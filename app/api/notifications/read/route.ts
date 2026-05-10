import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

const readSchema = z.object({
  notification_id: z.string().uuid(),
})

export const POST = withAuth(
  withRateLimit(async (req: NextRequest) => {
    try {
      const userId = req.headers.get('x-user-id')!
      const body = await req.json().catch(() => ({}))
      const parsed = readSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          details: { notification_id: 'Required (uuid)' },
        })
      }

      // RLS scopes the update to the authenticated user. We still pin user_id
      // to defeat any RLS misconfiguration that might broaden the scope.
      const supabase = await createServerSupabase()
      const { error } = await supabase
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('id', parsed.data.notification_id)
        .eq('user_id', userId)

      if (error) {
        throw new AppError('SYSTEM_DATABASE_ERROR', { cause: error })
      }
      return NextResponse.json({ success: true })
    } catch (error) {
      return handleRouteError(error)
    }
  }, ACTION_MODERATE),
)
