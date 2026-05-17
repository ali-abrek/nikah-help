import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { citySearchSchema } from '@/features/geo/schemas'
import { validationError } from '@/lib/errors/validation'
import { handleRouteError } from '@/lib/errors/handler'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'

export const runtime = 'nodejs'

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl
    const q = searchParams.get('q') ?? ''
    const country = searchParams.get('country') ?? undefined

    const parsed = citySearchSchema.safeParse({ q, country })

    if (!parsed.success) {
      const err = validationError(parsed.error)
      return NextResponse.json(err.toResponse(), { status: err.status })
    }

    const supabase = await createServerSupabase()

    const select =
      'id, name, alt_names_ru, admin1_name, country_code, population, location'

    type CityRow = {
      id: number
      name: string
      alt_names_ru: string | null
      admin1_name: string | null
      country_code: string
      population: number | null
      location: { coordinates: [number, number] } | null
    }

    const pattern = `${parsed.data.q}%`
    const countryCode = parsed.data.country?.toUpperCase()

    const baseQuery = (column: string) => {
      let q = supabase.from('geonames_cities').select(select).ilike(column, pattern)
      if (countryCode) q = q.eq('country_code', countryCode)
      return q.order('population', { ascending: false }).limit(10).returns<CityRow[]>()
    }

    const [latinResult, ruResult] = await Promise.all([
      baseQuery('name'),
      baseQuery('alt_names_ru'),
    ])

    if (latinResult.error) throw latinResult.error
    if (ruResult.error) throw ruResult.error

    const seen = new Set<number>()
    const merged: CityRow[] = []
    for (const row of [...(latinResult.data ?? []), ...(ruResult.data ?? [])]) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      merged.push(row)
    }
    merged.sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    const top = merged.slice(0, 10)

    const cities = top.map((city) => ({
      id: city.id,
      name: city.alt_names_ru ?? city.name,
      region: city.admin1_name,
      country: city.country_code,
      population: city.population,
      lat: city.location?.coordinates?.[1] ?? null,
      lng: city.location?.coordinates?.[0] ?? null,
    }))

    return NextResponse.json({ cities })
  } catch (error) {
    return handleRouteError(error)
  }
}, READ_GENEROUS)
