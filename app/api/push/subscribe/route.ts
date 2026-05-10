import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    auth: z.string().min(1).max(512),
    p256dh: z.string().min(1).max(512),
  }),
})

export const POST = withAuth(
  withRateLimit(async (req: NextRequest) => {
    try {
      const userId = req.headers.get('x-user-id')!
      const body = await req.json().catch(() => ({}))
      const parsed = subscribeSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError('VALIDATION_INVALID_INPUT', {
          details: parsed.error.flatten().fieldErrors as Record<string, string>,
        })
      }
      const { endpoint, keys } = parsed.data
      const supabase = await createServerSupabase()
      // RLS on push_subscriptions enforces user_id = auth.uid().
      // onConflict('endpoint') reassigns a stale endpoint to the new owner if
      // the subscription was previously associated with another account.
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          kind: 'web',
          endpoint,
          auth: keys.auth,
          p256dh: keys.p256dh,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      )
      if (error) throw new AppError('SYSTEM_DATABASE_ERROR', { cause: error })
      return NextResponse.json({ success: true })
    } catch (error) {
      return handleRouteError(error)
    }
  }, ACTION_MODERATE),
)

export const DELETE = withAuth(
  withRateLimit(async (req: NextRequest) => {
    try {
      const userId = req.headers.get('x-user-id')!
      const supabase = await createServerSupabase()
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('kind', 'web')
      if (error) throw new AppError('SYSTEM_DATABASE_ERROR', { cause: error })
      return NextResponse.json({ success: true })
    } catch (error) {
      return handleRouteError(error)
    }
  }, ACTION_MODERATE),
)
