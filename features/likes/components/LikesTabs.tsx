'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BigHeader } from '@/components/ui/header'
import { PillSegmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { useLang } from '@/lib/i18n/use-lang'
import { localizePlace } from '@/lib/i18n/dictionary'

type Tab = 'incoming' | 'outgoing' | 'matches'

interface LikeProfileData {
  id: string
  name: string | null
  gender: string | null
  age: number | null
  city: string | null
  photo_url: string | null
  liked_at?: string | null
  match_id?: string
  matched_at?: string | null
}

interface LikesTabsProps {
  incoming: LikeProfileData[]
  outgoing: LikeProfileData[]
  matches: LikeProfileData[]
}

export function LikesTabs({ incoming, outgoing, matches }: LikesTabsProps) {
  const { t, lang } = useLang()
  const [tab, setTab] = useState<Tab>('incoming')

  const data = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : matches

  return (
    <div className="flex h-full flex-col">
      <BigHeader title={t('likes_title')} />
      <div className="px-5 pb-3.5">
        <PillSegmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'incoming', label: t('likes_incoming') },
            { value: 'outgoing', label: t('likes_outgoing') },
            { value: 'matches', label: t('likes_mutual') },
          ]}
        />
      </div>
      <div className="scroll-area flex-1 overflow-auto pb-24">
        {data.length === 0 ? (
          <EmptyState icon="heart" title={t('likes_empty')} />
        ) : (
          <div className="grid grid-cols-2 gap-3 px-5">
            {data.map((p) => (
              <Link
                key={p.id}
                href={`/profile/${p.id}`}
                className="relative block aspect-[4/5] overflow-hidden rounded-2xl"
              >
                {p.photo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/photos/stream/${p.id}/${p.photo_url}`}
                    alt={p.name ?? ''}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-[var(--surface-2)] text-[var(--ink-3)]">
                    <Icon name="user" size={32} />
                  </div>
                )}
                <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(15,26,31,0.7)_0%,rgba(15,26,31,0)_50%)]" />
                <div className="absolute bottom-2.5 left-2.5 right-2.5 text-left text-white">
                  <div className="text-sm font-semibold">
                    {p.name ?? '—'}
                    {p.age != null && <span>, {p.age}</span>}
                  </div>
                  {p.city && (
                    <div className="text-[11.5px] opacity-90">{localizePlace(p.city, lang)}</div>
                  )}
                </div>
                {tab === 'matches' && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-2 py-1 text-[10.5px] font-semibold text-white">
                    <Icon name="heart-fill" size={11} />
                    {t('likes_mutual_badge')}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
