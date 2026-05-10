import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata = {
  title: 'Дашборд — Nikah Help',
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    redirect('/auth')
  }

  const userId = data.claims.sub as string

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role, onboarding_completed')
    .eq('id', userId)
    .single()

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-foreground">Дашборд</h1>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Email</span>
            <span className="font-medium text-foreground">{profile?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Роль</span>
            <span className="font-medium text-foreground">{profile?.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Онбординг</span>
            <span className="font-medium text-foreground">
              {profile?.onboarding_completed ? 'Завершён' : 'Не завершён'}
            </span>
          </div>
        </div>

        {!profile?.onboarding_completed && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Завершите{' '}
            <Link href="/onboarding" className="underline hover:text-amber-900 dark:hover:text-amber-100">
              регистрацию
            </Link>
            , чтобы ваш профиль стал видимым
          </div>
        )}
      </div>

      <form action="/api/auth/signout" method="POST" className="mt-4">
        <button type="submit" className="text-sm text-zinc-500 underline hover:text-foreground">
          Выйти
        </button>
      </form>
    </div>
  )
}
