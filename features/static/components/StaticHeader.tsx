'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icon'

export function StaticHeader({ title }: { title: string }) {
  const router = useRouter()
  return (
    <div className="sticky top-0 z-10 flex min-h-[56px] items-center border-b border-[var(--divider)] bg-[var(--bg)] px-3 py-2">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Back"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--ink)]"
      >
        <Icon name="back" size={22} />
      </button>
      <h1 className="m-0 flex-1 text-center text-[20px] font-semibold text-[var(--ink)]">
        {title}
      </h1>
      <div className="w-10 shrink-0" aria-hidden />
    </div>
  )
}
