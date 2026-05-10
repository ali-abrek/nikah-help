'use client'

import { useEffect, useCallback } from 'react'
import { useInView } from 'react-intersection-observer'
import { useFeed } from '../hooks/useFeed'
import { ProfileCard } from './ProfileCard'
import type { FeedFilters, FeedPage } from '../schemas'

interface FeedClientProps {
  viewerGender: 'male' | 'female'
  filters: FeedFilters
  initialData?: FeedPage
}

export function FeedClient({ viewerGender, filters, initialData }: FeedClientProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useFeed({
    viewerGender,
    filters,
    initialData,
  })

  const { ref, inView } = useInView({ rootMargin: '400px' })

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    if (inView) loadMore()
  }, [inView, loadMore])

  if (status === 'error') {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Не удалось загрузить ленту. Попробуйте позже.</p>
      </div>
    )
  }

  const profiles = data?.pages.flatMap((page) => page.profiles) ?? []
  const isEmpty = status === 'success' && profiles.length === 0

  return (
    <div>
      {isEmpty ? (
        <div className="py-16 text-center">
          <p className="text-lg text-zinc-500">Профили не найдены. Попробуйте изменить фильтры.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      )}

      <div ref={ref} className="h-10" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  )
}
