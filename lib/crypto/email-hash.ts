import { createHash } from 'node:crypto'

export function hashBlockedEmail(email: string): Buffer {
  const pepper = process.env.BLOCKED_EMAIL_PEPPER
  if (!pepper) throw new Error('BLOCKED_EMAIL_PEPPER missing')
  return createHash('sha256').update(pepper + email.trim().toLowerCase()).digest()
}
