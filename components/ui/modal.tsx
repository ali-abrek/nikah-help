'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './button'

interface ModalAction {
  label: string
  onClick: () => void
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children?: ReactNode
  primary?: ModalAction
  secondary?: ModalAction
  danger?: boolean
}

export function Modal({ open, onClose, title, children, primary, secondary, danger }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      className="anim-fade fixed inset-0 z-[60] grid place-items-center bg-[rgba(15,26,31,0.42)] p-6 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-pop w-full max-w-[340px] rounded-[20px] bg-[var(--bg)] p-[22px] shadow-[0_20px_50px_rgba(15,26,31,0.22)]"
      >
        <div className="mb-1.5 text-[17px] font-semibold tracking-[-0.2px] text-[var(--ink)]">
          {title}
        </div>
        {children && <div className="text-sm leading-snug text-[var(--ink-2)]">{children}</div>}
        {(primary || secondary) && (
          <div className="mt-4 flex gap-2">
            {secondary && (
              <Button kind="soft" full size="md" onClick={secondary.onClick}>
                {secondary.label}
              </Button>
            )}
            {primary && (
              <Button kind={danger ? 'danger' : 'primary'} full size="md" onClick={primary.onClick}>
                {primary.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
