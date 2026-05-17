'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'
import { handleActionError } from '@/lib/errors/action'
import { getUserId } from '@/lib/auth/claims'
import { captureSentryException } from '@/lib/sentry/capture'
import { filterPreferencesSchema } from './schemas'
import type { Json } from '@/types/database.types'

async function unauthorized(reason: string) {
  void captureSentryException(new Error(`Feed action unauthorized: ${reason}`), {
    flow: 'action.feed',
    severity: 'warning',
    tags: { reason },
  })
  return handleActionError(new AppError('AUTH_UNAUTHORIZED'))
}

export async function saveFilterPreferencesAction(prefs: unknown) {
  const supabase = await createServerSupabase()
  const { data: authData } = await supabase.auth.getClaims()
  const userId = authData?.claims ? getUserId(authData.claims as Record<string, unknown>) : null
  if (!userId) return unauthorized('no_user_id')

  const parsed = filterPreferencesSchema.safeParse(prefs)
  if (!parsed.success) {
    return handleActionError(
      new AppError('VALIDATION_INVALID_INPUT', {
        details: parsed.error.flatten().fieldErrors as Record<string, string>,
      }),
    )
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ filter_preferences: parsed.data as Json })
      .eq('id', userId)
    if (error) throw error
    return { success: true as const }
  } catch (e) {
    return handleActionError(e)
  }
}
