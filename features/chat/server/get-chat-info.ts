import { createAdminClient } from '@/lib/supabase/admin'

export interface ChatInfo {
  chat_id: string
  match_id: string
  other_user: {
    id: string
    name: string | null
    photo_id: string | null
  }
}

export async function getChatInfo(chatId: string, userId: string): Promise<ChatInfo | null> {
  const supabase = createAdminClient()

  const { data: chat } = await supabase
    .from('chats')
    .select(
      `
      id, match_id,
      matches!inner ( id, user_a, user_b )
    `,
    )
    .eq('id', chatId)
    .single()

  if (!chat) return null

  const m = chat.matches as unknown as { id: string; user_a: string; user_b: string }
  if (m.user_a !== userId && m.user_b !== userId) return null

  const otherId = m.user_a === userId ? m.user_b : m.user_a

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, photos ( id )')
    .eq('id', otherId)
    .single()

  const photos = (profile?.photos as Array<{ id: string }>) ?? []
  const photoId = photos[0]?.id ?? null

  return {
    chat_id: chat.id,
    match_id: chat.match_id,
    other_user: {
      id: otherId,
      name: profile?.name ?? null,
      photo_id: photoId,
    },
  }
}
