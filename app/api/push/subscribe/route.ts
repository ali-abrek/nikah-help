import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string(),
    p256dh: z.string(),
  }),
})

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = subscribeSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const userId = (claims as Record<string, unknown>).sub as string
  const { endpoint, keys } = result.data

  const admin = createAdminClient()

  // Upsert: if endpoint already exists for another user, move it
  await admin
    .from('push_subscriptions')
    .upsert(
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

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (claims as Record<string, unknown>).sub as string
  const admin = createAdminClient()

  await admin.from('push_subscriptions').delete().eq('user_id', userId).eq('kind', 'web')

  return NextResponse.json({ ok: true })
}
