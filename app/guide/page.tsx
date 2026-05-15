import { ScreenBody } from '@/components/layout/AppShell'
import { GuideScreen } from '@/features/static/components/GuideScreen'
import { buildGenericTitle } from '@/lib/seo'

export const metadata = { title: buildGenericTitle('Инструкция', 'ru') }

export default function GuidePage() {
  return (
    <ScreenBody>
      <GuideScreen />
    </ScreenBody>
  )
}
