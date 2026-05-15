'use client'

import { StaticHeader } from './StaticHeader'
import { Icon, type IconName } from '@/components/ui/icon'
import { useLang } from '@/lib/i18n/use-lang'
import type { TKey } from '@/lib/i18n/dictionary'

const SECTIONS: { icon: IconName; titleKey: TKey; bodyKey: TKey }[] = [
  { icon: 'user', titleKey: 'guide_1_t', bodyKey: 'guide_1_b' },
  { icon: 'sliders', titleKey: 'guide_2_t', bodyKey: 'guide_2_b' },
  { icon: 'heart', titleKey: 'guide_3_t', bodyKey: 'guide_3_b' },
  { icon: 'chat', titleKey: 'guide_4_t', bodyKey: 'guide_4_b' },
  { icon: 'shield', titleKey: 'guide_5_t', bodyKey: 'guide_5_b' },
]

export function GuideScreen() {
  const { t } = useLang()
  return (
    <div className="flex h-full flex-col">
      <StaticHeader title={t('guide_title')} />
      <div className="scroll-area grid flex-1 gap-3.5 overflow-auto px-5 pb-10 pt-5">
        {SECTIONS.map((s) => (
          <div
            key={s.titleKey}
            className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface)] px-[18px] py-4"
          >
            <div className="mb-2.5 flex items-center gap-2.5">
              <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--primary-soft)] text-[var(--primary)]">
                <Icon name={s.icon} size={18} />
              </div>
              <div className="text-[15px] font-semibold text-[var(--ink)]">{t(s.titleKey)}</div>
            </div>
            <p className="m-0 text-sm leading-[1.65] text-[var(--ink-2)] [text-wrap:pretty]">
              {t(s.bodyKey)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
