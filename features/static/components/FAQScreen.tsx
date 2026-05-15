'use client'

import { useState } from 'react'
import { StaticHeader } from './StaticHeader'
import { Icon } from '@/components/ui/icon'
import { useLang } from '@/lib/i18n/use-lang'
import type { TKey } from '@/lib/i18n/dictionary'

const QA: { q: TKey; a: TKey }[] = [
  { q: 'faq_q1', a: 'faq_a1' },
  { q: 'faq_q2', a: 'faq_a2' },
  { q: 'faq_q3', a: 'faq_a3' },
  { q: 'faq_q4', a: 'faq_a4' },
  { q: 'faq_q5', a: 'faq_a5' },
  { q: 'faq_q6', a: 'faq_a6' },
  { q: 'faq_q7', a: 'faq_a7' },
]

export function FAQScreen() {
  const { t } = useLang()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="flex h-full flex-col">
      <StaticHeader title={t('faq_title')} />
      <div className="scroll-area grid flex-1 gap-2 overflow-auto px-5 pb-10 pt-3">
        {QA.map((item, i) => {
          const isOpen = open === i
          return (
            <div
              key={item.q}
              className="overflow-hidden rounded-[14px] border border-[var(--divider)] bg-[var(--surface)]"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-3 bg-transparent px-4 py-3.5 text-left"
              >
                <span className="flex-1 text-[14.5px] font-semibold leading-snug text-[var(--ink)]">
                  {t(item.q)}
                </span>
                <span
                  className={`shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                >
                  <Icon name="chevron-down" size={18} className="text-[var(--ink-3)]" />
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-[var(--divider)] px-4 pb-4 pt-3">
                  <p className="m-0 text-sm leading-[1.65] text-[var(--ink-2)] [text-wrap:pretty]">
                    {t(item.a)}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
