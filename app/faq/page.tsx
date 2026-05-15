import { ScreenBody } from '@/components/layout/AppShell'
import { FAQScreen } from '@/features/static/components/FAQScreen'

export const metadata = { title: 'FAQ — Nikah Help' }

export default function FAQPage() {
  return (
    <ScreenBody>
      <FAQScreen />
    </ScreenBody>
  )
}
