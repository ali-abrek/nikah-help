import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'
import { inngest, chatDeleteEvent } from '@/lib/inngest/client'

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

  // Collect media storage paths BEFORE deleting the chat, because the cascade
  // delete removes all message rows — Inngest would find nothing to clean up.
  const { data: mediaMessages } = await supabase
    .from('messages')
    .select('type, content')
    .eq('chat_id', chatId)
    .in('type', ['image', 'voice'])

  const mediaPaths = (mediaMessages ?? [])
    .map((msg) => {
      try {
        const url = new URL(msg.content ?? '')
        const parts = url.pathname.split('/')
        const bucketIdx = parts.indexOf('chat-media')
        if (bucketIdx >= 0) return parts.slice(bucketIdx + 1).join('/')
      } catch {
        if ((msg.content ?? '').startsWith('chat-media/')) {
          return msg.content!.replace('chat-media/', '')
        }
      }
      return null
    })
    .filter((p): p is string => p !== null)

  // Delete the chat (cascade deletes messages)
  await supabase.from('chats').delete().eq('id', chatId)

  // Trigger Inngest with pre-collected paths so media cleanup can proceed even
  // though messages are already gone.
  await inngest.send(chatDeleteEvent.create({ chatId, matchId: chat.match_id, mediaPaths }))

  // Notify the other user
  await supabase.from('notifications').insert({
    user_id: otherUserId,
    type: 'chat_deleted',
    title_key: 'notification.chat_deleted.title',
    body_key: 'notification.chat_deleted.body',
  })
}
