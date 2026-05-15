import { ScreenBody } from '@/components/layout/AppShell'
import { AgreementsScreen } from '@/features/static/components/AgreementsScreen'

export const metadata = { title: 'Соглашения — Nikah Help' }

export default function AgreementsPage() {
  return (
    <ScreenBody>
      <AgreementsScreen />
    </ScreenBody>
  )
}
