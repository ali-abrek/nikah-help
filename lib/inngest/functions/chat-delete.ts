import { inngest, chatDeleteEvent } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureSentryException } from '@/lib/sentry/capture'

export const chatDeleteFn = inngest.createFunction(
  {
    id: 'chat.delete',
    retries: 3,
    triggers: [chatDeleteEvent],
    onFailure: async ({ event, error }) => {
      const { chatId } = event.data as { chatId?: string }
      await captureSentryException(error, {
        flow: 'action.chat_delete',
        severity: 'error',
        tags: { step: 'retry_exhausted' },
        extra: { logContext: { chatId: chatId ?? 'unknown' } },
      })
    },
  },
  async ({ event }) => {
    const { chatId, mediaPaths } = event.data
    const supabase = createAdminClient()

    const paths = mediaPaths ?? []

    if (paths.length > 0) {
      const { error } = await supabase.storage.from('chat-media').remove(paths)

      if (error) {
        throw error
      }
    }

    return { status: 'ok', chatId }
  },
)
