import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { AuthScreen } from '@/features/auth/components/auth-screen'

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed:
    'Не удалось подтвердить ссылку. Возможно, срок её действия истёк. Запросите новую.',
  AUTH_UNAUTHORIZED: 'Войдите, чтобы продолжить.',
}

export const metadata = {
  title: 'Вход — Nikah Help',
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  if (data?.claims) redirect('/feed')

  const { error: code } = await searchParams
  const message = code ? (CALLBACK_ERROR_MESSAGES[code] ?? code) : undefined
  return <AuthScreen callbackError={message} />
}
