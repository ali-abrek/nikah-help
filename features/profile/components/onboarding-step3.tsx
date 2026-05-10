'use client'

import { useState, useRef } from 'react'
import { markPhotoUploaded } from '../actions'

const MAX_PHOTOS = 6

type PhotoSlot = {
  position: number
  preview: string | null
  photoId: string | null
  path: string | null
  uploading: boolean
}

function createSlots(): PhotoSlot[] {
  return Array.from({ length: MAX_PHOTOS }, (_, i) => ({
    position: i + 1,
    preview: null,
    photoId: null,
    path: null,
    uploading: false,
  }))
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

  // Trigger server-side processing (sharp variants + moderation pipeline).
  await fetch('/api/photos/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId }),
  }).catch(() => {
    // Non-fatal — photo-abandon-cleanup will reap if processing never starts.
  })

  return { photoId, path }
}

export function OnboardingStep3({
  isPending,
  onComplete,
}: {
  isPending?: boolean
  onComplete?: () => void
}) {
  const [slots, setSlots] = useState<PhotoSlot[]>(createSlots)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filledCount = slots.filter((s) => s.preview).length

  const handleSlotClick = (position: number) => {
    if (slots[position - 1]?.uploading) return
    setActiveSlot(position)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeSlot) return

    // Validate type
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

    // Create preview
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
            ? { ...s, uploading: false, preview, photoId: result.photoId, path: result.path }
            : s,
        ),
      )
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemove = (position: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.position === position ? { ...s, preview: null, photoId: null, path: null } : s,
      ),
    )
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
            {slot.preview ? (
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element -- preview is an object URL, next/image does not handle blobs */}
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
                  onClick={() => handleRemove(slot.position)}
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
    </div>
  )
}
