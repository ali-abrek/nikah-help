'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sendMagicLink } from '@/features/auth/actions'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tag } from '@/components/ui/chip'
import { useLang } from '@/lib/i18n/use-lang'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AuthScreen({ callbackError }: { callbackError?: string }) {
  const { t } = useLang()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [pending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const valid = EMAIL_RE.test(email)
  const showError = touched && email.length > 0 && !valid

  const submit = () => {
    setTouched(true)
    setServerError(null)
    if (!valid) return
    const fd = new FormData()
    fd.set('email', email)
    startTransition(async () => {
      const res = await sendMagicLink(null, fd)
      if (res?.success) {
        router.push(`/auth/sent?email=${encodeURIComponent(email)}`)
      } else {
        setServerError(res?.error?.message ?? t('auth_email_error'))
      }
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-2 pt-3.5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full text-[var(--ink)]"
        >
          <Icon name="back" size={22} />
        </button>
        <h1 className="m-0 text-[22px] font-bold tracking-[1px] text-[var(--ink)]">
          {t('app_name')}
        </h1>
        <div className="w-10" aria-hidden />
      </div>

      <div className="flex-1 overflow-auto px-6 pb-10 pt-3">
        <h2 className="m-0 mb-4 mt-2 text-[22px] font-semibold leading-[1.2] tracking-[-0.4px] text-[var(--ink)] [text-wrap:balance]">
          {t('app_tagline')}
        </h2>

        <div className="mb-7 flex flex-wrap gap-2">
          <Tag>{t('guest_intro_p1')}</Tag>
          <Tag>{t('guest_intro_p2')}</Tag>
          <Tag>{t('guest_intro_p3')}</Tag>
          <Tag>{t('guest_intro_p4')}</Tag>
        </div>

        {callbackError && !serverError && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/5 px-3.5 py-3 text-[13px] text-[var(--danger)]">
            <Icon name="alert" size={14} className="mt-0.5" />
            <span>{callbackError}</span>
          </div>
        )}

        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setTouched(false)
                setServerError(null)
              }}
              onBlur={() => setTouched(true)}
              placeholder={t('auth_email_ph')}
              className={`box-border h-[52px] w-full rounded-[14px] border-[1.5px] bg-[var(--surface)] px-4 text-[15px] text-[var(--ink)] outline-none transition-colors duration-150 ${
                showError || serverError
                  ? 'border-[var(--danger)]'
                  : 'border-[var(--divider-strong)] focus:border-[var(--primary)]'
              }`}
            />
            {(showError || serverError) && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--danger)]">
                <Icon name="alert" size={14} />
                {serverError ?? t('auth_email_error')}
              </div>
            )}
          </div>
          <Button kind="primary" size="lg" full type="submit" disabled={pending}>
            {pending ? '…' : t('auth_send')}
          </Button>
        </form>

        <p className="mt-4 text-xs leading-[1.55] text-[var(--ink-3)]">
          {t('auth_terms')}
          <Link href="/agreements" className="text-[var(--primary)] underline">
            {t('auth_terms_link')}
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
