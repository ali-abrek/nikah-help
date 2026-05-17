'use client'

import { useRef, useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { markPhotoUploaded, deletePhotoAction, reorderPhotosAction } from '../actions'
import { Photo as PhotoStream } from '@/features/photos/components/Photo'
import { useLang } from '@/lib/i18n/use-lang'
import { rejectionToastKey } from '../lib/rejection-reason'
import { SortablePhoto } from './SortablePhoto'

const MAX_PHOTOS = 6
const MIN_SHORT_SIDE_PX = 1000
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ACCEPTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
] as const

export type WizardPhoto = {
  id: string
  position: number
  localPreview: string | null
  uploading: boolean
  isExisting: boolean
}

type UploadResult =
  | { photoId: string; path: string; moderationStatus: string; moderationReason: string | null }
  | { error: string }

async function uploadFile(file: File, position: number): Promise<UploadResult> {
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

  // Await processing so we know whether moderation auto-rejected the photo
  // before letting the wizard advance. Without this the user sees the photo
  // briefly then it vanishes after server-side cleanup.
  const procRes = await fetch('/api/photos/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId }),
  }).catch(() => null)

  let moderationStatus = 'queued'
  let moderationReason: string | null = null
  if (procRes?.ok) {
    const body = (await procRes.json().catch(() => null)) as {
      moderationStatus?: string
      moderationReason?: string | null
    } | null
    moderationStatus = body?.moderationStatus ?? 'queued'
    moderationReason = body?.moderationReason ?? null
  }

  return { photoId, path, moderationStatus, moderationReason }
}

// Best-effort client check: returns the short side in px, or null if the
// browser cannot decode the file (HEIC/HEIF — Safari can sometimes, Chromium
// cannot). When null, we defer to server-side sharp validation.
async function readShortSide(file: File): Promise<number | null> {
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
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(Math.min(img.naturalWidth, img.naturalHeight))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
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

  const remainingSlots = MAX_PHOTOS - photos.length
  const hasAddSlot = remainingSlots > 0
  const nextPosition = photos.length + 1

  const handleAddClick = () => {
    fileInputRef.current?.click()
  }

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (selected.length === 0) return

    // Cap at remaining slots so the user gets a clear error rather than
    // silently truncating their selection.
    if (selected.length > remainingSlots) {
      setError(t('ph_err_max_count', { n: MAX_PHOTOS }))
      return
    }

    setError(null)

    let basePosition = nextPosition
    const errors: string[] = []

    for (const file of selected) {
      if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) {
        errors.push(t('ph_err_format'))
        continue
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(t('ph_err_too_large'))
        continue
      }

      const shortSide = await readShortSide(file)
      // shortSide === null means the browser couldn't decode (HEIC on Chrome).
      // The server pipeline runs sharp.metadata() on every upload and rejects
      // small images with VALIDATION_IMAGE_TOO_SMALL — so the client check is
      // a fast-feedback layer, not the authoritative gate.
      if (shortSide !== null && shortSide < MIN_SHORT_SIDE_PX) {
        errors.push(t('ph_err_too_small'))
        continue
      }

      const position = basePosition++
      const tempId = `__pending_${position}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      // shortSide === null means browser can't decode this format (HEIC on Chrome/Firefox).
      // Skip the object URL in that case — the slot shows a gray placeholder instead.
      const preview = shortSide !== null ? URL.createObjectURL(file) : null

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

      // Fire-and-await per-file so positions stay sequential and the server's
      // PHOTO_POSITION_TAKEN constraint can't race.
      const result = await uploadFile(file, position)

      if ('error' in result) {
        setPhotos((prev) => prev.filter((p) => p.id !== tempId))
        if (preview) URL.revokeObjectURL(preview)
        errors.push(result.error)
        continue
      }

      // Auto-rejected by moderation — server has cleaned up the DB row,
      // remove the local placeholder and surface the rejection reason.
      if (result.moderationStatus === 'rejected') {
        setPhotos((prev) => prev.filter((p) => p.id !== tempId))
        if (preview) URL.revokeObjectURL(preview)
        errors.push(t(rejectionToastKey(result.moderationReason)))
        continue
      }

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === tempId ? { ...p, id: result.photoId, uploading: false, isExisting: true } : p,
        ),
      )
    }

    if (errors.length > 0) {
      // Dedupe identical messages (e.g. multiple too-small files share one msg).
      setError(Array.from(new Set(errors)).join(' • '))
    }
  }

  const handleRemoveRequest = (photoId: string) => {
    setPendingDelPhotoId(photoId)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Reorder is a DB op against real photo IDs. If any photo is still
    // uploading (temp id), abort — the user will retry once spinners clear.
    if (photos.some((p) => p.uploading)) return

    const currentIds = photos.map((p) => p.id)
    const oldIndex = currentIds.indexOf(String(active.id))
    const newIndex = currentIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return

    const previousPhotos = photos
    const nextIds = arrayMove(currentIds, oldIndex, newIndex)
    const reordered = nextIds.map((id, i) => {
      const found = previousPhotos.find((p) => p.id === id)!
      return { ...found, position: i + 1 }
    })
    setPhotos(reordered)

    const result = await reorderPhotosAction(nextIds)
    if (!('success' in result) || !result.success) {
      setPhotos(previousPhotos)
      setError(t('own_photo_reorder_error'))
    }
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
      const code = 'error' in result ? result.error?.code : undefined
      setError(
        code === 'PHOTO_ONLY_APPROVED_DELETED'
          ? t('own_photo_del_last_error')
          : t('own_photo_del_error'),
      )
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Загрузите до 6 фотографий. Первое фото станет аватаром. Рекомендуемое соотношение сторон —
        4:5.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-3">
            {photos.map((photo, idx) => (
              <SortablePhoto key={photo.id} id={photo.id} disabled={photo.uploading}>
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                  {photo.localPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- object URL preview
                    <img
                      src={photo.localPreview}
                      alt={`Фото ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : photo.uploading ? (
                    <div className="h-full w-full bg-[var(--surface-2)]" />
                  ) : (
                    <PhotoStream
                      photoId={photo.id}
                      variant="cover"
                      alt={`Фото ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  )}
                  {idx === 0 && (
                    <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">
                      Аватар
                    </span>
                  )}
                  {photo.uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <svg
                        className="h-6 w-6 animate-spin text-white"
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
              </SortablePhoto>
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
        </SortableContext>
      </DndContext>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        onChange={handleFilesSelected}
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
