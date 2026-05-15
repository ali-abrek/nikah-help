'use client'

import { useState, useRef } from 'react'
import { markPhotoUploaded, deletePhotoAction } from '../actions'
import { Photo as PhotoStream } from '@/features/photos/components/Photo'
import { useLang } from '@/lib/i18n/use-lang'

const MAX_PHOTOS = 6

type PhotoSlot = {
  position: number
  preview: string | null
  photoId: string | null
  path: string | null
  uploading: boolean
  isExisting: boolean
}

function createSlots(initial: { id: string; position: number }[]): PhotoSlot[] {
  const slots: PhotoSlot[] = Array.from({ length: MAX_PHOTOS }, (_, i) => ({
    position: i + 1,
    preview: null,
    photoId: null,
    path: null,
    uploading: false,
    isExisting: false,
  }))
  for (const p of initial) {
    const idx = p.position - 1
    if (idx >= 0 && idx < MAX_PHOTOS) {
      slots[idx] = {
        position: p.position,
        preview: null,
        photoId: p.id,
        path: null,
        uploading: false,
        isExisting: true,
      }
    }
  }
  return slots
}

async function uploadFile(
  file: File,
  position: number,
): Promise<{ photoId: string; path: string } | { error: string }> {
  const res = await fetch('/api/photos/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mimeType: file.type, filename: file.name, position }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { error: body.message ?? 'Ошибка загрузки' }
  }

  const { photoId, signedUrl, path } = (await res.json()) as {
    photoId: string
    signedUrl: string
    path: string
  }

  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })

  if (!uploadRes.ok) {
    return { error: 'Не удалось загрузить файл' }
  }

  const result = await markPhotoUploaded(photoId)

  if (!result.success) {
    return { error: result.error?.message ?? 'Ошибка сохранения' }
  }

  await fetch('/api/photos/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId }),
  }).catch(() => {})

  return { photoId, path }
}

export function OnboardingStep3({
  isPending,
  onComplete,
  initialPhotos = [],
}: {
  isPending?: boolean
  onComplete?: () => void
  initialPhotos?: { id: string; position: number; moderation_status: string }[]
}) {
  const { t } = useLang()
  const [slots, setSlots] = useState<PhotoSlot[]>(() => createSlots(initialPhotos))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelPhotoId, setPendingDelPhotoId] = useState<string | null>(null)
  const [deletingPhoto, setDeletingPhoto] = useState(false)

  const filledCount = slots.filter((s) => s.preview || s.isExisting).length

  const handleSlotClick = (position: number) => {
    if (slots[position - 1]?.uploading) return
    setActiveSlot(position)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeSlot) return

    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/heic',
      'image/heif',
    ]
    if (!validTypes.includes(file.type)) {
      setError('Неподдерживаемый формат. Допустимы: JPEG, PNG, WebP, AVIF, HEIC')
      return
    }

    const preview = URL.createObjectURL(file)

    setSlots((prev) => prev.map((s) => (s.position === activeSlot ? { ...s, uploading: true } : s)))
    setError(null)

    const result = await uploadFile(file, activeSlot)

    if ('error' in result) {
      setSlots((prev) =>
        prev.map((s) =>
          s.position === activeSlot
            ? { ...s, uploading: false, preview: null, photoId: null, path: null }
            : s,
        ),
      )
      setError(result.error)
    } else {
      setSlots((prev) =>
        prev.map((s) =>
          s.position === activeSlot
            ? {
                ...s,
                uploading: false,
                preview,
                photoId: result.photoId,
                path: result.path,
                isExisting: false,
              }
            : s,
        ),
      )
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveNew = (position: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.position === position
          ? { ...s, preview: null, photoId: null, path: null, isExisting: false }
          : s,
      ),
    )
  }

  const handleRemoveExistingRequest = (photoId: string) => {
    setPendingDelPhotoId(photoId)
  }

  const confirmDeleteExisting = async () => {
    if (!pendingDelPhotoId) return
    setDeletingPhoto(true)
    const result = await deletePhotoAction(pendingDelPhotoId)
    setDeletingPhoto(false)
    if ('success' in result && result.success) {
      setSlots((prev) =>
        prev.map((s) =>
          s.photoId === pendingDelPhotoId
            ? { ...s, preview: null, photoId: null, path: null, isExisting: false }
            : s,
        ),
      )
    } else {
      setError(t('own_photo_del_error'))
    }
    setPendingDelPhotoId(null)
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Загрузите до 6 фотографий. Первое фото станет аватаром. Рекомендуемое соотношение сторон —
        4:5.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {slots.map((slot) => (
          <div key={slot.position}>
            {slot.isExisting && slot.photoId ? (
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                <PhotoStream
                  photoId={slot.photoId}
                  variant="cover"
                  alt={`Фото ${slot.position}`}
                  className="h-full w-full object-cover"
                />
                {slot.position === 1 && (
                  <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">
                    Аватар
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveExistingRequest(slot.photoId!)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  ×
                </button>
              </div>
            ) : slot.preview ? (
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element -- preview is an object URL */}
                <img
                  src={slot.preview}
                  alt={`Фото ${slot.position}`}
                  className="h-full w-full object-cover"
                />
                {slot.position === 1 && (
                  <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">
                    Аватар
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveNew(slot.position)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleSlotClick(slot.position)}
                disabled={slot.uploading}
                className="flex aspect-[4/5] w-full items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-500 disabled:opacity-50 dark:border-zinc-700 dark:hover:border-emerald-500"
              >
                {slot.uploading ? (
                  <svg
                    className="h-6 w-6 animate-spin text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  <span className="text-3xl">+</span>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        onChange={handleFileSelected}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => onComplete?.()}
        disabled={isPending || filledCount === 0}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending
          ? 'Сохранение...'
          : filledCount > 0
            ? 'Продолжить'
            : 'Загрузите хотя бы одно фото'}
      </button>

      {pendingDelPhotoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5">
            <h2 className="mb-2 text-[17px] font-semibold text-[var(--ink)]">
              {t('own_photo_del_title')}
            </h2>
            <p className="mb-5 text-[14px] text-[var(--ink-2)]">{t('own_photo_del_sub')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingDelPhotoId(null)}
                className="flex-1 rounded-xl bg-[var(--surface-2)] py-2.5 text-sm font-medium text-[var(--ink)]"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDeleteExisting}
                disabled={deletingPhoto}
                className="flex-1 rounded-xl bg-[var(--danger)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {deletingPhoto ? '…' : t('own_photo_del_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
