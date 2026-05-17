import { Inngest } from 'inngest'
import { getEnv } from '@/lib/env'

export const inngest = new Inngest({
  id: 'nikah-help',
  signingKey: getEnv('INNGEST_SIGNING_KEY'),
  eventKey: getEnv('INNGEST_EVENT_KEY'),
})

export {
  photoModerateEvent,
  photoProcessEvent,
  photoDeleteEvent,
  photoAbandonCleanupEvent,
  photoReplaceCleanupEvent,
  chatDeleteEvent,
  likeRevokeEvent,
  notificationSendEvent,
  profileRegenerateBioEvent,
} from './events'
