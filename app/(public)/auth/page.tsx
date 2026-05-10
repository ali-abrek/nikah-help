import { LoginForm } from '@/features/auth/components/login-form'
import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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

  if (data?.claims) {
    redirect('/feed')
  }

  const { error: callbackError } = await searchParams

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Nikah Help</h1>
          <p className="mt-2 text-sm text-zinc-500">Войдите, чтобы найти свою вторую половину</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <LoginForm callbackError={callbackError} />
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Нажимая «Войти», вы соглашаетесь с{' '}
          <Link href="/terms" className="underline hover:text-foreground">
            условиями
          </Link>{' '}
          и{' '}
          <Link href="/privacy" className="underline hover:text-foreground">
            политикой конфиденциальности
          </Link>
        </p>
      </div>
    </div>
  )
}
