import type { NextRequest } from 'next/server'
import { AppError } from '@/lib/errors/app-error'
import { extractIp, hashIp } from '@/lib/utils/ip'

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function resolveIdempotencyKey(
  request: NextRequest,
  key: string,
): Promise<string> {
  const trimmed = key.trim()
  if (!UUID_V4_RE.test(trimmed)) {
    throw new AppError('IDEMPOTENCY_KEY_INVALID', {
      message: 'Idempotency-Key must be a valid UUID v4',
      logContext: { providedKey: trimmed.slice(0, 8) + '...' },
    })
  }

  const userId = request.headers.get('x-user-id')

  if (userId) {
    return `idempotency:user:${userId}:${trimmed}`
  }

  return `idempotency:ip:${hashIp(extractIp(request))}:${trimmed}`
}
