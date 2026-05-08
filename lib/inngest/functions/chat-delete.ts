import { inngest } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const chatDeleteFn = inngest.createFunction(
  {
    id: 'chat.delete',
    retries: 3,
    triggers: { event: 'chat/delete' },
  },
  async ({ event }) => {
    const { chatId } = event.data as { chatId: string; matchId: string }
    const supabase = createAdminClient()

    const { data: mediaMessages } = await supabase
      .from('messages')
      .select('id, type, content')
      .eq('chat_id', chatId)
      .in('type', ['image', 'voice'])

    if (mediaMessages?.length) {
      const paths = mediaMessages
        .map((m) => extractStoragePath(m.type, m.content))
        .filter((p): p is string => p !== null)

      if (paths.length > 0) {
        const { error } = await supabase.storage
          .from('chat-media')
          .remove(paths)

        if (error) {
          console.error(JSON.stringify({
            level: 'error',
            message: 'chat_delete_media_cleanup_failed',
            chatId,
            error: error.message,
          }))
        }
      }
    }

    return { status: 'ok', chatId }
  },
)

function extractStoragePath(type: string, content: string): string | null {
  if (type === 'image') {
    try {
      const url = new URL(content)
      const parts = url.pathname.split('/')
      const bucketIdx = parts.indexOf('chat-media')
      if (bucketIdx >= 0) {
        return parts.slice(bucketIdx + 1).join('/')
      }
    } catch {
      if (content.startsWith('chat-media/')) {
        return content.replace('chat-media/', '')
      }
    }
  }

  if (type === 'voice') {
    if (content.includes('/')) {
      const parts = content.split('/')
      const bucketIdx = parts.indexOf('chat-media')
      if (bucketIdx >= 0) {
        return parts.slice(bucketIdx + 1).join('/')
      }
    }
  }

  return null
}
