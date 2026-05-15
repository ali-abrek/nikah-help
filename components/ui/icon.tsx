import { cn } from '@/lib/utils/cn'

export type IconName =
  | 'home'
  | 'feed'
  | 'chat'
  | 'heart'
  | 'heart-fill'
  | 'bell'
  | 'sliders'
  | 'search'
  | 'more'
  | 'back'
  | 'next'
  | 'check'
  | 'check2'
  | 'close'
  | 'plus'
  | 'mic'
  | 'paperclip'
  | 'send'
  | 'shield'
  | 'eye-off'
  | 'lock'
  | 'mail'
  | 'globe'
  | 'user'
  | 'gear'
  | 'crown'
  | 'flag'
  | 'help'
  | 'pin'
  | 'ruler'
  | 'reply'
  | 'play'
  | 'pause'
  | 'sun'
  | 'moon'
  | 'log-out'
  | 'trash'
  | 'edit'
  | 'sparkle'
  | 'calendar'
  | 'chevron-down'
  | 'chevron-up'
  | 'male'
  | 'female'
  | 'alert'

interface IconProps {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

/**
 * Lucide-style 1.6px stroke icon set. Inline SVG so colours follow currentColor
 * and there is no runtime dependency on lucide-react for the design system.
 */
export function Icon({ name, size = 20, className, strokeWidth = 1.6 }: IconProps) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: cn('shrink-0', className),
  }
  switch (name) {
    case 'home':
      return (
        <svg {...p}>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      )
    case 'feed':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="6" rx="1.5" />
          <rect x="3" y="14" width="18" height="6" rx="1.5" />
        </svg>
      )
    case 'chat':
      return (
        <svg {...p}>
          <path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5V15c0 .8-.7 1.5-1.5 1.5H10l-4 3.5V5.5Z" />
        </svg>
      )
    case 'heart':
      return (
        <svg {...p}>
          <path d="M12 20s-7-4.5-9.2-9C1.4 8 3.4 4.5 6.8 4.5c2 0 3.7 1.2 4.6 2.7.9-1.5 2.6-2.7 4.6-2.7 3.4 0 5.4 3.5 4 6.5C19 15.5 12 20 12 20Z" />
        </svg>
      )
    case 'heart-fill':
      return (
        <svg {...p} fill="currentColor">
          <path d="M12 20s-7-4.5-9.2-9C1.4 8 3.4 4.5 6.8 4.5c2 0 3.7 1.2 4.6 2.7.9-1.5 2.6-2.7 4.6-2.7 3.4 0 5.4 3.5 4 6.5C19 15.5 12 20 12 20Z" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...p}>
          <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      )
    case 'sliders':
      return (
        <svg {...p}>
          <path d="M4 7h10" />
          <path d="M18 7h2" />
          <circle cx="16" cy="7" r="2" />
          <path d="M4 17h4" />
          <path d="M12 17h8" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      )
    case 'search':
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case 'more':
      return (
        <svg {...p}>
          <circle cx="5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <circle cx="19" cy="12" r="1.2" fill="currentColor" />
        </svg>
      )
    case 'back':
      return (
        <svg {...p}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      )
    case 'next':
      return (
        <svg {...p}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      )
    case 'check':
      return (
        <svg {...p}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )
    case 'check2':
      return (
        <svg {...p}>
          <path d="M3 13l4 4L13 9" />
          <path d="M11 13l4 4L21 9" />
        </svg>
      )
    case 'close':
      return (
        <svg {...p}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...p}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'mic':
      return (
        <svg {...p}>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      )
    case 'paperclip':
      return (
        <svg {...p}>
          <path d="M21 11.5l-9 9a5.5 5.5 0 1 1-7.8-7.8L13 4a3.5 3.5 0 1 1 5 5L9.5 17.5a1.5 1.5 0 1 1-2.1-2.1L15 8" />
        </svg>
      )
    case 'send':
      return (
        <svg {...p}>
          <path d="M4 12l16-8-6 18-3-7-7-3z" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...p}>
          <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
        </svg>
      )
    case 'eye-off':
      return (
        <svg {...p}>
          <path d="M3 3l18 18" />
          <path d="M10 5.5C18 4 22 12 22 12s-1.5 3-4 5" />
          <path d="M6 7.5C3 9.5 2 12 2 12s4 8 12 7.5" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...p}>
          <rect x="4.5" y="11" width="15" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      )
    case 'mail':
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 7 9-7" />
        </svg>
      )
    case 'globe':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18" />
          <path d="M12 3a14 14 0 0 0 0 18" />
        </svg>
      )
    case 'user':
      return (
        <svg {...p}>
          <circle cx="12" cy="9" r="3.5" />
          <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
        </svg>
      )
    case 'gear':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12c0-.6 0-1.1-.1-1.7l2-1.6-2-3.4-2.5.7c-.8-.6-1.7-1.1-2.6-1.4L13.4 2h-2.8l-.4 2.6c-.9.3-1.8.8-2.6 1.4l-2.5-.7-2 3.4 2 1.6c0 .6-.1 1.1-.1 1.7s0 1.1.1 1.7l-2 1.6 2 3.4 2.5-.7c.8.6 1.7 1.1 2.6 1.4L10.6 22h2.8l.4-2.6c.9-.3 1.8-.8 2.6-1.4l2.5.7 2-3.4-2-1.6c.1-.6.1-1.1.1-1.7Z" />
        </svg>
      )
    case 'crown':
      return (
        <svg {...p}>
          <path d="M3 8l3 9h12l3-9-5 4-4-7-4 7-5-4z" />
        </svg>
      )
    case 'flag':
      return (
        <svg {...p}>
          <path d="M5 3v18" />
          <path d="M5 4h12l-2 4 2 4H5" />
        </svg>
      )
    case 'help':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 1.8-2 3.5" />
          <circle cx="12" cy="17.5" r=".75" fill="currentColor" />
        </svg>
      )
    case 'pin':
      return (
        <svg {...p}>
          <path d="M12 2a6 6 0 0 1 6 6c0 4-6 12-6 12S6 12 6 8a6 6 0 0 1 6-6Z" />
          <circle cx="12" cy="8" r="2.2" />
        </svg>
      )
    case 'ruler':
      return (
        <svg {...p}>
          <path d="M3 13l10-10 8 8L11 21z" />
          <path d="M7 11l2 2" />
          <path d="M10 8l2 2" />
          <path d="M13 5l2 2" />
        </svg>
      )
    case 'reply':
      return (
        <svg {...p}>
          <path d="M9 5l-6 7 6 7" />
          <path d="M3 12h11a7 7 0 0 1 7 7" />
        </svg>
      )
    case 'play':
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M7 5v14l12-7z" />
        </svg>
      )
    case 'pause':
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...p}>
          <path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z" />
        </svg>
      )
    case 'log-out':
      return (
        <svg {...p}>
          <path d="M14 4h5v16h-5" />
          <path d="M10 8l-4 4 4 4" />
          <path d="M6 12h12" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...p}>
          <path d="M4 7h16" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
        </svg>
      )
    case 'edit':
      return (
        <svg {...p}>
          <path d="M4 20h4l11-11-4-4L4 16v4z" />
        </svg>
      )
    case 'sparkle':
      return (
        <svg {...p}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          <path d="M19 17l.8 1.8L21.5 19.5 19.7 20.3 19 22l-.7-1.7L16.5 19.5l1.8-.7z" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      )
    case 'chevron-down':
      return (
        <svg {...p}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )
    case 'chevron-up':
      return (
        <svg {...p}>
          <path d="M18 15l-6-6-6 6" />
        </svg>
      )
    case 'male':
      return (
        <svg {...p}>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M19 5l-5.5 5.5M19 5h-5M19 5v5" />
        </svg>
      )
    case 'female':
      return (
        <svg {...p}>
          <circle cx="12" cy="9" r="5" />
          <path d="M12 14v6M9 18h6" />
        </svg>
      )
    case 'alert':
      return (
        <svg {...p}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      )
    default:
      return null
  }
}
