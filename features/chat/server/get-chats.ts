import { createAdminClient } from '@/lib/supabase/admin'
import { callChatPreviews } from '@/lib/supabase/rpc'

export interface ChatPreview {
  chat_id: string
  match_id: string
  other_user: {
    id: string
    name: string | null
    photo_id: string | null
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

  const [profilesResult, previewsResult] = await Promise.all([
    supabase.from('profiles').select('id, name, photos ( id )').in('id', otherUserIds),
    chatIds.length > 0
      ? callChatPreviews(supabase, { p_viewer_id: userId })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ])

  const profileMap = new Map<string, { id: string; name: string | null; photo_id: string | null }>()
  for (const p of profilesResult.data ?? []) {
    const photos = p.photos as Array<{ id: string }> | null
    profileMap.set(p.id, {
      id: p.id,
      name: p.name as string | null,
      photo_id: photos?.[0]?.id ?? null,
    })
  }

  const previewMap = new Map<
    string,
    {
      last_message: ChatPreview['last_message']
      unread_count: number
    }
  >()
  for (const row of previewsResult.data ?? []) {
    const r = row as {
      chat_id: string
      last_message_type: string | null
      last_message_content: string | null
      last_message_sender_id: string | null
      last_message_created_at: string | null
      unread_count: number
    }
    previewMap.set(r.chat_id, {
      last_message: r.last_message_type
        ? {
            type: r.last_message_type,
            content: r.last_message_content ?? '',
            sender_id: r.last_message_sender_id ?? '',
            created_at: r.last_message_created_at ?? new Date().toISOString(),
          }
        : null,
      unread_count: r.unread_count,
    })
  }

  return matches
    .filter((m) => chatMap.has(m.id))
    .map((m) => {
      const chatId = chatMap.get(m.id)!
      const otherId = m.user_a === userId ? m.user_b : m.user_a
      const preview = previewMap.get(chatId)

      return {
        chat_id: chatId,
        match_id: m.id,
        other_user: profileMap.get(otherId) ?? { id: otherId, name: null, photo_id: null },
        last_message: preview?.last_message ?? null,
        unread_count: preview?.unread_count ?? 0,
        updated_at: (m.created_at as string) ?? new Date().toISOString(),
      }
    })
}
