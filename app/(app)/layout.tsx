import { MatchProvider } from '@/features/likes/hooks/MatchProvider'
import { BottomNav } from '@/components/layout/BottomNav'
import { ScreenBody } from '@/components/layout/AppShell'
import { NotificationToaster } from '@/features/notifications/components/NotificationToaster'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MatchProvider>
      <NotificationToaster />
      <ScreenBody>{children}</ScreenBody>
      <BottomNav />
    </MatchProvider>
  )
}
