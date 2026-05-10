'use client'

import { useState, useTransition } from 'react'
import { saveOnboardingStep1, saveOnboardingStep2 } from '../actions'
import { OnboardingStep1 } from './onboarding-step1'
import { OnboardingStep2 } from './onboarding-step2'
import { OnboardingStep3 } from './onboarding-step3'
import { OnboardingStep4 } from './onboarding-step4'

const STEPS = [
  { id: 1, label: 'Основное' },
  { id: 2, label: 'Детали' },
  { id: 3, label: 'Фото' },
  { id: 4, label: 'Обзор' },
]

type ActionResult = Awaited<ReturnType<typeof saveOnboardingStep1>>

export function OnboardingWizard({ locale = 'ru' }: { locale?: string }) {
  const [step, setStep] = useState(1)
  const [gender, setGender] = useState<'male' | 'female' | null>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleStep1Submit = (formData: FormData) => {
    const g = formData.get('gender') as string
    if (g === 'male' || g === 'female') setGender(g)

    startTransition(async () => {
      const res = await saveOnboardingStep1(formData)
      setResult(res)
      if (res.success) setStep(2)
    })
  }

  const handleStep2Submit = (formData: FormData) => {
    startTransition(async () => {
      const res = await saveOnboardingStep2(formData)
      setResult(res)
      if (res.success) setStep(3)
    })
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* Step indicators */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step >= s.id
                  ? 'bg-emerald-600 text-white'
                  : 'border border-zinc-300 text-zinc-500 dark:border-zinc-700'
              }`}
            >
              {step > s.id ? '✓' : s.id}
            </div>
            <span
              className={`text-sm ${
                step >= s.id ? 'text-foreground font-medium' : 'text-zinc-400'
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-2 h-px w-8 ${
                  step > s.id ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 1 && (
        <OnboardingStep1 onSubmit={handleStep1Submit} isPending={isPending} locale={locale} />
      )}

      {step === 2 && gender && (
        <OnboardingStep2
          key="step2"
          gender={gender}
          onSubmit={handleStep2Submit}
          isPending={isPending}
        />
      )}

      {step === 3 && <OnboardingStep3 isPending={isPending} onComplete={() => setStep(4)} />}

      {step === 4 && gender && (
        <OnboardingStep4 isPending={isPending} onResult={(res) => setResult(res)} />
      )}

      {/* Feedback */}
      {result?.success && 'message' in result && result.message && (
        <p className="mt-4 text-center text-sm text-emerald-600">{result.message}</p>
      )}
      {result && !result.success && 'error' in result && (
        <p className="mt-4 text-center text-sm text-red-600">{result.error.message}</p>
      )}

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Назад
        </button>
      </div>
    </div>
  )
}
