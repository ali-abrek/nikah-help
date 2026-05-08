import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const readSchema = z.object({
  notification_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = readSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const admin = createAdminClient()
  await admin
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', result.data.notification_id)

  return NextResponse.json({ ok: true })
}
