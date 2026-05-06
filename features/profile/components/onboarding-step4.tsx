'use client'

import { useState, useTransition } from 'react'
import { completeOnboardingAction } from '../actions'
import { useRouter } from 'next/navigation'
import type { ErrorResponse } from '@/lib/errors/types'

type OnboardingResult =
  | { success: true; message: string; bio: string }
  | { success: false; error: ErrorResponse }

export function OnboardingStep4({
  gender: _gender,
  isPending,
  onResult,
}: {
  gender: 'male' | 'female'
  isPending?: boolean
  onResult?: (result: OnboardingResult) => void
}) {
  const [bio, setBio] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [done, setDone] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const handleSubmit = () => {
    setGenerating(true)
    startTransition(async () => {
      const res = await completeOnboardingAction()
      onResult?.(res as OnboardingResult)
      if (res.success) {
        setDone(true)
        if (res.bio) setBio(res.bio)
        router.push('/feed')
      } else {
        setGenerating(false)
      }
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Проверьте введённые данные. После завершения AI создаст вашу биографию,
        и ваш профиль станет доступен в ленте.
      </p>

      {generating && !bio && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <svg
            className="h-5 w-5 animate-spin text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm text-amber-800 dark:text-amber-200">
            AI генерирует вашу биографию...
          </span>
        </div>
      )}

      {bio && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
          <p className="mb-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Ваша AI-биография
          </p>
          <p className="text-sm text-emerald-800 dark:text-emerald-200">{bio}</p>
        </div>
      )}

      {done && (
        <p className="text-center text-sm text-emerald-600">
          Профиль заполнен! Перенаправляем в ленту...
        </p>
      )}

      {!done && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || generating}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {generating ? 'Создание биографии...' : 'Завершить онбординг'}
        </button>
      )}
    </div>
  )
}
