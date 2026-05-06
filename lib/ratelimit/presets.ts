import type { RateLimitOptions } from './types'

// Auth callbacks have no role bypass — even admins/moderators are rate-limited
// to prevent brute-force attacks on the most sensitive authentication endpoint.
export const AUTH_STRICT: RateLimitOptions = {
  limit: 10,
  window: 60,
  keyStrategy: 'ip',
  errorCode: 'RATE_LIMIT_AUTH_CALLBACK',
  bypassRoles: [],
}

export const ACTION_MODERATE: RateLimitOptions = {
  limit: 30,
  window: 60,
  keyStrategy: 'user',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
}

export const MESSAGE_SEND: RateLimitOptions = {
  limit: 30,
  window: 60,
  keyStrategy: 'user',
  errorCode: 'RATE_LIMIT_MESSAGE_SEND',
}

export const READ_GENEROUS: RateLimitOptions = {
  limit: 120,
  window: 60,
  keyStrategy: 'ip+user',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
}

export const PHOTO_UPLOAD: RateLimitOptions = {
  limit: 20,
  window: 60,
  keyStrategy: 'user',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
}

export const WEBHOOK: RateLimitOptions = {
  limit: 300,
  window: 60,
  keyStrategy: 'ip',
  errorCode: 'RATE_LIMIT_TOO_MANY_REQUESTS',
}
