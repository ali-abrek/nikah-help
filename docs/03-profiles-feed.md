# 03 — Profiles, Feed & Matching

## Purpose

This file defines profile management, profile publishing, the feed with filtering (including PostGIS radius search), the likes system, match creation, and tariff-based limits.

---

## Requirement: Profile Publishing

### Profile States

| `profiles.is_published` | Visibility                                                          |
| ----------------------- | ------------------------------------------------------------------- |
| `true`                  | Visible in search, feed, recommendations. Accessible by ID.         |
| `false`                 | Excluded from search. Not accessible by ID (unless own or matched). |

Default: `true` after onboarding completion.

### Scenario: User unpublishes their profile

**Given** an authenticated user on their profile page
**When** they toggle the "Profile Published" switch to off
**Then** a confirmation dialog appears: "Are you sure you want to unpublish your profile? It will stop appearing in the feed."
**And** on confirm: `is_published = false`, toast: "You have unpublished your profile..."

### Scenario: User publishes their profile

**Given** an authenticated user with `is_published = false`
**When** they toggle the switch to on
**Then** a Server Action checks: at least one approved photo exists
**And** if no approved photo: toast error "You need at least one approved photo to publish your profile"
**And** if valid: `is_published = true`, toast: "You have published your profile..."

### Scenario: Unpublished profile restrictions

**Given** a user with `is_published = false`
**When** they attempt to send a like
**Then** a toast appears: "To send a like, you must first publish your profile."

---

## Requirement: Feed (`/feed`)

### Scenario: User views the feed

**Given** an authenticated user on `/feed`
**When** the page loads
**Then** a React Server Component fetches initial data via `createServerClient`
**And** only profiles of the opposite gender are shown
**And** only published profiles with at least one approved photo are included
**And** each profile card shows: avatar (96×96), name, age, country
**And** layout is responsive: 1 column (mobile), 2 (tablet), 3+ (desktop)
**And** the response annotates every card with the viewer's interaction state so the client can render "Liked" / "Matched" badges without an N+1 follow-up

### Feed response shape

Each card returned by `GET /api/feed` (and the matching RSC fetch) is a `FeedProfile`:

| Field                              | Type                 | Notes                                                                                   |
| ---------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `id`                               | `uuid`               | Profile id                                                                              |
| `name`                             | `string`             |                                                                                         |
| `gender`                           | `'male' \| 'female'` |                                                                                         |
| `birth_date`                       | `date`               | Used by client to compute age                                                           |
| `country`, `city`                  | `string \| null`     |                                                                                         |
| `ai_bio`                           | `string \| null`     | Canonical bio text                                                                      |
| `marital_status`, `children_count` |                      | Free-tier filter inputs                                                                 |
| `cover_photo_url`                  | `string \| null`     | Storage path of the cover (or `cover_blurred` if private) — fed to `/api/photos/stream` |
| `created_at`                       | `timestamptz`        | Pagination cursor                                                                       |
| `viewer_has_liked`                 | `boolean`            | True iff `likes(from=viewer, to=card)` exists                                           |
| `is_matched`                       | `boolean`            | True iff a `matches` row covers the (viewer, card) pair                                 |

> **Decision:** `viewer_has_liked` and `is_matched` are computed server-side in **two batched queries per page** (one over `likes`, one over `matches` filtered by viewer participation), not per-card. The client never re-queries these — `useInfiniteQuery` cache keys on `(filters, cursor)`.

> **Decision:** The full `profiles.ai_bio` is the canonical textual description on the profile detail view (`/profile/[id]`) and on the user's own profile page. Structured fields (`marital_status`, `income_level`, `hijab_attitude`, etc.) are NOT rendered as a list to viewers — they exist only to power filters and search in the feed.

### Scenario: User scrolls for more profiles

**Given** the feed is loaded with initial data
**When** the user scrolls to the bottom
**Then** cursor-based pagination via `useInfiniteQuery` loads the next page
**And** the cursor is `created_at` of the last visible profile

### Scenario: Real-time updates in feed

**Given** a profile is updated (new photo, bio change, publish status)
**When** the change is committed to Postgres
**Then** Supabase Realtime Postgres Changes on `profiles` pushes the update
**And** `queryClient.setQueryData` updates the feed cache

### Scenario: Filter state is preserved in URL

**Given** a user applies filters
**When** the filter values change
**Then** they are written to URL query params via `useSearchParams` + `router.replace`
**And** the feed re-fetches with new parameters

---

## Requirement: Filters

### Scenario: Man filters for women

**Given** a male user on the feed
**When** he opens filters
**Then** the following filters are available:

| Filter            | Options                          |
| ----------------- | -------------------------------- |
| Location          | Country + city OR radius         |
| Age               | Range (dual slider)              |
| Marital status    | Never married / Divorced / Widow |
| Children          | No children / Has children       |
| Polygyny attitude | Only monogamy / Open to polygyny |
| Hijab             | Wears hijab / Wears niqab        |

### Scenario: Woman filters for men

**Given** a female user on the feed
**When** she opens filters
**Then** the following filters are available:

| Filter         | Options                                              |
| -------------- | ---------------------------------------------------- |
| Location       | Country + city OR radius                             |
| Age            | Range (dual slider)                                  |
| Marital status | Never married / Divorced / Widower / Married         |
| Children       | No children / Has children                           |
| Income level   | Average / Above average                              |
| Housing        | Renting / Own apartment / Own house / With relatives |

### Default State

All filters default to "any" (no filtering).

---

## Requirement: Radius Search (PostGIS)

### Scenario: User filters by radius

**Given** a user with geolocation enabled
**When** they select the "Radius" tab in location filters
**Then** a slider appears with range 50–1000 km (step 50 km)
**And** switching to radius clears country/city filters
**And** switching to country/city clears radius

### Scenario: Radius query executes

**Given** a user with coordinates in `profiles.location`
**When** the radius filter is applied
**Then** the query uses:

```sql
SELECT * FROM profiles
WHERE ST_DWithin(
  profiles.location,
  (SELECT location FROM profiles WHERE id = $user_id),
  $radius_meters
)
AND is_published = true
AND gender <> $user_gender;
```

### Spatial Index

```sql
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles USING GIST (location);
```

### Constraints

- Radius search only returns users who have enabled geolocation
- Users without `profiles.location` are excluded from radius results

---

## Requirement: Likes System

### States

```
No like → One-sided (A→B) → Mutual (match)
                                    ↓
                           Revoke → Delete match + chat
```

### Scenario: User sends a like

**Given** a user viewing another profile
**When** they tap the "Like" button
**Then** a Server Action / Route Handler:

1. Runs the **subscription / quota gate** in app code (`has_active_subscription`, `count_likes_used` — see Tariff-Based Limits below)
2. Calls the SECURITY DEFINER function `send_like(p_from, p_to)` (see [02 — Database § send_like RPC](./02-database.md)). The RPC does the structural validation (own profile, target exists & published, opposite gender, not blocked, no duplicate), inserts the like under `ON CONFLICT DO NOTHING`, and reads any match row produced by the `handle_match()` trigger — all in one transaction.
3. Receives `(matched, match_id, error_code)` back. `error_code` is mapped 1:1 to the `AppError` registry; success returns `{ matched, match_id? }`.
4. On success the application fans out match notifications to both participants (best-effort INSERT into `notifications`).

**And** the target user receives a notification (in-app if online, Web Push if offline)
**And** the target user can now see the sender's photos without blur

> **Decision:** No `from('likes').insert(...)` from application code. Every like MUST go through `send_like(...)`. This keeps the post-conditions (gender check, block check, dup check, match read) in one atomic boundary instead of five round-trips with TOCTOU windows.

### Scenario: Like triggers a match

**Given** User A has already liked User B
**When** User B likes User A
**Then** the Postgres trigger `handle_match()` atomically creates `matches` + `chats`
**And** User B (online): fullscreen modal with two avatars + "Go to Chat" button (delivered via Broadcast event `match.created` on channel `user:${userId}`)
**And** User A (online): toast "User B also likes you!" (delivered via Broadcast event `match.created` on channel `user:${userId}`)
**And** both receive a notification in `notifications` table
**And** the chat becomes accessible to both users

### Scenario: User revokes a like

**Given** a mutual match exists between User A and User B
**When** User A revokes their like
**Then** a dialog appears: "Your chat with User B will be permanently deleted."
**And** on confirm: an Inngest workflow `like.revoke` executes:

1. DELETE from `likes`
2. DELETE from `matches`
3. DELETE message files from Storage
4. DELETE from `messages`
5. DELETE from `chats`
   **And** User B receives a revocation notification
   **And** idempotency key: `revoke:${userA}:${userB}`

---

## Requirement: Tariff-Based Limits

### Decision: Single Lifetime Counter — Likes

For male users on the free tier, there is **exactly one lifetime counter**: likes sent.

| Resource   | Free-tier limit                           | Premium   |
| ---------- | ----------------------------------------- | --------- |
| Likes sent | **3 lifetime**                            | Unlimited |
| Chats      | Derived — at most 3, one per matched like | Unlimited |

> **Decision:** Chats are NOT counted separately. A chat opens automatically on mutual match (Postgres trigger `handle_match`), so the chat count cannot exceed the like count. Once both users are in the chat, either of them can write first — that distinction is irrelevant for the limit.

> **Decision:** Limits are lifetime (`COUNT(*) FROM likes WHERE from_user_id = me`). They do NOT reset monthly. Revoking a like, deleting a chat, or losing a match does NOT restore the quota. The only way to lift the limit is an active subscription.

### Counter (single source of truth)

```sql
-- Likes used (lifetime)
SELECT count(*) FROM likes WHERE from_user_id = $me;
```

Wrapped into a SECURITY DEFINER helper `count_likes_used($user)` and called from the `sendLike` Server Action before allowing the action.

### Subscription Check

```sql
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user
      AND status = 'active'
      AND current_period_end > now()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Scenario: Free-tier male user sends a like

**Given** a male user
**When** they send a like
**Then** the Server Action evaluates in order:

1. `has_active_subscription(me)` → if true: allow.
2. `count_likes_used(me) < 3` → if true: allow.
3. Otherwise reject with modal:

> "You have already sent 3 likes, exhausting your free tier limits. To continue using the app without restrictions, purchase a monthly subscription."

**And** the modal contains a button linking to `/subscription`.

### Scenario: Free-tier male user in a chat

**Given** a male user with a mutual match (chat already auto-created)
**When** they send messages in the chat
**Then** NO additional gating is applied — the chat exists because the user spent one of their 3 likes and got a mutual response
**And** message-content limits and per-user throughput limits still apply (see [04 — Chat](./04-chat-realtime.md))

### Scenario: Female user or premium user

**Given** a female user or any user with an active subscription
**When** they send likes or chat
**Then** NO limits are applied.

### Enforcement

All limit checks MUST happen on the server (RLS + Server Action validation). Client-side checks are for UX only.

The price for premium is read from `pricing_plans` (code = `subscription_monthly`). Hardcoded amounts in code are forbidden.

---

## Requirement: Block List

### Scenario: User blocks another user

**Given** an authenticated user viewing another profile or a chat
**When** they tap "Block"
**Then** a confirmation dialog appears: "User will no longer see your profile, send you likes, or message you."
**And** on confirm: a Server Action `blockUser({ targetId })` runs:

1. Reads `targetId`'s email from `auth.users` (via service role client)
2. Computes `blocked_email_hash = hashBlockedEmail(email)` (see [02 — Database](./02-database.md) — peppered SHA-256, plaintext email never stored)
3. INSERTs into `blocks(blocker_id, blocked_id, blocked_email_hash)` — the hash survives the target's account deletion
4. If a mutual match exists: trigger Inngest `like.revoke` to delete chat + match (see [03 — Likes System](#requirement-likes-system))
5. Toast: "User blocked"

### Scenario: Blocked user tries to interact

**Given** User B is blocked by User A
**When** User B opens the feed, attempts a like, or tries to open the chat
**Then** RLS hides A's profile from B's feed
**And** the `insert_likes` policy rejects B's like attempts
**And** any pre-existing chat is hidden in A's chat list and shows a "User unavailable" banner for B

### Scenario: User unblocks

**Given** an active block by User A on User B
**When** User A removes the block from `/settings/blocked`
**Then** the block row is deleted
**And** profile visibility resumes (chat is NOT restored — it was deleted on block)

### Scenario: User views their personal blocklist (`/settings/blocked`)

**Given** an authenticated user
**When** they open `/settings/blocked`
**Then** the page renders:

- **Header**: "Blocked users" + counter (e.g. "3 blocked")
- **Search input**: filters the list client-side by display name (only for live blocks; ghost blocks are always shown)
- **List** (paginated, 20 per page, infinite scroll):
  - Each row: avatar (96×96 — or placeholder if `blocked_id IS NULL`), display name (or "Account deleted" for ghost blocks), `created_at` (relative — "Blocked 3 days ago"), optional `reason` (truncated). Email is **not** displayed — it is stored as a peppered hash and is never derivable
  - Right side: **"Unblock"** button (destructive style)
- **Empty state**: "You haven't blocked anyone yet." with a one-line explanation of what blocking does
- **Sort**: most recently blocked first

### Scenario: Server query for the blocklist

**Given** the user opens `/settings/blocked`
**When** the RSC fetches data
**Then** the query runs:

```sql
SELECT b.id, b.reason, b.created_at,
       p.id AS profile_id, p.name,
       (SELECT id FROM photos
          WHERE profile_id = p.id
            AND position = 1
            AND moderation_status = 'approved'
          LIMIT 1) AS avatar_photo_id
FROM blocks b
LEFT JOIN profiles p ON p.id = b.blocked_id
WHERE b.blocker_id = auth.uid()
ORDER BY b.created_at DESC;
```

**And** the avatar is fetched via the regular `/api/photos/sign` endpoint with the resolved photo id.
**And** `blocked_email_hash` is NEVER returned to the client — it is purely a server-side rebind/dedup key.
**And** the result includes both "live" blocks (`blocked_id IS NOT NULL`) and "ghost" blocks (target's account deleted).

### Scenario: User unblocks from the list

**Given** the user clicks "Unblock" on a row
**When** the confirmation dialog appears: "Unblock {name or 'this user'}? They will be able to see your profile again."
**And** on confirm: Server Action `unblockUser({ blockId })`:

1. Verifies `blocker_id = auth.uid()` (RLS)
2. DELETEs the `blocks` row
3. Returns optimistically; the row is removed from the list

> **Decision:** Unblocking does NOT recreate the deleted chat / match. To re-establish contact, both users must like each other again.

### Scenario: User searches their blocklist

**Given** the blocklist contains many entries
**When** the user types into the search field
**Then** the list is filtered client-side using a fuzzy match on `name` of live blocks (ghost blocks always shown)
**And** server pagination is preserved — the search only filters the currently-loaded pages. To search the entire list, the user keeps scrolling (TanStack Query `useInfiniteQuery` with `keepPreviousData: true`).

### Discoverability

A "Blocked users" entry under `/settings` (sub-route `/settings/blocked`) is the only way to reach the page. There is no badge or counter elsewhere — the absolute count of blocks is an unimportant signal.

### Storage of Block Effects

Block effects are enforced at three layers:

1. **RLS:** every `select_*` policy on `profiles`, `photos`, `messages`, `notifications` includes `NOT is_blocked_pair(auth.uid(), <other_id>)`.
2. **Server Actions:** `sendLike`, `sendMessage`, `viewProfile` re-check `is_blocked_pair` and return 404 (not 403) to avoid leaking the block.
3. **Realtime:** Realtime channels filter on RLS, so blocked users do not receive each other's events.

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md)
- [01 — Authentication & Onboarding](./01-auth.md)
- [02 — Database Schema & RLS](./02-database.md)
- [04 — Chat, Realtime & Notifications](./04-chat-realtime.md)
- [05 — Payments (T-Bank)](./05-payments.md)
- [08 — Reports, Moderation & Bans](./08-moderation.md)
