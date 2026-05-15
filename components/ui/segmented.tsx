'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (next: T) => void
  options: SegmentedOption<T>[]
  className?: string
}

/** 2–3 option radio replacement — full-width grid with primary fill on the active option. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn('grid gap-2', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-14 rounded-xl border text-[15px] tracking-[-0.1px] transition-[background-color,color,border-color] duration-150',
              active
                ? 'border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--primary)]'
                : 'border-[var(--divider-strong)] bg-[var(--surface)] font-medium text-[var(--ink)]',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** Compact pill segmented control used inside sticky headers (Likes tabs). */
export function PillSegmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: SegmentedProps<T>) {
  return (
    <div className={cn('flex gap-1.5 rounded-xl bg-[var(--surface-2)] p-1', className)}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-[38px] flex-1 rounded-[9px] text-[13.5px] transition-[background-color,color,box-shadow] duration-150',
              active
                ? 'bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(15,26,31,0.08)]'
                : 'bg-transparent font-medium text-[var(--ink-3)]',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
