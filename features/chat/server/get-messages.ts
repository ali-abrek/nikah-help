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

export async function getMessages(chatId: string): Promise<MessageRow[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('messages')
    .select(`
      id, chat_id, sender_id, type, content, parent_id,
      status, created_at, read_at, edited_at, original_content, deleted_at,
      parent_message:parent_id (
        id, sender_id, type, content, deleted_at
      )
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(100)

  return (data as unknown as MessageRow[]) ?? []
}
