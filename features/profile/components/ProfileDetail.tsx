'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Header, IconBtn } from '@/components/ui/header'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { Sheet } from '@/components/ui/sheet'
import { Tag } from '@/components/ui/chip'
import { useToast } from '@/components/ui/toast'
import { Photo as PhotoStream } from '@/features/photos/components/Photo'
import { useMatch } from '@/features/likes/hooks/MatchProvider'
import { useLang } from '@/lib/i18n/use-lang'
import { localizePlace, type Lang } from '@/lib/i18n/dictionary'
import type { ProfileDetailData } from '../server/get-profile'

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

interface ProfileDetailProps {
  profile: ProfileDetailData
  isOwnProfile: boolean
  isGuest?: boolean
}

export function ProfileDetail({ profile, isOwnProfile, isGuest = false }: ProfileDetailProps) {
  const { t, lang } = useLang()
  const router = useRouter()
  const toast = useToast()
  const { triggerMatch } = useMatch()
  const [photoIdx, setPhotoIdx] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [showUnlike, setShowUnlike] = useState(false)
  const [liked, setLiked] = useState(profile.viewer_has_liked)
  const [matched, setMatched] = useState(profile.viewer_is_match)
  const [pending, setPending] = useState(false)

  const photos = profile.photos
  const age = calcAge(profile.birth_date)
  const touchStart = useRef<number | null>(null)

  const goNext = () => setPhotoIdx((i) => Math.min(i + 1, photos.length - 1))
  const goPrev = () => setPhotoIdx((i) => Math.max(i - 1, 0))

  const swipe = (touch: typeof touchStart, end: number) => {
    if (touch.current === null) return
    const diff = touch.current - end
    if (Math.abs(diff) > 40) (diff > 0 ? goNext : goPrev)()
    touch.current = null
  }

  const sendLike = async () => {
    if (pending || matched) return
    if (liked) {
      setShowUnlike(true)
      return
    }
    setPending(true)
    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_user_id: profile.id, action: 'like' }),
      })
      if (res.ok) {
        setLiked(true)
        const data = await res.json()
        if (data.matched) {
          setMatched(true)
          triggerMatch({
            myProfile: null,
            theirProfile: {
              id: profile.id,
              name: profile.name ?? '',
              gender: profile.gender ?? 'male',
              photos: photos as never,
            },
          })
        } else {
          toast.show(t('prof_liked_toast'))
        }
      } else {
        const err = await res.json().catch(() => null)
        toast.show(err?.message ?? t('prof_liked_toast'))
      }
    } finally {
      setPending(false)
    }
  }

  const confirmUnlike = async () => {
    setShowUnlike(false)
    setPending(true)
    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_user_id: profile.id, action: 'unlike' }),
      })
      if (res.ok) {
        setLiked(false)
        setMatched(false)
        toast.show(t('prof_unlike_done'))
      }
    } finally {
      setPending(false)
    }
  }

  const openChat = () => {
    router.push(`/chats?with=${profile.id}`)
  }

  const photo = photos[photoIdx]
  const showFull = isOwnProfile || matched
  const guestUrl = (photoId: string, variant: string) =>
    `/api/photos/guest/stream?photoId=${photoId}&variant=${variant}&fmt=webp`

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <Header
        title=""
        leading="back"
        onLeading={() => router.back()}
        hairline={false}
        trailing={
          !isOwnProfile ? <IconBtn icon="more" onClick={() => setShowReport(true)} /> : undefined
        }
      />

      <div className="scroll-area flex-1 overflow-auto pb-[120px]">
        <div
          className="relative mx-4 aspect-[4/5] overflow-hidden rounded-[22px]"
          onTouchStart={(e) => {
            touchStart.current = e.touches[0]?.clientX ?? null
          }}
          onTouchEnd={(e) => {
            const x = e.changedTouches[0]?.clientX ?? 0
            swipe(touchStart, x)
          }}
        >
          {photo ? (
            isGuest ? (
              <img
                src={guestUrl(photo.id, showFull ? 'full' : 'cover')}
                alt={`${profile.name ?? ''} ${photoIdx + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <PhotoStream
                photoId={photo.id}
                variant={showFull ? 'full' : 'cover'}
                alt={`${profile.name ?? ''} ${photoIdx + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[var(--surface-2)] text-[var(--ink-3)]">
              <Icon name="user" size={48} />
            </div>
          )}
          <div className="pointer-events-none absolute left-3 right-3 top-3 flex gap-1">
            {photos.map((_, i) => (
              <span
                key={i}
                className={`h-[3px] flex-1 rounded-full ${
                  i === photoIdx ? 'bg-white/95' : 'bg-white/35'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-[22px] pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="m-0 text-[26px] font-semibold tracking-[-0.5px] text-[var(--ink)]">
                {profile.name ?? ''}
                {age != null && <span className="font-semibold">, {age}</span>}
              </h1>
              {(profile.city || profile.country) && (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-[var(--ink-2)]">
                  <Icon name="pin" size={13} className="text-[var(--ink-3)]" />
                  <span>
                    {profile.city ? localizePlace(profile.city, lang) : ''}
                    {profile.city && profile.country ? ', ' : ''}
                    {profile.country
                      ? lang === 'ru'
                        ? (profile.country_name_ru ?? profile.country_name_en ?? profile.country)
                        : (profile.country_name_en ?? profile.country)
                      : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-[7px]">
            {profile.marital_status && (
              <Tag>{maritalLabel(profile.marital_status, profile.gender, lang)}</Tag>
            )}
            {profile.children_count !== null && (
              <Tag>
                {(profile.children_count ?? 0) > 0
                  ? lang === 'ru'
                    ? 'Есть дети'
                    : 'Has children'
                  : lang === 'ru'
                    ? 'Детей нет'
                    : 'No children'}
              </Tag>
            )}
          </div>

          {(profile.ai_bio || profile.about_self) && (
            <div className="mt-[18px]">
              <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--ink)] [text-wrap:pretty]">
                {profile.ai_bio ?? profile.about_self}
              </p>
            </div>
          )}

          {photos.length > 1 && (
            <div className="mt-[22px]">
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.6px] text-[var(--ink-3)]">
                {t('prof_photos')}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPhotoIdx(i)}
                    className={`overflow-hidden rounded-[14px] ${
                      photoIdx === i
                        ? 'outline outline-2 outline-offset-2 outline-[var(--primary)]'
                        : ''
                    }`}
                  >
                    <div className="relative aspect-[4/5]">
                      {isGuest ? (
                        <img
                          src={guestUrl(p.id, showFull ? 'full' : 'cover')}
                          alt={`${profile.name ?? ''} ${i + 1}`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <PhotoStream
                          photoId={p.id}
                          variant={showFull ? 'full' : 'cover'}
                          alt={`${profile.name ?? ''} ${i + 1}`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {!showFull && !isGuest && (
                <div className="mt-2.5 flex gap-1.5 text-xs text-[var(--ink-3)]">
                  <Icon name="lock" size={14} />
                  <span>
                    {t('prof_blurred')} · {t('prof_blurred_sub')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isOwnProfile && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-2.5 px-5 pt-3 pb-[calc(12px+var(--safe-bottom))] [background:linear-gradient(to_top,var(--bg)_70%,transparent)]">
          {isGuest ? (
            <Link href="/auth" className="block w-full">
              <Button kind="primary" size="lg" full icon="heart">
                {t('prof_like')}
              </Button>
            </Link>
          ) : matched ? (
            <Button kind="primary" size="lg" full icon="chat" onClick={openChat}>
              {t('prof_message')}
            </Button>
          ) : (
            <Button
              kind="primary"
              size="lg"
              full
              icon={liked ? 'heart-fill' : 'heart'}
              onClick={sendLike}
              disabled={pending}
            >
              {t(liked ? 'prof_liked' : 'prof_like')}
            </Button>
          )}
        </div>
      )}

      <Sheet open={showReport} onClose={() => setShowReport(false)}>
        <button
          type="button"
          onClick={() => {
            setShowReport(false)
            toast.show(t('prof_report'))
          }}
          className="flex h-[50px] w-full items-center gap-3 rounded-xl bg-transparent px-4 text-left text-[15px] text-[var(--danger)]"
        >
          <Icon name="flag" size={18} />
          {t('prof_report')}
        </button>
        <Button kind="ghost" full onClick={() => setShowReport(false)}>
          {t('cancel')}
        </Button>
      </Sheet>

      <Modal
        open={showUnlike}
        onClose={() => setShowUnlike(false)}
        title={t('prof_unlike_title')}
        primary={{ label: t('prof_unlike_confirm'), onClick: confirmUnlike }}
        secondary={{ label: t('cancel'), onClick: () => setShowUnlike(false) }}
        danger
      >
        {t('prof_unlike_sub')}
      </Modal>
    </div>
  )
}

function maritalLabel(
  status: string,
  gender: 'male' | 'female' | null | undefined,
  lang: Lang,
): string {
  const ru: Record<string, [string, string]> = {
    single: ['Не был женат', 'Не была замужем'],
    divorced: ['Разведён', 'Разведена'],
    widowed: ['Вдовец', 'Вдова'],
    married_1: ['Женат на одной', 'Замужем'],
    married_2: ['Женат на двоих', 'Замужем'],
    married_3: ['Женат на троих', 'Замужем'],
  }
  const en: Record<string, string> = {
    single: 'Never married',
    divorced: 'Divorced',
    widowed: gender === 'female' ? 'Widow' : 'Widower',
    married_1: 'Married to one wife',
    married_2: 'Married to two wives',
    married_3: 'Married to three wives',
  }
  if (lang === 'en') return en[status] ?? status
  const pair = ru[status]
  if (!pair) return status
  return gender === 'female' ? pair[1] : pair[0]
}
