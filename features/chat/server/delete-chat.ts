import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'
import { inngest } from '@/lib/inngest/client'

export async function deleteChat(chatId: string, userId: string) {
  const supabase = createAdminClient()

  // Verify user is participant
  const { data: chat } = await supabase
    .from('chats')
    .select(
      `
      id, match_id,
      matches!inner ( user_a, user_b )
    `,
    )
    .eq('id', chatId)
    .single()

  if (!chat) {
    throw new AppError('CHAT_NOT_PARTICIPANT')
  }

  const m = chat.matches as unknown as { user_a: string; user_b: string }
  if (m.user_a !== userId && m.user_b !== userId) {
    throw new AppError('CHAT_NOT_PARTICIPANT')
  }

  const otherUserId = m.user_a === userId ? m.user_b : m.user_a

  // Delete the chat (cascade deletes messages)
  await supabase.from('chats').delete().eq('id', chatId)

  // Trigger Inngest to clean up media files
  await inngest.send({
    name: 'chat/delete',
    data: { chatId, matchId: chat.match_id },
  })

  // Notify the other user
  await supabase.from('notifications').insert({
    user_id: otherUserId,
    type: 'chat_deleted',
    title_key: 'notification.chat_deleted.title',
    body_key: 'notification.chat_deleted.body',
  })
}
