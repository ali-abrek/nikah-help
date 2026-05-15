'use client'

import { useState, useTransition } from 'react'
import { saveOnboardingStep1, saveOnboardingStep2, completeOnboardingAction } from '../actions'
import { OnboardingStep1 } from './onboarding-step1'
import { OnboardingStep2 } from './onboarding-step2'
import { OnboardingStep3 } from './onboarding-step3'
import { OnboardingStep4 } from './onboarding-step4'
import { Button } from '@/components/ui/button'
import { StickyActions } from '@/components/ui/header'
import { Logo } from '@/components/ui/logo'
import { useLang } from '@/lib/i18n/use-lang'
import type {
  OnboardingStep1Data,
  OnboardingStep2MaleData,
  OnboardingStep2FemaleData,
} from '../schemas'

type ActionResult = Awaited<ReturnType<typeof saveOnboardingStep1>>

/**
 * Re-skinned onboarding shell using the Forest design's chrome:
 * a step counter + progress bar at the top, sticky Back/Next actions at the
 * bottom. The internal step forms keep using react-hook-form + the existing
 * Server Actions so the data flow is untouched.
 */
export function OnboardingWizard({ locale = 'ru' }: { locale?: string }) {
  const { t } = useLang()
  const [step, setStep] = useState(1)
  const [gender, setGender] = useState<'male' | 'female' | null>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [step1Data, setStep1Data] = useState<Partial<OnboardingStep1Data> | null>(null)
  const [step2Data, setStep2Data] = useState<Partial<
    OnboardingStep2MaleData | OnboardingStep2FemaleData
  > | null>(null)
  const [submittingStep, setSubmittingStep] = useState<number | null>(null)

  const handleStep1Submit = (formData: FormData) => {
    const g = formData.get('gender') as string
    if (g === 'male' || g === 'female') setGender(g)
    const captured: Record<string, unknown> = {}
    formData.forEach((value, key) => {
      if (key === 'height' || key === 'weight') captured[key] = Number(value)
      else if (key === 'allow_geolocation') captured[key] = value === 'true' || value === 'on'
      else captured[key] = value
    })
    setStep1Data(captured as Partial<OnboardingStep1Data>)
    setSubmittingStep(1)
    startTransition(async () => {
      const res = await saveOnboardingStep1(formData)
      setResult(res)
      setSubmittingStep(null)
      if (res.success) setStep(2)
    })
  }

  const handleStep2Submit = (formData: FormData) => {
    const captured: Record<string, unknown> = {}
    formData.forEach((value, key) => {
      if (key === 'children_count') captured[key] = Number(value)
      else captured[key] = value
    })
    setStep2Data(captured as Partial<OnboardingStep2MaleData | OnboardingStep2FemaleData>)
    setSubmittingStep(2)
    startTransition(async () => {
      const res = await saveOnboardingStep2(formData)
      setResult(res)
      setSubmittingStep(null)
      if (res.success) setStep(3)
    })
  }

  const submitStepForm = (n: number) => {
    const form = document.getElementById(`ob-step-${n}`) as HTMLFormElement | null
    form?.requestSubmit()
  }

  const handleNext = () => {
    if (step === 1) submitStepForm(1)
    else if (step === 2) submitStepForm(2)
    else if (step === 3) setStep(4)
    else if (step === 4) {
      setSubmittingStep(4)
      startTransition(async () => {
        await completeOnboardingAction()
        setSubmittingStep(null)
        // redirect handled server-side by completeOnboarding
        window.location.href = '/feed'
      })
    }
  }

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1)
  }

  const progressPct = (step / 4) * 100

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium uppercase tracking-[0.4px] text-[var(--ink-3)]">
            {t('ob_step', { n: step })}
          </span>
          <Logo size={20} />
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--divider)]">
          <div
            className="h-full bg-[var(--primary)] transition-[width] duration-300"
            style={{
              width: `${progressPct}%`,
              transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)',
            }}
          />
        </div>
      </div>

      <div className="scroll-area flex-1 overflow-auto px-5 pb-5 pt-3">
        {step === 1 && (
          <OnboardingStep1
            onSubmit={handleStep1Submit}
            defaultValues={step1Data ?? undefined}
            isPending={isPending && submittingStep === 1}
            locale={locale}
          />
        )}
        {step === 2 && gender && (
          <OnboardingStep2
            key="step2"
            gender={gender}
            onSubmit={handleStep2Submit}
            defaultValues={step2Data ?? undefined}
            isPending={isPending && submittingStep === 2}
          />
        )}
        {step === 3 && <OnboardingStep3 isPending={isPending} onComplete={() => setStep(4)} />}
        {step === 4 && gender && (
          <OnboardingStep4
            isPending={isPending}
            step1Data={step1Data}
            step2Data={step2Data}
            gender={gender}
            onResult={(res) => setResult(res)}
          />
        )}

        {result && !result.success && 'error' in result && (
          <p className="mt-4 text-center text-sm text-[var(--danger)]">{result.error.message}</p>
        )}
      </div>

      <StickyActions>
        <Button kind="soft" size="lg" full onClick={handleBack} disabled={step === 1 || isPending}>
          {t('ob_back')}
        </Button>
        <Button kind="primary" size="lg" full onClick={handleNext} disabled={isPending}>
          {step === 4 ? t('ob_save') : t('ob_next')}
        </Button>
      </StickyActions>
    </div>
  )
}
