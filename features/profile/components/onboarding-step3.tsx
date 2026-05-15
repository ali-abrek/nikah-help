'use client'

import { useRef, useState } from 'react'
import { markPhotoUploaded, deletePhotoAction } from '../actions'
import { Photo as PhotoStream } from '@/features/photos/components/Photo'
import { useLang } from '@/lib/i18n/use-lang'

const MAX_PHOTOS = 6

export type WizardPhoto = {
  id: string
  position: number
  localPreview: string | null
  uploading: boolean
  isExisting: boolean
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

interface Props {
  photos: WizardPhoto[]
  setPhotos: React.Dispatch<React.SetStateAction<WizardPhoto[]>>
}

export function OnboardingStep3({ photos, setPhotos }: Props) {
  const { t } = useLang()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelPhotoId, setPendingDelPhotoId] = useState<string | null>(null)
  const [deletingPhoto, setDeletingPhoto] = useState(false)

  const hasAddSlot = photos.length < MAX_PHOTOS
  const nextPosition = photos.length + 1

  const handleAddClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return

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

    setError(null)
    const position = nextPosition
    const tempId = `__pending_${position}_${Date.now()}`
    const preview = URL.createObjectURL(file)

    setPhotos((prev) => [
      ...prev,
      {
        id: tempId,
        position,
        localPreview: preview,
        uploading: true,
        isExisting: false,
      },
    ])

    const result = await uploadFile(file, position)

    if ('error' in result) {
      setPhotos((prev) => prev.filter((p) => p.id !== tempId))
      setError(result.error)
      URL.revokeObjectURL(preview)
      return
    }

    setPhotos((prev) =>
      prev.map((p) =>
        p.id === tempId ? { ...p, id: result.photoId, uploading: false, isExisting: true } : p,
      ),
    )
  }

  const handleRemoveRequest = (photoId: string) => {
    setPendingDelPhotoId(photoId)
  }

  const confirmDelete = async () => {
    if (!pendingDelPhotoId) return
    const photoId = pendingDelPhotoId
    setDeletingPhoto(true)
    const result = await deletePhotoAction(photoId)
    setDeletingPhoto(false)
    setPendingDelPhotoId(null)

    if ('success' in result && result.success) {
      setPhotos((prev) =>
        prev
          .filter((p) => p.id !== photoId)
          .sort((a, b) => a.position - b.position)
          .map((p, i) => ({ ...p, position: i + 1 })),
      )
    } else {
      setError(t('own_photo_del_error'))
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Загрузите до 6 фотографий. Первое фото станет аватаром. Рекомендуемое соотношение сторон —
        4:5.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {photos.map((photo) => (
          <div key={photo.id}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              {photo.localPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- object URL preview
                <img
                  src={photo.localPreview}
                  alt={`Фото ${photo.position}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <PhotoStream
                  photoId={photo.id}
                  variant="cover"
                  alt={`Фото ${photo.position}`}
                  className="h-full w-full object-cover"
                />
              )}
              {photo.position === 1 && (
                <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">
                  Аватар
                </span>
              )}
              {photo.uploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <svg className="h-6 w-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
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
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRemoveRequest(photo.id)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}

        {hasAddSlot && (
          <div>
            <button
              type="button"
              onClick={handleAddClick}
              className="flex aspect-[4/5] w-full items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-500 dark:border-zinc-700 dark:hover:border-emerald-500"
            >
              <span className="text-3xl">+</span>
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        onChange={handleFileSelected}
        className="hidden"
      />

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
                disabled={deletingPhoto}
                className="flex-1 rounded-xl bg-[var(--surface-2)] py-2.5 text-sm font-medium text-[var(--ink)] disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
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
