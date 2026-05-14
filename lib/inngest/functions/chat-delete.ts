import { inngest } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const chatDeleteFn = inngest.createFunction(
  {
    id: 'chat.delete',
    retries: 3,
    triggers: { event: 'chat/delete' },
  },
  async ({ event }) => {
    const { chatId, mediaPaths } = event.data as {
      chatId: string
      matchId: string
      mediaPaths?: string[]
    }
    const supabase = createAdminClient()

    // mediaPaths are collected by deleteChat() before the cascade delete runs.
    // Falling back to an empty array is safe — it just means no cleanup needed.
    const paths = mediaPaths ?? []

    if (paths.length > 0) {
      const { error } = await supabase.storage.from('chat-media').remove(paths)

      if (error) {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'chat_delete_media_cleanup_failed',
            chatId,
            error: error.message,
          }),
        )
      }
    }

    return { status: 'ok', chatId }
  },
)
