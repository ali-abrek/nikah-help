# 01 — Authentication & Onboarding

## Purpose

This file defines the complete authentication flow, session management, role-based access control, user registration, onboarding process, AI-generated bio, and account deletion. Authentication relies exclusively on Supabase Magic Link — no OAuth providers are used.

> **MANDATORY OBSERVABILITY (auth):** Auth failures are **deliberately silent to end users** (we never confirm whether an email exists), which means **operators have zero signal unless Sentry is wired**. Per [14-sentry-observability.md](14-sentry-observability.md), the following MUST report to Sentry:
> * `flow=auth.magic_link_send` — Supabase `signInWithOtp` failure (network, rate, provider error). Tag with hashed email domain only — never the email.
> * `flow=auth.callback` — `exchangeCodeForSession` failure or invalid state in `app/(public)/auth/callback/route.ts`. Severity: error.
> * `flow=auth.session_refresh` — failure inside `proxy.ts` when refreshing the SSR session. Severity: warning.
> * `flow=auth.rbac` — RBAC check anomalies (missing `role` claim, missing `users_app.role` row). Severity: error.
>
> The user-facing message MUST remain generic; the Sentry event carries the cause + stack. `setSentryUser(id)` from `lib/sentry/` MUST be called with the user UUID only — never `email` or `username`. The helper's type signature enforces this; `scrubPii` in `beforeSend` strips all other user fields as a safety net.

---

## Requirement: Supabase Auth — Magic Link Only

The platform MUST use Supabase Auth with Magic Link as the sole authentication method. Google OAuth and Apple OAuth are explicitly excluded.

### Scenario: User signs up with email

**Given** a new user on the `/auth` page
**When** they enter their email and submit the form
**Then** Supabase sends a Magic Link email via Resend
**And** the user sees a confirmation screen: "Check your email for the login link"

### Scenario: User clicks Magic Link

**Given** a user receives a Magic Link email
**When** they click the link
**Then** the browser opens `/api/auth/callback?code=...`
**And** the Route Handler exchanges the code for a session via `exchangeCodeForSession()`
**And** the user is redirected to `/feed` (or `/onboarding` if onboarding is incomplete)

### Scenario: User returns with existing session

**Given** a returning user with a valid session cookie
**When** they visit any page
**Then** `proxy.ts` refreshes the session via `supabase.auth.getClaims()`
**And** the user proceeds without re-authentication

> **Decision:** One email = one account. Supabase enforces this constraint.

---

## Requirement: Auth Callback Route Handler

### Scenario: Code exchange succeeds

**Given** a GET request to `/api/auth/callback?code=<valid_code>`
**When** the Route Handler processes the request
**Then** it exchanges the code for a session
**And** redirects to the `next` query parameter (default: `/feed`)

### Scenario: Code exchange fails

**Given** a GET request to `/api/auth/callback` with an invalid or expired code
**When** the Route Handler processes the request
**Then** it redirects to `/auth?error=auth_callback_failed`

### Implementation

```typescript
// app/api/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/feed'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { /* cookie handlers */ } }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }
  return NextResponse.redirect(new URL('/auth?error=auth_callback_failed', request.url))
}
```

---

## Requirement: Session Management

### Scenario: Server-side session verification

**Given** a protected Route Handler or Server Action
**When** it needs to identify or authorize the current user
**Then** it MUST use `createServerClient` from `@supabase/ssr`
**And** call `getClaims()` or `getUser()` for verified user identity
**And** NEVER use `getSession()` for authorization decisions

### Scenario: Proxy refreshes session

**Given** a user navigating the app
**When** `proxy.ts` intercepts each request
**Then** it MUST refresh the Supabase session cookie via `supabase.auth.getClaims()`

### Scenario: Browser client initialization

**Given** a client component needs to interact with Supabase
**When** creating the client
**Then** it MUST use `createBrowserClient` from `@supabase/ssr`

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
```

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

---

## Requirement: Role-Based Access Control (RBAC)

### Roles

| Role | Scope |
|---|---|
| `user` | Base permissions, subject to tariff limits |
| `moderator` | Resolve reports, view flagged conversations |
| `admin` | Everything `moderator` + manage roles + statistics |

### Scenario: Role is checked on the backend

**Given** a request requiring a specific role
**When** the backend processes it
**Then** it MUST check `profiles.role` via a Postgres function `has_role(user_id uuid, required_role text) returns boolean`
**And** RLS policies MUST enforce the role check
**And** frontend role checks are for UX hiding only, never for security

### Scenario: Admin assigns moderator role

**Given** an admin user
**When** they assign the `moderator` role to another user
**Then** the operation succeeds
**And** the RLS policy ensures only `admin` can perform this

### Scenario: Admin cannot change own role

**Given** an admin user
**When** they attempt to change their own role
**Then** the RLS policy blocks the operation (`id <> auth.uid()`)

> **Decision:** Roles for `moderator` and `admin` grant access to all features regardless of tariff and gender.

### JWT and Roles

- Supabase JWT: `sub` = `user_id`. Product role comes from `profiles.role`.
- Role is NOT embedded in JWT (avoids stale data).
- Server-side cache: `unstable_cache` with tag `user-role:${userId}`, TTL 60 seconds.
- `getClaims()` replaces `getSession()` for verification (supports Supabase's asymmetric JWTs).

---

## Requirement: User Registration Flow

### Scenario: New user completes registration

**Given** a user signs in via Magic Link for the first time
**When** `auth.users` receives the new record
**Then** a Postgres trigger `handle_new_user()` fires
**And** inserts a row into `profiles` with `onboarding_completed = false`
**And** the user is redirected to `/onboarding`

### Postgres Trigger

The trigger creates the profile row and refuses registration of banned emails. It does NOT re-bind personal blocks (`blocks.blocked_email_hash`) — that rebind requires the `BLOCKED_EMAIL_PEPPER` env var, which Postgres has no access to. Block rebind is performed by the **Auth callback Route Handler** in application code (see [02 — Database](./02-database.md) → `blocks`).

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Reject registration if email is on the moderator banlist
  IF public.is_email_banned(NEW.email) THEN
    RAISE EXCEPTION 'banned_email' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (id, email, onboarding_completed, role)
  VALUES (NEW.id, NEW.email, false, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## Requirement: Onboarding (4 Steps)

The onboarding flow MUST consist of 4 sequential steps at `/onboarding`. Each step auto-saves via debounced Server Action. When editing, data is loaded from the database.

### Scenario: User completes onboarding step 1 — Basic Data

**Given** a new user on `/onboarding`
**When** they fill in the Step 1 form
**Then** all fields are required:
- Name (text input)
- Date of birth (date picker, with **strict validation: user MUST be ≥ 18 years old at the time of submission**)
  - Client-side: Zod v4 schema rejects `birth_date > today - 18 years` with localized error "You must be at least 18 years old"
  - Server-side: Server Action re-validates; DB-level CHECK on `profiles.birth_date` is the final guard
  - Date picker `max` attribute = `today - 18 years` to prevent invalid input
- Gender (two icon cards: male / female)
- Country (combobox with search; sourced from `geonames_countries`, CIS countries pinned to top via `is_cis = true`)
- City (autocomplete, depends on country; data source: `geonames_cities` via Route Handler `GET /api/geo/cities?country=...&q=...`. See [02 — Database](./02-database.md) for schema and query)
- Nationality (autocomplete: CIS + major countries)
- Height and weight (two numeric fields, same row)
- Checkbox "Allow geolocation sharing" with tooltip: "Enables radius-based search and participation in such search"
  - When enabled: `navigator.geolocation.getCurrentPosition()` → coordinates → `profiles.location` (type `geography(point, 4326)`, requires PostGIS)

### Scenario: User completes onboarding step 2 — Extended Data (gender-specific)

**Given** the user's gender from Step 1
**When** they fill in Step 2
**Then** the form adapts:

**For men:**
- Marital status (never married / divorced / widower / married to one / two / three)
- Children (none / 1 / 2 / 3 / 4 / 5+)
- Education
- Income level
- Housing type
- Textarea "About yourself, religion, and spouse preferences" (optional)

**For women:**
- Marital status (never married / divorced / widow)
- Children
- Education
- Willingness to relocate
- Attitude toward polygyny
- Attitude toward hijab
- Textarea "About yourself, religion, and spouse preferences" (optional)

### Scenario: User completes onboarding step 3 — Photos

**Given** the user proceeds to Step 3
**When** they upload photos
**Then** the following rules apply:
- Input `accept="image/*"` with drag & drop support
- Upload directly to Supabase Storage via `storage.createSignedUploadUrl()`
- Grid of up to 6 photos (4:5 aspect ratio, hidden until first upload)
- First photo becomes avatar (always visible, never blurred)
- Switch "Private mode" (default: off) — when on, photos are blurred until mutual match

### Scenario: User completes onboarding step 4 — Review

**Given** the user proceeds to Step 4
**When** they review their data (all read-only)
**Then** clicking "Save" triggers a Server Action that:
1. Validates all data via Zod v4
2. Calls OpenAI API to generate `profiles.ai_bio`
3. Sets `onboarding_completed = true`
4. Redirects to `/feed`

---

## Requirement: AI Bio Generation

### Scenario: OpenAI generates a profile description

**Given** a completed onboarding profile
**When** the Server Action calls OpenAI
**Then** it uses model `gpt-4o-mini` with `response_format: text`
**And** the prompt MUST instruct the model to:

> "You are an assistant for a Muslim marriage application. Based strictly on the provided profile data, write a short, natural, and engaging self-description in several paragraphs. The tone must be modest, respectful, and polite. Always write in the first person. You must use all available profile information. If additional information is provided in the field 'About Yourself (user's words)', integrate it naturally into the narrative. Do not invent, assume, or add any facts that are not explicitly stated in the profile. Structure the text as follows: In the first paragraph, introduce the person's name, age, nationality, and where they live (city and type of housing). In the next paragraph, describe their height, weight, health condition, and involvement in sports, if this information is present in the profile data. If any of these details are not provided, simply omit them without mentioning their absence. In the following paragraph, describe their marital history: whether they were previously married, whether they have children, and who the children live with, if such information is provided. In the next paragraph, describe their work and income level, if this information is mentioned in the profile data. In a separate paragraph, describe what they wrote about their religion. In the final paragraph, describe whom they are looking for as a future spouse, including their expectations, preferences, and requirements. The final text must be written in Russian. Correct any grammatical mistakes found in the input data. The text must not contain references to missing profile information (for example, do not write phrases such as 'although there is no information in my profile about sports'). If certain details are not provided, simply do not mention them. The profile must not include any fabricated or additional information. It should be well-structured, coherent, and free of errors, presented as continuous plain text without headings or bullet points."

### Role of the AI Bio

The generated `profiles.ai_bio` is the **canonical text description** of a profile. It is rendered:
- In the user's own profile page
- In other users' profile detail view (`/profile/[id]`)
- In match modals and notification previews where the description is shown

The structured data (`marital_status`, `children_count`, `income_level`, etc.) is stored separately and is used **only for filter/search** in the feed. End-users never see the raw structured fields as a list — they see the AI-generated narrative.

### Scenario: Bio is regenerated after profile changes

**Given** a user updates a bio-relevant field (see "Bio-relevant fields" below)
**When** the changes are saved
**Then** an Inngest job regenerates the AI bio asynchronously
**And** the structured data fields remain unchanged (separate concern)

---

## Requirement: Profile Editing (`/profile/edit`)

### Scenario: User edits their profile after onboarding

**Given** an authenticated user with `onboarding_completed = true`
**When** they open `/profile/edit`
**Then** the form is grouped into the same 4 logical sections as onboarding (Basic / Extended / Photos / Review)
**And** all fields are pre-filled from `profiles`
**And** photo management uses the dedicated Photo CRUD flow (see `06-image-processing.md`)

### Scenario: Editable fields

| Field | Editable | Notes |
|---|---|---|
| `name`, `country`, `city`, `nationality`, `height`, `weight` | ✅ | Free edit |
| `birth_date` | ✅ | But re-validates ≥18 (DB CHECK enforces) |
| `gender` | ❌ | Locked. Changing gender is functionally a new account — see Decision below |
| `email` | ❌ | Tied to auth identity (Magic Link) |
| Marital / children / education / income / housing / hijab / polygyny | ✅ | Gender-specific subset |
| `about_self` | ✅ | User free text — triggers `ai_bio` regeneration |
| `private_mode`, `is_published`, `locale`, `theme_preference` | ✅ | Toggle-style, no `ai_bio` regen |
| `location` (geo) | ✅ | Recaptured via `navigator.geolocation` |

> **Decision:** `gender` is immutable post-onboarding. Changing gender invalidates outgoing/incoming likes, mutual matches, and tariff counters. If a user genuinely needs to change it, they MUST delete the account and re-register. The UI shows the gender field as read-only with a tooltip explaining this.

### Scenario: Save triggers ai_bio regeneration

**Given** a user clicks "Save" after editing fields that affect the bio narrative
**When** the Server Action runs (`saveOnboardingStep1` / `saveOnboardingStep2` for the wizard, the same actions invoked from `/profile/edit` post-onboarding)
**Then** it:
1. Validates all changes via Zod v4
2. UPDATEs the profile and returns immediately (no waiting on OpenAI)
3. Calls the shared helper `maybeRegenerateBio(supabase, userId)` which:
   - Re-reads the bio-relevant subset (see "Bio-relevant fields" below)
   - Computes `hashBioFields(profile)` — a hex SHA-256 over the canonicalised field set (`lib/profile/bio-fields.ts`)
   - **No-ops** if `onboarding_completed = false` (initial bio is generated synchronously by `generateBio()` at step 4 of the wizard — emitting the event there would race the synchronous write)
   - **No-ops** if the new hash equals `profiles.ai_bio_input_hash` (a back-and-forth edit that landed on the same values must not burn the 3/day Inngest rate-limit budget)
   - Otherwise writes `ai_bio_input_hash = newHash`, sets `ai_bio_status = 'pending'`, and emits Inngest event `profile/regenerate-bio` with `{ userId }`
4. While regeneration is in flight: `profiles.ai_bio_status` is `pending` (just queued) → `regenerating` (Inngest worker started) (UI shows a "refreshing" badge for any non-`ready` value)
5. Inngest function calls OpenAI with the AI Bio Prompt (see [Requirement: AI Bio Generation](#requirement-ai-bio-generation)) and writes back `profiles.ai_bio` + `ai_bio_status = 'ready'`. The hash on disk stays the one captured at edit time — that is the input the bio was generated from.

> **Decision:** Initial hash is captured at `completeOnboarding` time (snapshot of bio-relevant fields after step-2 saves and step-4 bio generation). Without this snapshot the very first post-onboarding edit would always look like a "no-op" against a NULL hash and skip regeneration.

> **Decision:** The hash is computed in Node, not in Postgres. The canonical implementation is `lib/profile/bio-fields.ts` and is imported by both the regen worker (`profile-regenerate-bio.ts` uses the same `BIO_FIELDS_SQL` for its `select`) and `maybeRegenerateBio`. There is no per-feature copy of the field list.

### Bio-relevant fields

Changes to ANY of these fields trigger regeneration:

`name`, `birth_date`, `nationality`, `country`, `city`, `housing`, `height`, `weight`, `marital_status`, `children_count`, `education`, `income_level`, `willing_to_relocate`, `polygyny_attitude`, `hijab_attitude`, `about_self`.

Changes to fields outside this list (e.g. `private_mode`, `theme_preference`, `is_published`) do NOT regenerate the bio.

### Scenario: User clicks "Regenerate bio" manually

**Given** a user on `/profile/edit`
**When** they tap "Regenerate description" button
**Then** the Inngest event `profile/regenerate-bio` is emitted unconditionally
**And** the regeneration is subject to the same 24h rate limit as automatic regenerations (see below).

### Rate Limit (combined auto + manual)

> **Decision:** A user may regenerate the AI bio at most **3 times per rolling 24 hours**, counted across both automatic regenerations (triggered by edits to bio-relevant fields) and manual "Regenerate description" clicks.

Implementation:
- The Inngest function `profile.regenerate-bio` declares `rateLimit: { limit: 3, period: '24h', key: 'event.data.userId' }`.
- When the limit is hit:
  - For **manual** triggers: the Server Action returns a friendly error toast: "You can regenerate your description up to 3 times per day. Try again later."
  - For **automatic** triggers (post-edit): the profile UPDATE still succeeds, but the bio is **not** regenerated. The stale `ai_bio` remains. A small notice appears on `/profile/edit`: "Your description will refresh automatically once the daily regeneration limit resets."

### Photo changes do NOT trigger regeneration

> **Decision:** Adding, deleting, replacing, or reordering photos does NOT regenerate the AI bio. The bio describes the person's textual self-description; photo changes are visual.

### OpenAI Prompt (canonical)

The prompt for **all** bio generation (initial onboarding step 4 and subsequent regenerations) MUST be exactly the canonical text defined in [Requirement: AI Bio Generation](#requirement-ai-bio-generation). It is the single source of truth — no per-context variants are allowed.

### Inngest function

```typescript
// lib/inngest/functions/profile-regenerate-bio.ts
export const profileRegenerateBioFn = inngest.createFunction(
  {
    id: 'profile.regenerate-bio',
    retries: 3,
    concurrency: { limit: 50, key: 'event.data.userId' },
    rateLimit: { limit: 3, period: '24h', key: 'event.data.userId' },
  },
  { event: 'profile/regenerate-bio' },
  async ({ event, step }) => {
    const { userId } = event.data
    const profile = await step.run('load-profile', () => loadProfile(userId))
    const bio = await step.run('openai-generate', () =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AI_BIO_PROMPT },
          { role: 'user', content: JSON.stringify(profile.bioInputs) },
        ],
      })
    )
    await step.run('persist', () => updateAiBio(userId, bio))
  }
)
```

---

## Requirement: Account Deletion

### Scenario: User deletes their account

**Given** an authenticated user on their profile page
**When** they click the destructive "DELETE PROFILE" button
**And** confirm in the dialog
**Then** a progress indicator appears
**And** the Inngest workflow `account.delete` executes sequentially:
1. Mark `profiles.deletion_status = 'in_progress'`, set `is_published = false`
2. Delete all photos from Supabase Storage
3. Delete all chat media from Supabase Storage
4. Delete DB records: likes, matches, chats, messages, reports, notifications, push_subscriptions
5. **Preserve blocks**: rows in `blocks` where `blocked_id = userId` MUST be kept; only `blocked_id` is set to NULL (FK is `ON DELETE SET NULL`). Their `blocked_email_hash` (peppered SHA-256 of the email, see [02 — Database](./02-database.md)) was captured at block time and remains, so any future re-registration with the same email is auto-rebound by the **Auth callback Route Handler** (not the trigger — pepper is not visible to Postgres). Rows in `blocks` where `blocker_id = userId` are deleted (CASCADE) — the user's own blocklist disappears with them
6. **If deletion is admin-driven via permanent ban:** insert into `banned_emails(email, reason_code, banned_by)` BEFORE deleting the auth user, so the email cannot re-register
7. Cancel T-Bank recurring payment (if active)
8. DELETE FROM profiles WHERE id = userId
9. Delete Supabase Auth user via admin API
10. Purge Cloudflare cache for user's URLs
11. Sign out the user, redirect to `/auth`

### Implementation

```typescript
// lib/inngest/functions/account-delete.ts
export const accountDeleteFn = inngest.createFunction(
  { id: 'account.delete', retries: 3, idempotency: 'data.userId' },
  { event: 'account/delete' },
  async ({ event, step }) => {
    const { userId } = event.data

    await step.run('mark-deleting', async () => {
      // UPDATE profiles SET deletion_status = 'in_progress', is_published = false
    })
    await step.run('delete-photos', async () => { /* Storage */ })
    await step.run('delete-chats-media', async () => { /* iterate chats → Storage */ })
    await step.run('delete-db-records', async () => {
      // DELETE likes, matches, chats, messages, reports, notifications, push_subscriptions
    })
    await step.run('cancel-tbank-recurrent', async () => {
      // Cancel T-Bank recurring payment
    })
    await step.run('delete-profile', async () => {
      // DELETE FROM profiles WHERE id = userId
    })
    await step.run('delete-auth-user', async () => {
      // supabaseAdmin.auth.admin.deleteUser(userId)
    })
    await step.run('purge-cloudflare', async () => {
      // Cloudflare API purge
    })
  }
)
```

### Anti-Fraud

- Rate limiting on `/auth/callback` (Cloudflare WAF + Upstash)
- One email = one account (enforced by Supabase)
- **`banned_emails` table** (see [02 — Database](./02-database.md)) is checked in `handle_new_user()` trigger. Banned emails cannot register again until an admin lifts the entry. Populated automatically on permanent ban + account deletion (see Account Deletion above)
- Per-user blocklist (`blocks` table) persists across account deletion via peppered `blocked_email_hash` retention; if the deleted user re-registers with the same email, the block is automatically reapplied by the Auth callback Route Handler

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md)
- [02 — Database Schema & RLS](./02-database.md)
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md)
- [05 — Payments (T-Bank)](./05-payments.md)
- [06 — Image Processing & Storage](./06-image-processing.md)
