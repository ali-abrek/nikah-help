import { createAdminClient } from '@/lib/supabase/admin'

export interface ChatPreview {
  chat_id: string
  match_id: string
  other_user: {
    id: string
    name: string | null
    photo_url: string | null
  }
  last_message: {
    type: string
    content: string
    sender_id: string
    created_at: string
  } | null
  unread_count: number
  updated_at: string
}

export async function getChats(userId: string): Promise<ChatPreview[]> {
  const supabase = createAdminClient()

  const { data: matches } = await supabase
    .from('matches')
    .select(
      `
      id, user_a, user_b, created_at,
      chats!chats_match_id_fkey ( id )
    `,
    )
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (!matches?.length) return []

  const chatMap = new Map<string, string>()
  const otherUserIds: string[] = []

  for (const m of matches) {
    const chatRows = m.chats as Array<{ id: string }> | null
    const firstChat = chatRows?.[0]
    if (firstChat?.id) {
      chatMap.set(m.id, firstChat.id)
    }
    otherUserIds.push(m.user_a === userId ? m.user_b : m.user_a)
  }

  const chatIds = Array.from(chatMap.values())

  // Fetch profiles, last messages, and unread counts in parallel
  const [profilesResult, messagesResult, unreadResult] = await Promise.all([
    supabase.from('profiles').select('id, name, photos ( variants )').in('id', otherUserIds),
    chatIds.length > 0
      ? supabase
          .from('messages')
          .select('chat_id, type, content, sender_id, created_at')
          .in('chat_id', chatIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    chatIds.length > 0
      ? supabase
          .from('messages')
          .select('chat_id')
          .in('chat_id', chatIds)
          .neq('sender_id', userId)
          .is('read_at', null)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])

  // Build profile map
  const profileMap = new Map<
    string,
    { id: string; name: string | null; photo_url: string | null }
  >()
  for (const p of profilesResult.data ?? []) {
    const photos = p.photos as Array<{ variants: Record<string, Record<string, string>> }> | null
    profileMap.set(p.id, {
      id: p.id,
      name: p.name as string | null,
      photo_url: photos?.[0]?.variants?.thumbnail_sm?.webp ?? null,
    })
  }

  // Build last message map
  const lastMsgMap = new Map<
    string,
    { type: string; content: string; sender_id: string; created_at: string }
  >()
  for (const msg of messagesResult.data ?? []) {
    const chatId = msg.chat_id as string
    if (!chatId || lastMsgMap.has(chatId)) continue
    lastMsgMap.set(chatId, {
      type: (msg.type as string) ?? 'text',
      content: (msg.content as string) ?? '',
      sender_id: (msg.sender_id as string) ?? '',
      created_at: (msg.created_at as string) ?? new Date().toISOString(),
    })
  }

  // Build unread count map
  const unreadMap = new Map<string, number>()
  for (const r of unreadResult.data ?? []) {
    const chatId = r.chat_id as string
    if (!chatId) continue
    unreadMap.set(chatId, (unreadMap.get(chatId) ?? 0) + 1)
  }

  return matches
    .filter((m) => chatMap.has(m.id))
    .map((m) => {
      const chatId = chatMap.get(m.id)!
      const otherId = m.user_a === userId ? m.user_b : m.user_a

      return {
        chat_id: chatId,
        match_id: m.id,
        other_user: profileMap.get(otherId) ?? { id: otherId, name: null, photo_url: null },
        last_message: lastMsgMap.get(chatId) ?? null,
        unread_count: unreadMap.get(chatId) ?? 0,
        updated_at: (m.created_at as string) ?? new Date().toISOString(),
      }
    })
}
