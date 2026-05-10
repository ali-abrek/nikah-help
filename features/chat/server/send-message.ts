import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'

interface SendMessageParams {
  chatId: string
  senderId: string
  type: 'text' | 'image' | 'voice'
  content: string
  parentId?: string
}

interface SendMessageResult {
  id: string
  chat_id: string
  sender_id: string
  type: string
  content: string
  parent_id: string | null
  status: string
  created_at: string
}

export async function sendMessage({
  chatId,
  senderId,
  type,
  content,
  parentId,
}: SendMessageParams): Promise<SendMessageResult> {
  const supabase = createAdminClient()

  // Verify chat exists and sender is participant
  const { data: chat } = await supabase
    .from('chats')
    .select(
      `
      id,
      matches!inner ( user_a, user_b )
    `,
    )
    .eq('id', chatId)
    .single()

  if (!chat) {
    throw new AppError('CHAT_NOT_PARTICIPANT', {
      logContext: { chatId, senderId },
    })
  }

  const m = chat.matches as unknown as { user_a: string; user_b: string }
  if (m.user_a !== senderId && m.user_b !== senderId) {
    throw new AppError('CHAT_NOT_PARTICIPANT', {
      logContext: { chatId, senderId },
    })
  }

  // If parent_id is set, verify it exists and belongs to same chat
  if (parentId) {
    const { data: parent } = await supabase
      .from('messages')
      .select('id, chat_id')
      .eq('id', parentId)
      .single()

    if (!parent || parent.chat_id !== chatId) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        message: 'Указанное сообщение не найдено в этом чате',
      })
    }
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      type,
      content,
      parent_id: parentId ?? null,
      status: 'sent',
    })
    .select('id, chat_id, sender_id, type, content, parent_id, status, created_at')
    .single()

  if (error || !message) {
    throw new AppError('SYSTEM_DATABASE_ERROR', {
      cause: error ?? undefined,
      logContext: { chatId, senderId },
    })
  }

  return message as SendMessageResult
}
