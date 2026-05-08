import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'

interface MarkAsReadParams {
  chatId: string
  messageIds: string[]
  userId: string
}

export async function markAsRead({ chatId, messageIds, userId }: MarkAsReadParams) {
  const supabase = createAdminClient()

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
