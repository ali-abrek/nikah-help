import { AuthSent } from '@/features/auth/components/auth-sent'

export const metadata = {
  title: 'Проверьте почту — Nikah Help',
}

export default async function AuthSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email = '' } = await searchParams
  return <AuthSent initialEmail={email} />
}
