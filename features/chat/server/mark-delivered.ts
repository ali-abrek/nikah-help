import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'

interface MarkDeliveredParams {
  messageIds: string[]
  userId: string
}

/**
 * Called by client when it receives a message via Realtime INSERT.
 * Marks messages as 'delivered' (monotonic: only applied if status is 'sent').
 */
export async function markDelivered({ messageIds, userId }: MarkDeliveredParams) {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('messages')
    .update({ status: 'delivered' })
    .in('id', messageIds)
    .neq('sender_id', userId) // Don't mark own messages
    .eq('status', 'sent') // Monotonic: only sent -> delivered

  if (error) {
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: error,
      logContext: { messageCount: messageIds.length },
    })
  }
}
