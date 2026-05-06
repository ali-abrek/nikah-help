import type { IdempotencyOptions } from './types'

export const PAYMENT_CRITICAL: IdempotencyOptions = {
  required: true,
  ttl: 86_400,
  timeout: 60_000,
}

export const USER_ACTION: IdempotencyOptions = {
  required: false,
  ttl: 3600,
  timeout: 10_000,
}

export const MESSAGE_SEND: IdempotencyOptions = {
  required: false,
  ttl: 600,
  timeout: 5_000,
}
