import { ScreenBody } from '@/components/layout/AppShell'
import { AgreementsScreen } from '@/features/static/components/AgreementsScreen'
import { buildGenericTitle } from '@/lib/seo'

export const metadata = { title: buildGenericTitle('Соглашения', 'ru') }

export default function AgreementsPage() {
  return (
    <ScreenBody>
      <AgreementsScreen />
    </ScreenBody>
  )
}
