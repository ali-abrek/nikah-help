import { MatchProvider } from '@/features/likes/hooks/MatchProvider'
import { BottomNav } from '@/components/layout/BottomNav'
import { ScreenBody } from '@/components/layout/AppShell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MatchProvider>
      <ScreenBody>{children}</ScreenBody>
      <BottomNav />
    </MatchProvider>
  )
}
