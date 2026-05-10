'use client'

import Link from 'next/link'
import type { FeedProfile } from '../schemas'
import { Photo } from '@/features/photos/components/Photo'
import { cn } from '@/lib/utils/cn'

function calcAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return age
}

export function ProfileCard({ profile }: { profile: FeedProfile }) {
  const age = profile.birth_date ? calcAge(profile.birth_date) : null

  return (
    <Link
      href={`/profile/${profile.id}`}
      className={cn(
        'group relative block overflow-hidden rounded-2xl border border-zinc-200',
        'bg-white transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900',
      )}
    >
      <div className="relative aspect-[4/5] w-full bg-zinc-100 dark:bg-zinc-800">
        {profile.cover_photo_url ? (
          <Photo
            photoId={profile.id}
            variant="cover"
            alt={profile.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"
              />
            </svg>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-lg font-semibold text-foreground group-hover:text-primary">
            {profile.name}
          </h3>
          {age != null && <span className="text-sm text-zinc-500">{age} лет</span>}
        </div>

        {profile.city && profile.country && (
          <p className="mt-1 text-sm text-zinc-500">
            {profile.city}, {profile.country}
          </p>
        )}

        {profile.ai_bio && (
          <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
            {profile.ai_bio}
          </p>
        )}
      </div>
    </Link>
  )
}
