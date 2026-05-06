'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

interface MatchProfile {
  id: string
  name: string | null
  gender: 'male' | 'female' | null
  photos: { variants: Record<string, { avif: string; webp: string }> | null }[]
}

interface MatchModalProps {
  open: boolean
  onClose: () => void
  myProfile: MatchProfile | null
  theirProfile: MatchProfile | null
}

export function MatchModal({ open, onClose, myProfile, theirProfile }: MatchModalProps) {
  const router = useRouter()

  const handleGoToChat = useCallback(() => {
    router.push('/chats')
    onClose()
  }, [router, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-zinc-900">
        {/* Match heading */}
        <h2 className="text-2xl font-bold text-rose-500">
          Это мэтч!
        </h2>
        <p className="mt-2 text-zinc-500">
          У вас взаимная симпатия. Начните общение прямо сейчас.
        </p>

        {/* Avatar pair */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <AvatarCircle
            profile={myProfile}
            className="w-20 h-20"
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-lg">
            &#10084;
          </div>
          <AvatarCircle
            profile={theirProfile}
            className="w-20 h-20"
          />
        </div>

        {/* Names */}
        <div className="mt-4 flex items-center justify-center gap-6 text-sm font-medium">
          <span className="text-foreground">{myProfile?.name ?? 'Вы'}</span>
          <span className="text-foreground">{theirProfile?.name ?? '...'}</span>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleGoToChat}
            className={cn(
              'w-full rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white',
              'hover:bg-primary-hover transition-colors',
            )}
          >
            Перейти в чат
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Продолжить поиск
          </button>
        </div>
      </div>
    </div>
  )
}

function AvatarCircle({
  profile,
  className,
}: {
  profile: MatchProfile | null
  className?: string
}) {
  if (!profile) {
    return (
      <div
        className={cn(
          'rounded-full bg-zinc-200 dark:bg-zinc-700',
          className,
        )}
      />
    )
  }

  const firstPhoto = profile.photos?.[0]
  const src = firstPhoto?.variants?.thumbnail_sm?.webp

  return (
    <div
      className={cn(
        'overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700',
        className,
      )}
    >
      {src ? (
        <img
          src={`/api/photos/stream/${profile.id}/${src}`}
          alt={profile.name ?? ''}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-400">
          {profile.name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  )
}
