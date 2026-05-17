'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { Spinner } from '@/components/ui/spinner'
import { Modal } from '@/components/ui/modal'
import { Toggle } from '@/components/ui/toggle'
import { SettingsRow } from '@/components/ui/settings-row'
import { Photo as PhotoStream } from '@/features/photos/components/Photo'
import { useToast } from '@/components/ui/toast'
import { useLang } from '@/lib/i18n/use-lang'
import { localizePlace } from '@/lib/i18n/dictionary'
import { deletePhotoAction, markPhotoUploaded } from '../actions'
import type { ProfileDetailData, ProfilePhotoData } from '../server/get-profile'

interface OwnProfileProps {
  profile: ProfileDetailData
}

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

export function OwnProfile({ profile }: OwnProfileProps) {
  const { t, lang } = useLang()
  const router = useRouter()
  const toast = useToast()
  const [photoIdx, setPhotoIdx] = useState(0)
  const [photos, setPhotos] = useState(profile.photos)
  const [published, setPublished] = useState(!!profile.is_published)
  const [privateMode, setPrivateMode] = useState(false)
  const [showOff, setShowOff] = useState(false)
  const [showDel, setShowDel] = useState(false)
  const [photoPendingDel, setPhotoPendingDel] = useState<string | null>(null)
  const [deletingPhoto, setDeletingPhoto] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // Local blob previews keyed by photoId — used while the server is still
  // processing variants. Without this, PhotoStream 404s for queued photos.
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      Object.values(localPreviews).forEach((url) => URL.revokeObjectURL(url))
    }
    // Intentionally empty deps: cleanup runs once on unmount with the latest
    // ref via closure-captured object. Per-key cleanup happens inside the
    // delete handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [pending, startTransition] = useTransition()
  const age = calcAge(profile.birth_date)
  const photo = photos[photoIdx]

  const togglePublish = (next: boolean) => {
    if (!next) {
      setShowOff(true)
      return
    }
    startTransition(async () => {
      const res = await fetch('/api/profile/toggle-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: true }),
      })
      if (res.ok) setPublished(true)
      else toast.show(t('own_no_photos'))
    })
  }

  const confirmUnpublish = () => {
    setShowOff(false)
    startTransition(async () => {
      const res = await fetch('/api/profile/toggle-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: false }),
      })
      if (res.ok) setPublished(false)
    })
  }

  const handleAddPhotoClick = () => {
    if (uploadingPhoto) return
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (selected.length === 0) return

    const MAX_PHOTOS = 6
    const MIN_SHORT_SIDE_PX = 1000
    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/heic',
      'image/heif',
    ]

    const remainingSlots = MAX_PHOTOS - photos.length
    if (selected.length > remainingSlots) {
      toast.show(t('ph_err_max_count', { n: MAX_PHOTOS }))
      return
    }

    // Best-effort browser-side decode; HEIC on Chromium returns null and we
    // fall through to server-side sharp validation.
    const readShortSide = async (file: File): Promise<number | null> => {
      if (typeof createImageBitmap === 'function') {
        try {
          const bitmap = await createImageBitmap(file)
          const side = Math.min(bitmap.width, bitmap.height)
          bitmap.close?.()
          return side
        } catch {
          return null
        }
      }
      return null
    }

    setUploadingPhoto(true)
    try {
      let basePosition = photos.length + 1
      for (const file of selected) {
        if (!validTypes.includes(file.type)) {
          toast.show(t('ph_err_format'))
          continue
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          toast.show(t('ph_err_too_large'))
          continue
        }
        const shortSide = await readShortSide(file)
        if (shortSide !== null && shortSide < MIN_SHORT_SIDE_PX) {
          toast.show(t('ph_err_too_small'))
          continue
        }

        const position = basePosition++
        const previewUrl = URL.createObjectURL(file)

        const res = await fetch('/api/photos/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType: file.type, filename: file.name, position }),
        })
        if (!res.ok) {
          toast.show(t('own_photo_add_error'))
          URL.revokeObjectURL(previewUrl)
          continue
        }

        const { photoId, signedUrl } = (await res.json()) as {
          photoId: string
          signedUrl: string
        }

        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        if (!uploadRes.ok) {
          toast.show(t('own_photo_add_error'))
          URL.revokeObjectURL(previewUrl)
          continue
        }

        const markResult = await markPhotoUploaded(photoId)
        if (!markResult.success) {
          toast.show(t('own_photo_add_error'))
          URL.revokeObjectURL(previewUrl)
          continue
        }

        await fetch('/api/photos/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoId }),
        }).catch(() => {})

        const newPhoto: ProfilePhotoData = {
          id: photoId,
          position,
          variants: null,
          moderation_status: 'queued',
        }
        setLocalPreviews((prev) => ({ ...prev, [photoId]: previewUrl }))
        setPhotos((prev) => [...prev, newPhoto])
      }
    } finally {
      setUploadingPhoto(false)
    }
  }

  const confirmDeletePhoto = async () => {
    if (!photoPendingDel) return
    setDeletingPhoto(true)
    const result = await deletePhotoAction(photoPendingDel)
    setDeletingPhoto(false)
    if (!('success' in result) || !result.success) {
      toast.show(t('own_photo_del_error'))
    } else {
      setPhotos((prev) => {
        const next = prev.filter((p) => p.id !== photoPendingDel)
        setPhotoIdx((idx) => Math.min(idx, Math.max(0, next.length - 1)))
        return next
      })
      setLocalPreviews((prev) => {
        const url = prev[photoPendingDel]
        if (url) URL.revokeObjectURL(url)
        const { [photoPendingDel]: _, ...rest } = prev
        return rest
      })
    }
    setPhotoPendingDel(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex min-h-[56px] items-center border-b border-[var(--divider)] bg-[var(--bg)] px-3 py-2">
        <button
          type="button"
          onClick={() => router.push('/feed')}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full text-[var(--ink)]"
        >
          <Icon name="back" size={22} />
        </button>
        <h1 className="m-0 flex-1 text-[22px] font-bold uppercase tracking-[0.5px] text-[var(--ink)]">
          {t('own_title')}
        </h1>
        <Link
          href="/settings"
          aria-label={t('settings')}
          className="grid h-10 w-10 place-items-center rounded-full text-[var(--ink)]"
        >
          <Icon name="gear" size={22} />
        </Link>
      </div>

      <div className="scroll-area flex-1 overflow-auto pb-10">
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          {photo ? (
            localPreviews[photo.id] ? (
              // eslint-disable-next-line @next/next/no-img-element -- object URL preview while variants are still processing
              <img
                src={localPreviews[photo.id]}
                alt={profile.name ?? ''}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <PhotoStream
                photoId={photo.id}
                variant="full"
                alt={profile.name ?? ''}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[var(--surface-2)] text-[var(--ink-3)]">
              <Icon name="user" size={48} />
            </div>
          )}
          {photos.length > 1 && (
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
          )}
          {(photo?.moderation_status === 'pending' ||
            photo?.moderation_status === 'queued' ||
            photo?.moderation_status === 'manual_review') && (
            <span className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur-md">
              {t('mod_pending')}
            </span>
          )}
          {photo?.moderation_status === 'rejected' && (
            <span className="absolute bottom-3 left-3 rounded-lg bg-[var(--danger)] px-2.5 py-1 text-[11px] text-white">
              {t('mod_rejected')}
            </span>
          )}
        </div>

        <div className="px-5 pt-4 text-center">
          <div className="text-[22px] font-semibold tracking-[-0.2px] text-[var(--ink)]">
            {profile.name ?? '—'}
            {age != null && <span>, {age}</span>}
          </div>
          {(profile.city || profile.country) && (
            <div className="mt-1 text-[13px] text-[var(--ink-3)]">
              {profile.city ? localizePlace(profile.city, lang) : ''}
              {profile.city && profile.country ? ', ' : ''}
              {profile.country
                ? lang === 'ru'
                  ? (profile.country_name_ru ?? profile.country_name_en ?? profile.country)
                  : (profile.country_name_en ?? profile.country)
                : ''}
            </div>
          )}
          <span
            className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
              published
                ? 'bg-[rgba(61,170,111,0.1)] text-[var(--success)]'
                : 'bg-[var(--surface-2)] text-[var(--ink-3)]'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: published ? 'var(--success)' : 'var(--ink-3)',
              }}
            />
            {published ? t('own_published') : t('own_unpublished')}
          </span>
        </div>

        <div className="px-5 pt-3.5">
          <Link
            href="/subscription"
            className="flex w-full items-center gap-3 rounded-2xl border border-[var(--accent)] bg-[linear-gradient(to_right,var(--accent-soft)_0%,transparent_80%)] p-3.5"
          >
            <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-[var(--accent)] text-base font-bold text-white">
              ₽
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-semibold text-[var(--ink)]">{t('sub_title')}</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--ink-2)]">
                {t('own_free_likes_left', { used: 0 })}
              </div>
            </div>
            <Icon name="next" size={18} className="text-[var(--ink-3)]" />
          </Link>
        </div>

        <div className="px-5 pt-[18px]">
          <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.6px] text-[var(--ink-3)]">
            {t('prof_photos')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div
                key={p.id}
                className={`relative aspect-[4/5] overflow-hidden rounded-xl ${
                  photoIdx === i
                    ? 'outline outline-2 outline-offset-2 outline-[var(--primary)]'
                    : ''
                }`}
              >
                <button type="button" onClick={() => setPhotoIdx(i)} className="absolute inset-0">
                  {localPreviews[p.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- object URL preview while variants are still processing
                    <img
                      src={localPreviews[p.id]}
                      alt={`photo ${i}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <PhotoStream
                      photoId={p.id}
                      variant="cover"
                      alt={`photo ${i}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {i === 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--primary)] px-1.5 py-0.5 text-[10px] text-white">
                      {t('ob_avatar')}
                    </span>
                  )}
                  {(p.moderation_status === 'pending' ||
                    p.moderation_status === 'queued' ||
                    p.moderation_status === 'manual_review') && (
                    <span className="absolute bottom-1 left-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-center text-[9.5px] text-white">
                      {t('mod_pending')}
                    </span>
                  )}
                  {p.moderation_status === 'rejected' && (
                    <span className="absolute bottom-1 left-1 right-1 rounded bg-[var(--danger)] px-1.5 py-0.5 text-center text-[9.5px] text-white">
                      {t('mod_rejected')}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoPendingDel(p.id)}
                  aria-label={t('own_photo_del_confirm')}
                  className="absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"
                >
                  <Icon name="close" size={10} />
                </button>
              </div>
            ))}
            {photos.length < 6 && (
              <button
                type="button"
                onClick={handleAddPhotoClick}
                disabled={uploadingPhoto}
                aria-label={t('own_photo_add')}
                className="grid aspect-[4/5] place-items-center rounded-xl border-[1.5px] border-dashed border-[var(--divider-strong)] bg-[var(--surface-2)] text-[var(--ink-3)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-60 disabled:hover:border-[var(--divider-strong)] disabled:hover:text-[var(--ink-3)]"
              >
                {uploadingPhoto ? <Spinner size={22} /> : <Icon name="plus" size={22} />}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
            onChange={handleFileSelected}
            className="hidden"
          />
        </div>

        {profile.ai_bio && (
          <div className="px-5 pt-[18px]">
            <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.6px] text-[var(--ink-3)]">
              {t('ob_about_me')}
            </div>
            <div className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface)] px-4 py-3.5">
              <p className="m-0 whitespace-pre-wrap text-[14.5px] leading-[1.65] text-[var(--ink)]">
                {profile.ai_bio}
              </p>
            </div>
          </div>
        )}

        <div className="px-5 pt-[18px]">
          <div className="overflow-hidden rounded-[14px] border border-[var(--divider)] bg-[var(--surface)]">
            <SettingsRow
              label={t('set_publish')}
              sub={published ? t('own_published') : t('own_unpublished')}
              trailing={<Toggle on={published} onChange={togglePublish} />}
            />
            <SettingsRow
              label={t('ob_private_mode')}
              sub={privateMode ? t('ob_private_private') : t('ob_private_public')}
              trailing={<Toggle on={privateMode} onChange={setPrivateMode} />}
              last
            />
          </div>
        </div>

        <div className="mx-5 mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push('/onboarding')}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--surface-2)] text-[14.5px] font-medium text-[var(--ink)]"
          >
            <Icon name="edit" size={16} />
            {t('own_edit')}
          </button>
          <button
            type="button"
            onClick={() => setShowDel(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-transparent text-[14.5px] font-medium text-[var(--danger)]"
          >
            <Icon name="trash" size={16} />
            {t('own_delete')}
          </button>
        </div>
      </div>

      <Modal
        open={showOff}
        onClose={() => setShowOff(false)}
        title={t('own_publish_off_title')}
        primary={{ label: t('own_publish_off_confirm'), onClick: confirmUnpublish }}
        secondary={{ label: t('cancel'), onClick: () => setShowOff(false) }}
      >
        {t('own_publish_off_sub')}
      </Modal>

      <Modal
        open={showDel}
        onClose={() => setShowDel(false)}
        title={t('own_delete_title')}
        primary={{ label: t('own_delete_confirm'), onClick: () => setShowDel(false) }}
        secondary={{ label: t('cancel'), onClick: () => setShowDel(false) }}
        danger
      >
        {t('own_delete_sub')}
      </Modal>

      <Modal
        open={!!photoPendingDel}
        onClose={() => setPhotoPendingDel(null)}
        title={t('own_photo_del_title')}
        primary={{
          label: deletingPhoto ? '…' : t('own_photo_del_confirm'),
          onClick: confirmDeletePhoto,
        }}
        secondary={{ label: t('cancel'), onClick: () => setPhotoPendingDel(null) }}
        danger
      >
        {t('own_photo_del_sub')}
      </Modal>

      {pending && <div aria-hidden className="sr-only" />}
    </div>
  )
}
