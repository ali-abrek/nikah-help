import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { ScreenBody } from '@/components/layout/AppShell'
import { PaymentScreen } from '@/features/payment/components/PaymentScreen'

export const metadata = { title: 'Оплата — Nikah Help' }

export default async function PaymentPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null
  if (!userId) redirect('/auth')

  return (
    <ScreenBody>
      <PaymentScreen />
    </ScreenBody>
  )
}
