import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { setPreference } from '@/features/notifications/server/get-preferences'
import { z } from 'zod'

const prefSchema = z.object({
  type: z.string().min(1),
  enabled: z.boolean(),
})

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = prefSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const userId = (claims as Record<string, unknown>).sub as string
  await setPreference(userId, result.data.type, result.data.enabled)

  return NextResponse.json({ ok: true })
}
