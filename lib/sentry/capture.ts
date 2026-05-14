import type { ErrorCode } from '@/lib/errors/registry'
import type { CaptureOptions, FlowTag, SentryExtra } from './types'

// Maps AppError codes to their canonical flow tags so logError does not need
// to annotate every throw site individually. Codes not in this map emit to
// Sentry without a flow tag; they are still captured, just not alert-routed.
const CODE_TO_FLOW: Partial<Record<ErrorCode, FlowTag>> = {
  PHOTO_UPLOAD_FAILED: 'image.upload',
  PHOTO_DOWNLOAD_FAILED: 'image.upload',
  EXTERNAL_SUPABASE_STORAGE_FAILED: 'image.upload',
  PHOTO_PROCESSING_FAILED: 'image.process',
  PHOTO_MODERATION_FAILED: 'image.process',
  SYSTEM_DATABASE_ERROR: 'db.query',
  EXTERNAL_OPENAI_FAILED: 'moderation.vision',
  EXTERNAL_DEEPSEEK_FAILED: 'moderation.vision',
  EXTERNAL_OPENAI_TIMEOUT: 'moderation.vision',
  EXTERNAL_TBANK_FAILED: 'payments.init',
  PAYMENT_INIT_FAILED: 'payments.init',
  PAYMENT_SIGNATURE_INVALID: 'payments.webhook',
  EXTERNAL_RESEND_FAILED: 'notif.send',
  RATE_LIMIT_AUTH_CALLBACK: 'ratelimit.infra',
}

export function deriveFlowFromCode(code: ErrorCode): FlowTag | undefined {
  return CODE_TO_FLOW[code]
}

// Strips known PII patterns from logContext values before placing them in
// Sentry extra. Only applies to string values — numbers/booleans are safe.
export function safeLogContext(
  ctx: Record<string, unknown> | undefined,
): SentryExtra['logContext'] {
  if (!ctx) return undefined
  const out: Record<string, string | number | boolean | null | unknown[]> = {}
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === 'string') {
      // Drop anything that looks like an email address or a JWT/token.
      if (/[@]/.test(value) || /^ey[A-Za-z0-9_-]{10,}/.test(value)) continue
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      Array.isArray(value)
    ) {
      out[key] = value
    }
  }
  return out
}

// Primary Sentry exception capture helper. All production code MUST use this
// rather than importing @sentry/nextjs directly, to ensure consistent flow
// tagging and PII discipline.
//
// No-ops cleanly when SENTRY_DSN is absent (local dev without config).
export async function captureSentryException(err: unknown, opts: CaptureOptions): Promise<void> {
  const dsn =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_SENTRY_DSN
      : (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN)

  if (!dsn) return

  try {
    const Sentry = await import('@sentry/nextjs')
    const { flow, severity = 'error', tags = {}, extra } = opts

    Sentry.captureException(err, {
      level: severity,
      tags: { flow, ...tags },
      extra: extra as Record<string, unknown>,
    })
  } catch {
    // Intentionally suppressed: Sentry being unavailable must never break the
    // request path. Risk: this failure is invisible. Acceptable because the
    // original error is already logged to stdout via logError/console.
  }
}

// Synchronous variant for environments where async is unavailable (e.g. top-
// level module initialization). Falls back to no-op if SDK not yet loaded.
export function captureSentryExceptionSync(err: unknown, _opts: CaptureOptions): void {
  const dsn =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_SENTRY_DSN
      : (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN)

  if (!dsn) return

  try {
    // @sentry/nextjs may not be loaded synchronously in all runtimes; use the
    // global hub if available, otherwise silently drop.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any
    if (typeof g.__SENTRY__?.hub?.captureException === 'function') {
      g.__SENTRY__.hub.captureException(err)
    }
  } catch {
    // Intentionally suppressed: same reasoning as captureSentryException.
  }
}
