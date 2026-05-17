'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sendMagicLink } from '@/features/auth/actions'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/chip'
import { Icon } from '@/components/ui/icon'
import { useLang } from '@/lib/i18n/use-lang'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function GuestFeedBanner() {
  const { t } = useLang()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [pending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const valid = EMAIL_RE.test(email)
  const showInputError = touched && email.length > 0 && !valid

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
    <div className="border-b border-[var(--divider)] px-5 pb-5 pt-3">
      <h2 className="m-0 mb-3.5 text-[18px] font-medium leading-[1.3] tracking-[-0.2px] text-[var(--ink-2)] [text-wrap:balance]">
        {t('app_tagline')}
      </h2>

      <div className="mb-[18px] flex flex-wrap gap-[7px]">
        <Tag>{t('guest_intro_p1')}</Tag>
        <Tag>{t('guest_intro_p2')}</Tag>
        <Tag>{t('guest_intro_p3')}</Tag>
        <Tag>{t('guest_intro_p4')}</Tag>
      </div>

      <form
        className="flex flex-col gap-2"
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
            className={`box-border h-[50px] w-full rounded-xl border-[1.5px] bg-[var(--surface)] px-4 text-[15px] text-[var(--ink)] outline-none transition-colors duration-150 ${
              showInputError || serverError
                ? 'border-[var(--danger)]'
                : 'border-[var(--divider-strong)] focus:border-[var(--primary)]'
            }`}
          />
          {(showInputError || serverError) && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--danger)]">
              <Icon name="alert" size={14} />
              {serverError ?? t('auth_email_error')}
            </div>
          )}
        </div>
        <Button kind="primary" size="md" full type="submit" disabled={pending}>
          {pending ? '…' : t('auth_send')}
        </Button>
      </form>

      <p className="mt-2.5 text-[11.5px] leading-[1.5] text-[var(--ink-3)]">
        {t('auth_terms')}
        <Link href="/agreements" className="text-[var(--primary)] underline">
          {t('auth_terms_link')}
        </Link>
        .
      </p>
    </div>
  )
}
