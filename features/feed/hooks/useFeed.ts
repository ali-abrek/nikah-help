'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import type { FeedFilters, FeedPage } from '../schemas'

interface UseFeedParams {
  viewerGender: 'male' | 'female'
  filters: FeedFilters
  initialData?: FeedPage
}

async function fetchFeedPage({
  pageParam,
  viewerGender,
  filters,
}: {
  pageParam?: string
  viewerGender: string
  filters: FeedFilters
}): Promise<FeedPage> {
  const params = new URLSearchParams()
  params.set('gender', viewerGender)
  if (pageParam) params.set('cursor', pageParam)

  const f = filters as Record<string, unknown>
  if (f.age_min) params.set('age_min', String(f.age_min))
  if (f.age_max) params.set('age_max', String(f.age_max))
  if (f.radius_km) params.set('radius_km', String(f.radius_km))
  if (f.children_count_max != null) params.set('children_count_max', String(f.children_count_max))

  if (f.marital_status && Array.isArray(f.marital_status)) {
    params.set('marital_status', f.marital_status.join(','))
  }
  if (f.polygyny_attitude && Array.isArray(f.polygyny_attitude)) {
    params.set('polygyny_attitude', f.polygyny_attitude.join(','))
  }
  if (f.hijab_attitude && Array.isArray(f.hijab_attitude)) {
    params.set('hijab_attitude', f.hijab_attitude.join(','))
  }
  if (f.income_level && Array.isArray(f.income_level)) {
    params.set('income_level', f.income_level.join(','))
  }
  if (f.housing && Array.isArray(f.housing)) {
    params.set('housing', f.housing.join(','))
  }
  if (f.education && Array.isArray(f.education)) {
    params.set('education', f.education.join(','))
  }

  const res = await fetch(`/api/feed?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.message ?? 'Failed to fetch feed')
  }
  return res.json()
}

export function useFeed({ viewerGender, filters, initialData }: UseFeedParams) {
  return useInfiniteQuery({
    queryKey: ['feed', viewerGender, filters],
    queryFn: ({ pageParam }) =>
      fetchFeedPage({
        pageParam: pageParam as string | undefined,
        viewerGender,
        filters,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: initialData ? { pages: [initialData], pageParams: [undefined] } : undefined,
    staleTime: 30_000,
  })
}

// ── Guest feed (no auth) ────────────────────────────────────────────

async function fetchGuestFeedPage({ pageParam }: { pageParam?: string }): Promise<FeedPage> {
  const params = new URLSearchParams()
  if (pageParam) params.set('cursor', pageParam)

  const res = await fetch(`/api/feed/guest?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.message ?? 'Failed to fetch feed')
  }
  return res.json()
}

export function useGuestFeed({ initialData }: { initialData?: FeedPage }) {
  return useInfiniteQuery({
    queryKey: ['feed', 'guest'],
    queryFn: ({ pageParam }) => fetchGuestFeedPage({ pageParam: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: initialData ? { pages: [initialData], pageParams: [undefined] } : undefined,
    staleTime: 30_000,
  })
}
