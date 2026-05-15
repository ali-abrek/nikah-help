import { ScreenBody } from '@/components/layout/AppShell'
import { FAQScreen } from '@/features/static/components/FAQScreen'
import { buildGenericTitle } from '@/lib/seo'

export const metadata = { title: buildGenericTitle('FAQ', 'en') }

export default function FAQPage() {
  return (
    <ScreenBody>
      <FAQScreen />
    </ScreenBody>
  )
}
