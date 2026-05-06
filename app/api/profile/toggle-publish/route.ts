import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'
import { togglePublish } from '@/features/profile/server/toggle-publish'

export async function POST() {
  const supabase = await createServerSupabase()
  const { data: claims, error } = await supabase.auth.getClaims()

  if (error || !claims) {
    return NextResponse.json(
      new AppError('AUTH_UNAUTHORIZED').toResponse(),
      { status: 401 },
    )
  }

  const userId = (claims as Record<string, unknown>).sub as string

  try {
    const result = await togglePublish(supabase, userId)
    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
