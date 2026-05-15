'use client'

import { useCallback, useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { useLang } from '@/lib/i18n/use-lang'

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
  const { t } = useLang()
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const handleGoToChat = useCallback(() => {
    router.push('/chats')
    onClose()
  }, [router, onClose])

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
      className="anim-fade fixed inset-0 z-[100] flex flex-col items-center justify-center p-7 text-white"
      style={{
        background: 'linear-gradient(180deg, var(--primary) 0%, var(--primary-deep) 100%)',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex w-full max-w-[340px] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mb-9 flex items-center justify-center">
          <div
            className="absolute h-[250px] w-[250px] rounded-full bg-white/[0.06]"
            style={{ animation: 'pulse-soft 3s ease-in-out infinite' }}
          />
          <div
            className="absolute h-[180px] w-[180px] rounded-full bg-white/[0.08]"
            style={{ animation: 'pulse-soft 3s ease-in-out infinite .4s' }}
          />
          <div className="flex">
            <AvatarCircle profile={theirProfile} className="h-[110px] w-[110px] relative z-[2] translate-x-3.5 -rotate-3" />
            <AvatarCircle profile={myProfile} className="h-[110px] w-[110px] -translate-x-3.5 rotate-3" />
          </div>
        </div>

        <div
          id={titleId}
          className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.4px] backdrop-blur-md"
        >
          <Icon name="heart-fill" size={12} />
          {t('match_badge')}
        </div>

        <p
          id={descId}
          className="m-0 mb-8 max-w-[300px] text-center text-base font-medium leading-relaxed text-white/90"
        >
          {t('match_sub')}
        </p>

        <Button
          kind="secondary"
          size="lg"
          full
          icon="chat"
          onClick={handleGoToChat}
          className="!border-none !bg-white !text-[var(--primary)]"
        >
          {t('match_open_chat')}
        </Button>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="mt-3 bg-transparent p-2 text-sm font-medium text-white/85"
        >
          {t('match_later')}
        </button>
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
          'overflow-hidden rounded-full bg-white/20',
          className,
        )}
        style={{ boxShadow: '0 0 0 4px rgba(255,255,255,0.2)' }}
      />
    )
  }
  const src = profile.photos?.[0]?.variants?.thumbnail_sm?.webp
  return (
    <div
      className={cn('overflow-hidden rounded-full bg-white/20', className)}
      style={{ boxShadow: '0 0 0 4px rgba(255,255,255,0.2)' }}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/api/photos/stream/${profile.id}/${src}`}
          alt={profile.name ?? ''}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl text-white/70">
          {profile.name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  )
}
