'use client'

import Link from 'next/link'
import { BigHeader, IconBtn } from '@/components/ui/header'
import { useLang } from '@/lib/i18n/use-lang'

export function FeedHeader() {
  const { t } = useLang()
  return (
    <BigHeader
      title={t('nav_feed')}
      actions={
        <>
          <Link href="/feed/filters" aria-label={t('feed_filters')}>
            <IconBtn icon="sliders" ariaLabel={t('feed_filters')} />
          </Link>
          <Link href="/settings" aria-label={t('settings')}>
            <IconBtn icon="gear" ariaLabel={t('settings')} />
          </Link>
        </>
      }
    />
  )
}
