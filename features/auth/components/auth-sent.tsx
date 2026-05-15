'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendMagicLink } from '@/features/auth/actions'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { TextInput } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useLang } from '@/lib/i18n/use-lang'

interface AuthSentProps {
  initialEmail: string
}

export function AuthSent({ initialEmail }: AuthSentProps) {
  const { t } = useLang()
  const router = useRouter()
  const toast = useToast()
  const [email, setEmail] = useState(initialEmail)
  const [showChange, setShowChange] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [pending, startTransition] = useTransition()

  const resend = (to: string) => {
    const fd = new FormData()
    fd.set('email', to)
    startTransition(async () => {
      const res = await sendMagicLink(null, fd)
      if (res?.success) {
        toast.show(t('email_sent_toast'))
      } else {
        toast.show(res?.error?.message ?? t('auth_email_error'))
      }
    })
  }

  const submitNewEmail = () => {
    if (!newEmail.includes('@')) return
    setEmail(newEmail)
    setShowChange(false)
    resend(newEmail)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-center px-5 pb-2 pt-3.5">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="bg-transparent p-0"
        >
          <h1 className="m-0 text-[22px] font-bold tracking-[1px] text-[var(--ink)]">
            {t('app_name')}
          </h1>
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center px-7 pb-10 pt-6 text-center">
        <div className="mx-auto mb-6 mt-2 grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-[var(--primary-soft)] text-[var(--primary)]">
          <Icon name="mail" size={32} strokeWidth={1.5} />
        </div>
        <h2 className="mb-3.5 text-[26px] font-semibold tracking-[-0.5px] text-[var(--ink)]">
          {t('auth_sent_title')}
        </h2>
        <p className="mx-auto mb-3 max-w-[300px] text-[14.5px] leading-relaxed text-[var(--ink-2)] [text-wrap:pretty]">
          {t('auth_sent_sub')}
        </p>
        {email && (
          <p className="mb-2 text-[13.5px] font-medium text-[var(--ink)]">{email}</p>
        )}
        <p className="mx-auto mb-8 max-w-[300px] text-[13px] leading-snug text-[var(--ink-3)] [text-wrap:pretty]">
          {t('auth_sent_spam')}
        </p>
        <div className="grid w-full max-w-[340px] gap-2.5">
          <Button kind="primary" full size="md" onClick={() => resend(email)} disabled={pending}>
            {t('auth_resend')}
          </Button>
          <Button kind="ghost" full size="md" onClick={() => setShowChange(true)}>
            {t('auth_change_email')}
          </Button>
        </div>
      </div>

      <Modal
        open={showChange}
        onClose={() => setShowChange(false)}
        title={t('auth_change_email_title')}
        primary={{ label: t('save'), onClick: submitNewEmail }}
        secondary={{ label: t('cancel'), onClick: () => setShowChange(false) }}
      >
        <div className="mt-2">
          <TextInput
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder={t('auth_email_ph')}
            type="email"
          />
        </div>
      </Modal>
    </div>
  )
}
