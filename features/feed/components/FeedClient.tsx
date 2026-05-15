'use client'

import { useEffect, useCallback } from 'react'
import { useInView } from 'react-intersection-observer'
import { useFeed } from '../hooks/useFeed'
import { FeedCard } from './FeedCard'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { useLang } from '@/lib/i18n/use-lang'
import type { FeedFilters, FeedPage } from '../schemas'

interface FeedClientProps {
  viewerGender: 'male' | 'female'
  filters: FeedFilters
  initialData?: FeedPage
}

export function FeedClient({ viewerGender, filters, initialData }: FeedClientProps) {
  const { t } = useLang()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useFeed({
    viewerGender,
    filters,
    initialData,
  })
  const { ref, inView } = useInView({ rootMargin: '400px' })

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    if (inView) loadMore()
  }, [inView, loadMore])

  if (status === 'error') {
    return <EmptyState icon="alert" title={t('feed_empty')} sub={t('feed_empty_sub')} />
  }

  const profiles = data?.pages.flatMap((page) => page.profiles) ?? []
  if (status === 'success' && profiles.length === 0) {
    return <EmptyState icon="feed" title={t('feed_empty')} sub={t('feed_empty_sub')} />
  }

  return (
    <>
      <div className="grid gap-3.5">
        {profiles.map((profile) => (
          <FeedCard key={profile.id} profile={profile} />
        ))}
      </div>
      <div ref={ref} className="h-10" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      )}
    </>
  )
}
