import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { ACTION_MODERATE } from '@/lib/ratelimit/presets'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'

export const runtime = 'nodejs'

export const POST = withAuth(
  withRateLimit(async (req: NextRequest) => {
    try {
      const userId = req.headers.get('x-user-id')!
      const supabase = await createServerSupabase()
      const { error } = await supabase
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'unread')

      if (error) {
        throw new AppError('SYSTEM_DATABASE_ERROR', { cause: error })
      }
      return NextResponse.json({ success: true })
    } catch (error) {
      return handleRouteError(error)
    }
  }, ACTION_MODERATE),
)
