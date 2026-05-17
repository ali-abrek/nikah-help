'use client'

import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SortablePhotoProps {
  id: string
  disabled?: boolean
  children: ReactNode
}

// Wraps a single photo cell in a sortable container. Drag activation is gated
// by the parent's sensor config (distance/delay) so taps still propagate to
// inner buttons like delete or "select active".
export function SortablePhoto({ id, disabled, children }: SortablePhotoProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'manipulation',
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}
