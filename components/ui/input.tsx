'use client'

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './icon'

interface FieldProps {
  label?: ReactNode
  optional?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  suffix?: ReactNode
  children: ReactNode
  className?: string
}

export function Field({ label, optional, hint, error, suffix, children, className }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      {(label || suffix) && (
        <div className="mb-1.5 flex items-baseline justify-between">
          {label && (
            <span className="text-[12.5px] font-medium tracking-[0.1px] text-[var(--ink-2)]">
              {label}
              {optional && <span className="font-normal text-[var(--ink-3)]"> · {optional}</span>}
            </span>
          )}
          {suffix}
        </div>
      )}
      {children}
      {hint && !error && (
        <div className="mt-1.5 text-xs leading-snug text-[var(--ink-3)]">{hint}</div>
      )}
      {error && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--danger)]">
          <Icon name="alert" size={14} />
          {error}
        </div>
      )}
    </label>
  )
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: IconName
  invalid?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { icon, invalid, className, ...rest },
  ref,
) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-0 flex h-full items-center text-[var(--ink-3)]">
          <Icon name={icon} size={18} />
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          'box-border h-[50px] w-full rounded-xl border bg-[var(--surface)] text-[15px] text-[var(--ink)] outline-none transition-[border-color,box-shadow] duration-150',
          icon ? 'pl-[42px] pr-4' : 'px-4',
          invalid
            ? 'border-[1.5px] border-[var(--danger)]'
            : 'border-[var(--divider-strong)] focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_var(--primary-soft)]',
          'disabled:bg-[var(--surface-2)] disabled:opacity-50',
          className,
        )}
        {...rest}
      />
    </div>
  )
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'box-border w-full resize-none rounded-xl border border-[var(--divider-strong)] bg-[var(--surface)] px-4 py-3.5 text-[15px] leading-relaxed text-[var(--ink)] outline-none transition-colors duration-150 focus:border-[var(--primary)]',
        className,
      )}
      {...rest}
    />
  )
})
