import { ScreenBody } from '@/components/layout/AppShell'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <ScreenBody>{children}</ScreenBody>
}
