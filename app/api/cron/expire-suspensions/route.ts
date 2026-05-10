import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertCronAuth } from '@/lib/api/cron'
import { handleRouteError } from '@/lib/errors/handler'
import { invalidateSuspensionCache } from '@/lib/auth/suspension'

export const runtime = 'nodejs'
export const maxDuration = 60

// Lift expired suspensions. Runs every 15 minutes (vercel.json) so users
// regain access close to their expiry time. The `is_user_suspended` cache
// has a 30s TTL, so we explicitly invalidate the lifted users to avoid
// up to half a minute of stale enforcement.
export async function GET(request: NextRequest) {
  try {
    assertCronAuth(request)

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data: lifting, error: selectErr } = await supabase
      .from('user_suspensions')
      .select('id, user_id')
      .is('lifted_at', null)
      .not('expires_at', 'is', null)
      .lt('expires_at', nowIso)

    if (selectErr) {
      return NextResponse.json({ error: selectErr.message }, { status: 500 })
    }

    const ids = (lifting ?? []).map((row) => row.id)
    if (ids.length === 0) {
      return NextResponse.json({ lifted: 0 })
    }

    const { error: updateErr } = await supabase
      .from('user_suspensions')
      .update({ lifted_at: nowIso })
      .in('id', ids)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    await Promise.all((lifting ?? []).map((row) => invalidateSuspensionCache(row.user_id)))

    return NextResponse.json({ lifted: ids.length })
  } catch (error) {
    return handleRouteError(error)
  }
}
