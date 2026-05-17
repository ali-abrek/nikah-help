'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'
import { validationError } from '@/lib/errors/validation'
import { handleActionError } from '@/lib/errors/action'
import { getServerUserId, getUserId } from '@/lib/auth/claims'
import { captureSentryException } from '@/lib/sentry/capture'
import {
  onboardingStep1Schema,
  onboardingStep2MaleSchema,
  onboardingStep2FemaleSchema,
  reorderPhotosSchema,
} from './schemas'
import { saveBasicData } from './server/save-basic-data'
import { saveExtendedData } from './server/save-extended-data'
import { generateBio } from './server/generate-bio'
import { completeOnboarding } from './server/complete-onboarding'
import { replacePhoto } from './server/replace-photo'
import { deletePhoto } from './server/delete-photo'
import { reorderPhotos } from './server/reorder-photos'

async function unauthorized(reason: string) {
  // Diagnostic so Sentry shows exactly which auth seam failed — header
  // missing, session unreadable on the action's client, or DB call rejected.
  const h = await headers()
  void captureSentryException(new Error(`Profile action unauthorized: ${reason}`), {
    flow: 'auth.rbac',
    severity: 'warning',
    tags: {
      step: 'profile_action_auth',
      reason,
      had_x_user_id: String(h.get('x-user-id') !== null),
    },
  })
  return handleActionError(new AppError('AUTH_UNAUTHORIZED'))
}

/**
 * Resolves the authenticated user ID for a Server Action.
 *
 * Always calls `getClaims()` on the action's own supabase client so the
 * session that authorizes downstream PostgREST calls is loaded by the
 * same client that performs them. Falls back to `getServerUserId()`
 * (proxy x-user-id header + helper client) only if the action's client
 * fails to load a session — which can happen when the @supabase/ssr
 * 0.10.2 server client does not see the proxy-refreshed cookies.
 */
async function resolveUserId(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
): Promise<string | null> {
  const { data: authData } = await supabase.auth.getClaims()
  const fromAction = getUserId((authData?.claims ?? {}) as Record<string, unknown>)
  if (fromAction) return fromAction
  return await getServerUserId()
}

export async function saveOnboardingStep1(formData: FormData) {
  const supabase = await createServerSupabase()
  const userId = await resolveUserId(supabase)
  if (!userId) return unauthorized('no_user_id')

  const raw = {
    name: formData.get('name'),
    birth_date: formData.get('birth_date'),
    gender: formData.get('gender'),
    country: formData.get('country'),
    city: formData.get('city'),
    nationality: formData.get('nationality'),
    height: formData.get('height') ? Number(formData.get('height')) : undefined,
    weight: formData.get('weight') ? Number(formData.get('weight')) : undefined,
    allow_geolocation:
      formData.get('allow_geolocation') === 'true' || formData.get('allow_geolocation') === 'on',
  }

  const parsed = onboardingStep1Schema.safeParse(raw)

  if (!parsed.success) {
    const err = validationError(parsed.error)
    return { success: false as const, error: err.toResponse() }
  }

  // Verify the city exists in the selected country (case-insensitive).
  // Two separate queries instead of a PostgREST `.or()` filter: arbitrary
  // user input (commas, dots, parens) can break the OR-filter syntax, and
  // duplicate alt_names_ru rows would make `.maybeSingle()` error out.
  const country = parsed.data.country.toUpperCase()
  const cityValue = parsed.data.city
  const [byName, byAltRu] = await Promise.all([
    supabase
      .from('geonames_cities')
      .select('id')
      .eq('country_code', country)
      .ilike('name', cityValue)
      .limit(1),
    supabase
      .from('geonames_cities')
      .select('id')
      .eq('country_code', country)
      .ilike('alt_names_ru', cityValue)
      .limit(1),
  ])

  if (!byName.data?.length && !byAltRu.data?.length) {
    return {
      success: false as const,
      error: new AppError('VALIDATION_INVALID_INPUT', {
        message: 'Выбранный город не существует в указанной стране',
      }).toResponse(),
    }
  }

  try {
    await saveBasicData(supabase, userId, parsed.data)
    return { success: true as const }
  } catch (e) {
    const pgCode =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : 'unknown'
    void captureSentryException(e, {
      flow: 'action.save_onboarding_step1',
      severity: 'error',
      tags: { step: 'save_basic_data', pg_code: pgCode },
    })
    return handleActionError(e)
  }
}

export async function saveOnboardingStep2(formData: FormData) {
  const supabase = await createServerSupabase()
  const userId = await resolveUserId(supabase)
  if (!userId) return unauthorized('no_user_id')

  const gender = formData.get('gender') as string

  if (gender !== 'male' && gender !== 'female') {
    return {
      success: false as const,
      error: new AppError('VALIDATION_INVALID_INPUT', {
        message: 'Некорректный пол',
      }).toResponse(),
    }
  }

  const base = {
    marital_status: formData.get('marital_status'),
    children_count: formData.get('children_count')
      ? Number(formData.get('children_count'))
      : undefined,
    about_self: formData.get('about_self'),
  }

  if (gender === 'male') {
    const raw = {
      ...base,
      income_level: formData.get('income_level'),
      housing: formData.get('housing'),
    }

    const parsed = onboardingStep2MaleSchema.safeParse(raw)

    if (!parsed.success) {
      const err = validationError(parsed.error)
      return { success: false as const, error: err.toResponse() }
    }

    try {
      await saveExtendedData(supabase, userId, { ...parsed.data, gender })
      return { success: true as const }
    } catch (e) {
      const pgCode =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: unknown }).code)
          : 'unknown'
      void captureSentryException(e, {
        flow: 'action.save_onboarding_step2',
        severity: 'error',
        tags: { step: 'save_extended_data', gender, pg_code: pgCode },
      })
      return handleActionError(e)
    }
  }

  const rawFemale = {
    ...base,
    willing_to_relocate: formData.get('willing_to_relocate'),
    polygyny_attitude: formData.get('polygyny_attitude'),
    hijab_attitude: formData.get('hijab_attitude'),
  }

  const parsed = onboardingStep2FemaleSchema.safeParse(rawFemale)

  if (!parsed.success) {
    const err = validationError(parsed.error)
    return { success: false as const, error: err.toResponse() }
  }

  try {
    await saveExtendedData(supabase, userId, { ...parsed.data, gender })
    return { success: true as const }
  } catch (e) {
    const pgCode =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : 'unknown'
    void captureSentryException(e, {
      flow: 'action.save_onboarding_step2',
      severity: 'error',
      tags: { step: 'save_extended_data', gender, pg_code: pgCode },
    })
    return handleActionError(e)
  }
}

export async function markPhotoUploaded(photoId: string) {
  const supabase = await createServerSupabase()
  const userId = await resolveUserId(supabase)
  if (!userId) return unauthorized('no_user_id')

  try {
    // Atomic transition: only flip a pending row owned by this user. If the
    // row is missing, owned by someone else, or already past pending, the
    // update affects 0 rows and we return NOT_FOUND so the client retries
    // the upload-url step instead of silently moving on.
    const { data, error: updateErr } = await supabase
      .from('photos')
      .update({ status: 'uploaded', updated_at: new Date().toISOString() })
      .eq('id', photoId)
      .eq('profile_id', userId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (updateErr) throw updateErr
    if (!data) {
      return {
        success: false as const,
        error: new AppError('NOT_FOUND', {
          message: 'Photo not found or already processed',
        }).toResponse(),
      }
    }
    return { success: true as const, message: 'Фото сохранено' }
  } catch (e) {
    return handleActionError(e)
  }
}

export async function completeOnboardingAction() {
  const supabase = await createServerSupabase()
  const userId = await resolveUserId(supabase)
  if (!userId) return unauthorized('no_user_id')

  try {
    const bio = await generateBio(supabase, userId)
    await completeOnboarding(supabase, userId)
    return { success: true as const, message: 'Онбординг завершён', bio }
  } catch (e) {
    return handleActionError(e)
  }
}

export async function replacePhotoAction(position: number) {
  const supabase = await createServerSupabase()
  const userId = await resolveUserId(supabase)
  if (!userId) return unauthorized('no_user_id')

  if (position < 1 || position > 6) {
    return {
      success: false as const,
      error: new AppError('VALIDATION_INVALID_INPUT', {
        message: 'Некорректная позиция',
      }).toResponse(),
    }
  }

  try {
    const result = await replacePhoto(supabase, userId, position)
    return { success: true as const, ...result }
  } catch (e) {
    return handleActionError(e)
  }
}

export async function deletePhotoAction(photoId: string) {
  const supabase = await createServerSupabase()
  const userId = await resolveUserId(supabase)
  if (!userId) return unauthorized('no_user_id')

  try {
    await deletePhoto(supabase, userId, photoId)
    return { success: true as const, message: 'Фото удалено' }
  } catch (e) {
    return handleActionError(e)
  }
}

export async function cancelRegistrationAction() {
  const supabase = await createServerSupabase()
  const userId = await resolveUserId(supabase)

  if (!userId) {
    redirect('/feed')
  }

  try {
    // Clear session cookies first so the browser is anonymous after the redirect.
    await supabase.auth.signOut()

    // Delete the auth user via admin client — cascades to profiles, photos,
    // notifications, and all related rows via ON DELETE CASCADE FK constraints.
    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) {
      void captureSentryException(error, {
        flow: 'auth.cancel_registration',
        severity: 'error',
        tags: { step: 'delete_user' },
        extra: { logContext: { userId } },
      })
    }
  } catch (err) {
    void captureSentryException(err, {
      flow: 'auth.cancel_registration',
      severity: 'error',
      tags: { step: 'cancel_registration' },
    })
  }

  redirect('/feed')
}

export async function reorderPhotosAction(orderedPhotoIds: string[]) {
  const supabase = await createServerSupabase()
  const userId = await resolveUserId(supabase)
  if (!userId) return unauthorized('no_user_id')

  const parsed = reorderPhotosSchema.safeParse({ orderedPhotoIds })
  if (!parsed.success) {
    const err = validationError(parsed.error)
    return { success: false as const, error: err.toResponse() }
  }

  try {
    await reorderPhotos(supabase, userId, orderedPhotoIds)
    return { success: true as const, message: 'Порядок сохранён' }
  } catch (e) {
    return handleActionError(e)
  }
}
