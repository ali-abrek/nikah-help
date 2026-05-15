'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Icon } from '@/components/ui/icon'
import { Photo as PhotoStream } from '@/features/photos/components/Photo'
import { useLang } from '@/lib/i18n/use-lang'
import { localizePlace } from '@/lib/i18n/dictionary'
import { generateSeoSlug } from '@/lib/seo'
import type { FeedProfile } from '../schemas'

function calcAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

interface FeedCardProps {
  profile: FeedProfile
  trailing?: ReactNode
}

/**
 * Large 4:5 portrait card with a gradient overlay carrying the name/age
 * and city pinned to the bottom-left, plus an optional trailing slot
 * (used for the like-attempt button on the guest variant).
 */
export function FeedCard({ profile, trailing }: FeedCardProps) {
  const { lang } = useLang()
  const age = calcAge(profile.birth_date)

  return (
    <Link
      href={`/profile/${profile.id}-${generateSeoSlug(profile)}`}
      className="block overflow-hidden rounded-[18px] border border-[var(--divider)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(15,26,31,0.04),0_4px_12px_rgba(15,26,31,0.04)]"
    >
      <div className="relative aspect-[4/5]">
        {profile.cover_photo_url ? (
          <PhotoStream
            photoId={profile.id}
            variant="cover"
            alt={profile.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[var(--surface-2)] text-[var(--ink-3)]">
            <Icon name="user" size={48} />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(15,26,31,0.62)_0%,rgba(15,26,31,0)_50%)]" />
        <div className="absolute bottom-3.5 left-4 right-4 flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size={44} src={null} alt={profile.name} />
            <div className="min-w-0 text-white">
              <div className="text-[17px] font-semibold leading-[1.1] tracking-[-0.2px]">
                {profile.name}
                {age != null && <span className="font-semibold">, {age}</span>}
              </div>
              {(profile.city || profile.country) && (
                <div className="mt-0.5 flex items-center gap-1 text-[13px] text-white/85">
                  <Icon name="pin" size={12} />
                  <span className="truncate">
                    {profile.city ? localizePlace(profile.city, lang) : ''}
                    {profile.city && profile.country ? ', ' : ''}
                    {profile.country ? localizePlace(profile.country, lang) : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
          {trailing}
        </div>
      </div>
    </Link>
  )
}
