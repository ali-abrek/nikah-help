'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './icon'

interface HeaderProps {
  title?: ReactNode
  subtitle?: ReactNode
  leading?: IconName
  onLeading?: () => void
  trailing?: ReactNode
  sticky?: boolean
  hairline?: boolean
  centerTitle?: boolean
  className?: string
}

/** Chat-style top header — leading icon, single-line title (+ subtitle), optional trailing. */
export function Header({
  title,
  subtitle,
  leading,
  onLeading,
  trailing,
  sticky = true,
  hairline = true,
  centerTitle = false,
  className,
}: HeaderProps) {
  return (
    <div
      className={cn(
        sticky && 'sticky top-0 z-10',
        'flex min-h-[52px] items-center gap-2 bg-[var(--bg)] px-3 py-2',
        hairline && 'border-b border-[var(--divider)]',
        className,
      )}
    >
      {leading && (
        <button
          type="button"
          onClick={onLeading}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-transparent text-[var(--ink)]"
        >
          <Icon name={leading} size={22} />
        </button>
      )}
      <div
        className={cn(
          'min-w-0 flex-1 truncate',
          leading ? 'pl-0' : 'pl-2',
          centerTitle && 'text-center',
        )}
      >
        {title && (
          <div className="truncate text-base font-semibold tracking-[-0.2px] text-[var(--ink)]">
            {title}
          </div>
        )}
        {subtitle && (
          <div className="truncate text-xs text-[var(--ink-3)]">{subtitle}</div>
        )}
      </div>
      {trailing}
      {centerTitle && !trailing && <div className="w-10 shrink-0" aria-hidden />}
    </div>
  )
}

/** Big-title header used on Feed / Likes. */
export function BigHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-5 pb-3 pt-1.5">
      <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-0.5px] text-[var(--ink)]">
        {title}
      </h1>
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  )
}

interface IconBtnProps {
  icon: IconName
  onClick?: () => void
  badge?: number | string
  size?: number
  className?: string
  ariaLabel?: string
}

export function IconBtn({ icon, onClick, badge, size = 40, className, ariaLabel }: IconBtnProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full bg-transparent text-[var(--ink)] [-webkit-tap-highlight-color:transparent]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} />
      {badge !== undefined && badge !== 0 && (
        <span
          className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10.5px] font-semibold leading-none text-white shadow-[0_0_0_2px_var(--bg)]"
          style={{ height: 16 }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/** Sticky bottom action bar with a soft fade into the background colour. */
export function StickyActions({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 left-0 right-0 z-[5] flex gap-2.5 px-5 pt-3',
        'pb-[calc(12px+var(--safe-bottom))]',
        '[background:linear-gradient(to_top,var(--bg)_70%,transparent)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
