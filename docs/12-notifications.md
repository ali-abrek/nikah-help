# 12 — Notification System

## Purpose

This file defines the centralized notification system for the Nikah Help platform — a `createNotification(type, context, options?)` factory that replaces all inline notification construction. Every notification, regardless of delivery channel (in-app, web push, email), is generated through this single entry point.

**Target audience:** AI development agents (Claude Code) and senior fullstack engineers.

> **MANDATORY OBSERVABILITY (notifications):** Per [14-sentry-observability.md](14-sentry-observability.md):
>
> - `flow=notif.send`, `channel=<push|email|in_app>` — channel send failure (Resend non-2xx, Web Push `410 Gone`-loop, etc.). Severity: error.
> - `flow=sw` — uncaught error in `public/sw.js` (Service Worker). Severity: warning. Use `@sentry/browser` lightweight init in the SW context.
> - Notification payload `body` text is template-rendered and may contain user names — it MUST be redacted before capture (only `notification_type` + `notification_id` go to Sentry).

---

## Requirement: Architecture

### Scenario: Any system action needs to notify a user

**Given** a business event (like received, match created, moderation action, etc.)
**When** the system needs to notify the affected user
**Then** the notification is ALWAYS generated through `createNotification()`
**And** dispatched through the single Inngest `notification-dispatch` function
**And** routed to channels based on user presence and preferences

```
Business Event
  │
  ▼
┌──────────────────────────────┐
│  createNotification(type,    │
│    context, options?)        │
│                              │
│  1. Resolve template         │
│  2. Build i18n keys          │
│  3. Resolve entity link      │
│  4. Return NotificationPayload│
└──────────────────────────────┘
  │
  ▼
┌──────────────────────────────┐
│  Inngest event sent          │
│  { name: "notification/send",│
│    data: { user_id, payload }}│
└──────────────────────────────┘
  │
  ▼
┌──────────────────────────────┐
│  notification-dispatch fn    │
│                              │
│  1. Check preferences        │
│  2. INSERT → notifications   │
│  3. Check Presence (online?) │
│  4. If online → Realtime ✓   │
│  5. If offline → Web Push    │
│  6. If email pref → Resend   │
└──────────────────────────────┘
```

### Design Constraints

- **Single factory, not inline construction.** Every notification is built by `createNotification()`. Inline `title_key` / `body_key` strings are banned.
- **i18n keys, not text.** The factory produces keys like `notifications.like_received.title`. The client resolves them with next-intl. This keeps text out of the database and enables locale switching.
- **Async-first.** The factory is synchronous (cheap). The Inngest dispatch is async — the caller fires an event and moves on.
- **Channel routing is centralized.** The dispatch function decides in-app vs push vs email. Individual business actions don't know about channels.
- **Compatible with existing DB schema.** The factory output maps directly to the `notifications` table columns (`title_key`, `body_key`, `payload`).

---

## Requirement: API Design

### `createNotification(type, context, options?)`

```typescript
// lib/notifications/factory.ts
import type {
  NotificationType,
  NotificationContext,
  NotificationOptions,
  NotificationPayload,
} from './types'
import { resolveTemplate } from './templates'
import { resolveLink } from './links'
import { validateContext } from './validation'

/**
 * Centralized notification factory.
 *
 * Generates a NotificationPayload ready for insertion into the `notifications` table
 * and dispatch through Inngest `notification/send` event.
 *
 * @throws {AppError} if required context fields are missing for the given type
 */
export function createNotification(
  type: NotificationType,
  context: NotificationContext,
  options: NotificationOptions = {},
): NotificationPayload {
  // 1. Validate required context for this type
  validateContext(type, context)

  // 2. Resolve i18n keys from the template registry
  const { titleKey, bodyKey } = resolveTemplate(type)

  // 3. Resolve entity link
  const link = resolveLink(type, context)

  // 4. Build the payload
  return {
    title_key: titleKey,
    body_key: bodyKey,
    payload: {
      type,
      actor_id: context.actorId,
      actor_name: context.actorName,
      entity_id: context.entityId,
      entity_type: context.entityType,
      link,
      reason: context.reason,
      ban_duration: context.banDuration,
      photo_id: context.photoId,
      timestamp: new Date().toISOString(),
    },
  }
}
```

### Type Definitions

```typescript
// lib/notifications/types.ts

// ── Notification Types ───────────────────────────────────────────

export type NotificationType =
  // Social
  | 'like_received'
  | 'match_created'
  | 'message_new'
  | 'like_revoked'
  // Moderation
  | 'photo_approved'
  | 'photo_rejected'
  | 'photo_removed_by_moderator'
  | 'account_blocked'
  | 'account_reinstated'
  | 'account_suspension_expired'
  // System
  | 'inactivity_warning'

// ── Context (dynamic data) ───────────────────────────────────────

export interface NotificationContext {
  /** User ID of the notification recipient. Required for all types. */
  recipientId: string

  /** User ID of the actor who triggered the event (liker, sender, moderator). */
  actorId?: string

  /** Display name of the actor. Used for interpolation in templates. */
  actorName?: string

  /** Primary entity ID (match, photo, message, etc.). */
  entityId?: string

  /** Entity type — drives link resolution. */
  entityType?: 'profile' | 'photo' | 'match' | 'message' | 'chat'

  /** Photo ID — specific to photo-related notifications. */
  photoId?: string

  /** Match ID — specific to match-related notifications. */
  matchId?: string

  /** Message ID — specific to message notifications. */
  messageId?: string

  /** Chat ID — specific to chat-related notifications. */
  chatId?: string

  /** Reason text — for moderation actions (why was photo removed / account blocked). */
  reason?: string

  /** Duration of temporary ban (human-readable, e.g. "7 days"). */
  banDuration?: string
}

// ── Options ──────────────────────────────────────────────────────

export interface NotificationOptions {
  /** Override the recipient's locale. Default: read from profiles.locale. */
  locale?: 'ru' | 'en'

  /** Override default channels. Default: all channels based on preferences. */
  channels?: Channel[]

  /** Priority hint. High = critical (account blocked). Low = passive (inactivity). */
  priority?: 'high' | 'normal' | 'low'

  /** TTL in seconds. After this, the notification may be dropped if undelivered. */
  ttl?: number
}

export type Channel = 'in_app' | 'email' | 'push'

// ── Output Payload ───────────────────────────────────────────────

export interface NotificationPayload {
  /** i18n key for the title. Resolved by the client via next-intl. */
  title_key: string

  /** i18n key for the body. Resolved by the client via next-intl. */
  body_key: string

  /** Dynamic data: interpolation variables + metadata + entity link. */
  payload: {
    type: NotificationType
    actor_id?: string
    actor_name?: string
    entity_id?: string
    entity_type?: string
    link?: string
    reason?: string
    ban_duration?: string
    photo_id?: string
    timestamp: string
  }
}
```

### Context Requirements by Type

```typescript
// lib/notifications/validation.ts
import { AppError } from '@/lib/errors/app-error'
import type { NotificationType, NotificationContext } from './types'

/**
 * Map of required context fields per notification type.
 * Throws VALIDATION_INVALID_INPUT if a required field is missing.
 */
const REQUIRED_FIELDS: Record<NotificationType, (keyof NotificationContext)[]> = {
  like_received: ['recipientId', 'actorId', 'actorName', 'entityId'],
  match_created: ['recipientId', 'actorId', 'actorName', 'matchId'],
  message_new: ['recipientId', 'actorId', 'actorName', 'messageId', 'chatId'],
  like_revoked: ['recipientId', 'actorId', 'entityId'],
  photo_approved: ['recipientId', 'photoId'],
  photo_rejected: ['recipientId', 'photoId', 'reason'],
  photo_removed_by_moderator: ['recipientId', 'photoId', 'reason'],
  account_blocked: ['recipientId', 'reason'],
  account_reinstated: ['recipientId'],
  account_suspension_expired: ['recipientId'],
  inactivity_warning: ['recipientId'],
}

export function validateContext(type: NotificationType, context: NotificationContext): void {
  const required = REQUIRED_FIELDS[type]
  const missing = required.filter((field) => context[field] == null)

  if (missing.length > 0) {
    throw new AppError('VALIDATION_INVALID_INPUT', {
      message: `Missing required context fields for ${type}: ${missing.join(', ')}`,
      details: Object.fromEntries(missing.map((f) => [f, 'Required'])),
      logContext: { notificationType: type, missing },
    })
  }
}
```

---

## Requirement: Notification Taxonomy

### Naming Convention

```
{domain}_{event}
```

- **domain:** Broad category (`like`, `match`, `message`, `photo`, `account`)
- **event:** Past-tense verb describing what happened (`received`, `created`, `approved`, `blocked`)

All types are lowercase with underscores. The registry below is the single source of truth. Client code switches on `payload.type`, never on `title_key` or `body_key`.

### Registry

#### Social — Interpersonal interactions

| Type            | Trigger                              | Priority | Default Channels      |
| --------------- | ------------------------------------ | -------- | --------------------- |
| `like_received` | User A likes User B's profile        | normal   | in_app + push         |
| `like_revoked`  | User A revokes their like on User B  | low      | in_app                |
| `match_created` | Mutual like detected → match created | high     | in_app + push + email |
| `message_new`   | New message in an active chat        | normal   | in_app + push         |

#### Moderation — Admin/moderator actions

| Type                         | Trigger                             | Priority | Default Channels |
| ---------------------------- | ----------------------------------- | -------- | ---------------- |
| `photo_approved`             | Moderator approves a photo          | normal   | in_app           |
| `photo_rejected`             | Moderator rejects a photo           | normal   | in_app           |
| `photo_removed_by_moderator` | Moderator removes an approved photo | high     | in_app + email   |
| `account_blocked`            | Moderator permanently blocks a user | high     | email            |
| `account_reinstated`         | Admin lifts a block                 | high     | email            |
| `account_suspension_expired` | Temporary ban duration ends         | normal   | email            |

#### System — Automated platform events

| Type                 | Trigger                 | Priority | Default Channels |
| -------------------- | ----------------------- | -------- | ---------------- |
| `inactivity_warning` | User inactive > 90 days | low      | email            |

### Channel Defaults Rationale

- **`account_blocked` is email-only:** When blocked, the user cannot access the app. In-app notifications are pointless. Push is unreliable if the user uninstalled the app.
- **`match_created` is all channels:** Highest-value event. The user should see it everywhere.
- **`like_received` skips email:** Would generate too many emails for popular profiles. Push + in-app is sufficient.
- **Moderation actions are mostly in-app:** The user is typically online when a photo is approved/rejected. Email is reserved for critical actions (account blocked, reinstated) or when the user may not open the app (photo removed).

---

## Requirement: Template System

### Template Structure

Every notification type has exactly one template with two i18n keys:

```
notifications.{type}.title
notifications.{type}.body
```

Templates are defined in the i18n message files (`messages/ru.json`, `messages/en.json`), NOT in code. This keeps text editable without code changes.

### Variable Interpolation

Variables use the ICU message format (native to next-intl):

```
{{actorName}}       — simple interpolation
{count}             — pluralization variable
```

### All Templates

```json
// messages/ru.json (partial)
{
  "notifications": {
    "like_received": {
      "title": "Новый лайк",
      "body": "{actorName} поставил(а) вам лайк"
    },
    "like_revoked": {
      "title": "Лайк отозван",
      "body": "{actorName} отозвал(а) свой лайк"
    },
    "match_created": {
      "title": "Новая пара!",
      "body": "У вас взаимный лайк с {actorName}. Начните общение!"
    },
    "message_new": {
      "title": "Новое сообщение",
      "body": "{actorName}: новое сообщение в чате"
    },
    "photo_approved": {
      "title": "Фото одобрено",
      "body": "Ваше фото прошло модерацию и опубликовано"
    },
    "photo_rejected": {
      "title": "Фото отклонено",
      "body": "Ваше фото не прошло модерацию. Причина: {reason}"
    },
    "photo_removed_by_moderator": {
      "title": "Фото удалено модератором",
      "body": "Ваше фото удалено. Причина: {reason}"
    },
    "account_blocked": {
      "title": "Аккаунт заблокирован",
      "body": "Ваш аккаунт заблокирован. Причина: {reason}"
    },
    "account_reinstated": {
      "title": "Аккаунт разблокирован",
      "body": "Ваш аккаунт восстановлен. Добро пожаловать обратно!"
    },
    "account_suspension_expired": {
      "title": "Блокировка снята",
      "body": "Временная блокировка вашего аккаунта истекла. Вы снова можете пользоваться сервисом."
    },
    "inactivity_warning": {
      "title": "Мы скучаем!",
      "body": "Вы давно не заходили в Nikah Help. Вас ждут новые знакомства!"
    }
  }
}
```

```json
// messages/en.json (partial)
{
  "notifications": {
    "like_received": {
      "title": "New Like",
      "body": "{actorName} liked your profile"
    },
    "like_revoked": {
      "title": "Like Revoked",
      "body": "{actorName} revoked their like"
    },
    "match_created": {
      "title": "New Match!",
      "body": "You and {actorName} liked each other. Start a conversation!"
    },
    "message_new": {
      "title": "New Message",
      "body": "{actorName}: new message in chat"
    },
    "photo_approved": {
      "title": "Photo Approved",
      "body": "Your photo passed moderation and is now visible"
    },
    "photo_rejected": {
      "title": "Photo Rejected",
      "body": "Your photo did not pass moderation. Reason: {reason}"
    },
    "photo_removed_by_moderator": {
      "title": "Photo Removed by Moderator",
      "body": "Your photo was removed. Reason: {reason}"
    },
    "account_blocked": {
      "title": "Account Blocked",
      "body": "Your account has been blocked. Reason: {reason}"
    },
    "account_reinstated": {
      "title": "Account Reinstated",
      "body": "Your account has been reinstated. Welcome back!"
    },
    "account_suspension_expired": {
      "title": "Suspension Lifted",
      "body": "Your temporary suspension has expired. You can use the service again."
    },
    "inactivity_warning": {
      "title": "We Miss You!",
      "body": "You haven't been on Nikah Help for a while. New people are waiting!"
    }
  }
}
```

### Template Resolution

```typescript
// lib/notifications/templates.ts
import type { NotificationType } from './types'

interface TemplateKeys {
  titleKey: string
  bodyKey: string
}

/**
 * Maps each notification type to its i18n keys.
 * Single source of truth — all template keys are resolved here.
 *
 * To add a new notification type:
 * 1. Add the type to NotificationType in types.ts
 * 2. Add the mapping here
 * 3. Add RU + EN translations to messages/*.json
 * 4. Add required fields to validation.ts
 */
const TEMPLATE_MAP: Record<NotificationType, TemplateKeys> = {
  like_received: {
    titleKey: 'notifications.like_received.title',
    bodyKey: 'notifications.like_received.body',
  },
  like_revoked: {
    titleKey: 'notifications.like_revoked.title',
    bodyKey: 'notifications.like_revoked.body',
  },
  match_created: {
    titleKey: 'notifications.match_created.title',
    bodyKey: 'notifications.match_created.body',
  },
  message_new: {
    titleKey: 'notifications.message_new.title',
    bodyKey: 'notifications.message_new.body',
  },
  photo_approved: {
    titleKey: 'notifications.photo_approved.title',
    bodyKey: 'notifications.photo_approved.body',
  },
  photo_rejected: {
    titleKey: 'notifications.photo_rejected.title',
    bodyKey: 'notifications.photo_rejected.body',
  },
  photo_removed_by_moderator: {
    titleKey: 'notifications.photo_removed_by_moderator.title',
    bodyKey: 'notifications.photo_removed_by_moderator.body',
  },
  account_blocked: {
    titleKey: 'notifications.account_blocked.title',
    bodyKey: 'notifications.account_blocked.body',
  },
  account_reinstated: {
    titleKey: 'notifications.account_reinstated.title',
    bodyKey: 'notifications.account_reinstated.body',
  },
  account_suspension_expired: {
    titleKey: 'notifications.account_suspension_expired.title',
    bodyKey: 'notifications.account_suspension_expired.body',
  },
  inactivity_warning: {
    titleKey: 'notifications.inactivity_warning.title',
    bodyKey: 'notifications.inactivity_warning.body',
  },
}

export function resolveTemplate(type: NotificationType): TemplateKeys {
  const template = TEMPLATE_MAP[type]
  if (!template) {
    // Unknown type — this is a bug, not a runtime condition
    throw new AppError('SYSTEM_INTERNAL_ERROR', {
      message: `No template defined for notification type: ${type}`,
      logContext: { notificationType: type },
    })
  }
  return template
}
```

### Template Safety

Two invariants are enforced:

1. **Compile-time:** `TEMPLATE_MAP` uses `Record<NotificationType, TemplateKeys>`, so TypeScript enforces that every type has an entry.
2. **CI test:** A Vitest test iterates `NotificationType` union values and checks that both `messages/ru.json` and `messages/en.json` contain the corresponding keys. Same pattern as error code CI enforcement in `09-error-handling.md`.

```typescript
// tests/unit/lib/notifications/templates.test.ts
import { describe, it, expect } from 'vitest'
import ruMessages from '@/messages/ru.json'
import enMessages from '@/messages/en.json'

const ALL_TYPES = [
  'like_received',
  'like_revoked',
  'match_created',
  'message_new',
  'photo_approved',
  'photo_rejected',
  'photo_removed_by_moderator',
  'account_blocked',
  'account_reinstated',
  'account_suspension_expired',
  'inactivity_warning',
] as const

describe('notification templates', () => {
  it('should have RU translation for every type', () => {
    for (const type of ALL_TYPES) {
      const t = ruMessages.notifications[type as keyof typeof ruMessages.notifications]
      expect(t).toBeDefined(`Missing RU translation for: ${type}`)
      expect(t.title).toBeTruthy()
      expect(t.body).toBeTruthy()
    }
  })

  it('should have EN translation for every type', () => {
    for (const type of ALL_TYPES) {
      const t = enMessages.notifications[type as keyof typeof enMessages.notifications]
      expect(t).toBeDefined(`Missing EN translation for: ${type}`)
      expect(t.title).toBeTruthy()
      expect(t.body).toBeTruthy()
    }
  })

  it('should not have orphaned translations without a type', () => {
    for (const key of Object.keys(ruMessages.notifications)) {
      expect(ALL_TYPES).toContain(key as (typeof ALL_TYPES)[number])
    }
  })
})
```

---

## Requirement: Link Resolution

### Scenario: A notification payload needs a deep link

**Given** a notification of type `match_created` with `matchId = "abc-123"`
**When** `resolveLink()` is called
**Then** it returns `/matches/abc-123`

All entity-based links are resolved in one place. Route changes (e.g. `/matches/:id` → `/chat/:id`) require a single-line edit.

### Route Map

```typescript
// lib/notifications/links.ts
import type { NotificationType, NotificationContext } from './types'

/**
 * Centralized entity link resolver.
 * Maps (type, context) → app route path.
 *
 * Returns undefined if the notification type has no meaningful link
 * (e.g. account_blocked — user can't access the app).
 */
export function resolveLink(
  type: NotificationType,
  context: NotificationContext,
): string | undefined {
  switch (type) {
    // Social — link to the relevant entity
    case 'like_received':
      return context.actorId ? `/profiles/${context.actorId}` : undefined

    case 'match_created':
      return context.matchId ? `/matches/${context.matchId}` : undefined

    case 'message_new':
      return context.chatId ? `/chat/${context.chatId}` : undefined

    case 'like_revoked':
      return undefined // No link — the like is gone

    // Moderation — photos
    case 'photo_approved':
    case 'photo_rejected':
      return '/settings/photos'

    case 'photo_removed_by_moderator':
      return '/settings/photos'

    // Moderation — account
    case 'account_blocked':
      return undefined // User cannot access the app

    case 'account_reinstated':
    case 'account_suspension_expired':
      return '/feed'

    // System
    case 'inactivity_warning':
      return '/feed'

    default:
      return undefined
  }
}
```

### Route Reference Table

Centralized route patterns for the entire app. If a route changes, update it here and in `resolveLink()`:

| Route              | Pattern                        | Used By                                                                  |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------ |
| `/profiles/:id`    | Public profile view            | `like_received`                                                          |
| `/matches/:id`     | Match detail / chat initiation | `match_created`                                                          |
| `/chat/:id`        | Chat conversation              | `message_new`                                                            |
| `/settings/photos` | Photo management               | `photo_approved`, `photo_rejected`, `photo_removed_by_moderator`         |
| `/feed`            | Main feed                      | `account_reinstated`, `account_suspension_expired`, `inactivity_warning` |
| `/blocked`         | Blocked account info page      | No notification link (redirect page, not linked from notifications)      |

---

## Requirement: Channel Routing

### Dispatch Logic

The Inngest `notification-dispatch` function is the sole dispatcher. It decides which channels to use based on user state and preferences:

```typescript
// lib/inngest/functions/notification-dispatch.ts
import { inngest } from '@/lib/inngest/client'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { sendWebPush } from '@/lib/web-push/send'
import { sendEmail } from '@/lib/resend/client'
import { getPresence } from '@/lib/realtime/presence'
import type { NotificationPayload } from '@/lib/notifications/types'

export const notificationDispatch = inngest.createFunction(
  { id: 'notification-dispatch' },
  { event: 'notification/send' },
  async ({ event }) => {
    const { userId, payload } = event.data as {
      userId: string
      payload: NotificationPayload
    }

    const supabase = createSupabaseAdmin()

    // 1. Check notification preferences
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', userId)
      .eq('type', payload.payload.type)
      .single()

    if (prefs && !prefs.enabled) {
      return // User disabled this notification type
    }

    // 2. Persist to DB (for in-app notification center)
    const { data: row } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: payload.payload.type,
        title_key: payload.title_key,
        body_key: payload.body_key,
        payload: payload.payload,
        entity_id: payload.payload.entity_id ?? null,
      })
      .select('id')
      .single()

    if (!row) {
      throw new Error('Failed to insert notification')
    }

    // 3. Check if user is online (Presence)
    const isOnline = await getPresence(userId)

    if (isOnline) {
      // Realtime Postgres Changes delivers the INSERT automatically.
      // The `notifications` table is in the supabase_realtime publication.
      // The client's useNotifications() hook receives the new row via the
      // Supabase Realtime channel and renders it in-app.
      return
    }

    // 4. Offline — Web Push
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (subscriptions && subscriptions.length > 0) {
      // Resolve locale for push notification text
      const { data: profile } = await supabase
        .from('profiles')
        .select('locale')
        .eq('id', userId)
        .single()

      const locale = profile?.locale ?? 'ru'

      // Resolve translated text server-side for push
      const { getTranslations } = await import('next-intl/server')
      const t = await getTranslations({ locale, namespace: 'notifications' })

      const pushTitle = t(`${payload.payload.type}.title`, payload.payload as any)
      const pushBody = t(`${payload.payload.type}.body`, payload.payload as any)

      for (const sub of subscriptions) {
        await sendWebPush({
          subscription: sub,
          title: pushTitle,
          body: pushBody,
          url: payload.payload.link
            ? `${process.env.NEXT_PUBLIC_APP_URL}${payload.payload.link}`
            : process.env.NEXT_PUBLIC_APP_URL!,
          tag: payload.payload.type,
        })
      }
    }

    // 5. Email — only for types configured to send email
    if (shouldSendEmail(payload.payload.type)) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('locale')
        .eq('id', userId)
        .single()

      await sendEmail({
        to: userId, // Resolved to email via Supabase Admin API
        templateId: `notification-${payload.payload.type}`,
        locale: profile?.locale ?? 'ru',
        variables: {
          app_link: `${process.env.NEXT_PUBLIC_APP_URL}${payload.payload.link ?? '/feed'}`,
          reason: payload.payload.reason,
          actor_name: payload.payload.actor_name,
        },
      })
    }
  },
)

/**
 * Only specific notification types trigger emails.
 * Most social notifications are sufficiently covered by in-app + push.
 */
function shouldSendEmail(type: string): boolean {
  const emailTypes = new Set([
    'match_created',
    'account_blocked',
    'account_reinstated',
    'account_suspension_expired',
    'photo_removed_by_moderator',
    'inactivity_warning',
  ])
  return emailTypes.has(type)
}
```

### Channel Routing Table

| Type                         | In-App (Realtime) | Web Push        | Email |
| ---------------------------- | ----------------- | --------------- | ----- |
| `like_received`              | ✅ (if online)    | ✅ (if offline) | —     |
| `like_revoked`               | ✅                | —               | —     |
| `match_created`              | ✅                | ✅              | ✅    |
| `message_new`                | ✅                | ✅              | —     |
| `photo_approved`             | ✅                | —               | —     |
| `photo_rejected`             | ✅                | —               | —     |
| `photo_removed_by_moderator` | ✅                | —               | ✅    |
| `account_blocked`            | —                 | —               | ✅    |
| `account_reinstated`         | —                 | —               | ✅    |
| `account_suspension_expired` | —                 | —               | ✅    |
| `inactivity_warning`         | —                 | —               | ✅    |

---

## Requirement: Storage

### Database Schema (already defined in 02-database.md)

```sql
-- Enum for read status
CREATE TYPE notification_status AS ENUM ('unread', 'read');

-- Core notifications table
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        text NOT NULL,
  status      notification_status NOT NULL DEFAULT 'unread',
  title_key   text NOT NULL,
  body_key    text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  entity_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

-- Indexes
CREATE INDEX idx_notifications_user
  ON notifications (user_id, created_at DESC);

CREATE INDEX idx_notifications_unread
  ON notifications (user_id, status)
  WHERE status = 'unread';

-- Notification preferences per type
CREATE TABLE notification_preferences (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type    text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, type)
);
```

### Retention Policy

Notifications older than 90 days are deleted by a Vercel Cron job:

```typescript
// app/api/cron/cleanup-notifications/route.ts
// Runs daily at 04:00 UTC
// DELETE FROM notifications WHERE created_at < now() - INTERVAL '90 days'
```

Read notifications older than 30 days are also purged:

```sql
DELETE FROM notifications
WHERE status = 'read'
  AND created_at < now() - INTERVAL '30 days';
```

---

## Requirement: Integration Examples

### Example 1: Like Received (social action)

```typescript
// features/likes/server/send-like.ts
import { createNotification } from '@/lib/notifications/factory'
import { inngest } from '@/lib/inngest/client'

export async function sendLike(fromUserId: string, toUserId: string) {
  // ... business logic (limit check, insert, etc.) ...

  // Get actor name for the notification
  const { data: actor } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', fromUserId)
    .single()

  // Build notification through the factory
  const notification = createNotification('like_received', {
    recipientId: toUserId,
    actorId: fromUserId,
    actorName: actor?.name ?? 'Someone',
    entityId: fromUserId, // Link to the liker's profile
    entityType: 'profile',
  })

  // Dispatch via Inngest — fire and forget
  await inngest.send({
    name: 'notification/send',
    data: {
      userId: toUserId,
      payload: notification,
    },
  })
}
```

### Example 2: Match Created (mutual like detected)

```typescript
// features/likes/server/check-match.ts
import { createNotification } from '@/lib/notifications/factory'
import { inngest } from '@/lib/inngest/client'

export async function checkAndCreateMatch(likerId: string, likedId: string) {
  // Check if the liked user has also liked the liker
  const { data: mutual } = await supabase
    .from('likes')
    .select('id')
    .eq('from_user_id', likedId)
    .eq('to_user_id', likerId)
    .single()

  if (!mutual) return null // No match yet

  // Create the match
  const { data: match } = await supabase
    .from('matches')
    .insert({
      user1_id: likerId,
      user2_id: likedId,
    })
    .select('id')
    .single()

  if (!match) throw new Error('Failed to create match')

  // Notify BOTH users
  const [profile1, profile2] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', likerId).single(),
    supabase.from('profiles').select('name').eq('id', likedId).single(),
  ])

  const notification1 = createNotification('match_created', {
    recipientId: likerId,
    actorId: likedId,
    actorName: profile2.data?.name ?? 'Someone',
    matchId: match.id,
    entityId: match.id,
    entityType: 'match',
  })

  const notification2 = createNotification('match_created', {
    recipientId: likedId,
    actorId: likerId,
    actorName: profile1.data?.name ?? 'Someone',
    matchId: match.id,
    entityId: match.id,
    entityType: 'match',
  })

  // Fire both — Inngest handles them independently
  await Promise.all([
    inngest.send({ name: 'notification/send', data: { userId: likerId, payload: notification1 } }),
    inngest.send({ name: 'notification/send', data: { userId: likedId, payload: notification2 } }),
  ])

  return match
}
```

### Example 3: Message Sent (chat)

```typescript
// features/chat/server/send-message.ts
import { createNotification } from '@/lib/notifications/factory'
import { inngest } from '@/lib/inngest/client'

export async function sendMessage(senderId: string, chatId: string, text: string) {
  // ... insert message into messages table ...

  const { data: message } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      body: text,
    })
    .select('id, chat_id')
    .single()

  // Determine recipient
  const { data: chat } = await supabase
    .from('chats')
    .select('user1_id, user2_id')
    .eq('id', chatId)
    .single()

  const recipientId = chat.user1_id === senderId ? chat.user2_id : chat.user1_id

  const { data: sender } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', senderId)
    .single()

  const notification = createNotification('message_new', {
    recipientId,
    actorId: senderId,
    actorName: sender?.name ?? 'Someone',
    messageId: message.id,
    chatId: message.chat_id,
    entityId: message.id,
    entityType: 'message',
  })

  await inngest.send({
    name: 'notification/send',
    data: { userId: recipientId, payload: notification },
  })

  return message
}
```

### Example 4: Moderation — Photo Removed

```typescript
// features/moderation/server/remove-photo.ts
import { createNotification } from '@/lib/notifications/factory'
import { inngest } from '@/lib/inngest/client'

export async function removePhotoByModerator(photoId: string, reason: string, moderatorId: string) {
  // ... mark photo as rejected, delete from storage, etc. ...

  const { data: photo } = await supabase
    .from('photos')
    .select('user_id, id')
    .eq('id', photoId)
    .single()

  if (!photo) throw new AppError('NOT_FOUND')

  const notification = createNotification('photo_removed_by_moderator', {
    recipientId: photo.user_id,
    photoId: photo.id,
    entityId: photo.id,
    entityType: 'photo',
    reason,
  })

  await inngest.send({
    name: 'notification/send',
    data: { userId: photo.user_id, payload: notification },
  })
}
```

### Example 5: Moderation — Account Blocked

```typescript
// features/moderation/server/block-account.ts
import { createNotification } from '@/lib/notifications/factory'
import { inngest } from '@/lib/inngest/client'

export async function blockAccount(
  targetUserId: string,
  reason: string,
  isPermanent: boolean,
  banDurationDays?: number,
) {
  // ... suspend user, sign out sessions, etc. ...

  const duration = isPermanent ? undefined : `${banDurationDays} days`

  const notification = createNotification('account_blocked', {
    recipientId: targetUserId,
    reason,
    banDuration: duration,
  })

  // Even though account is blocked, the notification is still sent.
  // The dispatch function delivers via email since in-app is inaccessible.
  await inngest.send({
    name: 'notification/send',
    data: { userId: targetUserId, payload: notification },
  })
}
```

### Example 6: Cron — Inactivity Warning

```typescript
// app/api/cron/inactive-account-warn/route.ts
import { createNotification } from '@/lib/notifications/factory'
import { inngest } from '@/lib/inngest/client'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createSupabaseAdmin()

  // Find users inactive > 90 days
  const { data: inactiveUsers } = await supabase
    .from('profiles')
    .select('id')
    .lt('last_seen_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .eq('is_published', true)
    .limit(500)

  if (!inactiveUsers) {
    return Response.json({ processed: 0 })
  }

  // Batch send notifications
  const events = inactiveUsers.map((user) =>
    inngest.send({
      name: 'notification/send',
      data: {
        userId: user.id,
        payload: createNotification('inactivity_warning', {
          recipientId: user.id,
        }),
      },
    }),
  )

  await Promise.all(events)

  return Response.json({ processed: inactiveUsers.length })
}
```

---

## Requirement: Error Handling

### Template Missing (Bug — Should Never Happen)

If `resolveTemplate()` is called with an unknown type, it throws `SYSTEM_INTERNAL_ERROR`. This is a developer bug (forgot to add the template after adding a type), not a runtime condition. TypeScript's exhaustiveness check on `Record<NotificationType, ...>` prevents this at compile time.

### Context Missing Required Fields

If a caller provides incomplete context, `validateContext()` throws `VALIDATION_INVALID_INPUT` with per-field details. This is a developer bug — the caller should provide all required fields. The error surfaces immediately in development and is caught by the caller's error boundary in production.

### Dispatch Failure

If the Inngest event fails to send, the error is logged and the business action continues. The notification is a side effect, not a critical path:

```typescript
try {
  await inngest.send({ name: 'notification/send', data: { userId, payload: notification } })
} catch (error) {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'notification.inngest_send_failed',
      userId,
      type: notification.payload.type,
      error: (error as Error).message,
    }),
  )
  // Proceed — don't fail the business action because of a notification error
}
```

### Email Delivery Failure

If Resend fails, the Inngest function retries with exponential backoff (Inngest built-in). After 3 retries, the event is moved to the dead letter queue. Failed email deliveries are logged but don't affect in-app or push delivery.

### Fallback Language

If `profiles.locale` is NULL or an unsupported value, the dispatch function defaults to `'ru'`:

```typescript
const locale = profile?.locale ?? 'ru'
if (!['ru', 'en'].includes(locale)) {
  locale = 'ru'
}
```

### Empty Push Subscriptions

If the user has no push subscriptions (unregistered, revoked, or cleaned up), push delivery is silently skipped. Only in-app and email channels are attempted.

---

## Requirement: Performance

### Latency Budget

| Component                             | Target  |
| ------------------------------------- | ------- |
| `createNotification()` (sync, no I/O) | < 0.1ms |
| `inngest.send()` (fire and forget)    | < 10ms  |
| Total overhead on business action     | < 10ms  |

### Design Decisions for Performance

1. **Factory is synchronous.** No DB queries, no network calls. Just string interpolation and object construction.
2. **Inngest is fire-and-forget.** `inngest.send()` enqueues an event and returns immediately. The caller doesn't wait for dispatch to complete.
3. **No heavy computation in the request cycle.** Template resolution is a map lookup. Link resolution is a switch statement. Validation iterates over at most 5 fields.
4. **Batch dispatch for bulk operations.** The inactivity cron batches 500 Inngest events in a single `Promise.all()`.
5. **Realtime is zero-cost for the server.** When the user is online, the INSERT into `notifications` automatically streams to the client via Supabase Realtime Postgres Changes — no additional server work.

### Anti-Patterns to Avoid

```typescript
// ❌ Fetching actor profile inside the factory
function createNotification(type, context) {
  const actor = await supabase.from('profiles').select('name').eq('id', context.actorId)
  // ... NO. The factory is sync. The caller provides actorName.
}

// ❌ Sending notifications synchronously in the request handler
async function POST(request) {
  await sendLike(...)
  await sendPush(...)   // Blocks the response
  await sendEmail(...)  // Blocks the response
  return Response.json({ ok: true })
}

// ✅ Fire-and-forget via Inngest
async function POST(request) {
  await sendLike(...)
  await inngest.send({ name: 'notification/send', ... })
  return Response.json({ ok: true })
}

// ❌ Building notification payloads inline
await inngest.send({
  name: 'notification/send',
  data: {
    userId,
    payload: {
      title_key: 'notifications.like_received.title', // Hardcoded string
      body_key: 'notifications.like_received.body',   // Hardcoded string
      payload: { type: 'like_received', ... },
    },
  },
})

// ✅ Always use the factory
const notification = createNotification('like_received', { ... })
await inngest.send({ name: 'notification/send', data: { userId, payload: notification } })
```

---

## Requirement: Extensibility

### Adding a New Notification Type

Checklist — follow these 6 steps:

1. **Add the type** to `NotificationType` union in `lib/notifications/types.ts`:

   ```typescript
   | 'profile_viewed'  // New type
   ```

2. **Add required fields** to `REQUIRED_FIELDS` in `lib/notifications/validation.ts`:

   ```typescript
   profile_viewed: ['recipientId', 'actorId', 'actorName', 'entityId'],
   ```

3. **Add template keys** to `TEMPLATE_MAP` in `lib/notifications/templates.ts`:

   ```typescript
   profile_viewed: {
     titleKey: 'notifications.profile_viewed.title',
     bodyKey: 'notifications.profile_viewed.body',
   },
   ```

4. **Add translations** to both locale files:

   ```json
   // messages/ru.json
   "profile_viewed": {
     "title": "Кто-то посмотрел ваш профиль",
     "body": "{actorName} посмотрел(а) ваш профиль"
   }
   // messages/en.json
   "profile_viewed": {
     "title": "Profile View",
     "body": "{actorName} viewed your profile"
   }
   ```

5. **Add link resolution** in `lib/notifications/links.ts`:

   ```typescript
   case 'profile_viewed':
     return context.actorId ? `/profiles/${context.actorId}` : undefined
   ```

6. **Update channel routing** in the dispatch function if the new type needs email:

   ```typescript
   // In shouldSendEmail() — only if email is needed
   'profile_viewed', // Probably not — too noisy
   ```

7. **Update the CI test** with the new type name.

### Updating Templates

To change notification text, edit only the JSON message files. No code changes needed. The `title_key` and `body_key` stored in existing rows remain valid — the client resolves them against the updated messages.

### Adding a New Delivery Channel

To add a new channel (e.g., SMS, Telegram):

1. Add the channel to the `Channel` type:

   ```typescript
   export type Channel = 'in_app' | 'email' | 'push' | 'sms'
   ```

2. Add the delivery logic to the dispatch function:

   ```typescript
   if (channels.includes('sms')) {
     await sendSms({ to: profile.phone, body: smsBody })
   }
   ```

3. Add a column to `notification_preferences` or add a `channels` jsonb column to control per-channel opt-out. The existing `enabled` boolean is per-type; per-channel preferences require a schema migration (out of scope for MVP).

### Per-Channel Opt-Out (Future)

The current `notification_preferences` table controls enable/disable per notification TYPE. For per-CHANNEL opt-out, add a `channels` column:

```sql
ALTER TABLE notification_preferences
ADD COLUMN channels jsonb NOT NULL DEFAULT '["in_app", "push", "email"]';
```

The dispatch function would then check:

```typescript
const allowedChannels = prefs.channels ?? ['in_app', 'push', 'email']
```

---

## File Summary

```
lib/notifications/
├── types.ts          # NotificationType, NotificationContext, NotificationOptions, NotificationPayload
├── factory.ts        # createNotification() — the single entry point
├── templates.ts      # TEMPLATE_MAP — type → i18n keys, resolveTemplate()
├── links.ts          # resolveLink() — type + context → app route
└── validation.ts     # validateContext() — required field enforcement

lib/inngest/functions/
└── notification-dispatch.ts  # Single dispatch function: persist + route to channels

messages/
├── ru.json           # notifications.{type}.{title,body} in Russian
└── en.json           # notifications.{type}.{title,body} in English

app/api/cron/
└── cleanup-notifications/route.ts  # Purge old notifications (90d all, 30d read)
```

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md) — Inngest, Supabase Realtime, Resend in tech stack
- [02 — Database Schema & RLS](./02-database.md) — notifications, push_subscriptions, notification_preferences tables
- [04 — Chat, Realtime & Notifications](./04-chat-realtime.md) — Presence, Web Push architecture, Realtime publication
- [07 — Infrastructure, Testing & i18n](./07-infrastructure.md) — Vercel Cron jobs, i18n patterns, PostHog events
- [08 — Reports, Moderation & Suspensions](./08-moderation.md) — moderation-triggered notifications
- [09 — Error Handling System](./09-error-handling.md) — AppError class, VALIDATION_INVALID_INPUT, SYSTEM_INTERNAL_ERROR codes
- [10 — Rate Limiting System](./10-rate-limiting.md) — notification-create rate limit
- [11 — Idempotency System](./11-idempotency.md) — idempotency for notification dispatch
