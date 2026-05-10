import { Inngest } from 'inngest'
import { getEnv } from '@/lib/env'

// Pass the keys explicitly so they're an obvious requirement of this module.
// In production both must be set (validateEnv() throws on a missing
// INNGEST_SIGNING_KEY); locally they may be absent during dev runs against
// the Inngest dev server which bypasses signing.
export const inngest = new Inngest({
  id: 'nikah-help',
  signingKey: getEnv('INNGEST_SIGNING_KEY'),
  eventKey: getEnv('INNGEST_EVENT_KEY'),
})
