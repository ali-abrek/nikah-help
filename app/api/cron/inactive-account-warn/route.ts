import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertCronAuth } from '@/lib/api/cron'
import { handleRouteError } from '@/lib/errors/handler'
import { inngest } from '@/lib/inngest/client'

export const runtime = 'nodejs'
export const maxDuration = 60

// Find users inactive for 30+ days who haven't been warned in the last 14
// days, and emit a `notification/send` event for each. Notification dispatch
// (lib/inngest/functions/notification-dispatch.ts) handles preferences,
// dedup (M12 once landed), and cross-channel delivery.
const INACTIVITY_DAYS = 30
const WARN_INTERVAL_DAYS = 14
const BATCH_LIMIT = 500

export async function GET(request: NextRequest) {
  try {
    assertCronAuth(request)
    const supabase = createAdminClient()

    const inactiveCutoff = new Date(Date.now() - INACTIVITY_DAYS * 86_400_000).toISOString()
    const warnCutoff = new Date(Date.now() - WARN_INTERVAL_DAYS * 86_400_000).toISOString()

    const { data, error } = await supabase
      .from('profiles')
      .select('id, last_seen_at, inactivity_warned_at')
      .lt('last_seen_at', inactiveCutoff)
      .or(`inactivity_warned_at.is.null,inactivity_warned_at.lt.${warnCutoff}`)
      .eq('is_published', true)
      .limit(BATCH_LIMIT)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const targets = data ?? []
    if (targets.length === 0) {
      return NextResponse.json({ queued: 0 })
    }

    const events = targets.map((row) => ({
      name: 'notification/send' as const,
      data: {
        type: 'inactivity_warning',
        userId: row.id,
        channels: ['email'],
        payload: {
          title_key: 'notifications.inactivity_warning.title',
          body_key: 'notifications.inactivity_warning.body',
          payload: { type: 'inactivity_warning', entity_id: row.id },
        },
      },
    }))

    await inngest.send(events)

    const nowIso = new Date().toISOString()
    await supabase
      .from('profiles')
      .update({ inactivity_warned_at: nowIso })
      .in(
        'id',
        targets.map((t) => t.id),
      )

    return NextResponse.json({ queued: events.length })
  } catch (error) {
    return handleRouteError(error)
  }
}
