import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { handleRouteError } from '@/lib/errors/handler'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'
import { queryGuestFeed } from '@/features/feed/server/query-feed'

export const runtime = 'nodejs'

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const supabase = await createServerSupabase()
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor') ?? undefined

    const page = await queryGuestFeed({ supabase, cursor })
    return NextResponse.json(page)
  } catch (error) {
    return handleRouteError(error)
  }
}, READ_GENEROUS)
