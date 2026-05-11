import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'

interface MarkAsReadParams {
  chatId: string
  messageIds: string[]
  userId: string
}

export async function markAsRead({ chatId, messageIds, userId }: MarkAsReadParams) {
  const supabase = createAdminClient()

  // Verify the caller is a participant of this chat before touching any rows.
  const { data: chat } = await supabase
    .from('chats')
    .select('id, matches!inner ( user_a, user_b )')
    .eq('id', chatId)
    .single()

  if (!chat) {
    throw new AppError('NOT_FOUND', { logContext: { chatId } })
  }

  const m = chat.matches as unknown as { user_a: string; user_b: string }
  if (m.user_a !== userId && m.user_b !== userId) {
    throw new AppError('AUTH_UNAUTHORIZED', { logContext: { chatId, userId } })
  }

  const { error } = await supabase
    .from('messages')
    .update({
      status: 'read',
      read_at: new Date().toISOString(),
    })
    .in('id', messageIds)
    .eq('chat_id', chatId)
    .neq('sender_id', userId) // Only mark others' messages as read
    .is('read_at', null) // Only if not already read
    .is('deleted_at', null) // Don't mark deleted messages

  if (error) {
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: error,
      logContext: { chatId, messageCount: messageIds.length },
    })
  }
}
