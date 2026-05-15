'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './icon'

interface PickerRowProps {
  label?: ReactNode
  value?: ReactNode
  placeholder?: ReactNode
  onClick: () => void
  icon?: IconName
  disabled?: boolean
  className?: string
}

/** Tappable row that opens a Sheet of choices — full-width, hairline border. */
export function PickerRow({
  value,
  placeholder,
  onClick,
  icon,
  disabled,
  className,
}: PickerRowProps) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[50px] w-full items-center justify-between gap-2 rounded-xl border border-[var(--divider-strong)] bg-[var(--surface)] px-4 text-left text-[15px] disabled:opacity-50',
        hasValue ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]',
        className,
      )}
    >
      <span className="flex items-center gap-2.5 truncate">
        {icon && <Icon name={icon} size={18} className="text-[var(--ink-3)]" />}
        {hasValue ? value : placeholder}
      </span>
      <Icon name="next" size={16} className="text-[var(--ink-3)]" />
    </button>
  )
}

interface ListPickerItem<V> {
  value: V
  label: ReactNode
  prefix?: ReactNode
}

interface ListPickerProps<V> {
  items: ListPickerItem<V>[]
  selected: V | null | undefined
  onPick: (value: V) => void
  isEqual?: (a: V, b: V) => boolean
}

/** List-style picker rendered inside a Sheet. */
export function ListPicker<V>({
  items,
  selected,
  onPick,
  isEqual = Object.is,
}: ListPickerProps<V>) {
  return (
    <div className="grid max-h-[380px] gap-1 overflow-auto">
      {items.map((item, idx) => {
        const active = selected !== null && selected !== undefined && isEqual(item.value, selected)
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onPick(item.value)}
            className={cn(
              'flex h-[50px] items-center justify-between gap-3 rounded-[10px] px-4 text-left text-[15px] text-[var(--ink)]',
              active && 'bg-[var(--primary-soft)]',
            )}
          >
            <span className="flex items-center gap-3">
              {item.prefix}
              <span>{item.label}</span>
            </span>
            {active && <Icon name="check" size={18} className="text-[var(--primary)]" />}
          </button>
        )
      })}
    </div>
  )
}
