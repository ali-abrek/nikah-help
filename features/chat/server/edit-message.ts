import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'

interface EditMessageParams {
  messageId: string
  content: string
  userId: string
}

export async function editMessage({ messageId, content, userId }: EditMessageParams) {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('messages')
    .select('id, sender_id, type, content, created_at, deleted_at')
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

  if (existing.type !== 'text') {
    throw new AppError('MESSAGE_NOT_TEXT')
  }

  if (existing.deleted_at) {
    throw new AppError('MESSAGE_ALREADY_DELETED')
  }

  // Check 5-minute edit window
  const created = new Date(existing.created_at ?? Date.now()).getTime()
  const now = Date.now()
  if (now - created > 5 * 60 * 1000) {
    throw new AppError('MESSAGE_EDIT_WINDOW_EXPIRED')
  }

  const { data: updated, error } = await supabase
    .from('messages')
    .update({
      content,
      original_content: existing.content || undefined,
      edited_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select('id, content, edited_at, original_content')
    .single()

  if (error) {
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: error,
      logContext: { messageId },
    })
  }

  return updated
}
