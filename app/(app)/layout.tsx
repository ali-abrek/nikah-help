import Link from 'next/link'
import { MatchProvider } from '@/features/likes/hooks/MatchProvider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MatchProvider>
      <div className="min-h-full flex flex-col">
        <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/feed" className="text-lg font-bold text-foreground">
              Nikah Help
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/feed" className="text-zinc-600 hover:text-foreground">
                Лента
              </Link>
              <Link href="/likes" className="text-zinc-600 hover:text-foreground">
                Лайки
              </Link>
              <Link href="/dashboard" className="text-zinc-600 hover:text-foreground">
                Профиль
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </MatchProvider>
  )
}
