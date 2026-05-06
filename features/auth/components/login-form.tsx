'use client'

import { useActionState } from 'react'
import { sendMagicLink } from '@/features/auth/actions'
import type { ServerActionResult } from '@/lib/errors/action'

const initialState: ServerActionResult<{ message: string }> | null = null

export function LoginForm() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState)

  if (state?.success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-950">
        <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
          Проверьте почту
        </h3>
        <p className="mt-2 text-sm text-green-700 dark:text-green-300">
          {state.data?.message ?? ''}
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {state?.error?.details?.email && (
          <p className="mt-1 text-xs text-red-500">{state.error.details.email}</p>
        )}
        {!state?.success && state?.error && !state.error.details && (
          <p className="mt-1 text-xs text-red-500">{state.error.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 items-center justify-center rounded-lg bg-primary font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? 'Отправка...' : 'Войти'}
      </button>

      <p className="text-center text-xs text-zinc-500">
        Ссылка для входа будет отправлена на указанный email
      </p>
    </form>
  )
}
