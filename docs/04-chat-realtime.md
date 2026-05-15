# 04 — Chat, Realtime & Notifications

## Purpose

This file defines the real-time chat architecture, message types, Supabase Realtime v2 usage (Changes, Broadcast, Presence), notification dispatch system, voice messages, and chat deletion.

> **MANDATORY OBSERVABILITY (realtime):** Per [14-sentry-observability.md](14-sentry-observability.md), the chat client MUST capture Realtime channel failures so silent disconnect storms are visible:
>
> - `flow=realtime.channel`, `channel=<name>` — every `CHANNEL_ERROR` and `TIMED_OUT` callback. Severity: warning.
> - Same flow, severity error — when a single session reconnects more than 3 times in 60 s.
> - Message-send and read-receipt route handlers report 5xx via the standard `AppError` → Sentry path.
> - Plaintext message content is **NEVER** sent to Sentry. Only `chat_id`, `message_id`, and `from_user_id` (id, not email) are acceptable tags. Replay is disabled on `/chat/*` (see PII rules in 14).

---

## Requirement: Chat Architecture

### Scenario: Chat becomes available after match

**Given** a mutual match is created between two users
**When** the match row is inserted
**Then** a `chats` row is atomically created by the Postgres trigger
**And** both users can access `chats/[chatId]`
**And** RLS on `messages` restricts reads to the two chat participants

### Technology Stack

- **Supabase Realtime v2** — Postgres Changes on `messages` for new message delivery
- **Broadcast** — ephemeral events (typing, match notifications)
- **Presence** — online/offline status in chat
- **Business logic** — Server Actions + Postgres triggers
- **Storage** — Supabase Postgres

---

## Requirement: Message Types

| Type  | Upload Method                                                     | Delivery                                    |
| ----- | ----------------------------------------------------------------- | ------------------------------------------- |
| Text  | INSERT into `messages` via Server Action                          | Realtime Changes                            |
| Image | Direct upload to Supabase Storage → signed URL path in `messages` | Realtime Changes + Cloudflare CDN for image |
| Voice | Direct upload to Supabase Storage → path in `messages`            | Realtime Changes + Cloudflare CDN for audio |

### Content Limits

All limits validated server-side in the `sendMessage` Server Action and mirrored on the client via Zod v4:

| Type                       | Limit                                        | Notes                                                                                                                                                   |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text                       | **≤ 4000 characters**                        | Counted by `Array.from(str).length` (correct for emoji/CJK)                                                                                             |
| Text                       | Empty / whitespace-only rejected             | Trim + reject                                                                                                                                           |
| Image                      | **≤ 8 MB** per file                          | Accepted: JPEG, PNG, WebP, AVIF, HEIC. Same `sharp` rules as profile photos can be applied for thumbnail generation (Inngest async — not blocking send) |
| Image dimensions           | Reject < 200×200 px (likely accidental icon) |                                                                                                                                                         |
| Voice                      | **≤ 90 seconds** duration                    | Enforced client-side by `MediaRecorder` stop-timer; server re-validates by reading audio metadata in Inngest                                            |
| Voice                      | **≤ 5 MB** per file                          | Hard cap on upload                                                                                                                                      |
| Send rate per user         | **30 messages / minute**                     | Upstash Ratelimit on `sendMessage`                                                                                                                      |
| New chat initiations / day | **10**                                       | Anti-spam against pretend-mass-mutual flow                                                                                                              |

### Edit & Delete Rules

| Action     | Allowed for                              | Notes                                                                     |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| **Edit**   | Text messages only (own)                 | Image / voice messages CANNOT be edited — replace by delete + new message |
| **Delete** | All types (own only): text, image, voice | Creates a tombstone — the message row stays so quote-replies remain valid |

#### Edit (text only)

> **Decision:** Edit is allowed only within **5 minutes after the message was sent**. After that, the "Edit" action is hidden in the UI and rejected on the server. Rationale: matches user expectation from Telegram-style chats and prevents revisionism in conversation history.

**Given** an authenticated user owns a text message that is NOT deleted AND `now() - created_at < interval '5 minutes'`
**When** they invoke "Edit" from the message context menu
**Then**:

- The composer is pre-filled with the current `content` and the message bubble shows an "Editing…" indicator with a small countdown showing remaining edit time
- Server Action `editMessage({ messageId, newContent })`:
  - Validates ownership AND `type = 'text'` AND `deleted_at IS NULL` AND `created_at >= now() - interval '5 minutes'`
  - If the 5-minute window expired between opening the editor and submitting: returns error toast "Edit window expired"
  - UPDATE sets `content = $new`, `edited_at = now()`, `original_content = COALESCE(original_content, OLD.content)` (we keep the first version for moderation/audit)
  - Realtime UPDATE fires; the recipient's UI replaces the bubble in place and shows an "edited" suffix
- After 5 minutes elapse, the "Edit" item disappears from the message context menu (client computes `now() - created_at` from the rendered timestamp).

#### Delete (text / image / voice)

**Given** an authenticated user owns a message that is NOT deleted
**When** they invoke "Delete"
**Then** a confirmation dialog appears: "Delete this message? It will disappear for both of you."
**And** on confirm: Server Action `deleteMessage({ messageId })`:

- Validates ownership and `deleted_at IS NULL`
- Sets `deleted_at = now()`, clears `content` (set to empty string), keeps `type` and `parent_id`
- For image / voice: deletes the file from Storage (`chat-media/{chatId}/{messageId}.{ext}`)
- Realtime UPDATE pushes the tombstone to both parties; UI renders "Message deleted" placeholder

#### Schema additions for `messages`

```sql
ALTER TABLE messages
  ADD COLUMN deleted_at       timestamptz,
  ADD COLUMN edited_at        timestamptz,
  ADD COLUMN original_content text;
```

#### RLS additions

```sql
-- Edit: own text messages, not deleted, within 5-minute window
CREATE POLICY "edit_own_text_message" ON messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    AND type = 'text'
    AND deleted_at IS NULL
    AND created_at >= now() - interval '5 minutes'
  )
  WITH CHECK (
    sender_id = auth.uid()
  );

-- Delete: tombstone via UPDATE — own messages, not yet deleted, no time limit
CREATE POLICY "tombstone_own_message" ON messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    sender_id = auth.uid()
  );
```

> **Decision:** Two separate UPDATE policies are needed because the edit window is stricter than the delete rule. PostgreSQL evaluates policies as a logical OR, so a delete (which sets `deleted_at`) passes through `tombstone_own_message`, while a content edit must pass `edit_own_text_message` (the 5-minute window). Server Actions distinguish the two operations explicitly.

> **Decision:** Quote-replies that point at a tombstoned message render as "Original message deleted" and lose the click-to-jump affordance.

### Message Data Model

See [02 — Database Schema & RLS](./02-database.md) for the complete `messages` table definition.

---

## Requirement: Message Sending Flow

### Scenario: User sends a text message

**Given** an authenticated user in a chat
**When** they submit the message form
**Then** a Server Action `sendMessage` executes:

1. Validates input via Zod v4
2. Verifies the user is a match participant (RLS)
3. INSERTs into `messages`
4. Supabase Realtime broadcasts the INSERT to `chat:${chatId}` subscribers
5. Client optimistically adds the message via `queryClient.setQueryData`
6. If receiver is offline (checked via Presence): Inngest dispatches Web Push notification

### Scenario: User sends an image

**Given** a user in a chat
**When** they select and upload an image
**Then** the image uploads directly to Supabase Storage (chat-media bucket)
**And** the storage path is inserted as `messages.content` with `type = 'image'`
**And** delivery follows the same flow as text messages

### Scenario: User sends a voice message

**Given** a user recording audio
**When** they finish recording
**Then** `MediaRecorder` API captures `audio/webm` (Opus codec)
**And** the blob uploads directly to Supabase Storage (chat-media bucket)
**And** the storage path is inserted as `messages.content` with `type = 'voice'`

---

## Requirement: Message Status & Read Receipts

The `messages.status` enum has three values with strict transition rules:

```
sent ──(recipient online OR push delivered)──> delivered ──(recipient views)──> read
```

| Status      | When written                                                                                                                                                                                                                                                        | By                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sent`      | INSERT default. The sender's optimistic UI also displays this.                                                                                                                                                                                                      | Server Action `sendMessage`                                                                                                                                             |
| `delivered` | Set when **either** (a) recipient is currently online in the chat channel (Presence shows them present in `chat:${chatId}`) and the Realtime INSERT event was acknowledged on their tab, OR (b) Web Push was successfully delivered (no 404/410 from push service). | Server Action `markDelivered` (called from client on Realtime INSERT receipt) and Inngest function `notification-dispatch` after successful `web-push.sendNotification` |
| `read`      | Set when the message becomes visible in the recipient's viewport.                                                                                                                                                                                                   | Server Action `markAsRead({ messageIds })`, also writes `read_at = now()`                                                                                               |

### UI rendering

| Status      | Sender sees                           | Recipient sees          |
| ----------- | ------------------------------------- | ----------------------- |
| `sent`      | Single grey check ✓                   | (their own UI: nothing) |
| `delivered` | Double grey check ✓✓                  | n/a                     |
| `read`      | Double accent-color check ✓✓ (orange) | n/a                     |

### Scenario: User opens a chat

**Given** a user opens `chats/[chatId]`
**When** the messages load
**Then** if there are no unread messages: scroll to bottom
**And** if there are unread messages: a sticky divider "New Messages" appears, scroll to the first unread

### Scenario: Recipient receives a message Realtime event

**Given** a user is subscribed to `chat:${chatId}` and a new INSERT event arrives
**When** the client processes the event
**Then** if the message is from the OTHER user, the client calls `markDelivered({ messageId })` Server Action immediately
**And** the action UPDATEs `messages.status = 'delivered'` only if current status is `'sent'` (no-op for `read`)
**And** Realtime UPDATE on the row pushes the new status back to the sender for the ✓✓ indicator

### Scenario: Recipient is offline — push delivers

**Given** a user is offline (no Presence in chat channel)
**When** the Inngest `notification-dispatch` function calls `web-push.sendNotification` and the push service returns 2xx
**Then** the function calls `markDelivered({ messageId })` (via service-role client)
**And** if the push fails with 404/410, status remains `sent` and the dead subscription is removed (see [Web Push Service Worker](#requirement-web-push-service-worker))

### Scenario: Messages are marked as read

**Given** a user is viewing a chat
**When** messages become visible in the viewport (Intersection Observer)
**Then** a Server Action `markAsRead({ messageIds })` is called
**And** updates `messages.status = 'read'` and `messages.read_at = now()` for messages where `status <> 'read'` AND `sender_id <> auth.uid()`

### Transition guarantees

- Transitions are **one-way and monotonic**: `sent → delivered → read`. Server Actions enforce this with `WHERE status = '<expected_prior>'` clauses and ignore out-of-order events.
- `delivered` skipping is allowed: if the user opens the chat before the Realtime INSERT triggers `markDelivered`, the status jumps `sent → read` directly. The sender's UI still resolves to ✓✓ (read).

---

## Requirement: Realtime — Supabase Realtime v2

### Scenario: Client subscribes to chat channel

**Given** a user opens `chats/[chatId]`
**When** the client initializes
**Then** it subscribes to `chat:${chatId}` channel:

```typescript
const channel = supabase.channel(`chat:${chatId}`, {
  config: {
    broadcast: { self: false },
    presence: { key: userId },
  },
})

// Postgres Changes for new messages
channel.on(
  'postgres_changes',
  {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `chat_id=eq.${chatId}`,
  },
  (payload) => {
    queryClient.setQueryData(['messages', chatId], (old) => [...old, payload.new])
  },
)

// Broadcast for typing indicators
channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
  // update typing indicator UI
})

// Presence for online/offline
channel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    await channel.track({ online_at: new Date().toISOString() })
  }
})
```

### Scenario: Typing indicator

**Given** a user is typing in a chat
**When** they type
**Then** a throttled Broadcast event `{ event: 'typing', payload: { userId } }` is sent
**And** the other user sees a typing indicator
**And** they stop typing for 3 seconds → Broadcast `{ event: 'typing_stop' }`

### Scenario: Online/offline status

**Given** a user opens the chat
**When** the Realtime channel connects
**Then** Presence tracks them as online
**And** when they close the chat or go offline: `presence.leave` fires
**And** `profiles.last_seen_at` is updated

---

## Requirement: Voice Messages

### Scenario: User records and plays voice messages

**Given** a chat UI with voice recording capability
**When** the user holds the record button
**Then** `MediaRecorder` API captures audio (`audio/webm`, Opus codec)
**And** on release: the blob uploads to Supabase Storage

### Playback (wavesurfer.js)

- Waveform visualization, duration display, current/remaining time
- When one voice message finishes: auto-play the next in sequence
- Simultaneous playback of multiple messages is FORBIDDEN (Zustand singleton player)

---

## Requirement: Message Quote Replies

### Scenario: User quotes a message

**Given** a chat with messages
**When** a user performs a quote action (swipe right on mobile, long press / right click on desktop)
**Then** the `parent_id` is set on the new message referencing the quoted message
**And** the quoted message preview is shown above the input field

### Quote Actions by Context

| Context                    | Available Actions                 |
| -------------------------- | --------------------------------- |
| Own text message           | "Copy", "Quote", "Edit", "Delete" |
| Own image message          | "Quote", "Delete"                 |
| Own voice message          | "Quote", "Delete"                 |
| Other user's text message  | "Copy", "Quote"                   |
| Other user's image message | "Quote"                           |
| Other user's voice message | "Quote"                           |

> **Decision:** Reports on individual chat messages are NOT supported. Harassment in chat is handled via [User Block](./03-profiles-feed.md#requirement-block-list) which deletes the chat and the match. The user can additionally file a `profile` report (see [08 — Moderation](./08-moderation.md)).

---

## Requirement: Chat Deletion

### Scenario: User deletes a chat

**Given** a user in a chat
**When** they trigger chat deletion
**Then** Inngest workflow `chat.delete` executes:

1. SELECT messages WHERE type IN ('image', 'voice') AND chat_id = $id
2. DELETE files from Supabase Storage
3. DELETE messages (cascade)
4. DELETE chat
   **And** Broadcast notifies both participants
   **And** idempotency: `chat-delete:${chatId}`

---

## Requirement: Notification System

### Architecture

A single dispatch point. No business service sends notifications directly.

Sources → Inngest:

- Server Actions → Inngest events
- Postgres triggers → Database Webhooks → Inngest

### Inngest Event Format

```typescript
{
  name: 'notification/dispatch',
  data: {
    user_id: string,
    type:
      | 'like_received' | 'match_created' | 'message_new' | 'like_revoked'
      | 'photo_approved' | 'photo_rejected'
      | 'photo_removed_by_moderator' | 'account_blocked' | 'account_reinstated',
    title_key: string,   // i18n key
    body_key: string,    // i18n key
    payload: Record<string, unknown>,
    entity_id?: string,
    idempotency_key: string,
  }
}
```

### Delivery Channels

| Channel                                                  | Condition                                 |
| -------------------------------------------------------- | ----------------------------------------- |
| In-App (Supabase Realtime Broadcast on `user:${userId}`) | User is online (Presence)                 |
| Web Push (`web-push` + VAPID)                            | User is offline, has push subscription    |
| Email (Resend)                                           | By notification type and user preferences |

### Scenario: User receives notification in-app

**Given** a user is online
**When** a notification event is dispatched
**Then** INSERT into `notifications` table
**And** Supabase Realtime Postgres Changes on `notifications` pushes it to the client
**And** the notification badge updates in real-time

### Scenario: User receives notification while offline

**Given** a user is offline
**When** a notification event is dispatched
**Then** INSERT into `notifications` table
**And** Inngest function checks Presence → user offline
**And** sends Web Push via `web-push` library with VAPID keys
**And** reads `profiles.locale` for localized push text

### Scenario: User views notification history

**Given** a user on `/notifications`
**When** the page loads
**Then** a chronological list renders with cursor-based pagination
**And** unread notifications are visually distinct
**And** clicking a notification marks it as read and navigates to the relevant entity

### Notification Requirements

- **Idempotency:** Inngest built-in mechanism via event ID
- **Rate limiting:** `notification-create:${userId}:${type}` via Upstash
- **User preferences:** `notification_preferences(user_id, type, enabled)` controls channels
- All notifications stored in `notifications` table (full history)

---

## Requirement: Web Push Service Worker

Web Push requires a **registered Service Worker** that lives at the site root. Supabase Realtime is the in-app channel; Web Push covers offline.

### File: `public/sw.js`

```javascript
// public/sw.js — served at https://your-domain.com/sw.js (root scope)
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  const payload = event.data.json()
  // payload: { title, body, icon, badge, url, tag, renotify }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? '/icon-192.png',
      badge: payload.badge ?? '/badge-72.png',
      data: { url: payload.url },
      tag: payload.tag,
      renotify: payload.renotify ?? false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(url))
      if (existing) return existing.focus()
      return clients.openWindow(url)
    }),
  )
})
```

### Registration (client side, gated on permission)

```typescript
// lib/web-push/register.ts
'use client'
export async function registerPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null

  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })

  // Persist subscription server-side
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })
  return sub
}
```

### Backend send (`web-push` library)

```typescript
// lib/web-push/send.ts
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function sendPush(subscription: PushSubscriptionJSON, payload: object) {
  try {
    await webpush.sendNotification(subscription as any, JSON.stringify(payload))
  } catch (err: any) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Subscription is dead — DELETE FROM push_subscriptions
      await deleteSubscription(subscription.endpoint!)
    } else {
      throw err
    }
  }
}
```

### Lifecycle Rules

- The Service Worker is registered on first authenticated visit, but `Notification.requestPermission()` is only called from **a user gesture** (a button "Enable notifications") — never automatically on page load.
- Subscriptions are stored in `push_subscriptions` keyed by `(user_id, endpoint)`. Endpoint changes (browser reissue) → upsert.
- Dead subscriptions (404/410 from push service) are deleted server-side on first failed send.
- Service Worker updates are forced on every deploy via `self.skipWaiting()` + `clients.claim()`.

### CSP

Service Worker registration requires `worker-src 'self' blob:` in CSP (covered in `07-infrastructure.md`).

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md)
- [02 — Database Schema & RLS](./02-database.md)
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md)
- [05 — Payments (T-Bank)](./05-payments.md)
- [07 — Infrastructure, Testing & i18n](./07-infrastructure.md)
- [08 — Reports, Moderation & Bans](./08-moderation.md)
