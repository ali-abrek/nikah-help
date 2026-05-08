import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { handleRouteError } from '@/lib/errors/handler'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl
    const locale = searchParams.get('locale') ?? 'ru'

    const supabase = await createServerSupabase()

    const nameCol = locale === 'ru' ? 'name_ru' : 'name_en'

    const { data, error } = await supabase
      .from('geonames_countries')
      .select(`iso2, name_en, name_ru, phone_prefix`)
      .order(nameCol, { ascending: true })
      .returns<Array<{
        iso2: string
        name_en: string
        name_ru: string | null
        phone_prefix: string | null
      }>>()

    if (error) throw error

    const countries = (data ?? []).map((c) => ({
      iso2: c.iso2,
      name: locale === 'ru' ? (c.name_ru ?? c.name_en) : c.name_en,
      phone_prefix: c.phone_prefix,
    }))

    return NextResponse.json({ countries })
  } catch (error) {
    return handleRouteError(error)
  }
}, READ_GENEROUS)
