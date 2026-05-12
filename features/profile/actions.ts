'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'
import { validationError } from '@/lib/errors/validation'
import { handleActionError } from '@/lib/errors/action'
import { getServerUserId } from '@/lib/auth/claims'
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

function unauthorized() {
  // Re-route through handleActionError so the response carries the localized
  // message ("Пожалуйста, войдите в аккаунт") instead of the bare error code.
  return handleActionError(new AppError('AUTH_UNAUTHORIZED'))
}

export async function saveOnboardingStep1(formData: FormData) {
  const supabase = await createServerSupabase()
  const userId = await getServerUserId()
  if (!userId) return unauthorized()

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
    return { success: true as const, message: 'Сохранено' }
  } catch (e) {
    return handleActionError(e)
  }
}

export async function saveOnboardingStep2(formData: FormData) {
  const supabase = await createServerSupabase()
  const userId = await getServerUserId()
  if (!userId) return unauthorized()

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
    education: formData.get('education'),
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
      return { success: true as const, message: 'Сохранено' }
    } catch (e) {
      return handleActionError(e)
    }
  }

  const rawFemale = {
    ...base,
    willing_to_relocate: formData.get('willing_to_relocate') === 'true',
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
    return { success: true as const, message: 'Сохранено' }
  } catch (e) {
    return handleActionError(e)
  }
}

export async function markPhotoUploaded(photoId: string) {
  const supabase = await createServerSupabase()
  const userId = await getServerUserId()
  if (!userId) return unauthorized()

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
  const userId = await getServerUserId()
  if (!userId) return unauthorized()

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
  const userId = await getServerUserId()
  if (!userId) return unauthorized()

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
  const userId = await getServerUserId()
  if (!userId) return unauthorized()

  try {
    await deletePhoto(supabase, userId, photoId)
    return { success: true as const, message: 'Фото удалено' }
  } catch (e) {
    return handleActionError(e)
  }
}

export async function reorderPhotosAction(orderedPhotoIds: string[]) {
  const supabase = await createServerSupabase()
  const userId = await getServerUserId()
  if (!userId) return unauthorized()

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
