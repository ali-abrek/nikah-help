import { ScreenBody } from '@/components/layout/AppShell'
import { GuideScreen } from '@/features/static/components/GuideScreen'

export const metadata = { title: 'Инструкция — Nikah Help' }

export default function GuidePage() {
  return (
    <ScreenBody>
      <GuideScreen />
    </ScreenBody>
  )
}
