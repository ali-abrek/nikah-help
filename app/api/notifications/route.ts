import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getNotifications } from '@/features/notifications/server/get-notifications'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (claims as Record<string, unknown>).sub as string
  const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)

  const notifications = await getNotifications(userId, { cursor, limit })
  return NextResponse.json(notifications)
}
