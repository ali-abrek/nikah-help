import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { profileRegenerateBioFn } from '@/lib/inngest/functions/profile-regenerate-bio'
import { photoModerateFn } from '@/lib/inngest/functions/photo-moderate'
import { photoDeleteFn } from '@/lib/inngest/functions/photo-delete'
import { photoReplaceCleanupFn } from '@/lib/inngest/functions/photo-replace-cleanup'
import { photoAbandonCleanupFn } from '@/lib/inngest/functions/photo-abandon-cleanup'
import { chatDeleteFn } from '@/lib/inngest/functions/chat-delete'
import { notificationDispatchFn } from '@/lib/inngest/functions/notification-dispatch'

const handler = serve({
  client: inngest,
  functions: [
    profileRegenerateBioFn,
    photoModerateFn,
    photoDeleteFn,
    photoReplaceCleanupFn,
    photoAbandonCleanupFn,
    chatDeleteFn,
    notificationDispatchFn,
  ],
})

export const { GET, POST, PUT } = handler
