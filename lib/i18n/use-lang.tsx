'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { translate, type Lang, type TKey } from './dictionary'

interface LangCtx {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TKey, vars?: Record<string, string | number>) => string
}

const LangContext = createContext<LangCtx | null>(null)

const STORAGE_KEY = 'nh_lang'

function detectClientLang(): Lang {
  if (typeof window === 'undefined') return 'ru'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'ru' || stored === 'en') return stored
  const nav = navigator.language?.toLowerCase() ?? 'ru'
  return nav.startsWith('en') ? 'en' : 'ru'
}

const subscribe = () => () => {}

export function LangProvider({
  children,
  initialLang,
}: {
  children: ReactNode
  initialLang?: Lang
}) {
  // `useSyncExternalStore` lets us read the persisted preference during
  // hydration without a useEffect + setState cascade. The snapshot function
  // runs on the client; the server snapshot returns `initialLang ?? 'ru'`.
  const [override, setOverride] = useState<Lang | null>(null)
  const detected = useSyncExternalStore<Lang>(
    subscribe,
    () => detectClientLang(),
    () => initialLang ?? 'ru',
  )
  const lang = override ?? detected

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setOverride(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
      document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`
    }
  }, [])

  const value = useMemo<LangCtx>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within <LangProvider>')
  return ctx
}

/** Tiny date helper used in chat/feed tiles. */
export function formatRelative(spec: string | null | undefined, lang: Lang): string {
  if (!spec) return ''
  const [k, v = ''] = spec.split(':')
  if (k === 'min') return translate(lang, 'min_ago', { n: v })
  if (k === 'hr') return translate(lang, 'hr_ago', { n: v })
  if (k === 'd')
    return v === '1' ? translate(lang, 'yesterday') : `${v}${lang === 'ru' ? ' д' : 'd'}`
  return spec
}
