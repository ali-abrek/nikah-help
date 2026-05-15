'use client'

import { StaticHeader } from './StaticHeader'
import { useLang } from '@/lib/i18n/use-lang'

export function AgreementsScreen() {
  const { t } = useLang()
  return (
    <div className="flex h-full flex-col">
      <StaticHeader title={t('agreements_title')} />
      <div className="scroll-area flex-1 overflow-auto px-6 pb-10 pt-6">
        <p className="m-0 mb-5 text-[14.5px] leading-relaxed text-[var(--ink-2)] [text-wrap:pretty]">
          {t('agreements_intro')}
        </p>
        <div className="mb-6 grid gap-2.5">
          {(
            ['agreements_doc1', 'agreements_doc2', 'agreements_doc3', 'agreements_doc4'] as const
          ).map((k, i) => (
            <div
              key={k}
              className="flex items-start gap-3 rounded-xl border border-[var(--divider)] bg-[var(--surface)] px-4 py-3.5"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-[var(--ink)]">{t(k)}</span>
            </div>
          ))}
        </div>
        <p className="m-0 text-[13.5px] italic leading-relaxed text-[var(--ink-3)] [text-wrap:pretty]">
          {t('agreements_footer')}
        </p>
      </div>
    </div>
  )
}
