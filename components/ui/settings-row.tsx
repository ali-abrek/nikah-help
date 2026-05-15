import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './icon'

interface SettingsRowProps {
  icon?: IconName
  label: ReactNode
  sub?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  last?: boolean
  danger?: boolean
}

export function SettingsRow({
  icon,
  label,
  sub,
  trailing,
  onClick,
  last,
  danger,
}: SettingsRowProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3.5 text-left',
        !last && 'border-b border-[var(--divider)]',
        onClick ? 'cursor-pointer' : 'cursor-default',
        danger ? 'text-[var(--danger)]' : 'text-[var(--ink)]',
      )}
    >
      {icon && (
        <span
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]',
            danger ? 'text-[var(--danger)]' : 'text-[var(--ink-2)]',
          )}
        >
          <Icon name={icon} size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-medium">{label}</div>
        {sub && (
          <div className="mt-0.5 text-xs leading-snug text-[var(--ink-3)]">{sub}</div>
        )}
      </div>
      {trailing ?? (onClick && <Icon name="next" size={16} className="text-[var(--ink-3)]" />)}
    </Tag>
  )
}

export function SettingsGroup({
  label,
  children,
}: {
  label?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-[18px]">
      {label && (
        <div className="mb-2 px-1 text-[11.5px] font-semibold uppercase tracking-[0.7px] text-[var(--ink-3)]">
          {label}
        </div>
      )}
      <div className="overflow-hidden rounded-[14px] border border-[var(--divider)] bg-[var(--surface)]">
        {children}
      </div>
    </div>
  )
}
