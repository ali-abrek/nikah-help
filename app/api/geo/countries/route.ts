import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'

const querySchema = z.object({
  locale: z.enum(['ru', 'en']).default('ru'),
})

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const parsed = querySchema.safeParse({
      locale: request.nextUrl.searchParams.get('locale') ?? undefined,
    })
    if (!parsed.success) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        details: { locale: 'Must be one of: ru, en' },
      })
    }
    const { locale } = parsed.data

    const supabase = await createServerSupabase()

    const nameCol = locale === 'ru' ? 'name_ru' : 'name_en'

    const { data, error } = await supabase
      .from('geonames_countries')
      .select(`iso2, name_en, name_ru, phone_prefix`)
      .order(nameCol, { ascending: true })
      .returns<
        Array<{
          iso2: string
          name_en: string
          name_ru: string | null
          phone_prefix: string | null
        }>
      >()

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
