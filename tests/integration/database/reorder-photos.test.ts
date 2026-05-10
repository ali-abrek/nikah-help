import { describe, it, expect } from 'vitest'
import { adminClient, createTestUser, dbAvailable, deleteTestUser } from './_helpers'

const skip = !dbAvailable()

describe.skipIf(skip)('reorder_profile_photos optimistic lock (M4)', () => {
  it('rejects a stale signature with PHOTO_REORDER_STALE', async () => {
    const u = await createTestUser()
    try {
      const admin = adminClient()

      // Seed three photos in positions 1, 2, 3.
      const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
      for (let i = 0; i < ids.length; i++) {
        await admin.from('photos').insert({
          id: ids[i],
          profile_id: u.id,
          storage_path: `path-${i}`,
          position: i + 1,
          status: 'processed',
          moderation_status: 'approved',
        } as never)
      }

      const goodSignature = `1:${ids[0]}|2:${ids[1]}|3:${ids[2]}`
      const staleSignature = '1:00000000-0000-0000-0000-000000000000|2:x|3:y'

      // Stale signature → rejection.
      const { error } = await admin.rpc('reorder_profile_photos', {
        p_profile_id: u.id,
        p_photo_ids: [ids[2]!, ids[0]!, ids[1]!],
        p_expected_signature: staleSignature,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toMatch(/PHOTO_REORDER_STALE|reorder_signature_mismatch/i)

      // Order in the DB unchanged.
      const { data: photos } = await admin
        .from('photos')
        .select('id, position')
        .eq('profile_id', u.id)
        .order('position', { ascending: true })
      expect(photos?.map((p) => p.id)).toEqual(ids)

      // Good signature → success, new order.
      const ok = await admin.rpc('reorder_profile_photos', {
        p_profile_id: u.id,
        p_photo_ids: [ids[2]!, ids[0]!, ids[1]!],
        p_expected_signature: goodSignature,
      })
      expect(ok.error).toBeNull()

      const { data: after } = await admin
        .from('photos')
        .select('id, position')
        .eq('profile_id', u.id)
        .order('position', { ascending: true })
      expect(after?.map((p) => p.id)).toEqual([ids[2], ids[0], ids[1]])
    } finally {
      await deleteTestUser(u.id)
    }
  }, 30_000)

  it('null signature skips the optimistic lock (legacy callers still work)', async () => {
    const u = await createTestUser()
    try {
      const admin = adminClient()
      const ids = [crypto.randomUUID(), crypto.randomUUID()]
      for (let i = 0; i < ids.length; i++) {
        await admin.from('photos').insert({
          id: ids[i],
          profile_id: u.id,
          storage_path: `path-${i}`,
          position: i + 1,
          status: 'processed',
          moderation_status: 'approved',
        } as never)
      }

      const ok = await admin.rpc('reorder_profile_photos', {
        p_profile_id: u.id,
        p_photo_ids: [ids[1]!, ids[0]!],
        p_expected_signature: null,
      })
      expect(ok.error).toBeNull()
    } finally {
      await deleteTestUser(u.id)
    }
  }, 30_000)
})
