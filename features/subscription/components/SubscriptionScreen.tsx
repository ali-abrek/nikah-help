'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { StickyActions } from '@/components/ui/header'
import { useLang } from '@/lib/i18n/use-lang'

interface SubscriptionScreenProps {
  gender: 'male' | 'female' | null
}

export function SubscriptionScreen({ gender }: SubscriptionScreenProps) {
  const { t } = useLang()
  const router = useRouter()
  const [plan, setPlan] = useState<'month' | 'quarter'>('month')
  const isFemale = gender === 'female'

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex min-h-[56px] items-center gap-2 border-b border-[var(--divider)] bg-[var(--bg)] px-3 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--ink)]"
        >
          <Icon name="back" size={22} />
        </button>
        <h1 className="m-0 flex-1 text-[22px] font-bold uppercase tracking-[0.5px] text-[var(--ink)]">
          {t('sub_title')}
        </h1>
      </div>

      <div className="scroll-area flex-1 overflow-auto px-6 pb-24 pt-5">
        <p className="m-0 mb-6 text-[15px] leading-relaxed text-[var(--ink-2)] [text-wrap:pretty]">
          {t('sub_sub')}
        </p>

        {isFemale ? (
          <div className="mb-6 rounded-2xl border border-[var(--primary-faint)] bg-[var(--primary-soft)] px-5 py-5">
            <p className="m-0 text-base font-semibold leading-relaxed text-[var(--primary)] [text-wrap:pretty]">
              {t('sub_free_women')}
            </p>
          </div>
        ) : (
          <>
            <p className="m-0 mb-2.5 text-[12.5px] font-semibold uppercase tracking-[0.6px] text-[var(--ink-3)]">
              {t('sub_get')}
            </p>
            <div className="mb-6 grid gap-2">
              {(
                [
                  { k: 'sub_b1', i: 'heart' },
                  { k: 'sub_b2', i: 'chat' },
                ] as const
              ).map((b) => (
                <div
                  key={b.k}
                  className="flex items-center gap-3 rounded-xl border border-[var(--divider)] bg-[var(--surface)] px-4 py-3.5"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Icon name={b.i} size={16} />
                  </div>
                  <span className="text-[14.5px] font-medium">{t(b.k)}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-2.5">
              <PlanCard
                active={plan === 'month'}
                onClick={() => setPlan('month')}
                title={t('sub_plan_month')}
                price="1 000 ₽"
                sub={t('sub_month')}
              />
              <PlanCard
                active={plan === 'quarter'}
                onClick={() => setPlan('quarter')}
                title={t('sub_plan_quarter')}
                price="2 000 ₽"
                sub={t('sub_month')}
                badge={t('sub_plan_save')}
              />
            </div>
          </>
        )}
      </div>

      <StickyActions>
        <Button
          kind="primary"
          full
          size="lg"
          onClick={() => router.push(isFemale ? '/feed' : '/payment')}
        >
          {isFemale ? t('sub_continue') : t('sub_pay')}
        </Button>
      </StickyActions>
    </div>
  )
}

function PlanCard({
  active,
  onClick,
  title,
  price,
  sub,
  badge,
}: {
  active: boolean
  onClick: () => void
  title: string
  price: string
  sub: string
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-2xl border-[1.5px] px-[18px] py-4 text-left transition-colors ${
        active
          ? 'border-[var(--primary)] bg-[var(--primary-faint)]'
          : 'border-[var(--divider-strong)] bg-[var(--surface)]'
      }`}
    >
      <div>
        <div className="text-[15.5px] font-semibold text-[var(--ink)]">{title}</div>
        {badge && (
          <span className="mt-1 inline-block rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold text-white">
            {badge}
          </span>
        )}
      </div>
      <div className="text-right">
        <div className="text-lg font-bold text-[var(--ink)]">{price}</div>
        <div className="text-[11.5px] text-[var(--ink-3)]">{sub}</div>
      </div>
    </button>
  )
}
