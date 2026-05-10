import { describe, it, expect } from 'vitest'
import { adminClient, createTestUser, dbAvailable, deleteTestUser } from './_helpers'

const skip = !dbAvailable()

describe.skipIf(skip)('send_like race condition (H8)', () => {
  it('fires two concurrent reciprocal likes and produces exactly one match', async () => {
    const a = await createTestUser({ gender: 'male' })
    const b = await createTestUser({ gender: 'female' })

    try {
      // Fire both directions in parallel. Without the advisory lock both
      // transactions could see "no reciprocal yet" and miss the match;
      // with the lock the second one sees the first's like and creates
      // (or finds) the match deterministically.
      const admin = adminClient()
      const [r1, r2] = await Promise.all([
        admin.rpc('send_like', { p_from: a.id, p_to: b.id }),
        admin.rpc('send_like', { p_from: b.id, p_to: a.id }),
      ])

      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()

      // Exactly one match row in canonical (least, greatest) order.
      const { data: matches } = await admin
        .from('matches')
        .select('id, user_a, user_b')
        .or(`and(user_a.eq.${a.id},user_b.eq.${b.id}),and(user_a.eq.${b.id},user_b.eq.${a.id})`)

      expect(matches).toHaveLength(1)

      // At least one of the callers reports matched=true.
      const r1Row = (r1.data as Array<{ matched: boolean }> | null)?.[0]
      const r2Row = (r2.data as Array<{ matched: boolean }> | null)?.[0]
      expect(r1Row?.matched || r2Row?.matched).toBe(true)
    } finally {
      await deleteTestUser(a.id)
      await deleteTestUser(b.id)
    }
  }, 30_000)

  it('idempotent under repeated identical calls (no duplicate match, stable LIKE_ALREADY_SENT)', async () => {
    const a = await createTestUser({ gender: 'male' })
    const b = await createTestUser({ gender: 'female' })

    try {
      const admin = adminClient()
      const r1 = await admin.rpc('send_like', { p_from: a.id, p_to: b.id })
      const r2 = await admin.rpc('send_like', { p_from: a.id, p_to: b.id })

      const r1Row = (r1.data as Array<{ matched: boolean; error_code: string | null }> | null)?.[0]
      const r2Row = (r2.data as Array<{ matched: boolean; error_code: string | null }> | null)?.[0]

      expect(r1Row?.error_code).toBeNull()
      expect(r2Row?.error_code).toBe('LIKE_ALREADY_SENT')

      // No match (B never reciprocated).
      const { count } = await admin
        .from('matches')
        .select('id', { head: true, count: 'exact' })
        .or(`and(user_a.eq.${a.id},user_b.eq.${b.id}),and(user_a.eq.${b.id},user_b.eq.${a.id})`)
      expect(count).toBe(0)
    } finally {
      await deleteTestUser(a.id)
      await deleteTestUser(b.id)
    }
  }, 30_000)
})
