'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './icon'

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active?: boolean
  icon?: IconName
  children: ReactNode
}

export function Chip({ active, icon, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium transition-colors duration-150',
        active
          ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
          : 'border-[var(--divider-strong)] bg-transparent text-[var(--ink)]',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  )
}

/** Read-only “tag”-style pill used on profiles and intro cards. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-[var(--divider-strong)] bg-[var(--surface)] px-3 py-[5px] text-[13px] font-medium text-[var(--ink-2)]',
        className,
      )}
    >
      {children}
    </span>
  )
}
