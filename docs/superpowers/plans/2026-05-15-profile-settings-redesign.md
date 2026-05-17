# Profile & Settings Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 7 coordinated UI changes: settings profile block, onboarding-as-edit-flow, photo deletion, fullscreen removal, settings icon placement, header typography, and persistent filter preferences backed by Supabase.

**Architecture:** All writes go through Server Actions (`features/*/actions.ts`). Filter preferences stored as JSONB in `profiles.filter_preferences` — loaded server-side on page mount, saved client-side on apply/reset. Onboarding wizard gains `initialStep1Data / initialStep2Data / initialPhotos / isEditMode` props; the page always fetches the current profile and passes it down, making the wizard dual-purpose.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres, Tailwind v4, TanStack Query v5, Zod v4, Inngest (existing photo-delete pipeline), Server Actions.

---

## File Map

| Action | Path                                                            |
| ------ | --------------------------------------------------------------- |
| Modify | `lib/i18n/dictionary.ts`                                        |
| Modify | `components/ui/header.tsx`                                      |
| Modify | `features/chat/components/ChatList.tsx`                         |
| Modify | `features/likes/components/LikesTabs.tsx`                       |
| Modify | `features/notifications/components/NotificationList.tsx`        |
| Modify | `features/feed/components/FiltersScreen.tsx`                    |
| Modify | `app/settings/page.tsx`                                         |
| Modify | `features/settings/components/SettingsScreen.tsx`               |
| Modify | `features/profile/components/OwnProfile.tsx`                    |
| Modify | `features/profile/components/onboarding-step1.tsx`              |
| Modify | `features/profile/components/onboarding-step3.tsx`              |
| Modify | `features/profile/components/onboarding-wizard.tsx`             |
| Modify | `app/(app)/onboarding/page.tsx`                                 |
| Modify | `app/(app)/feed/filters/page.tsx`                               |
| Modify | `features/feed/schemas.ts`                                      |
| Create | `features/feed/actions.ts`                                      |
| Create | `supabase/migrations/20260515000000_add_filter_preferences.sql` |
| Delete | `app/(app)/profile/edit/page.tsx`                               |
| Delete | `features/profile/components/ProfileEditForm.tsx`               |

---

## Task 1: i18n keys for new strings

**Files:**

- Modify: `lib/i18n/dictionary.ts`

- [ ] **Step 1: Add RU keys after `own_free_likes_left` (line 181)**

```typescript
// In the RU = { ... } block, after:
//   own_free_likes_left: '{used}/3 бесплатных симпатий',
  own_edit: 'Редактировать анкету',
  own_photo_del_title: 'Удалить фото?',
  own_photo_del_sub: 'Фото будет удалено без возможности восстановления.',
  own_photo_del_confirm: 'Удалить',
  own_photo_del_error: 'Не удалось удалить фото',
```

- [ ] **Step 2: Add EN keys after `own_free_likes_left` in the EN block (around line 510)**

```typescript
// In the EN = { ... } block, after:
//   own_free_likes_left: '{used}/3 free likes',
  own_edit: 'Edit profile',
  own_photo_del_title: 'Delete photo?',
  own_photo_del_sub: 'The photo will be permanently deleted.',
  own_photo_del_confirm: 'Delete',
  own_photo_del_error: 'Failed to delete photo',
```

- [ ] **Step 3: Verify `pnpm typecheck` passes** (dictionary is inferred — the new keys must satisfy the union type)

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

Expected: no errors related to dictionary.

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/dictionary.ts
git commit -m "feat: add i18n keys for profile edit and photo deletion"
```

---

## Task 2: Header typography — H1, uppercase, left-aligned

**Files:**

- Modify: `components/ui/header.tsx`
- Modify: `features/profile/components/OwnProfile.tsx`
- Modify: `features/feed/components/FiltersScreen.tsx`

- [ ] **Step 1: Update `BigHeader` h1 — add `uppercase`**

In `components/ui/header.tsx`, find BigHeader (line ~70). Change:

```tsx
// Before
<h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-0.5px] text-[var(--ink)]">

// After
<h1 className="m-0 text-[28px] font-semibold uppercase leading-[1.1] tracking-[-0.5px] text-[var(--ink)]">
```

- [ ] **Step 2: Update `Header` title — change `<div>` to `<h1>`, add `uppercase`**

In the same file, inside `Header` (line ~57). Change:

```tsx
// Before
<div className="truncate text-base font-semibold tracking-[-0.2px] text-[var(--ink)]">
  {title}
</div>

// After
<h1 className="m-0 truncate text-base font-semibold uppercase tracking-[-0.2px] text-[var(--ink)]">
  {title}
</h1>
```

- [ ] **Step 3: Update OwnProfile custom header — left-align h1, add `uppercase`**

In `features/profile/components/OwnProfile.tsx` (line 86). Change:

```tsx
// Before
<h1 className="m-0 flex-1 text-center text-[18px] font-semibold text-[var(--ink)]">

// After
<h1 className="m-0 flex-1 text-[18px] font-semibold uppercase text-[var(--ink)]">
```

- [ ] **Step 4: Remove `centerTitle` from FiltersScreen Header**

In `features/feed/components/FiltersScreen.tsx` (line 138). Change:

```tsx
// Before
<Header title={t('filters_title')} leading="back" onLeading={close} centerTitle hairline />

// After
<Header title={t('filters_title')} leading="back" onLeading={close} hairline />
```

- [ ] **Step 5: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/ui/header.tsx features/profile/components/OwnProfile.tsx features/feed/components/FiltersScreen.tsx
git commit -m "feat: all page headers as uppercase H1, left-aligned"
```

---

## Task 3: Settings gear icon on Chats, Likes, Notifications, Filters

Pattern from `FeedHeader`: `<Link href="/settings"><IconBtn icon="gear" /></Link>`

**Files:**

- Modify: `features/chat/components/ChatList.tsx`
- Modify: `features/likes/components/LikesTabs.tsx`
- Modify: `features/notifications/components/NotificationList.tsx`
- Modify: `features/feed/components/FiltersScreen.tsx`

- [ ] **Step 1: Update ChatList.tsx**

Add imports at the top:

```tsx
import Link from 'next/link'
// Change existing import:
// Before: import { BigHeader } from '@/components/ui/header'
// After:
import { BigHeader, IconBtn } from '@/components/ui/header'
```

Update BigHeader call (currently line ~51):

```tsx
// Before
<BigHeader title={t('chats_title')} />

// After
<BigHeader
  title={t('chats_title')}
  actions={
    <Link href="/settings" aria-label={t('settings')}>
      <IconBtn icon="gear" ariaLabel={t('settings')} />
    </Link>
  }
/>
```

- [ ] **Step 2: Update LikesTabs.tsx**

Add imports:

```tsx
import Link from 'next/link'
// Change existing import:
// Before: import { BigHeader } from '@/components/ui/header'
// After:
import { BigHeader, IconBtn } from '@/components/ui/header'
```

Update BigHeader call (currently line ~40):

```tsx
// Before
<BigHeader title={t('likes_title')} />

// After
<BigHeader
  title={t('likes_title')}
  actions={
    <Link href="/settings" aria-label={t('settings')}>
      <IconBtn icon="gear" ariaLabel={t('settings')} />
    </Link>
  }
/>
```

- [ ] **Step 3: Update NotificationList.tsx**

Add imports (at top of file):

```tsx
import Link from 'next/link'
import { IconBtn } from '@/components/ui/header'
```

In the custom sticky header, add gear link between the h1 and the "mark all" button:

```tsx
// Before (custom header block):
<div className="sticky top-0 z-10 flex min-h-[56px] items-center justify-between gap-2 border-b border-[var(--divider)] bg-[var(--bg)] px-5 py-3">
  <button type="button" onClick={() => router.back()} aria-label="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink)]">
    <Icon name="back" size={22} />
  </button>
  <h1 className="m-0 flex-1 text-[22px] font-bold uppercase tracking-[0.5px] text-[var(--ink)]">
    {t('notif_title')}
  </h1>
  <button type="button" onClick={markAllAsRead} className="bg-transparent text-[13px] font-medium text-[var(--primary)]">
    {t('notif_mark_all')}
  </button>
</div>

// After:
<div className="sticky top-0 z-10 flex min-h-[56px] items-center justify-between gap-2 border-b border-[var(--divider)] bg-[var(--bg)] px-5 py-3">
  <button type="button" onClick={() => router.back()} aria-label="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink)]">
    <Icon name="back" size={22} />
  </button>
  <h1 className="m-0 flex-1 text-[22px] font-bold uppercase tracking-[0.5px] text-[var(--ink)]">
    {t('notif_title')}
  </h1>
  <Link href="/settings" aria-label={t('settings')}>
    <IconBtn icon="gear" ariaLabel={t('settings')} />
  </Link>
  <button type="button" onClick={markAllAsRead} className="bg-transparent text-[13px] font-medium text-[var(--primary)]">
    {t('notif_mark_all')}
  </button>
</div>
```

- [ ] **Step 4: Update FiltersScreen.tsx — add gear as `trailing` prop to Header**

Add imports (at top):

```tsx
import Link from 'next/link'
// Change existing import:
// Before: import { Header, StickyActions } from '@/components/ui/header'
// After:
import { Header, IconBtn, StickyActions } from '@/components/ui/header'
```

Update Header call (already changed `centerTitle` in Task 2 Step 4):

```tsx
// Before (after Task 2)
<Header title={t('filters_title')} leading="back" onLeading={close} hairline />

// After
<Header
  title={t('filters_title')}
  leading="back"
  onLeading={close}
  hairline
  trailing={
    <Link href="/settings" aria-label={t('settings')}>
      <IconBtn icon="gear" ariaLabel={t('settings')} />
    </Link>
  }
/>
```

- [ ] **Step 5: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add features/chat/components/ChatList.tsx features/likes/components/LikesTabs.tsx features/notifications/components/NotificationList.tsx features/feed/components/FiltersScreen.tsx
git commit -m "feat: settings gear icon on Chats, Likes, Notifications, Filters pages"
```

---

## Task 4: Profile block as first item in Settings

**Files:**

- Modify: `app/settings/page.tsx`
- Modify: `features/settings/components/SettingsScreen.tsx`

- [ ] **Step 1: Pass `userId` from settings page to `SettingsScreen`**

In `app/settings/page.tsx`, update the return:

```tsx
// Before
return (
  <ScreenBody>
    <SettingsScreen isAuthed={!!userId} isPublished={isPublished} role={role} />
  </ScreenBody>
)

// After
return (
  <ScreenBody>
    <SettingsScreen isAuthed={!!userId} isPublished={isPublished} role={role} userId={userId} />
  </ScreenBody>
)
```

- [ ] **Step 2: Add `userId` prop and profile group to `SettingsScreen`**

In `features/settings/components/SettingsScreen.tsx`, update the interface:

```tsx
// Before
interface SettingsScreenProps {
  isAuthed: boolean
  isPublished?: boolean
  role?: 'user' | 'admin' | 'moderator' | null
  freeLikesLeft?: number
}

// After
interface SettingsScreenProps {
  isAuthed: boolean
  isPublished?: boolean
  role?: 'user' | 'admin' | 'moderator' | null
  freeLikesLeft?: number
  userId?: string | null
}
```

Update the function signature:

```tsx
// Before
export function SettingsScreen({
  isAuthed,
  isPublished,
  role,
  freeLikesLeft = 2,
}: SettingsScreenProps) {

// After
export function SettingsScreen({
  isAuthed,
  isPublished,
  role,
  freeLikesLeft = 2,
  userId,
}: SettingsScreenProps) {
```

Add the profile group **before** the language/theme group (before the first `<SettingsGroup>` at line ~57):

```tsx
// Insert BEFORE the existing first SettingsGroup (language/theme):
{
  isAuthed && (
    <SettingsGroup>
      <SettingsRow
        icon="user"
        label={t('own_title')}
        onClick={() => router.push('/profile')}
        last
      />
    </SettingsGroup>
  )
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add app/settings/page.tsx features/settings/components/SettingsScreen.tsx
git commit -m "feat: profile block as first item in settings"
```

---

## Task 5: Remove fullscreen photo viewer from OwnProfile

**Files:**

- Modify: `features/profile/components/OwnProfile.tsx`

- [ ] **Step 1: Remove `fullscreen` state declaration**

```tsx
// Remove this line (~line 36):
const [fullscreen, setFullscreen] = useState(false)
```

- [ ] **Step 2: Replace main photo `<button>` wrapper with `<div>`**

```tsx
// Before (~line 99-101):
<button
  type="button"
  onClick={() => setFullscreen(true)}
  className="relative block aspect-[4/5] w-full cursor-pointer overflow-hidden"
>

// After:
<div className="relative block aspect-[4/5] w-full overflow-hidden">
```

Also change the closing tag from `</button>` to `</div>` at the end of that block (~line 138).

- [ ] **Step 3: Remove fullscreen modal block (~lines 276-298)**

Delete the entire block:

```tsx
// Remove entirely:
{
  fullscreen && photo && (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={() => setFullscreen(false)}
    >
      <PhotoStream
        photoId={photo.id}
        variant="full"
        alt={profile.name ?? ''}
        className="pointer-events-none max-h-full max-w-full object-contain"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setFullscreen(false)
        }}
        className="fixed right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white"
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

Expected: no errors (the `photo` const is still used by the slider at the top).

- [ ] **Step 5: Commit**

```bash
git add features/profile/components/OwnProfile.tsx
git commit -m "feat: remove fullscreen photo viewer from own profile"
```

---

## Task 6: Edit & Delete full-width buttons on OwnProfile + delete /profile/edit

**Files:**

- Modify: `features/profile/components/OwnProfile.tsx`
- Delete: `app/(app)/profile/edit/page.tsx`
- Delete: `features/profile/components/ProfileEditForm.tsx`

- [ ] **Step 1: Replace bare delete button with two full-width buttons**

In `OwnProfile.tsx`, replace the current delete button block (~lines 266-273):

```tsx
// Before:
<button
  type="button"
  onClick={() => setShowDel(true)}
  className="mx-5 mt-4 flex h-12 w-[calc(100%-40px)] items-center justify-center gap-2 rounded-xl bg-transparent text-[14.5px] font-medium text-[var(--danger)]"
>
  <Icon name="trash" size={16} />
  {t('own_delete')}
</button>

// After:
<div className="mx-5 mt-4 flex flex-col gap-3">
  <button
    type="button"
    onClick={() => router.push('/onboarding')}
    className="flex h-12 w-full items-center justify-center rounded-xl border border-[var(--divider)] bg-[var(--surface)] text-[14.5px] font-medium text-[var(--ink)]"
  >
    {t('own_edit')}
  </button>
  <button
    type="button"
    onClick={() => setShowDel(true)}
    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)] bg-transparent text-[14.5px] font-medium text-[var(--danger)]"
  >
    <Icon name="trash" size={16} />
    {t('own_delete')}
  </button>
</div>
```

- [ ] **Step 2: Delete /profile/edit page**

```bash
rm /Users/aliblogger/NikahHelpClaudePro/nikah-help/app/\(app\)/profile/edit/page.tsx
```

- [ ] **Step 3: Delete ProfileEditForm component**

```bash
rm /Users/aliblogger/NikahHelpClaudePro/nikah-help/features/profile/components/ProfileEditForm.tsx
```

- [ ] **Step 4: Run typecheck to confirm no dangling imports**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -30
```

Expected: no errors referencing ProfileEditForm or /profile/edit.

- [ ] **Step 5: Commit**

```bash
git add -p features/profile/components/OwnProfile.tsx
git commit -m "feat: edit and delete full-width buttons on own profile, remove /profile/edit"
```

(Use `git rm` output for the deleted files in the same commit.)

---

## Task 7: Photo deletion with confirmation in OwnProfile grid

**Files:**

- Modify: `features/profile/components/OwnProfile.tsx`

- [ ] **Step 1: Add import for `deletePhotoAction`**

At the top of `OwnProfile.tsx`, add to imports:

```tsx
import { deletePhotoAction } from '../actions'
```

- [ ] **Step 2: Add photo deletion state**

After the existing state declarations (around line 40), add:

```tsx
const [showPhotoDelModal, setShowPhotoDelModal] = useState(false)
const [photoToDeleteId, setPhotoToDeleteId] = useState<string | null>(null)
const [photoDeletingId, setPhotoDeletingId] = useState<string | null>(null)
```

- [ ] **Step 3: Add photo deletion handlers**

After `confirmUnpublish`, add:

```tsx
const confirmPhotoDelete = () => {
  if (!photoToDeleteId) return
  const id = photoToDeleteId
  setShowPhotoDelModal(false)
  setPhotoDeletingId(id)
  startTransition(async () => {
    const res = await deletePhotoAction(id)
    setPhotoDeletingId(null)
    setPhotoToDeleteId(null)
    if (!res.success) toast.show(t('own_photo_del_error'))
    else router.refresh()
  })
}
```

- [ ] **Step 4: Wrap each photo thumbnail in a `<div>` and add × delete button**

In the photo grid section (~lines 191-234), change the map to wrap each item:

```tsx
// Before:
{
  photos.map((p, i) => (
    <button
      key={p.id}
      type="button"
      onClick={() => setPhotoIdx(i)}
      className={`relative aspect-[4/5] overflow-hidden rounded-xl ${
        photoIdx === i ? 'outline outline-2 outline-offset-2 outline-[var(--primary)]' : ''
      }`}
    >
      <PhotoStream
        photoId={p.id}
        variant="cover"
        alt={`photo ${i}`}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {i === 0 && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--primary)] px-1.5 py-0.5 text-[10px] text-white">
          {t('ob_avatar')}
        </span>
      )}
      {p.moderation_status === 'pending' && (
        <span className="absolute bottom-1 left-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-center text-[9.5px] text-white">
          {t('mod_pending')}
        </span>
      )}
      {p.moderation_status === 'rejected' && (
        <span className="absolute bottom-1 left-1 right-1 rounded bg-[var(--danger)] px-1.5 py-0.5 text-center text-[9.5px] text-white">
          {t('mod_rejected')}
        </span>
      )}
    </button>
  ))
}

// After:
{
  photos.map((p, i) => (
    <div key={p.id} className="relative">
      <button
        type="button"
        onClick={() => setPhotoIdx(i)}
        className={`relative aspect-[4/5] w-full overflow-hidden rounded-xl ${
          photoIdx === i ? 'outline outline-2 outline-offset-2 outline-[var(--primary)]' : ''
        }`}
      >
        <PhotoStream
          photoId={p.id}
          variant="cover"
          alt={`photo ${i}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {i === 0 && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--primary)] px-1.5 py-0.5 text-[10px] text-white">
            {t('ob_avatar')}
          </span>
        )}
        {p.moderation_status === 'pending' && (
          <span className="absolute bottom-1 left-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-center text-[9.5px] text-white">
            {t('mod_pending')}
          </span>
        )}
        {p.moderation_status === 'rejected' && (
          <span className="absolute bottom-1 left-1 right-1 rounded bg-[var(--danger)] px-1.5 py-0.5 text-center text-[9.5px] text-white">
            {t('mod_rejected')}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          setPhotoToDeleteId(p.id)
          setShowPhotoDelModal(true)
        }}
        className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
        aria-label={t('own_photo_del_title')}
        disabled={photoDeletingId === p.id}
      >
        {photoDeletingId === p.id ? (
          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <Icon name="close" size={12} />
        )}
      </button>
    </div>
  ))
}
```

- [ ] **Step 5: Add photo deletion confirmation Modal**

After the existing `showDel` Modal block (near bottom of the file), add:

```tsx
<Modal
  open={showPhotoDelModal}
  onClose={() => setShowPhotoDelModal(false)}
  title={t('own_photo_del_title')}
  primary={{ label: t('own_photo_del_confirm'), onClick: confirmPhotoDelete }}
  secondary={{ label: t('cancel'), onClick: () => setShowPhotoDelModal(false) }}
  danger
>
  {t('own_photo_del_sub')}
</Modal>
```

- [ ] **Step 6: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add features/profile/components/OwnProfile.tsx
git commit -m "feat: photo deletion with confirmation in own profile grid"
```

---

## Task 8: DB migration — `filter_preferences` column

**Files:**

- Create: `supabase/migrations/20260515000000_add_filter_preferences.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260515000000_add_filter_preferences.sql
ALTER TABLE profiles ADD COLUMN filter_preferences jsonb DEFAULT NULL;
```

- [ ] **Step 2: Apply migration to Supabase**

Use the Supabase MCP tool `apply_migration` with the SQL above, or via CLI:

```bash
cd nikah-help && supabase db push
```

- [ ] **Step 3: Regenerate TypeScript types**

```bash
cd nikah-help && pnpm db:typegen
```

Verify `types/database.types.ts` now contains `filter_preferences: Json | null` in the profiles Row and Update types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260515000000_add_filter_preferences.sql types/database.types.ts
git commit -m "feat: add filter_preferences jsonb column to profiles"
```

---

## Task 9: `FilterPreferences` type + `saveFilterPreferencesAction`

**Files:**

- Modify: `features/feed/schemas.ts`
- Create: `features/feed/actions.ts`

- [ ] **Step 1: Add `FilterPreferences` interface to `features/feed/schemas.ts`**

Append at the end of the file:

```typescript
export interface FilterPreferences {
  locMode?: 'place' | 'radius'
  country?: string
  city?: string
  radiusKm?: number
  ageMin?: number
  ageMax?: number
  marital?: string | null
  children?: 'any' | 'none' | 'has'
  polygamy?: 'any' | 'mono' | 'open'
  hijab?: string | null
  income?: string | null
  housing?: string | null
}
```

- [ ] **Step 2: Create `features/feed/actions.ts`**

```typescript
'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { getServerUserId } from '@/lib/auth/claims'
import { captureSentryException } from '@/lib/sentry/capture'
import type { Json } from '@/types/database.types'
import type { FilterPreferences } from './schemas'

export async function saveFilterPreferencesAction(prefs: FilterPreferences | null) {
  const supabase = await createServerSupabase()
  const userId = await getServerUserId()
  if (!userId) return { success: false as const }

  const { error } = await supabase
    .from('profiles')
    .update({ filter_preferences: prefs as Json | null })
    .eq('id', userId)

  if (error) {
    void captureSentryException(error, {
      flow: 'action.save_filter_preferences',
      severity: 'warning',
      tags: { step: 'update_profiles' },
    })
    return { success: false as const }
  }
  return { success: true as const }
}
```

- [ ] **Step 3: Verify `Json` is exported from database.types.ts**

```bash
grep -n "^export type Json" nikah-help/types/database.types.ts
```

Expected: one line like `export type Json = string | number | boolean | null | ...`

If not exported, change `import type { Json }` to define it inline:

```typescript
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
```

- [ ] **Step 4: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add features/feed/schemas.ts features/feed/actions.ts
git commit -m "feat: FilterPreferences type and saveFilterPreferencesAction"
```

---

## Task 10: Persist filter settings in FiltersScreen

**Files:**

- Modify: `app/(app)/feed/filters/page.tsx`
- Modify: `features/feed/components/FiltersScreen.tsx`

- [ ] **Step 1: Update filters page to fetch `filter_preferences`**

In `app/(app)/feed/filters/page.tsx`, update the profile query to also select `filter_preferences`. The current query selects only `gender`:

```typescript
// Add import:
import type { FilterPreferences } from '@/features/feed/schemas'

// Change the profile select from:
const { data: profileData } = await supabase
  .from('profiles')
  .select('gender')
  .eq('id', userId)
  .single()
const gender = (profileData?.gender as 'male' | 'female') ?? 'male'

// To:
const { data: profileData } = await supabase
  .from('profiles')
  .select('gender, filter_preferences')
  .eq('id', userId)
  .single()
const gender = (profileData?.gender as 'male' | 'female') ?? 'male'
const initialFilters = (profileData?.filter_preferences as FilterPreferences | null) ?? null
```

Update the return to pass `initialFilters`:

```tsx
// Before:
return (
  <ScreenBody>
    <FiltersScreen viewerGender={gender} />
  </ScreenBody>
)

// After:
return (
  <ScreenBody>
    <FiltersScreen viewerGender={gender} initialFilters={initialFilters} />
  </ScreenBody>
)
```

- [ ] **Step 2: Add imports to FiltersScreen.tsx**

At the top of `features/feed/components/FiltersScreen.tsx`:

```typescript
import { saveFilterPreferencesAction } from '../actions'
import type { FilterPreferences } from '../schemas'
```

- [ ] **Step 3: Update `FiltersScreenProps` and state initialization**

```typescript
// Before:
interface FiltersScreenProps {
  viewerGender: 'male' | 'female'
}

export function FiltersScreen({ viewerGender }: FiltersScreenProps) {
  ...
  const [locMode, setLocMode] = useState<LocMode>('place')
  const [country, setCountry] = useState<string>('')
  const [city, setCity] = useState<string>('')
  const [radiusKm, setRadiusKm] = useState<number>(RADIUS_RANGE.min)
  const [ageMin, setAgeMin] = useState<number>(AGE_RANGE.min)
  const [ageMax, setAgeMax] = useState<number>(50)
  const [marital, setMarital] = useState<string | null>(null)
  const [children, setChildren] = useState<'any' | 'none' | 'has'>('any')
  const [polygamy, setPolygamy] = useState<'any' | 'mono' | 'open'>('any')
  const [hijab, setHijab] = useState<string | null>(null)
  const [income, setIncome] = useState<string | null>(null)
  const [housing, setHousing] = useState<string | null>(null)

// After:
interface FiltersScreenProps {
  viewerGender: 'male' | 'female'
  initialFilters?: FilterPreferences | null
}

export function FiltersScreen({ viewerGender, initialFilters }: FiltersScreenProps) {
  ...
  const [locMode, setLocMode] = useState<LocMode>(() => initialFilters?.locMode ?? 'place')
  const [country, setCountry] = useState<string>(() => initialFilters?.country ?? '')
  const [city, setCity] = useState<string>(() => initialFilters?.city ?? '')
  const [radiusKm, setRadiusKm] = useState<number>(() => initialFilters?.radiusKm ?? RADIUS_RANGE.min)
  const [ageMin, setAgeMin] = useState<number>(() => initialFilters?.ageMin ?? AGE_RANGE.min)
  const [ageMax, setAgeMax] = useState<number>(() => initialFilters?.ageMax ?? 50)
  const [marital, setMarital] = useState<string | null>(() => initialFilters?.marital ?? null)
  const [children, setChildren] = useState<'any' | 'none' | 'has'>(() => initialFilters?.children ?? 'any')
  const [polygamy, setPolygamy] = useState<'any' | 'mono' | 'open'>(() => initialFilters?.polygamy ?? 'any')
  const [hijab, setHijab] = useState<string | null>(() => initialFilters?.hijab ?? null)
  const [income, setIncome] = useState<string | null>(() => initialFilters?.income ?? null)
  const [housing, setHousing] = useState<string | null>(() => initialFilters?.housing ?? null)
```

- [ ] **Step 4: Update `apply()` to save preferences**

```typescript
// Before:
const apply = () => {
  const params = new URLSearchParams()
  ...
  router.replace(`/feed${params.toString() ? `?${params.toString()}` : ''}`)
}

// After:
const apply = () => {
  void saveFilterPreferencesAction({
    locMode, country, city, radiusKm, ageMin, ageMax,
    marital, children, polygamy, hijab, income, housing,
  })
  const params = new URLSearchParams()
  if (ageMin !== AGE_RANGE.min) params.set('age_min', String(ageMin))
  if (ageMax !== 50) params.set('age_max', String(ageMax))
  if (locMode === 'radius') params.set('radius_km', String(radiusKm))
  if (marital) params.set('marital_status', marital)
  if (children === 'none') params.set('children_count_max', '0')
  if (viewerGender === 'male') {
    if (polygamy === 'mono') params.set('polygyny_attitude', 'negative')
    else if (polygamy === 'open') params.set('polygyny_attitude', 'positive')
    if (hijab) params.set('hijab_attitude', hijab)
  } else {
    if (income) params.set('income_level', income)
    if (housing) params.set('housing', housing)
  }
  router.replace(`/feed${params.toString() ? `?${params.toString()}` : ''}`)
}
```

- [ ] **Step 5: Update `reset()` to clear saved preferences**

```typescript
// Before:
const reset = () => {
  setLocMode('place')
  setCountry('')
  setCity('')
  setRadiusKm(RADIUS_RANGE.min)
  setAgeMin(AGE_RANGE.min)
  setAgeMax(50)
  setMarital(null)
  setChildren('any')
  setPolygamy('any')
  setHijab(null)
  setIncome(null)
  setHousing(null)
}

// After:
const reset = () => {
  setLocMode('place')
  setCountry('')
  setCity('')
  setRadiusKm(RADIUS_RANGE.min)
  setAgeMin(AGE_RANGE.min)
  setAgeMax(50)
  setMarital(null)
  setChildren('any')
  setPolygamy('any')
  setHijab(null)
  setIncome(null)
  setHousing(null)
  void saveFilterPreferencesAction(null)
  router.replace('/feed')
}
```

- [ ] **Step 6: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/feed/filters/page.tsx features/feed/components/FiltersScreen.tsx
git commit -m "feat: persist filter preferences in Supabase across sessions"
```

---

## Task 11: Onboarding page — fetch profile for pre-fill

**Files:**

- Modify: `app/(app)/onboarding/page.tsx`

- [ ] **Step 1: Replace the onboarding page with full-profile-fetching version**

```typescript
import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/claims'
import { OnboardingWizard } from '@/features/profile/components/onboarding-wizard'
import type {
  OnboardingStep1Data,
  OnboardingStep2MaleData,
  OnboardingStep2FemaleData,
} from '@/features/profile/schemas'

export const metadata = {
  title: 'Анкета — Nikah Help',
}

export default async function OnboardingPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) redirect('/auth')

  const userId = getUserId(data.claims as Record<string, unknown>)
  if (!userId) redirect('/auth')

  const [{ data: profile }, { data: photos }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'locale, onboarding_completed, name, birth_date, gender, country, city, nationality, height, weight, marital_status, children_count, about_self, income_level, housing, willing_to_relocate, polygyny_attitude, hijab_attitude',
      )
      .eq('id', userId)
      .single(),
    supabase.from('photos').select('id, position').eq('profile_id', userId).order('position'),
  ])

  const locale = (profile?.locale as string) ?? 'ru'
  const isEditMode = !!profile?.onboarding_completed

  let initialStep1Data: Partial<OnboardingStep1Data> | undefined
  let initialStep2Data:
    | Partial<OnboardingStep2MaleData | OnboardingStep2FemaleData>
    | undefined

  if (profile?.name) {
    initialStep1Data = {
      name: profile.name ?? undefined,
      birth_date: profile.birth_date ?? undefined,
      gender: (profile.gender as 'male' | 'female') ?? undefined,
      country: profile.country ?? undefined,
      city: profile.city ?? undefined,
      nationality: profile.nationality ?? undefined,
      height: profile.height ?? undefined,
      weight: profile.weight ?? undefined,
      allow_geolocation: true,
    }

    if (profile.gender === 'male') {
      initialStep2Data = {
        marital_status:
          (profile.marital_status as OnboardingStep2MaleData['marital_status']) ?? undefined,
        children_count: profile.children_count ?? undefined,
        income_level:
          (profile.income_level as OnboardingStep2MaleData['income_level']) ?? undefined,
        housing: (profile.housing as OnboardingStep2MaleData['housing']) ?? undefined,
        about_self: profile.about_self ?? undefined,
      }
    } else if (profile.gender === 'female') {
      initialStep2Data = {
        marital_status:
          (profile.marital_status as OnboardingStep2FemaleData['marital_status']) ?? undefined,
        children_count: profile.children_count ?? undefined,
        willing_to_relocate:
          (profile.willing_to_relocate as OnboardingStep2FemaleData['willing_to_relocate']) ??
          undefined,
        polygyny_attitude:
          (profile.polygyny_attitude as OnboardingStep2FemaleData['polygyny_attitude']) ??
          undefined,
        hijab_attitude:
          (profile.hijab_attitude as OnboardingStep2FemaleData['hijab_attitude']) ?? undefined,
        about_self: profile.about_self ?? undefined,
      }
    }
  }

  const initialPhotos =
    photos && photos.length > 0
      ? photos.map((p) => ({ photoId: p.id, position: p.position }))
      : undefined

  return (
    <OnboardingWizard
      locale={locale}
      initialStep1Data={initialStep1Data}
      initialStep2Data={initialStep2Data}
      initialPhotos={initialPhotos}
      isEditMode={isEditMode}
    />
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -30
```

Expected: TypeScript errors about unknown props on `OnboardingWizard` — these will be fixed in Task 13.

- [ ] **Step 3: Commit (even with TS errors — they will be resolved in Task 13)**

Skip commit until Task 13 resolves the errors.

---

## Task 12: OnboardingStep1 — fix city clear-on-mount bug

**Files:**

- Modify: `features/profile/components/onboarding-step1.tsx`

The `useEffect` that clears `city` when `country` changes fires on initial render too, which would wipe the pre-filled city. Fix: skip the first render.

- [ ] **Step 1: Add `useRef` import**

```tsx
// Before:
import { useEffect } from 'react'

// After:
import { useEffect, useRef } from 'react'
```

- [ ] **Step 2: Add skip-first-render guard to the useEffect**

Inside `OnboardingStep1`, after the form setup:

```tsx
const isFirstRender = useRef(true)

// Replace the existing useEffect:
// Before:
useEffect(() => {
  setValue('city', '')
}, [selectedCountry, setValue])

// After:
useEffect(() => {
  if (isFirstRender.current) {
    isFirstRender.current = false
    return
  }
  setValue('city', '')
}, [selectedCountry, setValue])
```

- [ ] **Step 3: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

---

## Task 13: OnboardingStep3 — pre-fill existing photos + deletion confirmation

**Files:**

- Modify: `features/profile/components/onboarding-step3.tsx`

- [ ] **Step 1: Update imports**

```tsx
// Before:
import { markPhotoUploaded } from '../actions'

// After:
import { markPhotoUploaded, deletePhotoAction } from '../actions'
import { Modal } from '@/components/ui/modal'
import { Photo as PhotoStream } from '@/features/photos/components/Photo'
```

- [ ] **Step 2: Update `PhotoSlot` type to add `isExisting`**

```tsx
// Before:
type PhotoSlot = {
  position: number
  preview: string | null
  photoId: string | null
  path: string | null
  uploading: boolean
}

// After:
type PhotoSlot = {
  position: number
  preview: string | null
  photoId: string | null
  path: string | null
  uploading: boolean
  isExisting: boolean
}
```

- [ ] **Step 3: Update `createSlots` to include `isExisting: false`**

```tsx
// Before:
function createSlots(): PhotoSlot[] {
  return Array.from({ length: MAX_PHOTOS }, (_, i) => ({
    position: i + 1,
    preview: null,
    photoId: null,
    path: null,
    uploading: false,
  }))
}

// After:
function createSlots(): PhotoSlot[] {
  return Array.from({ length: MAX_PHOTOS }, (_, i) => ({
    position: i + 1,
    preview: null,
    photoId: null,
    path: null,
    uploading: false,
    isExisting: false,
  }))
}
```

- [ ] **Step 4: Add `initialPhotos` prop and lazy state initializer**

```tsx
// Before:
export function OnboardingStep3({
  isPending,
  onComplete,
}: {
  isPending?: boolean
  onComplete?: () => void
}) {
  const [slots, setSlots] = useState<PhotoSlot[]>(createSlots)

// After:
export function OnboardingStep3({
  isPending,
  onComplete,
  initialPhotos,
}: {
  isPending?: boolean
  onComplete?: () => void
  initialPhotos?: Array<{ photoId: string; position: number }>
}) {
  const [slots, setSlots] = useState<PhotoSlot[]>(() => {
    const base = createSlots()
    if (initialPhotos?.length) {
      for (const p of initialPhotos) {
        const idx = p.position - 1
        if (idx >= 0 && idx < MAX_PHOTOS) {
          base[idx] = { ...base[idx], photoId: p.photoId, isExisting: true }
        }
      }
    }
    return base
  })
```

- [ ] **Step 5: Update `filledCount` to count existing slots**

```tsx
// Before:
const filledCount = slots.filter((s) => s.preview).length

// After:
const filledCount = slots.filter((s) => s.preview || s.isExisting).length
```

- [ ] **Step 6: Add deletion confirmation state and handlers**

After `const [error, setError] = useState<string | null>(null)`, add:

```tsx
const [delConfirmPos, setDelConfirmPos] = useState<number | null>(null)
const [deleting, setDeleting] = useState(false)
```

Replace the existing `handleRemove`:

```tsx
// Remove:
const handleRemove = (position: number) => {
  setSlots((prev) =>
    prev.map((s) =>
      s.position === position ? { ...s, preview: null, photoId: null, path: null } : s,
    ),
  )
}

// Add:
const handleRemoveClick = (position: number) => {
  setDelConfirmPos(position)
}

const confirmRemove = async () => {
  if (delConfirmPos === null) return
  const slot = slots.find((s) => s.position === delConfirmPos)
  const posToRemove = delConfirmPos
  setDelConfirmPos(null)
  if (slot?.photoId) {
    setDeleting(true)
    await deletePhotoAction(slot.photoId)
    setDeleting(false)
  }
  setSlots((prev) =>
    prev.map((s) =>
      s.position === posToRemove
        ? { ...s, preview: null, photoId: null, path: null, isExisting: false }
        : s,
    ),
  )
}
```

- [ ] **Step 7: Update filled slot rendering to handle `isExisting`**

In the slot map (around line 162), replace the filled-slot block:

```tsx
// Before (filled slot):
{slot.preview ? (
  <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
    {/* eslint-disable-next-line @next/next/no-img-element -- preview is an object URL */}
    <img src={slot.preview} alt={`Фото ${slot.position}`} className="h-full w-full object-cover" />
    {slot.position === 1 && (
      <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">Аватар</span>
    )}
    <button type="button" onClick={() => handleRemove(slot.position)} className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
      ×
    </button>
  </div>
) : (

// After (filled slot):
{slot.preview || slot.isExisting ? (
  <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
    {slot.isExisting && slot.photoId ? (
      <PhotoStream
        photoId={slot.photoId}
        variant="cover"
        alt={`Фото ${slot.position}`}
        className="h-full w-full object-cover"
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- preview is an object URL
      <img src={slot.preview!} alt={`Фото ${slot.position}`} className="h-full w-full object-cover" />
    )}
    {slot.position === 1 && (
      <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">Аватар</span>
    )}
    <button
      type="button"
      onClick={() => handleRemoveClick(slot.position)}
      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
      disabled={deleting}
    >
      ×
    </button>
  </div>
) : (
```

- [ ] **Step 8: Add deletion confirmation Modal**

At the end of the returned JSX (before the closing `</div>`), add:

```tsx
<Modal
  open={delConfirmPos !== null}
  onClose={() => setDelConfirmPos(null)}
  title="Удалить фото?"
  primary={{ label: 'Удалить', onClick: () => void confirmRemove() }}
  secondary={{ label: 'Отмена', onClick: () => setDelConfirmPos(null) }}
  danger
>
  Фото будет удалено без возможности восстановления.
</Modal>
```

- [ ] **Step 9: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -20
```

---

## Task 14: OnboardingWizard — edit mode props and redirect

**Files:**

- Modify: `features/profile/components/onboarding-wizard.tsx`

- [ ] **Step 1: Add new props to the wizard**

```tsx
// Before:
export function OnboardingWizard({ locale = 'ru' }: { locale?: string }) {

// After:
export function OnboardingWizard({
  locale = 'ru',
  initialStep1Data,
  initialStep2Data,
  initialPhotos,
  isEditMode = false,
}: {
  locale?: string
  initialStep1Data?: Partial<OnboardingStep1Data>
  initialStep2Data?: Partial<OnboardingStep2MaleData | OnboardingStep2FemaleData>
  initialPhotos?: Array<{ photoId: string; position: number }>
  isEditMode?: boolean
}) {
```

- [ ] **Step 2: Initialize state from props**

```tsx
// Before:
const [step, setStep] = useState(1)
const [gender, setGender] = useState<'male' | 'female' | null>(null)
...
const [step1Data, setStep1Data] = useState<Partial<OnboardingStep1Data> | null>(null)
const [step2Data, setStep2Data] = useState<Partial<
  OnboardingStep2MaleData | OnboardingStep2FemaleData
> | null>(null)

// After:
const [step, setStep] = useState(1)
const [gender, setGender] = useState<'male' | 'female' | null>(
  () => (initialStep1Data as OnboardingStep1Data | undefined)?.gender ?? null,
)
...
const [step1Data, setStep1Data] = useState<Partial<OnboardingStep1Data> | null>(
  () => initialStep1Data ?? null,
)
const [step2Data, setStep2Data] = useState<Partial<
  OnboardingStep2MaleData | OnboardingStep2FemaleData
> | null>(() => initialStep2Data ?? null)
```

- [ ] **Step 3: Pass `initialPhotos` to OnboardingStep3**

```tsx
// Before:
{
  step === 3 && <OnboardingStep3 isPending={isPending} onComplete={() => setStep(4)} />
}

// After:
{
  step === 3 && (
    <OnboardingStep3
      isPending={isPending}
      onComplete={() => setStep(4)}
      initialPhotos={initialPhotos}
    />
  )
}
```

- [ ] **Step 4: Redirect to `/profile` in edit mode after step 4**

```tsx
// Before:
} else if (step === 4) {
  setSubmittingStep(4)
  startTransition(async () => {
    await completeOnboardingAction()
    setSubmittingStep(null)
    window.location.href = '/feed'
  })
}

// After:
} else if (step === 4) {
  setSubmittingStep(4)
  startTransition(async () => {
    await completeOnboardingAction()
    setSubmittingStep(null)
    window.location.href = isEditMode ? '/profile' : '/feed'
  })
}
```

- [ ] **Step 5: Run typecheck**

```bash
cd nikah-help && pnpm typecheck 2>&1 | head -30
```

Expected: no errors (the onboarding page from Task 11 should now type-check cleanly too).

- [ ] **Step 6: Commit all onboarding changes**

```bash
git add app/\(app\)/onboarding/page.tsx features/profile/components/onboarding-wizard.tsx features/profile/components/onboarding-step1.tsx features/profile/components/onboarding-step3.tsx
git commit -m "feat: onboarding wizard supports edit mode with profile pre-fill and photo deletion"
```

---

## Task 15: Final verification

- [ ] **Step 1: Full typecheck**

```bash
cd nikah-help && pnpm typecheck
```

Expected: exit 0, no errors.

- [ ] **Step 2: Lint**

```bash
cd nikah-help && pnpm lint
```

Expected: exit 0, no warnings (or only pre-existing ones).

- [ ] **Step 3: Format check**

```bash
cd nikah-help && pnpm format:check
```

If failures: run `pnpm format` then re-check.

- [ ] **Step 4: Final commit if format applied**

```bash
git add -p
git commit -m "chore: format after redesign"
```
