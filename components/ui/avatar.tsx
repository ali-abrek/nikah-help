'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface AvatarProps {
  src?: string | null
  alt?: string
  size?: number
  online?: boolean
  ring?: boolean
  fallback?: ReactNode
  className?: string
}

export function Avatar({
  src,
  alt = '',
  size = 44,
  online,
  ring,
  fallback,
  className,
}: AvatarProps) {
  const [errored, setErrored] = useState(false)
  const showImg = !!src && !errored

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size, flex: `0 0 ${size}px` }}
    >
      <div
        className="h-full w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
        style={{
          boxShadow: ring
            ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--primary)'
            : 'inset 0 0 0 1px var(--divider)',
        }}
      >
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src!}
            alt={alt}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm font-medium text-[var(--ink-3)]">
            {fallback ?? (alt ? alt.charAt(0).toUpperCase() : '·')}
          </div>
        )}
      </div>
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-[var(--success)] shadow-[0_0_0_2px_var(--bg)]"
          style={{
            width: Math.max(8, size * 0.22),
            height: Math.max(8, size * 0.22),
          }}
        />
      )}
    </div>
  )
}
