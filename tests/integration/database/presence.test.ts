import { describe, it, expect } from 'vitest'
import { adminClient, createTestUser, dbAvailable, deleteTestUser } from './_helpers'

const skip = !dbAvailable()

describe.skipIf(skip)('is_user_online (M6 server-side presence)', () => {
  it('returns true for last_seen_at within 120s, false otherwise', async () => {
    const u = await createTestUser()
    try {
      const admin = adminClient()

      // Recently seen (60s ago)
      await admin
        .from('profiles')
        .update({ last_seen_at: new Date(Date.now() - 60_000).toISOString() })
        .eq('id', u.id)
      const online = await admin.rpc('is_user_online', { p_user: u.id })
      expect(online.data).toBe(true)

      // Long-ago (200s)
      await admin
        .from('profiles')
        .update({ last_seen_at: new Date(Date.now() - 200_000).toISOString() })
        .eq('id', u.id)
      const offline = await admin.rpc('is_user_online', { p_user: u.id })
      expect(offline.data).toBe(false)

      // Null last_seen_at → false (never seen)
      await admin.from('profiles').update({ last_seen_at: null }).eq('id', u.id)
      const never = await admin.rpc('is_user_online', { p_user: u.id })
      expect(never.data).toBe(false)
    } finally {
      await deleteTestUser(u.id)
    }
  }, 30_000)
})
