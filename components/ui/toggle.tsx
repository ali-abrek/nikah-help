'use client'

import { cn } from '@/lib/utils/cn'

interface ToggleProps {
  on: boolean
  onChange: (next: boolean) => void
  className?: string
  ariaLabel?: string
}

export function Toggle({ on, onChange, className, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault()
        onChange(!on)
      }}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200',
        on ? 'bg-[var(--primary)]' : 'bg-[var(--divider-strong)]',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-[left]',
          on ? 'left-[18px]' : 'left-0.5',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)' }}
      />
    </button>
  )
}
