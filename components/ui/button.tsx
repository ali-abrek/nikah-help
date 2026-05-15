'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './icon'

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  kind?: ButtonKind
  size?: ButtonSize
  icon?: IconName
  iconRight?: IconName
  full?: boolean
  children?: ReactNode
}

const SIZES: Record<ButtonSize, { h: string; px: string; text: string; r: string; icon: number }> =
  {
    sm: { h: 'h-9', px: 'px-3.5', text: 'text-[13.5px]', r: 'rounded-[10px]', icon: 16 },
    md: { h: 'h-12', px: 'px-[18px]', text: 'text-[15px]', r: 'rounded-xl', icon: 18 },
    lg: { h: 'h-14', px: 'px-[22px]', text: 'text-base', r: 'rounded-[14px]', icon: 20 },
  }

const KIND_CLASSES: Record<ButtonKind, string> = {
  primary: 'bg-[var(--primary)] text-white',
  secondary:
    'bg-[var(--surface)] text-[var(--ink)] border border-[var(--divider-strong)]',
  ghost: 'bg-transparent text-[var(--ink)] border border-transparent',
  danger: 'bg-[var(--danger)] text-white',
  soft: 'bg-[var(--surface-2)] text-[var(--ink)]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { kind = 'primary', size = 'md', icon, iconRight, full, className, children, type, ...rest },
  ref,
) {
  const s = SIZES[size]
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium tracking-[-0.1px] transition-[transform,opacity,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-45 active:scale-[.985]',
        s.h,
        s.px,
        s.text,
        s.r,
        KIND_CLASSES[kind],
        full ? 'w-full' : 'w-auto',
        '[-webkit-tap-highlight-color:transparent]',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={s.icon} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.icon} />}
    </button>
  )
})
