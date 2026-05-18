'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { useLang } from '@/lib/i18n/use-lang'
import { decideModerationPhotoAction } from '../actions'
import type { QueuedPhoto } from '../server/list-queue'

interface ModerationQueueProps {
  initial: QueuedPhoto[]
}

export function ModerationQueue({ initial }: ModerationQueueProps) {
  const { t } = useLang()
  const router = useRouter()
  const toast = useToast()
  // IDs that were locally decided but not yet removed from the server's
  // initial list. This lets us optimistically hide an item the moment the
  // moderator makes a decision, without waiting for router.refresh().
  const [filteredOut, setFilteredOut] = useState<Set<string>>(new Set())

  // items is derived from the server's initial list, minus locally-decided
  // photos. When router.refresh() brings a new initial (e.g. after a decision
  // or the 30-second poll), items auto-updates via useMemo — no useState sync
  // required.
  const items = useMemo(
    () => initial.filter((p) => !filteredOut.has(p.photoId)),
    [initial, filteredOut],
  )

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Poll for new manual_review items every 30 seconds so the moderator
  // doesn't need to reload the page when photos arrive after it was opened.
  useEffect(() => {
    const tid = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(tid)
  }, [router])

  const decide = (photoId: string, decision: 'approve' | 'reject') => {
    setPendingId(photoId)
    startTransition(async () => {
      const res = await decideModerationPhotoAction({ photoId, decision })
      setPendingId(null)
      if (!res.success) {
        toast.show(res.error.message ?? t('mod_queue_error'))
        return
      }
      setFilteredOut((prev) => new Set([...prev, photoId]))
      toast.show(t('mod_queue_decided'))
      router.refresh()
    })
  }

  if (items.length === 0) {
    return (
      <div className="grid place-items-center px-5 py-20 text-center text-[var(--ink-3)]">
        <Icon name="check" size={32} />
        <p className="mt-3 text-sm">{t('mod_queue_empty')}</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-[var(--divider)]">
      {items.map((p) => (
        <li key={p.photoId} className="flex gap-3 px-5 py-4">
          <div className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- private moderator stream, not optimisable */}
            <img
              src={`/api/photos/moderation-stream?photoId=${p.photoId}&variant=cover&fmt=webp`}
              alt={p.profileName ?? p.photoId}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[var(--ink)]">
              {p.profileName ?? p.profileId.slice(0, 8)}
            </div>
            {p.moderationReason && (
              <div className="mt-1 text-xs text-[var(--ink-3)]">
                {t('mod_queue_reason')}: {p.moderationReason}
              </div>
            )}
            {p.profileGender && (
              <div className="mt-0.5 text-xs text-[var(--ink-3)]">
                {p.profileGender === 'male' ? 'M' : 'F'}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => decide(p.photoId, 'approve')}
                disabled={isPending && pendingId === p.photoId}
                className="rounded-lg bg-[var(--success)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {t('mod_queue_approve')}
              </button>
              <button
                type="button"
                onClick={() => decide(p.photoId, 'reject')}
                disabled={isPending && pendingId === p.photoId}
                className="rounded-lg bg-[var(--danger)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {t('mod_queue_reject')}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
