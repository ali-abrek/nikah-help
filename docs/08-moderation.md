# 08 — Reports, Moderation & Bans

## Purpose

This file defines the user-reporting flow (profile or photo), moderator UI and actions (block user, remove photo), the user-block list, and the persistent banned-emails list. The schema for `reports`, `user_suspensions`, `blocks`, and `banned_emails` is defined in [02 — Database Schema & RLS](./02-database.md). This file defines the **business rules and flows** built on top of that schema.

> **Decision:** MVP supports two moderator actions — **Remove photo** and **Block user (permanent)**. Warnings and time-limited suspensions are intentionally NOT exposed in the UI for MVP. The `user_suspensions` schema is kept flexible so they can be added later without a migration.

> **MANDATORY OBSERVABILITY (moderation):** Per [14-sentry-observability.md](14-sentry-observability.md):
> * `flow=moderation.vision`, `provider=<sightengine|openai>` — vision/moderation API failure inside the `moderate-photo` Inngest function. Severity: error.
> * `flow=moderation.action` — failure to persist a moderator action (block, remove photo, suspension write). Severity: error.
> * Reported entity ids and `report_id` are acceptable tags. Reported message text, photo bytes, and reporter/reported emails are NOT.

---

## Requirement: Reporting Entry Points

Reports can be filed against two entity kinds:

| Entity | Where the user triggers it |
|---|---|
| `profile` | Other user's profile page → kebab menu "Report user" |
| `photo` | Photo viewer (lightbox) → kebab menu "Report photo" (only on other users' photos) |

> **Decision:** Reports on individual chat messages are NOT supported. If a user is being harassed in chat, they should **block the user** (which deletes the chat and the match — see [03 — Block List](./03-profiles-feed.md#requirement-block-list)) and optionally file a `profile` report.

### Scenario: User opens the Report dialog

**Given** an authenticated user clicks "Report" on a profile or photo
**When** the Report dialog opens
**Then** it shows:
- A free-text textarea **"Reason (optional)"**, max 500 characters
- A "Send" button
- A "Cancel" button

> **Decision:** No predefined reason codes / radios. The reporter writes a short free-form reason (or skips it). Categorisation is the moderator's job.

### Scenario: Report submission

**Given** the dialog is filled out (or left empty)
**When** the user submits
**Then** Server Action `submitReport({ type, entityId, comment })`:
1. Validates inputs via Zod v4 (`type ∈ {'profile','photo'}`, `comment` optional, ≤500 chars)
2. Resolves `reported_user_id`:
   - For `type = 'profile'`: `entityId` IS the `reported_user_id`
   - For `type = 'photo'`: `reported_user_id = (SELECT profile_id FROM photos WHERE id = entityId)`
3. Rejects if `reporter_id = reported_user_id`
4. Rate-limits to **5 reports / day per reporter** via Upstash
5. INSERTs into `reports` (`status = 'new'`, `comment` may be NULL)
6. Returns success toast: "Thank you for your report. Our team will review it shortly."

> **Decision:** Reports are NOT acknowledged with a status update to the reporter. Privacy of moderation outcomes is preserved.

### Auto-Triage (lightweight)

The only automatic action is on the photo itself:

| Rule | Action |
|---|---|
| ≥ 3 distinct reports against the same photo within 24h | Auto-set `photos.moderation_status = 'manual_review'`, hiding it from feed pending review |

This rule is implemented in a Postgres function fired on `reports` INSERT. No automatic user blocks; humans decide on user blocks.

---

## Requirement: Moderator Panel (`/admin/reports`)

### Scenario: Moderator opens the queue

**Given** an authenticated user with `role IN ('moderator', 'admin')`
**When** they open `/admin/reports`
**Then** they see a paginated, filterable list of reports:
- Filters: `type`, `status`, date range
- Default sort: `created_at DESC`
- Each row shows: timestamp, reported user (name + avatar), entity preview (photo thumbnail or profile snippet), reporter comment (truncated), status

### Scenario: Moderator opens a single report

**Given** the moderator clicks a row
**When** the detail view opens
**Then** they see:
- The full reported entity (profile snapshot or photo at full resolution)
- The reporter's comment (if any)
- The reported user's history: count of prior `resolved` reports against them, current ban state
- Action buttons: **Dismiss**, **Remove photo** (only if `type = 'photo'`), **Block user**

### Scenario: Moderator dismisses a report

**Given** the moderator decides the report is unfounded
**When** they click "Dismiss"
**Then** `reports.status = 'resolved'`, `reports.resolution = 'dismissed'`, `reports.moderator_id = me`, `reports.resolved_at = now()`
**And** if the photo had been auto-hidden via `manual_review`: `photos.moderation_status = 'approved'`
**And** no notification is sent to the reporter or to the reported user

### Scenario: Moderator removes a photo

**Given** the report concerns a photo
**When** the moderator clicks "Remove photo"
**Then**:
1. `photos.moderation_status = 'rejected'`, `moderation_reason = 'moderator_removed'`
2. The photo's variants are deleted from Storage via Inngest job `photo/delete`
3. The photo row remains in the DB with `moderation_status = 'rejected'` for audit history
4. If the user had `is_published = true` AND no other approved photos remain: the system sets `is_published = false`
5. The report is closed: `status = 'resolved'`, `resolution = 'photo_removed'`
6. The owner receives an in-app + email notification: "One of your photos was removed by moderation."

### Scenario: Moderator blocks a user

**Given** any report (or any user, accessible via the user search panel)
**When** the moderator clicks "Block user"
**Then** a confirmation dialog appears: "This action will block {name} permanently. They will not be able to sign in, and their email will be added to the registration blocklist. Continue?"
**And** on confirm:
1. INSERT into `user_suspensions(user_id, kind = 'permanent_ban', reason_code = 'moderator_block', notes = <optional moderator note>, created_by = me)`
2. INSERT into `banned_emails(email = <user's email>, reason_code = 'moderator_block', banned_by = me)` (so the email cannot re-register)
3. The user's profile is unpublished (`is_published = false`)
4. All sessions are revoked via Supabase Admin API (`auth.admin.signOut(userId, 'global')`)
5. RLS hides the banned user from feed and chat (`is_user_suspended()` returns true)
6. The report (if any) is closed: `status = 'resolved'`, `resolution = 'user_blocked'`
7. The user receives a final email: "Your account has been blocked. Reason: <moderator note or generic>"

> **Decision:** "Block user" by the moderator is **permanent**. To temporarily restrict a user, future-proof: extend the UI to use the existing `user_suspensions.kind = 'temp_ban'` value (no schema change required).

### Scenario: Admin lifts a block

**Given** an active permanent ban
**When** an admin clicks "Lift block" on the user's record
**Then**:
1. `user_suspensions.lifted_at = now()`, `lifted_by = admin.id` for the active row
2. `banned_emails.lifted_at = now()`, `lifted_by = admin.id` for matching email row
3. The user is notified by email: "Your account has been reinstated. You can sign in again."
4. Sessions remain revoked (the user must request a new Magic Link)

> **Decision:** Moderators (`role = 'moderator'`) can BLOCK users. Only ADMINS (`role = 'admin'`) can LIFT blocks. This separation is enforced in RLS on `user_suspensions` and `banned_emails`.

---

## Requirement: Block List Panel (`/admin/blocks`)

A separate panel shows the **complete list of currently-blocked users**, sourced from `user_suspensions` joined with `profiles` and `banned_emails`. This is the canonical "Block list" the user requested.

### Scenario: Moderator views the block list

**Given** an authenticated user with `role IN ('moderator', 'admin')`
**When** they open `/admin/blocks`
**Then** they see a paginated table:
- Columns: User (name + avatar — or "deleted account" if profile gone), Email, Banned at, Banned by (moderator name), Reason, Status (`active`, `lifted`)
- Filters: `status` (default = active), date range, banned_by
- Search: by email or name
- Sort: most recent first

### Scenario: Admin lifts a block from the panel

**Given** the admin selects an active row
**When** they click "Lift"
**Then** the same flow as the user-detail Lift action runs (see above)

> **Decision:** This panel is read-only for moderators (they can see history but cannot lift bans they issued).

---

## Requirement: User-initiated Block List (`/settings/blocked`)

End-users have their **own** block list (people they personally blocked, separate from moderator action). Schema is `blocks` (see [02 — Database](./02-database.md)). Flow is in [03 — Block List](./03-profiles-feed.md#requirement-block-list).

| Aspect | User-initiated `blocks` | Moderator-initiated `user_suspensions` |
|---|---|---|
| Scope | Affects only the blocker's view | Affects everyone (user cannot sign in) |
| Audience | The blocking user only | Platform-wide |
| Reversal | Blocker can unblock | Only admin can lift |
| Persistence | Survives target's account deletion via peppered `blocked_email_hash` | `banned_emails` row preserves the (plaintext) email even after data deletion |

---

## Requirement: Suspension Enforcement

The `is_user_suspended()` helper (defined in `02-database.md`) returns `true` for users with active `permanent_ban` (or `temp_ban` if used in the future).

### Sign-in block

`proxy.ts` MUST check on every authenticated request:

```typescript
const claims = await supabase.auth.getClaims()
if (claims) {
  const { data: suspended } = await supabase.rpc('is_user_suspended', { p_user: claims.sub })
  if (suspended) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/blocked', request.url))
  }
}
```

### Page `/blocked`

Renders a public, unauthenticated page showing:
- "This account has been blocked."
- A "Contact support" mailto link
- No re-login form

### Effects on RLS

- `select_profile`, `select_photos` (and any "viewer" policy) include `NOT is_user_suspended(profiles.id)` so blocked users disappear from feed and search.
- All write paths fail because the blocked user cannot have a valid session.

---

## Requirement: Notifications Generated by Moderation

| Trigger | Notification type | Channels |
|---|---|---|
| Photo removed by moderator | `photo_removed_by_moderator` | In-app + Email |
| User blocked by moderator | `account_blocked` | Email only (in-app inaccessible) |
| Block lifted by admin | `account_reinstated` | Email |

All notifications use i18n keys; texts live in `messages/{locale}.json` under `notifications.moderation.*`.

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md)
- [01 — Authentication & Onboarding](./01-auth.md)
- [02 — Database Schema & RLS](./02-database.md)
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md)
- [04 — Chat, Realtime & Notifications](./04-chat-realtime.md)
- [06 — Image Processing & Storage](./06-image-processing.md)
