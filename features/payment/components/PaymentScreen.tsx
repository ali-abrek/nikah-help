'use client'

import { StaticHeader } from '@/features/static/components/StaticHeader'
import { useLang } from '@/lib/i18n/use-lang'

export function PaymentScreen() {
  const { t } = useLang()
  return (
    <div className="flex h-full flex-col">
      <StaticHeader title={t('payment_title')} />
      <div className="grid flex-1 place-items-center p-10 text-center">
        <div>
          <div className="mx-auto mb-5 grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-[var(--primary-soft)] text-[34px] text-[var(--primary)]">
            ₽
          </div>
          <p className="m-0 text-base text-[var(--ink-2)]">{t('payment_stub')}</p>
        </div>
      </div>
    </div>
  )
}
