import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { handleRouteError } from '@/lib/errors/handler'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'

export const GET = withRateLimit(async (_request: NextRequest) => {
  try {
    const supabase = await createServerSupabase()

    const { data, error } = await supabase
      .from('geonames_countries')
      .select('iso2, name_en, name_ru, phone_prefix')
      .order('name_ru', { ascending: true })

    if (error) throw error

    return NextResponse.json({ countries: data ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}, READ_GENEROUS)
