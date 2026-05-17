// Flow taxonomy — every Sentry event must carry one of these tags.
// Suffix conventions (append with a dot):
//   action.<snake_case_action_name>   e.g. action.send_message
//   cron.<vercel-cron-route-slug>     e.g. cron.expire-suspensions
// To add a new flow: extend the union and document it here.
export type FlowTag =
  | 'auth.magic_link_send'
  | 'auth.callback'
  | 'auth.session_refresh'
  | 'auth.rbac'
  | 'realtime.channel'
  | 'payments.init'
  | 'payments.webhook'
  | 'payments.rebill'
  | 'moderation.vision'
  | 'moderation.action'
  | 'moderation.sync'
  | 'moderation.cleanup'
  | 'image.upload'
  | 'image.process'
  | 'image.process.upload_variant'
  | 'image.process.dlq'
  | 'db.query'
  | 'db.rls'
  | 'ratelimit.infra'
  | 'ratelimit.abuse'
  | 'edge.proxy'
  | 'notif.send'
  | 'sw'
  | `action.${string}`
  | `cron.${string}`

// Production ingestion only — debug is dropped in beforeSend.
export type SentrySeverity = 'fatal' | 'error' | 'warning' | 'info'

// Typed extra payload — named fields prevent accidental PII leakage.
// Add a new field here rather than casting to a wider type at call sites.
export interface SentryExtra {
  traceId?: string
  logContext?: Record<string, string | number | boolean | null | unknown[]>
  step?: string
  attempt?: number
  provider?: string
  channel?: string
  subscriptionId?: string
  photoId?: string
  variant?: string
  cronSlug?: string
  reconnectCount?: number
}

export interface CaptureOptions {
  flow: FlowTag
  severity?: SentrySeverity // default: 'error'
  tags?: Record<string, string>
  extra?: SentryExtra
}
