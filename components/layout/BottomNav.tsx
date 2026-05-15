'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from '@/components/ui/icon'
import { useLang } from '@/lib/i18n/use-lang'

interface BottomNavBadges {
  chats?: number
  likes?: number
  notifications?: number
}

interface NavItemDef {
  href: string
  icon: IconName
  labelKey: 'nav_feed' | 'nav_chats' | 'nav_likes' | 'nav_notifications'
  match: (pathname: string) => boolean
  badgeKey?: keyof BottomNavBadges
}

const ITEMS: NavItemDef[] = [
  {
    href: '/feed',
    icon: 'feed',
    labelKey: 'nav_feed',
    match: (p) => p === '/feed' || p.startsWith('/feed/'),
  },
  {
    href: '/chats',
    icon: 'chat',
    labelKey: 'nav_chats',
    match: (p) => p.startsWith('/chats'),
    badgeKey: 'chats',
  },
  {
    href: '/likes',
    icon: 'heart',
    labelKey: 'nav_likes',
    match: (p) => p.startsWith('/likes'),
    badgeKey: 'likes',
  },
  {
    href: '/notifications',
    icon: 'bell',
    labelKey: 'nav_notifications',
    match: (p) => p.startsWith('/notifications'),
    badgeKey: 'notifications',
  },
]

const TAB_ROOTS = new Set(['/feed', '/chats', '/likes', '/notifications'])

export function BottomNav({ badges }: { badges?: BottomNavBadges }) {
  const pathname = usePathname() ?? ''
  const { t } = useLang()

  // Show bottom nav only on the four top-level tabs. On nested routes
  // (chat detail, profile detail, settings, filters, onboarding) the nav
  // hides so the screen can use the full height — matches the design.
  if (!TAB_ROOTS.has(pathname)) return null

  return (
    <nav
      className="grid shrink-0 grid-cols-4 border-t border-[var(--divider)] bg-[var(--bg)]"
      style={{ padding: '6px 6px calc(6px + var(--safe-bottom))' }}
    >
      {ITEMS.map((item) => {
        const active = item.match(pathname)
        const badge = item.badgeKey ? badges?.[item.badgeKey] : undefined
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'relative flex flex-col items-center gap-0.5 py-1.5 text-[10.5px] tracking-[0.1px]',
              '[-webkit-tap-highlight-color:transparent]',
              active ? 'font-semibold text-[var(--primary)]' : 'font-medium text-[var(--ink-3)]',
            )}
          >
            <span className="relative">
              <Icon name={item.icon} size={22} strokeWidth={active ? 2 : 1.6} />
              {badge !== undefined && badge > 0 && (
                <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold leading-none text-white shadow-[0_0_0_2px_var(--bg)]">
                  {badge}
                </span>
              )}
            </span>
            <span>{t(item.labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
