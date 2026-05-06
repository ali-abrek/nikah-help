'use client'

import { useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { FeedFilters } from '../schemas'

export function useFilters(viewerGender: 'male' | 'female') {
  const searchParams = useSearchParams()
  const router = useRouter()

  const filters = useMemo((): FeedFilters => {
    const base = {
      gender: viewerGender,
      ...extractNumber(searchParams, 'age_min'),
      ...extractNumber(searchParams, 'age_max'),
      ...extractNumber(searchParams, 'radius_km'),
      ...extractNumber(searchParams, 'children_count_max'),
      ...extractArray(searchParams, 'marital_status'),
    } as Record<string, unknown>

    if (viewerGender === 'male') {
      // Filtering female profiles: polygyny, hijab
      return {
        ...base,
        ...extractArray(searchParams, 'polygyny_attitude'),
        ...extractArray(searchParams, 'hijab_attitude'),
      } as FeedFilters
    }

    // Filtering male profiles: income, housing, education
    return {
      ...base,
      ...extractArray(searchParams, 'income_level'),
      ...extractArray(searchParams, 'housing'),
      ...extractArray(searchParams, 'education'),
    } as FeedFilters
  }, [searchParams, viewerGender])

  const setFilter = useCallback(
    (key: string, value: string | number | string[] | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        params.delete(key)
      } else if (Array.isArray(value)) {
        params.set(key, value.join(','))
      } else {
        params.set(key, String(value))
      }
      router.replace(`/feed?${params.toString()}`, { scroll: false })
    },
    [searchParams, router],
  )

  const clearFilters = useCallback(() => {
    router.replace('/feed', { scroll: false })
  }, [router])

  const activeCount = useMemo(() => {
    const keys = Object.keys(filters).filter((k) => k !== 'gender')
    return keys.filter((k) => {
      const v = (filters as Record<string, unknown>)[k]
      return v !== undefined && v !== null && v !== ''
    }).length
  }, [filters])

  return { filters, setFilter, clearFilters, activeCount }
}

// ── Helpers ─────────────────────────────────────────────────────────

function extractNumber(params: URLSearchParams, key: string) {
  const v = params.get(key)
  if (v === null) return {}
  const n = Number(v)
  if (isNaN(n)) return {}
  return { [key]: n }
}

function extractArray(params: URLSearchParams, key: string) {
  const v = params.get(key)
  if (!v) return {}
  const arr = v.split(',').filter(Boolean)
  if (arr.length === 0) return {}
  return { [key]: arr }
}
