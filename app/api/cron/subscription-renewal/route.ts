import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertCronAuth } from '@/lib/api/cron'
import { handleRouteError } from '@/lib/errors/handler'
import { withSentryMonitor } from '@/lib/sentry/monitor'

export const runtime = 'nodejs'
export const maxDuration = 60

// Daily subscription expiry sweep.
// T-Bank renewal itself happens through the payments webhook flow; this job
// only marks lapsed subscriptions as expired so the rest of the app's
// `has_active_subscription` checks return false promptly. The actual auto-
// renewal API call is implemented when the payments module ships.
async function handler(request: NextRequest): Promise<NextResponse> {
  try {
    assertCronAuth(request)

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data, error } = await supabase
      .from('subscriptions')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('status', 'active')
      .lt('current_period_end', nowIso)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ expired: data?.length ?? 0 })
  } catch (error) {
    return handleRouteError(error)
  }
}

export const GET = withSentryMonitor('cron.subscription-renewal', handler, '0 9 * * *')
