# 06 — Image Processing & Storage

## Purpose

This file defines the complete photo upload, processing, storage, delivery, and moderation pipeline. All image encoding, cropping, and resizing is performed by the `sharp` library in Next.js Route Handlers with `runtime = 'nodejs'`. No external image transformation services are used.

**Privacy guarantee:** photo bytes are never served as direct Supabase Storage URLs. Every image is streamed through `/api/photos/stream`, a Route Handler that enforces access control server-side and serves pre-blurred variants when the viewer is not authorised to see the original. Storage object URLs never appear in the browser's network tab or DevTools.

> **MANDATORY OBSERVABILITY (image pipeline):** The pipeline is async (Inngest) and multi-step (sharp transforms → Storage uploads → moderation). Silent step failures cause photos to get stuck "Processing…" with no operator signal. Per [14-sentry-observability.md](14-sentry-observability.md):
>
> - Every Inngest `step.run` MUST be wrapped so a failing step is captured with `flow=image.process`, `step=<step-name>`, `variant=<name>`, `photo_id=<uuid>`. Severity: error.
> - Multipart-parse / upload-route crashes report under `flow=image.upload`. Severity: error.
> - Variant upload to Storage failure: `flow=image.process.upload_variant`. Severity: error.
> - Photos that exit Inngest's retry budget into the DLQ: `flow=image.process.dlq`. Severity: **fatal**, alerts on-call.
>
> **Photo bytes, signed Storage URLs, EXIF data with GPS, and any face-recognition descriptors MUST NEVER be sent to Sentry.** Only opaque ids. Replay is masked across all media (`blockAllMedia: true`).

---

## Requirement: Upload Constraints

### Scenario: User uploads a photo

**Given** an authenticated user
**When** they select a file for upload
**Then** the following constraints are validated BEFORE upload:

| Constraint                 | Value                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted formats           | JPEG, PNG, WebP, AVIF, HEIC                                                                                                                                 |
| Maximum file size          | 10 MB                                                                                                                                                       |
| Minimum short side         | 1000 px (server rejects files below threshold; Zod schema mirrors this on the client)                                                                       |
| Maximum photos per profile | 6 (enforced by Server Action + deferred trigger)                                                                                                            |
| Upscaling                  | FORBIDDEN — `withoutEnlargement: true` on every `sharp.resize()`                                                                                            |
| HEIC support               | Requires `sharp` build with `libheif`. If unavailable on Vercel runtime, reject HEIC client-side and show "Convert your photo to JPEG/PNG before uploading" |

---

## Requirement: Upload Flow

### Scenario: Photo upload lifecycle

**Given** a user ready to upload a photo
**When** they select a file and trigger upload
**Then** the flow proceeds:

```
Step 1: Client → GET /api/photos/upload-url
         → Backend creates photos row (status = 'pending', storage_path = '{userId}/{photoId}.original')
         → Backend generates signed upload URL (Supabase Storage)
         → Returns { photoId, signedUrl }

Step 2: Client → PUT directly to Supabase Storage via signed URL
         → No backend proxy of file bytes

Step 3: Client → Server Action markPhotoUploaded(photoId)
         → Backend sets photos.status = 'uploaded'

Step 4: Client → POST /api/photos/process (Route Handler, runtime = 'nodejs')
         → Downloads original from Storage
         → sharp processes original into 5 variants (10 files — see pipeline below)
         → Uploads all 10 files to Supabase Storage using service role key
         → DELETES the original from Storage (variants are everything we keep)
         → Updates photos row: status = 'processed', variants = {...}, storage_path = NULL
         → Returns { success: true }

Step 5: Database Webhook on photos.status = 'processed'
         → Inngest event photo/moderate
         → OpenAI Vision moderation (uses cover variant — original is gone)
         → Updates photos.moderation_status
```

> **Decision:** Originals are **deleted from Storage immediately after successful variant generation**. We never retain the unprocessed file. Reasons: (1) lower storage costs, (2) smaller PII surface, (3) the cover variant (400×500) is sufficient for moderation. The only window where the original exists is between Step 2 and the end of Step 4 (typically <30 seconds).

> **Decision:** If `/api/photos/process` fails after generating variants but before deleting the original, the next run is idempotent — `processImage` is pure, and the cleanup step is a separate `step.run('delete-original')` so it can retry independently. If processing fails entirely, an Inngest job `photo/abandon-cleanup` (scheduled `+10min`) deletes both the original and the row.

> **Decision:** `/api/photos/process` enforces idempotency at the row level too. The handler:
>
> 1. Fetches the photo row (`id, profile_id, storage_path, status, variants`).
> 2. **Early-exits with `{ success: true, alreadyProcessed: true }`** if `status = 'processed'` — a duplicate POST after a successful run must never overwrite variants or re-trigger moderation.
> 3. Verifies `profile_id = userId` (`PHOTO_NOT_OWNER` otherwise) — the route is callable from clients, not just Inngest.
> 4. Atomically claims the row by transitioning `status ∈ {'pending','uploaded'} → 'processing'` (`UPDATE … WHERE status IN (…) RETURNING id`). A second concurrent runner sees zero affected rows and returns `{ success: true, inProgress: true }` instead of duplicating work.
> 5. Validates the original via `validateUpload`, runs `processImage`, uploads the 10 variants (each with its own `cacheControl`), deletes the original, then transitions `status → 'processed'`.

---

## Requirement: Image Processing Pipeline (sharp)

All processing runs in a Route Handler with `runtime = 'nodejs'`:

```typescript
// app/api/photos/process/route.ts
export const runtime = 'nodejs'
```

### Scenario: Server processes an uploaded photo

**Given** a photo marked `status = 'uploaded'`
**When** the `/api/photos/process` Route Handler is called with `{ photoId }`
**Then** `sharp` processes the original into exactly **5 variants (10 files):**

### Variant 1: Avatar

| Property   | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| Resolution | **100 × 100 px**                                                                   |
| Format     | **AVIF** with **WebP fallback**                                                    |
| Blur       | **Never blurred** (visible even in private mode, to all viewers)                   |
| Cache      | `Cache-Control: private, max-age=3600, immutable` in `/api/photos/stream` response |

### Variant 2: Cover Image

| Property     | Value                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| Aspect ratio | **4:5**                                                                      |
| Resolution   | **400 × 500 px**                                                             |
| Format       | **AVIF** with **WebP fallback**                                              |
| Cropping     | If original ratio differs → **crop to 4:5 centered**, then resize to 400×500 |

### Variant 3: Cover Blurred

| Property | Value                                                                              |
| -------- | ---------------------------------------------------------------------------------- |
| Base     | Same crop and resize as Cover (400 × 500, 4:5)                                     |
| Blur     | Gaussian blur, **sigma = 40 px**                                                   |
| Format   | **AVIF** with **WebP fallback**                                                    |
| Purpose  | Served by `/api/photos/stream` when viewer is not authorised to see the full cover |

### Variant 4: Full-Size Image

| Property           | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| Minimum short side | **800 px**                                                                        |
| Maximum resolution | **1200 × 1500 px**                                                                |
| Aspect ratio       | **4:5** (cropped)                                                                 |
| Processing         | Crop to 4:5 ratio; if result exceeds 1200×1500 → resize down to fit within limits |

### Variant 5: Full-Size Blurred

| Property | Value                                                                              |
| -------- | ---------------------------------------------------------------------------------- |
| Base     | Same crop and resize as Full-Size (1200 × 1500, 4:5)                               |
| Blur     | Gaussian blur, **sigma = 60 px**                                                   |
| Format   | **AVIF** with **WebP fallback**                                                    |
| Purpose  | Served by `/api/photos/stream` when viewer is not authorised to see the full image |

### Compression Settings

| Format | Quality       |
| ------ | ------------- |
| AVIF   | `quality: 60` |
| WebP   | `quality: 80` |

### Implementation

```typescript
// lib/image-processing/pipeline.ts
import sharp from 'sharp'

interface ProcessedVariants {
  avatarAvif: Buffer
  avatarWebp: Buffer
  coverAvif: Buffer
  coverWebp: Buffer
  coverBlurredAvif: Buffer
  coverBlurredWebp: Buffer
  fullAvif: Buffer
  fullWebp: Buffer
  fullBlurredAvif: Buffer
  fullBlurredWebp: Buffer
}

export async function processImage(buffer: Buffer): Promise<ProcessedVariants> {
  const image = sharp(buffer).rotate() // auto-orient via EXIF

  const metadata = await image.metadata()
  const { width = 0, height = 0 } = metadata

  // --- Avatar: 100×100 ---
  const avatar = image.clone().resize(100, 100, { fit: 'cover', withoutEnlargement: true })
  const avatarAvif = await avatar.clone().avif({ quality: 60 }).toBuffer()
  const avatarWebp = await avatar.clone().webp({ quality: 80 }).toBuffer()

  // --- Cover: 4:5, 400×500 ---
  const cover = image
    .clone()
    .resize(400, 500, { fit: 'cover', position: 'center', withoutEnlargement: true })
  const coverAvif = await cover.clone().avif({ quality: 60 }).toBuffer()
  const coverWebp = await cover.clone().webp({ quality: 80 }).toBuffer()
  const coverBlurredAvif = await cover.clone().blur(40).avif({ quality: 60 }).toBuffer()
  const coverBlurredWebp = await cover.clone().blur(40).webp({ quality: 80 }).toBuffer()

  // --- Full-size: 4:5, min short side 800px, max 1200×1500 ---
  let full = image.clone()

  if (Math.max(width, height) > 1500) {
    full = full.resize(1200, 1500, { fit: 'inside', withoutEnlargement: true })
  }
  full = full.resize(1200, 1500, { fit: 'cover', position: 'center', withoutEnlargement: true })

  const fullAvif = await full.clone().avif({ quality: 60 }).toBuffer()
  const fullWebp = await full.clone().webp({ quality: 80 }).toBuffer()
  const fullBlurredAvif = await full.clone().blur(60).avif({ quality: 60 }).toBuffer()
  const fullBlurredWebp = await full.clone().blur(60).webp({ quality: 80 }).toBuffer()

  return {
    avatarAvif,
    avatarWebp,
    coverAvif,
    coverWebp,
    coverBlurredAvif,
    coverBlurredWebp,
    fullAvif,
    fullWebp,
    fullBlurredAvif,
    fullBlurredWebp,
  }
}
```

### Storage Paths (10 files per photo)

```
profile-photos/{userId}/{photoId}-avatar.avif
profile-photos/{userId}/{photoId}-avatar.webp
profile-photos/{userId}/{photoId}-cover.avif
profile-photos/{userId}/{photoId}-cover.webp
profile-photos/{userId}/{photoId}-cover-blurred.avif
profile-photos/{userId}/{photoId}-cover-blurred.webp
profile-photos/{userId}/{photoId}-full.avif
profile-photos/{userId}/{photoId}-full.webp
profile-photos/{userId}/{photoId}-full-blurred.avif
profile-photos/{userId}/{photoId}-full-blurred.webp
```

### Storage upload metadata

When the process pipeline writes the 10 files via `supabase.storage.from('profile-photos').upload(...)`, each call MUST pass the variant's intended `cacheControl` so any direct Storage delivery (signed URLs, dev tools, etc.) honours the same caching policy that `/api/photos/stream` would set:

| Variant                                                      | `cacheControl` written to Storage  |
| ------------------------------------------------------------ | ---------------------------------- |
| `avatar` (avif/webp)                                         | `private, max-age=3600, immutable` |
| `cover`, `cover_blurred`, `full`, `full_blurred` (avif/webp) | `private, no-store`                |

The values are sourced from the single `PHOTO_VARIANTS` table in `lib/image-processing/photo-variants.ts` (`VariantConfig.cacheControl`) and propagate through `GeneratedFile.cacheControl` to the upload call. **No per-call literal string duplication.**

### `photos.variants` jsonb shape (after processing)

```json
{
  "avatar": {
    "avif": "profile-photos/{uid}/{pid}-avatar.avif",
    "webp": "profile-photos/{uid}/{pid}-avatar.webp"
  },
  "cover": {
    "avif": "profile-photos/{uid}/{pid}-cover.avif",
    "webp": "profile-photos/{uid}/{pid}-cover.webp"
  },
  "cover_blurred": {
    "avif": "profile-photos/{uid}/{pid}-cover-blurred.avif",
    "webp": "profile-photos/{uid}/{pid}-cover-blurred.webp"
  },
  "full": {
    "avif": "profile-photos/{uid}/{pid}-full.avif",
    "webp": "profile-photos/{uid}/{pid}-full.webp"
  },
  "full_blurred": {
    "avif": "profile-photos/{uid}/{pid}-full-blurred.avif",
    "webp": "profile-photos/{uid}/{pid}-full-blurred.webp"
  }
}
```

---

## Requirement: Photo Delivery — Privacy-First Proxy

### Decision: All images stream through a Route Handler

Supabase Storage URLs are internal. Clients never receive a Storage URL. Photos are fetched from the browser via a stable, session-authenticated proxy URL:

```
GET /api/photos/stream?photoId={id}&variant={avatar|cover|full}&fmt={avif|webp}
```

The Route Handler downloads the correct Storage object (full or pre-blurred) using the service role key and streams the bytes to the browser. The Storage URL is resolved and consumed entirely on the server.

> **Decision:** Pre-generated blurred variants are used instead of on-the-fly sharp blurring. The pipeline generates them once at upload time. At serve time the handler only reads the correct path from `photos.variants` and streams bytes — no per-request CPU cost.

> **Decision:** The handler runs with `runtime = 'nodejs'` (not Edge). `maxDuration = 30s`. It is NOT put behind Cloudflare caching for cover/full variants — `Cache-Control: private` prevents CDN caching.

### Blur Decision Matrix

The Route Handler evaluates conditions in priority order. The first match wins.

| Priority | Condition                                                                          | Avatar | Cover / Full |
| -------- | ---------------------------------------------------------------------------------- | ------ | ------------ |
| 1        | Viewer is the photo owner (`viewer_id = photo.profile_id`)                         | Full   | Full         |
| 2        | `profile.private_mode = false`                                                     | Full   | Full         |
| 3        | Mutual match exists between viewer and owner                                       | Full   | Full         |
| 4        | Owner sent a like to viewer (`likes`: `from_user_id = owner, to_user_id = viewer`) | Full   | Full         |
| 5        | None of the above (private profile, no relationship)                               | Full   | **Blurred**  |

**Avatar is always unblurred, regardless of private mode.** Rules 3–5 do not apply to it.

All blur decisions are made server-side. No blur flag is sent to the client. The client receives either the full image or the blurred image — it cannot distinguish which.

### SQL: Authorisation + Blur Check (single query)

```sql
-- Returns photo metadata and whether the viewer sees the full variant.
-- Runs under service role (bypasses RLS); handler enforces authz explicitly.
SELECT
  ph.id,
  ph.profile_id,
  ph.moderation_status,
  ph.variants,
  p.is_published,
  p.private_mode,
  -- Blur decision: true = serve full; false = serve blurred
  (
    ph.profile_id = $viewer_id                          -- rule 1: own photo
    OR p.private_mode = false                           -- rule 2: not private
    OR EXISTS (                                         -- rule 3: mutual match
        SELECT 1 FROM matches
        WHERE (user_a = $viewer_id AND user_b = ph.profile_id)
           OR (user_b = $viewer_id AND user_a = ph.profile_id)
    )
    OR EXISTS (                                         -- rule 4: owner liked viewer
        SELECT 1 FROM likes
        WHERE from_user_id = ph.profile_id AND to_user_id = $viewer_id
    )
  ) AS show_full,
  -- Visibility: viewer may see this photo at all
  (
    ph.profile_id = $viewer_id                         -- own photo (any status)
    OR (
      ph.moderation_status = 'approved'
      AND NOT is_blocked_pair($viewer_id, ph.profile_id)
      AND NOT is_user_suspended(ph.profile_id)
      AND (
        p.is_published = true
        OR EXISTS (
          SELECT 1 FROM matches
          WHERE (user_a = $viewer_id AND user_b = ph.profile_id)
             OR (user_b = $viewer_id AND user_a = ph.profile_id)
        )
      )
    )
  ) AS can_view
FROM photos ph
JOIN profiles p ON p.id = ph.profile_id
WHERE ph.id = $photo_id;
```

### Route Handler: Implementation Outline

```typescript
// app/api/photos/stream/route.ts
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { ratelimit } from '@/lib/upstash/ratelimit'
import { z } from 'zod/v4'

export const runtime = 'nodejs'
export const maxDuration = 30

const paramsSchema = z.object({
  photoId: z.string().uuid(),
  variant: z.enum(['avatar', 'cover', 'full']),
  fmt: z.enum(['avif', 'webp']),
})

export async function GET(request: NextRequest) {
  // 1. Authenticate viewer
  const supabase = createServerClient(/* cookies */)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response(null, { status: 401 })

  // 2. Parse and validate params
  const parsed = paramsSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return new Response(null, { status: 400 })
  const { photoId, variant, fmt } = parsed.data

  // 3. Rate limit (120 req/min per user)
  const { success } = await ratelimit.limit(`photo-stream:${user.id}`)
  if (!success) return new Response(null, { status: 429 })

  // 4. Load photo + authz + blur decision (single query, service role)
  const supabaseAdmin = createAdminClient()
  const { data: row } = await supabaseAdmin.rpc('get_photo_stream_context', {
    p_photo_id: photoId,
    p_viewer_id: user.id,
  })
  if (!row || !row.can_view) return new Response(null, { status: 404 })

  // 5. Resolve variant key (avatar is always full; cover/full respect blur)
  const variantKey = variant === 'avatar' || row.show_full ? variant : `${variant}_blurred`

  const storagePath = row.variants?.[variantKey]?.[fmt]
  if (!storagePath) return new Response(null, { status: 404 })

  // 6. Download from Storage (URL stays on server)
  const { data: file, error } = await supabaseAdmin.storage
    .from('profile-photos')
    .download(storagePath)
  if (error || !file) return new Response(null, { status: 404 })

  // 7. Stream to browser
  const contentType = fmt === 'avif' ? 'image/avif' : 'image/webp'
  const cacheControl =
    variant === 'avatar' ? 'private, max-age=3600, immutable' : 'private, no-store'

  return new Response(file, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline; filename="photo"',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
```

The heavy authz logic is factored into a Postgres function `get_photo_stream_context(p_photo_id, p_viewer_id)` (SECURITY DEFINER, service role) that executes the SQL above and returns a single row. This avoids duplicating the blur/visibility logic across languages.

### Response Headers

| Header                       | Value                              | Purpose                                                                              |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| `Content-Type`               | `image/avif` or `image/webp`       | Correct MIME type                                                                    |
| `Content-Disposition`        | `inline; filename="photo"`         | Prevents "Save As" from suggesting a meaningful filename; inline stops auto-download |
| `Cache-Control` (avatar)     | `private, max-age=3600, immutable` | Browser-only cache; CDN bypass due to `private`                                      |
| `Cache-Control` (cover/full) | `private, no-store`                | Browser does not write bytes to disk cache; CDN bypass                               |
| `X-Content-Type-Options`     | `nosniff`                          | Prevents MIME-type guessing by the browser                                           |
| `X-Robots-Tag`               | `noindex, nofollow`                | Prevents crawlers from indexing streamed bytes                                       |

> `Cache-Control: private` instructs Cloudflare (and any other CDN) to pass the request through without caching. Only the user's own browser may cache — and `no-store` disables disk persistence even there.

### Additional Client-Side Deterrents

These do not prevent a determined attacker but raise the effort for casual circumvention:

- `draggable={false}` and `onContextMenu={(e) => e.preventDefault()}` on every `<img>` element
- `user-select: none` CSS on photo containers
- Semi-transparent watermark overlay with the viewer's shortened `user_id` — identifies the source of leaked screenshots

> Full download prevention in browsers is technically impossible. The achieved guarantees are: (1) Storage URLs are never exposed to the client, (2) every image request requires an active authenticated session, (3) blurring is enforced server-side and cannot be bypassed by toggling CSS, (4) `no-store` prevents disk caching of cover/full images.

---

## Requirement: Photo CRUD

### Scenario: User uploads a new photo (positions 1–6)

Covered by [Requirement: Upload Flow](#requirement-upload-flow).

### Scenario: User replaces an existing photo at a position

**Given** an existing `photos` row at position N
**When** the user uploads a new file targeting position N
**Then** the Server Action `replacePhoto({ position, fileMeta })`:

1. Generates new `photoId` and a signed upload URL for the original
2. Returns `{ newPhotoId, signedUrl, oldPhotoId }`
3. Client uploads to Storage
4. Client calls `markPhotoUploaded(newPhotoId)`
5. After processing succeeds: an Inngest job `photo.replace-cleanup` deletes the OLD photo's 10 variant files from Storage and the OLD `photos` row from DB
6. The new photo is at position N with `moderation_status = 'queued'`
7. **The old photo remains visible to viewers until the new one is `approved`** (no flicker)

### Scenario: User deletes a photo

**Given** an authenticated user on `/profile/edit`
**When** they tap "Delete" on a photo
**Then** a confirmation dialog appears: "This photo will be permanently deleted."
**And** on confirm: Server Action `deletePhoto({ photoId })`:

1. Verifies ownership via RLS
2. If the photo is at position 1 (avatar) AND another approved photo exists: silently promotes the next approved photo to position 1
3. If no other approved photo exists AND `is_published = true`: blocks the deletion with toast "Cannot delete the only approved photo while profile is published. Add a new photo first or unpublish."
4. Otherwise: emits Inngest event `photo/delete` with `{ photoId, userId }`
5. The Inngest function deletes all 10 variant files from Storage and the row from DB
6. After deletion, the Route Handler returns 404 for that `photoId` immediately — no cache purge required

### Scenario: User reorders photos (drag and drop)

**Given** a user with 2+ photos on `/profile/edit`
**When** they drag a photo to a new position
**Then** the client computes the new ordering and calls Server Action `reorderPhotos({ orderedPhotoIds })`
**And** the action:

1. Verifies all `photoIds` belong to the user (RLS)
2. Verifies the array length matches the user's photo count exactly
3. UPDATEs `position` for each row in a **single SQL statement** using `UPDATE ... FROM (VALUES ...)` — Postgres defers UNIQUE index checks to statement end, so swapping positions doesn't transiently violate `idx_photos_profile_position`
4. The new position-1 photo automatically becomes the avatar
5. Returns the new ordering for optimistic UI confirmation

```sql
-- Single-statement reorder, avoids UNIQUE collisions
UPDATE photos SET position = v.new_pos
FROM (VALUES ($1::uuid, 1), ($2::uuid, 2), ...) AS v(id, new_pos)
WHERE photos.id = v.id AND photos.profile_id = $me;
```

### Scenario: Pending photo is not visible to others

**Given** a photo with `moderation_status IN ('queued', 'manual_review')`
**When** any viewer (not the owner) requests the photo via `/api/photos/stream`
**Then** the Route Handler returns 404 (the `can_view` check in `get_photo_stream_context` excludes non-approved photos for non-owners)
**And** the owner sees the photo with a "Pending moderation" badge in their own profile UI
**And** the photo CANNOT be used to satisfy the "at least one approved photo" requirement for `is_published = true`

### Scenario: Photo rejected by moderation

**Given** a photo with `moderation_status = 'rejected'`
**When** the owner views their profile
**Then** the photo card shows a "Rejected" badge with `moderation_reason`
**And** the user is offered "Replace" or "Delete" actions
**And** if `is_published = true` AND no approved photos remain: the system automatically sets `is_published = false` and notifies the user

---

## Requirement: Storage RLS Policies

Buckets `profile-photos` and `chat-media` are **private** (no public anonymous access).

```
profile-photos/{userId}/{photoId}-{variant}.{format}    # variants written by service role
profile-photos/{userId}/{photoId}.original              # original uploaded by user (transient)
chat-media/{chatId}/{messageId}.{ext}                   # voice or image messages
```

### `profile-photos` bucket policies

```sql
-- Insert: only the owning user can write their own .original file
CREATE POLICY "user_uploads_own_photo" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name LIKE '%.original'  -- users upload only originals; variants are written by service role
  );

-- Update / Delete: only the owning user
CREATE POLICY "user_modifies_own_photo" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "user_deletes_own_photo" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Select: NO policy for authenticated users.
-- All reads go through /api/photos/stream which downloads via service role key.
-- Authenticated users cannot generate signed URLs or read variant objects directly.
-- The absence of a SELECT policy means Supabase Storage rejects any direct client read attempt.
```

> **Decision:** Variants in `profile-photos` are written by `/api/photos/process` and read by `/api/photos/stream` — both use the **service role key** which bypasses RLS entirely. No user-facing Storage URL for variants is ever generated.

### `chat-media` bucket policies

```sql
-- Insert: authenticated user can upload to a chatId folder ONLY if they're a participant
CREATE POLICY "participant_uploads_chat_media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM chats
      JOIN matches ON matches.id = chats.match_id
      WHERE chats.id = ((storage.foldername(name))[1])::uuid
        AND (matches.user_a = auth.uid() OR matches.user_b = auth.uid())
    )
  );

-- Delete: same predicate (used by Inngest cleanup jobs running with service role)
CREATE POLICY "participant_deletes_chat_media" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM chats
      JOIN matches ON matches.id = chats.match_id
      WHERE chats.id = ((storage.foldername(name))[1])::uuid
        AND (matches.user_a = auth.uid() OR matches.user_b = auth.uid())
    )
  );
```

---

## Requirement: Moderation (Async — Inngest)

### Scenario: Photo is moderated after processing

**Given** a photo with status `'processed'`
**When** the Database Webhook fires → Inngest event `photo/moderate`
**Then** the Inngest function:

```typescript
// lib/inngest/functions/photo-moderate.ts
export const photoModerateFn = inngest.createFunction(
  { id: 'photo.moderate', retries: 3 },
  { event: 'photo/moderate' },
  async ({ event, step }) => {
    const { photoId } = event.data

    const coverBuffer = await step.run('download-cover', async () => {
      // Download cover variant from Storage via service role (400×500, sufficient for moderation)
    })

    const result = await step.run('moderate', async () => {
      return moderateWithOpenAI(coverBuffer)
    })

    await step.run('update-status', async () => {
      const decision = evaluateModerationResult(result)
      // UPDATE photos SET moderation_status = decision, moderation_result = result
      return decision
    })
  },
)
```

### Moderation Schema (OpenAI gpt-4o Vision, structured output)

```json
{
  "explicit_nudity_score": 0,
  "suggestive_score": 0,
  "violence_score": 0,
  "hate_symbols_score": 0,
  "face_count": 1,
  "detected_gender": "female",
  "reason": "string"
}
```

### Thresholds and Actions

| Category                                                               | Threshold | Action        | `moderation_reason`  |
| ---------------------------------------------------------------------- | --------- | ------------- | -------------------- |
| Explicit Nudity                                                        | ≥ 90      | Auto-reject   | `explicit_nudity`    |
| Suggestive                                                             | ≥ 85      | Reject        | `suggestive_content` |
| Violence                                                               | ≥ 90      | Reject        | `violence`           |
| Hate Symbols                                                           | ≥ 95      | Reject        | `hate_symbols`       |
| `face_count` ≠ 1                                                       | —         | Auto-reject   | `face_count_invalid` |
| `detected_gender ∈ {male,female}` and disagrees with `profiles.gender` | —         | Reject        | `gender_mismatch`    |
| `detected_gender = 'uncertain'` (provider could not classify)          | —         | Manual review | `gender_uncertain`   |

> **Decision:** The decision and the `moderation_reason` are produced by the **application** (`evaluateModeration` in `lib/inngest/functions/photo-moderate.ts`), not by the moderation provider. The provider's free-text `reason` field is preserved in `moderation_result` for audit but is not what the user/moderator sees — `moderation_reason` is the canonical machine-readable code from the table above. This way the i18n layer can localise reject reasons without depending on whatever language the LLM happens to return.

> **Decision:** Loading the photo for moderation also pulls `profiles.gender` via the FK relation in a single SELECT (`photos!inner(profiles!inner(gender))`). No second round-trip. The gender check is applied **after** all the safety thresholds — a clearly-NSFW photo of the correct gender still gets rejected for nudity, not for gender.

### Sightengine Alternative

Sightengine may be used as a cheaper alternative at scale. Integration is identical — the Inngest function's `moderate` step calls the chosen provider.

---

## Requirement: Cache Invalidation

Photos are served via `/api/photos/stream` with `Cache-Control: private` — Cloudflare does not cache them. Explicit CDN purges are therefore not needed for access-control changes (e.g. match deletion, like revocation).

Browser-side: cover and full variants use `no-store` so no bytes are persisted to disk. Avatar uses `max-age=3600`; stale avatars in the browser cache after a profile photo change are acceptable (re-validated on next load after 1 hour).

The only case requiring proactive action is **account deletion**: on `profiles.deletion_status = 'deleted'`, the Route Handler returns 404 for all `photoId` values owned by that user. The Inngest `photo/delete` job purges all 10 Storage files.

---

## Requirement: HTML Picture Element for AVIF/WebP Fallback

### Scenario: Client renders a photo

**Given** a component that needs to display a photo
**When** rendering
**Then** the `<picture>` element uses `/api/photos/stream` URLs — never Storage URLs:

```tsx
<picture>
  <source
    srcSet={`/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=avif`}
    type="image/avif"
  />
  <source
    srcSet={`/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=webp`}
    type="image/webp"
  />
  <img
    src={`/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=webp`}
    alt="Profile photo"
    width={width}
    height={height}
    className="object-cover"
    draggable={false}
    onContextMenu={(e) => e.preventDefault()}
  />
</picture>
```

The URL is stable and does not expire. Session authentication is provided by the browser's cookie jar on every request. No client-side token management or signed URL rotation is required.

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md)
- [01 — Authentication & Onboarding](./01-auth.md)
- [02 — Database Schema & RLS](./02-database.md)
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md)
- [07 — Infrastructure, Testing & i18n](./07-infrastructure.md)
- [08 — Reports, Moderation & Bans](./08-moderation.md)
