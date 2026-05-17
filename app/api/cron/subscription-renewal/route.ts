import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertCronAuth } from '@/lib/api/cron'
import { handleRouteError } from '@/lib/errors/handler'
import { withSentryMonitor } from '@/lib/sentry/monitor'

export const runtime = 'nodejs'
export const maxDuration = 60

// NOT YET IMPLEMENTED — payments module is not built (see docs/05-payments.md).
// This handler only marks lapsed DB rows as expired. No T-Bank charging,
// renewal, or webhook processing exists yet. Do not enable the Vercel cron
// trigger until the module is complete.
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
