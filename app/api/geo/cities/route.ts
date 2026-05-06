import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { citySearchSchema } from '@/features/geo/schemas'
import { validationError } from '@/lib/errors/validation'
import { handleRouteError } from '@/lib/errors/handler'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'

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

    let query = supabase
      .from('geonames_cities')
      .select('id, name, admin1_name, country_code, population, location')
      .ilike('name', `${parsed.data.q}%`)
      .order('population', { ascending: false })
      .limit(10)

    if (parsed.data.country) {
      query = query.eq('country_code', parsed.data.country.toUpperCase())
    }

    const { data, error } = await query.returns<Array<{
      id: number
      name: string
      admin1_name: string | null
      country_code: string
      population: number | null
      location: { coordinates: [number, number] } | null
    }>>()

    if (error) throw error

    const cities = (data ?? []).map((city) => ({
      id: city.id,
      name: city.name,
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
