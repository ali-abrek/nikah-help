import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold text-foreground">Nikah Help</h1>
        <p className="mt-3 text-zinc-500">Мусульманская платформа для создания семьи</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/auth"
            className="flex h-11 items-center justify-center rounded-lg bg-primary font-medium text-white transition-colors hover:bg-primary-hover"
          >
            Войти
          </Link>
          <Link
            href="/dashboard"
            className="flex h-11 items-center justify-center rounded-lg border border-zinc-200 font-medium text-foreground transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Дашборд
          </Link>
        </div>
      </div>
    </div>
  )
}
