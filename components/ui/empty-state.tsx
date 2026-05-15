import type { ReactNode } from 'react'
import { Icon, type IconName } from './icon'

interface EmptyStateProps {
  icon: IconName
  title: ReactNode
  sub?: ReactNode
}

export function EmptyState({ icon, title, sub }: EmptyStateProps) {
  return (
    <div className="grid place-items-center px-7 py-16 text-center">
      <div className="mb-[18px] grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-[var(--primary-soft)] text-[var(--primary)]">
        <Icon name={icon} size={32} />
      </div>
      <div className="mb-1.5 text-[17px] font-semibold text-[var(--ink)]">{title}</div>
      {sub && (
        <div className="text-[13.5px] leading-snug text-[var(--ink-3)]">{sub}</div>
      )}
    </div>
  )
}
