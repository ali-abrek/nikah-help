import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { AppError } from '@/lib/errors/app-error'
import { handleRouteError } from '@/lib/errors/handler'
import { withAuth } from '@/lib/api/with-auth'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { READ_GENEROUS } from '@/lib/ratelimit/presets'
import { queryFeed } from '@/features/feed/server/query-feed'
import type { FeedFilterValues } from '@/features/feed/schemas'

export const GET = withAuth(
  withRateLimit(async (request: NextRequest) => {
    try {
      const userId = request.headers.get('x-user-id')!
      const supabase = await createServerSupabase()

      const { data: viewer } = await supabase
        .from('profiles')
        .select('gender, onboarding_completed')
        .eq('id', userId)
        .single()

      if (!viewer?.gender || !viewer.onboarding_completed) {
        throw new AppError('PROFILE_ONBOARDING_INCOMPLETE')
      }

      const viewerGender = viewer.gender as 'male' | 'female'

      const url = new URL(request.url)
      const cursor = url.searchParams.get('cursor') ?? undefined
      const ageMin = url.searchParams.get('age_min')
      const ageMax = url.searchParams.get('age_max')
      const radiusKm = url.searchParams.get('radius_km')
      const childrenMax = url.searchParams.get('children_count_max')
      const maritalStatus = url.searchParams.get('marital_status')
      const polygynyAttitude = url.searchParams.get('polygyny_attitude')
      const hijabAttitude = url.searchParams.get('hijab_attitude')
      const incomeLevel = url.searchParams.get('income_level')
      const housing = url.searchParams.get('housing')
      const education = url.searchParams.get('education')

      const filters: FeedFilterValues = {
        ...(ageMin ? { age_min: Number(ageMin) } : {}),
        ...(ageMax ? { age_max: Number(ageMax) } : {}),
        ...(radiusKm ? { radius_km: Number(radiusKm) } : {}),
        ...(childrenMax != null ? { children_count_max: Number(childrenMax) } : {}),
        ...(maritalStatus ? { marital_status: maritalStatus.split(',').filter(Boolean) } : {}),
        ...(polygynyAttitude
          ? { polygyny_attitude: polygynyAttitude.split(',').filter(Boolean) }
          : {}),
        ...(hijabAttitude ? { hijab_attitude: hijabAttitude.split(',').filter(Boolean) } : {}),
        ...(incomeLevel ? { income_level: incomeLevel.split(',').filter(Boolean) } : {}),
        ...(housing ? { housing: housing.split(',').filter(Boolean) } : {}),
        ...(education ? { education: education.split(',').filter(Boolean) } : {}),
      }

      const page = await queryFeed({
        supabase,
        viewerId: userId,
        viewerGender,
        filters,
        cursor,
      })

      return NextResponse.json(page)
    } catch (error) {
      return handleRouteError(error)
    }
  }, READ_GENEROUS),
)
