import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'

interface DeleteMessageParams {
  messageId: string
  userId: string
}

export async function deleteMessage({ messageId, userId }: DeleteMessageParams) {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('messages')
    .select('id, sender_id, deleted_at, type')
    .eq('id', messageId)
    .single()

  if (!existing) {
    throw new AppError('VALIDATION_INVALID_INPUT', {
      message: 'Сообщение не найдено',
    })
  }

  if (existing.sender_id !== userId) {
    throw new AppError('MESSAGE_NOT_OWNER')
  }

  if (existing.deleted_at) {
    throw new AppError('MESSAGE_ALREADY_DELETED')
  }

  const { error } = await supabase
    .from('messages')
    .update({
      content: '',
      deleted_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (error) {
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: error,
      logContext: { messageId },
    })
  }
}
