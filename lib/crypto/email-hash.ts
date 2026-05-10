import { createHash } from 'node:crypto'
import { requireEnv } from '@/lib/env'

export function hashBlockedEmail(email: string): Buffer {
  const pepper = requireEnv('BLOCKED_EMAIL_PEPPER')
  return createHash('sha256')
    .update(pepper + email.trim().toLowerCase())
    .digest()
}
