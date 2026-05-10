'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils/cn'
import { Photo } from '@/features/photos/components/Photo'
import type { ProfilePhotoData } from '../server/get-profile'

interface PhotoSliderProps {
  photos: ProfilePhotoData[]
  // showFull is true when the viewer is the owner, has matched the owner,
  // or has already been liked by the owner. The Photo component handles
  // the variant fetch — we don't need the profile id or ownership here.
  showFull: boolean
}

export function PhotoSlider({ photos, showFull }: PhotoSliderProps) {
  const [current, setCurrent] = useState(0)

  const prev = useCallback(() => {
    setCurrent((c) => (c > 0 ? c - 1 : photos.length - 1))
  }, [photos.length])

  const next = useCallback(() => {
    setCurrent((c) => (c < photos.length - 1 ? c + 1 : 0))
  }, [photos.length])

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <p className="text-zinc-400">Нет фото</p>
      </div>
    )
  }

  const photo = photos[current]
  if (!photo) return null

  return (
    <div className="relative">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <Photo
          photoId={photo.id}
          variant={showFull ? 'full' : 'cover'}
          alt={`Фото ${current + 1}`}
          className="h-full w-full object-cover"
        />
      </div>

      {photos.length > 1 && (
        <>
          <button
            onClick={prev}
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white',
              'hover:bg-black/60 transition-colors',
            )}
            aria-label="Предыдущее фото"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={next}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white',
              'hover:bg-black/60 transition-colors',
            )}
            aria-label="Следующее фото"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === current ? 'w-6 bg-white' : 'w-1.5 bg-white/50',
                )}
                aria-label={`Фото ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
