# Profile & Settings Redesign — Spec

Date: 2026-05-15

## Overview

Seven coordinated UI changes: settings navigation, profile edit flow via re-onboarding, photo deletion, fullscreen removal, settings icon placement, header typography, and persistent filter preferences.

---

## 1. Profile Block First in Settings

**Files:** `app/settings/page.tsx`, `features/settings/components/SettingsScreen.tsx`

- Add `userId: string | null` prop to `SettingsScreenProps`.
- Settings page already has `userId` from auth — pass it down.
- Insert a new `SettingsGroup` **before** the language/theme group, shown only when `isAuthed`:
  - `SettingsRow` with `icon="user"`, `label=t('own_title')`, `onClick={() => router.push('/profile')}`.
- `/profile` already redirects to `/profile/${userId}` server-side, so no ID needed in the link.

---

## 2. Edit & Delete Buttons on Own Profile

**Files:** `features/profile/components/OwnProfile.tsx`

Replace the current bare-text "Удалить анкету" button with two full-width buttons at the bottom of the scroll area:

1. **"Редактировать анкету"** — soft style, full-width, `onClick={() => router.push('/onboarding')}`.
2. **"Удалить анкету"** — danger style, full-width, opens the existing `showDel` modal.

Both buttons have `mx-5 w-[calc(100%-40px)]` and `h-12 rounded-xl` to match existing layout.

**Delete `/profile/edit` route and `ProfileEditForm`:**

- Remove `app/(app)/profile/edit/page.tsx`
- Remove `features/profile/components/ProfileEditForm.tsx`

---

## 3. Onboarding Pre-fill for Edit Mode

**Files:**

- `app/(app)/onboarding/page.tsx`
- `features/profile/components/onboarding-wizard.tsx`
- `features/profile/components/onboarding-step3.tsx`

### Onboarding page

Fetch full profile (name, birth_date, gender, country, city, nationality, height, weight, marital_status, children_count, about_self, income_level, housing, willing_to_relocate, polygyny_attitude, hijab_attitude) + photos ordered by position. Map to `OnboardingStep1Data` and `OnboardingStep2MaleData | OnboardingStep2FemaleData` shapes. Pass as props to `OnboardingWizard`.

`allow_geolocation` is not stored as a boolean column — default to `true` when pre-filling.

### Wizard changes

New optional props:

```ts
initialStep1Data?: Partial<OnboardingStep1Data>
initialStep2Data?: Partial<OnboardingStep2MaleData | OnboardingStep2FemaleData>
initialPhotos?: Array<{ photoId: string; position: number }>
isEditMode?: boolean
```

- Initialize `step1Data` and `step2Data` state from these props (lazy initial state).
- Initialize `gender` from `initialStep1Data.gender` if present.
- On step 4 complete: in edit mode redirect to `/profile`, in new-user mode redirect to `/feed`.

### Step 3 pre-fill

Add `initialPhotos` prop. On mount, populate slots from `initialPhotos`:

```ts
type PhotoSlot = {
  position: number
  preview: string | null // object URL for newly uploaded
  photoId: string | null
  path: string | null
  uploading: boolean
  isExisting: boolean // true → render with <Photo> component, not <img>
}
```

For existing photos: `preview=null`, `isExisting=true`, render `<Photo photoId={...} variant="cover" />` instead of `<img src={preview}>`.

---

## 4. Photo Deletion with Confirmation

### Step 3 (`onboarding-step3.tsx`)

Replace `handleRemove` with an async version:

1. If slot has no `photoId` (edge case): just clear state.
2. Show inline confirmation modal (new `showDelConfirm` state + `deleteTarget` position).
3. On confirm: call `deletePhotoAction(photoId)` — already exported from `features/profile/actions`.
4. On success: clear slot. On error: show error message.

### OwnProfile photo grid (`OwnProfile.tsx`)

Add to each photo thumbnail in the 3-column grid:

- A `×` button overlay (absolute, top-right), same styling as step 3's remove button.
- Clicking opens the deletion confirmation modal (reuse existing `showDel` modal pattern, or add a second `showPhotoDelModal` state with the target photoId).
- On confirm: `deletePhotoAction(photoId)` → `router.refresh()` to reload photos from server.

The first photo (avatar) can also be deleted — the `deletePhoto` server helper already handles promotion of the next approved photo.

---

## 5. Remove Fullscreen Photo Viewer

**File:** `features/profile/components/OwnProfile.tsx`

- Change `<button type="button" onClick={() => setFullscreen(true)} ...>` wrapping the main photo to a plain `<div>` (remove `type`, `onClick`, `cursor-pointer`).
- Remove `fullscreen` state declaration.
- Remove the entire fullscreen modal block (lines 276–298).
- Photo navigation via thumbnail clicks remains unchanged.

---

## 6. Settings Icon on Chats, Likes, Notifications, Filters

Pattern: `<Link href="/settings"><IconBtn icon="gear" ariaLabel={t('settings')} /></Link>` (from `FeedHeader`).

| File                                                     | Change                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `features/chat/components/ChatList.tsx`                  | Add `actions` prop to `BigHeader` with the gear link                            |
| `features/likes/components/LikesTabs.tsx`                | Add `actions` prop to `BigHeader` with the gear link                            |
| `features/notifications/components/NotificationList.tsx` | Add gear link to the custom sticky header, to the left of the "mark all" button |
| `features/feed/components/FiltersScreen.tsx`             | Add `trailing` prop to `Header` with the gear icon link                         |

---

## 7. Page Headers: H1, Uppercase, Left-Aligned

**`components/ui/header.tsx`:**

- `BigHeader`: add `uppercase` to h1 className.
- `Header`: change title `<div>` to `<h1>`, add `uppercase` to className. Already left-aligned by default (only `centerTitle` prop centers it).

**`features/profile/components/OwnProfile.tsx`:**

- Custom sticky header h1: remove `text-center`, add `uppercase`.

**`features/notifications/components/NotificationList.tsx`:**

- Already `uppercase` + `<h1>` — no change.

**`features/feed/components/FiltersScreen.tsx`:**

- Remove `centerTitle` prop from `Header` call (title becomes left-aligned).

---

## 8. Persistent Filter Preferences

### Migration

```sql
ALTER TABLE profiles ADD COLUMN filter_preferences jsonb DEFAULT NULL;
```

Run `pnpm db:typegen` after applying.

### Stored shape (`FilterPreferences` type in `features/feed/schemas.ts`)

```ts
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

### Server action (new, in `features/feed/actions.ts`)

```ts
export async function saveFilterPreferencesAction(prefs: FilterPreferences | null)
```

Updates `profiles.filter_preferences` for the authenticated user.

### Page (`app/(app)/feed/filters/page.tsx`)

Fetch `filter_preferences` column alongside `gender`. Pass as `initialFilters` to `FiltersScreen`.

### `FiltersScreen` changes

- Accept `initialFilters?: FilterPreferences` prop.
- Initialize all state from `initialFilters` (falling back to defaults).
- `apply()`: call `saveFilterPreferencesAction(currentPrefs)`, then push URL params.
- `reset()`: call `saveFilterPreferencesAction(null)`, then reset state and clear URL.

---

## Files to Delete

- `app/(app)/profile/edit/page.tsx`
- `features/profile/components/ProfileEditForm.tsx`

## Files to Create

- `features/feed/actions.ts` (new — `saveFilterPreferencesAction`)
- `supabase/migrations/<timestamp>_add_filter_preferences.sql`

## Files to Modify

- `app/settings/page.tsx`
- `app/(app)/onboarding/page.tsx`
- `app/(app)/feed/filters/page.tsx`
- `components/ui/header.tsx`
- `features/settings/components/SettingsScreen.tsx`
- `features/profile/components/OwnProfile.tsx`
- `features/profile/components/onboarding-wizard.tsx`
- `features/profile/components/onboarding-step3.tsx`
- `features/chat/components/ChatList.tsx`
- `features/likes/components/LikesTabs.tsx`
- `features/notifications/components/NotificationList.tsx`
- `features/feed/components/FiltersScreen.tsx`
- `features/feed/schemas.ts`
- `types/database.types.ts` (after typegen)
