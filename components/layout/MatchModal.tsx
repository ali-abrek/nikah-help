'use client'

import { useCallback, useEffect, useId, useRef } from 'react'
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
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const handleGoToChat = useCallback(() => {
    router.push('/chats')
    onClose()
  }, [router, onClose])

  // ESC closes; tab focus stays inside the dialog while it's open.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    closeButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="mx-4 w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-2xl font-bold text-rose-500">
          Это мэтч!
        </h2>
        <p id={descId} className="mt-2 text-zinc-500">
          У вас взаимная симпатия. Начните общение прямо сейчас.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4" aria-hidden="true">
          <AvatarCircle profile={myProfile} className="w-20 h-20" />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-lg">
            &#10084;
          </div>
          <AvatarCircle profile={theirProfile} className="w-20 h-20" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-6 text-sm font-medium">
          <span className="text-foreground">{myProfile?.name ?? 'Вы'}</span>
          <span className="text-foreground">{theirProfile?.name ?? '...'}</span>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleGoToChat}
            className={cn(
              'w-full rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white',
              'hover:bg-primary-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            )}
          >
            Перейти в чат
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
    return <div className={cn('rounded-full bg-zinc-200 dark:bg-zinc-700', className)} />
  }

  const firstPhoto = profile.photos?.[0]
  const src = firstPhoto?.variants?.thumbnail_sm?.webp

  return (
    <div className={cn('overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
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
