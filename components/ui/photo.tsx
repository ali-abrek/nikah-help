'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon } from './icon'

interface PhotoProps {
  src?: string | null
  alt?: string
  blurred?: boolean
  radius?: number
  label?: ReactNode
  className?: string
  style?: CSSProperties
  /** Aspect ratio. Default "4/5" — matches the design's portrait crop. */
  aspect?: string | false
  /** Render priority for above-the-fold images. */
  priority?: boolean
}

/** Image tile in 4:5 portrait by default. Used in feed cards and galleries. */
export function Photo({
  src,
  alt = '',
  blurred,
  radius = 18,
  label,
  className,
  style,
  aspect = '4/5',
  priority,
}: PhotoProps) {
  const [errored, setErrored] = useState(false)
  return (
    <div
      className={cn('relative overflow-hidden bg-[var(--surface-2)]', className)}
      style={{
        borderRadius: radius,
        aspectRatio: aspect || undefined,
        ...style,
      }}
    >
      {src && !errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setErrored(true)}
          className={cn(
            'block h-full w-full object-cover',
            blurred && 'scale-[1.15] blur-[14px]',
          )}
          style={{ position: 'absolute', inset: 0 }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[var(--ink-3)]">
          <Icon name="user" size={32} />
        </div>
      )}
      {blurred && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20 backdrop-blur-md">
            <Icon name="lock" size={18} />
          </div>
        </div>
      )}
      {label && (
        <span className="absolute left-2 top-2 rounded-full bg-[rgba(15,26,31,0.6)] px-2 py-1 text-[11px] tracking-wide text-white backdrop-blur-md">
          {label}
        </span>
      )}
    </div>
  )
}
