import { createAdminClient } from '@/lib/supabase/admin'

export interface MessageRow {
  id: string
  chat_id: string
  sender_id: string
  type: 'text' | 'image' | 'voice'
  content: string
  parent_id: string | null
  status: 'sent' | 'delivered' | 'read'
  created_at: string
  read_at: string | null
  edited_at: string | null
  original_content: string | null
  deleted_at: string | null
  parent_message?: {
    id: string
    sender_id: string
    type: string
    content: string
    deleted_at: string | null
  } | null
}

export async function getMessages(chatId: string, userId: string): Promise<MessageRow[]> {
  const supabase = createAdminClient()

  // Verify the caller is a participant of this chat.
  const { data: chat } = await supabase
    .from('chats')
    .select('id, matches!inner ( user_a, user_b )')
    .eq('id', chatId)
    .single()

  if (!chat) return []

  const m = chat.matches as unknown as { user_a: string; user_b: string }
  if (m.user_a !== userId && m.user_b !== userId) return []

  const { data } = await supabase
    .from('messages')
    .select(
      `
      id, chat_id, sender_id, type, content, parent_id,
      status, created_at, read_at, edited_at, original_content, deleted_at,
      parent_message:parent_id (
        id, sender_id, type, content, deleted_at
      )
    `,
    )
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(100)

  return (data as unknown as MessageRow[]) ?? []
}
