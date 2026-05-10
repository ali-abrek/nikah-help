import { describe, it, expect } from 'vitest'
import { adminClient, createTestUser, dbAvailable, deleteTestUser } from './_helpers'

const skip = !dbAvailable()

describe.skipIf(skip)('RLS denial paths', () => {
  it("a user cannot read another user's notifications", async () => {
    const a = await createTestUser()
    const b = await createTestUser()

    try {
      const admin = adminClient()
      // Insert a notification owned by A using the service role (bypasses RLS).
      await admin.from('notifications').insert({
        user_id: a.id,
        type: 'system',
        title_key: 'test.title',
        body_key: 'test.body',
      })

      // B reads with their own session — RLS should hide A's row.
      const { data, error } = await b.client
        .from('notifications')
        .select('id, user_id')
        .eq('user_id', a.id)

      expect(error).toBeNull()
      expect(data ?? []).toHaveLength(0)
    } finally {
      await deleteTestUser(a.id)
      await deleteTestUser(b.id)
    }
  }, 30_000)

  it('a user cannot insert a like with from_user_id != auth.uid()', async () => {
    const a = await createTestUser({ gender: 'male' })
    const b = await createTestUser({ gender: 'female' })

    try {
      // B tries to insert a like AS A (impersonation attempt).
      const { error } = await b.client.from('likes').insert({
        from_user_id: a.id,
        to_user_id: b.id,
      })
      expect(error).not.toBeNull()
    } finally {
      await deleteTestUser(a.id)
      await deleteTestUser(b.id)
    }
  }, 30_000)

  it("a user cannot update another user's profile", async () => {
    const a = await createTestUser()
    const b = await createTestUser()

    try {
      const { error } = await b.client.from('profiles').update({ name: 'tampered' }).eq('id', a.id)
      // RLS may return error or 0 rows; either way nothing changes.

      const admin = adminClient()
      const { data: aRow } = await admin.from('profiles').select('name').eq('id', a.id).single()
      expect(aRow?.name).not.toBe('tampered')
      // We don't strictly require an error — some Supabase versions return
      // success-with-zero-rows under RLS.
      void error
    } finally {
      await deleteTestUser(a.id)
      await deleteTestUser(b.id)
    }
  }, 30_000)

  it('idempotency_keys is denied for authenticated users (H2 lockdown)', async () => {
    const a = await createTestUser()

    try {
      // Both SELECT and INSERT should fail under the deny_all_idempotency
      // policy. Service role still works (separate test).
      const selectRes = await a.client.from('idempotency_keys').select('key')
      expect(selectRes.data ?? []).toHaveLength(0)

      const insertRes = await a.client.from('idempotency_keys').insert({
        key: 'test-key',
        response: { ok: true } as never,
      } as never)
      expect(insertRes.error).not.toBeNull()
    } finally {
      await deleteTestUser(a.id)
    }
  }, 30_000)

  it('messages are visible only to chat participants', async () => {
    const a = await createTestUser({ gender: 'male' })
    const b = await createTestUser({ gender: 'female' })
    const stranger = await createTestUser()

    try {
      const admin = adminClient()
      // Set up a match + chat between A and B.
      await admin.rpc('send_like', { p_from: a.id, p_to: b.id })
      await admin.rpc('send_like', { p_from: b.id, p_to: a.id })

      const { data: match } = await admin
        .from('matches')
        .select('id')
        .or(`and(user_a.eq.${a.id},user_b.eq.${b.id}),and(user_a.eq.${b.id},user_b.eq.${a.id})`)
        .single()
      expect(match?.id).toBeTruthy()

      const { data: chat } = await admin
        .from('chats')
        .select('id')
        .eq('match_id', match!.id)
        .single()
      expect(chat?.id).toBeTruthy()

      // Insert a message via service role.
      await admin.from('messages').insert({
        chat_id: chat!.id,
        sender_id: a.id,
        type: 'text',
        content: 'hello',
      })

      // Stranger cannot read the chat or messages.
      const chatRes = await stranger.client.from('chats').select('id').eq('id', chat!.id)
      expect(chatRes.data ?? []).toHaveLength(0)

      const msgRes = await stranger.client.from('messages').select('id').eq('chat_id', chat!.id)
      expect(msgRes.data ?? []).toHaveLength(0)
    } finally {
      await deleteTestUser(a.id)
      await deleteTestUser(b.id)
      await deleteTestUser(stranger.id)
    }
  }, 60_000)
})
