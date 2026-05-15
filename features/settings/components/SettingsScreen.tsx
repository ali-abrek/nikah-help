'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Header } from '@/components/ui/header'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { SettingsRow, SettingsGroup } from '@/components/ui/settings-row'
import { Toggle } from '@/components/ui/toggle'
import { useLang } from '@/lib/i18n/use-lang'
import type { Lang } from '@/lib/i18n/dictionary'

interface SettingsScreenProps {
  isAuthed: boolean
  isPublished?: boolean
  role?: 'user' | 'admin' | 'moderator' | null
  freeLikesLeft?: number
}

export function SettingsScreen({
  isAuthed,
  isPublished,
  role,
  freeLikesLeft = 2,
}: SettingsScreenProps) {
  const router = useRouter()
  const { t, lang, setLang } = useLang()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [showLogout, setShowLogout] = useState(false)
  const [published, setPublished] = useState(!!isPublished)
  const themeValue = (theme === 'system' ? resolvedTheme : theme) ?? 'light'
  const isStaff = role === 'admin' || role === 'moderator'

  const onPublish = async (next: boolean) => {
    setPublished(next)
    const res = await fetch('/api/profile/toggle-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: next }),
    })
    if (!res.ok) setPublished(!next)
  }

  const onLogout = async () => {
    setShowLogout(false)
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex h-full flex-col">
      <Header title={t('set_title')} leading="back" onLeading={() => router.back()} />
      <div className="scroll-area flex-1 overflow-auto px-5 pb-10">
        {isAuthed && (
          <SettingsGroup>
            <SettingsRow
              icon="user"
              label={t('profile')}
              onClick={() => router.push('/profile')}
              last
            />
          </SettingsGroup>
        )}
        <SettingsGroup>
          <SettingsRow
            icon="globe"
            label={t('set_lang')}
            trailing={
              <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-[3px]">
                {(['ru', 'en'] as Lang[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={`h-7 rounded-md px-3 text-[12.5px] ${
                      lang === l
                        ? 'bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(15,26,31,0.08)]'
                        : 'bg-transparent font-medium text-[var(--ink-3)]'
                    }`}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            }
          />
          <SettingsRow
            icon={themeValue === 'dark' ? 'moon' : 'sun'}
            label={t('set_theme')}
            trailing={
              <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-[3px]">
                {(
                  [
                    { v: 'light', i: 'sun', l: t('set_theme_light') },
                    { v: 'dark', i: 'moon', l: t('set_theme_dark') },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setTheme(opt.v)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] ${
                      themeValue === opt.v
                        ? 'bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(15,26,31,0.08)]'
                        : 'bg-transparent font-medium text-[var(--ink-3)]'
                    }`}
                  >
                    <Icon name={opt.i} size={13} />
                    {opt.l}
                  </button>
                ))}
              </div>
            }
            last
          />
        </SettingsGroup>

        {isAuthed && (
          <SettingsGroup>
            <SettingsRow
              icon="user"
              label={t('set_publish')}
              sub={published ? t('own_published') : t('own_unpublished')}
              trailing={<Toggle on={published} onChange={onPublish} />}
            />
            <Link href="/subscription">
              <SettingsRow
                icon="crown"
                label={t('set_subscription')}
                sub={t('set_subscription_status_free', { n: freeLikesLeft })}
                last
                onClick={() => router.push('/subscription')}
              />
            </Link>
          </SettingsGroup>
        )}

        <SettingsGroup label={t('set_section_about')}>
          <SettingsRow
            icon="sparkle"
            label={t('set_education')}
            onClick={() => router.push('/guide')}
          />
          <SettingsRow icon="help" label={t('set_faq')} onClick={() => router.push('/faq')} />
          <SettingsRow
            icon="shield"
            label={t('set_legal')}
            onClick={() => router.push('/agreements')}
            last
          />
        </SettingsGroup>

        {isStaff && (
          <SettingsGroup label={t('set_section_staff')}>
            {role === 'admin' && (
              <SettingsRow
                icon="gear"
                label={t('set_admin')}
                onClick={() => router.push('/admin')}
              />
            )}
            <SettingsRow
              icon="shield"
              label={t('set_moderation')}
              onClick={() => router.push('/moderation')}
              last
            />
          </SettingsGroup>
        )}

        {isAuthed && (
          <SettingsGroup>
            <SettingsRow
              icon="log-out"
              label={t('set_logout')}
              onClick={() => setShowLogout(true)}
              danger
              last
            />
          </SettingsGroup>
        )}

        <div className="mt-4 text-center text-[11px] text-[var(--ink-3)]">NIKAH HELP · v1.0</div>
      </div>

      <Modal
        open={showLogout}
        onClose={() => setShowLogout(false)}
        title={t('set_logout_confirm')}
        primary={{ label: t('set_logout'), onClick: onLogout }}
        secondary={{ label: t('cancel'), onClick: () => setShowLogout(false) }}
        danger
      >
        {t('set_logout_sub')}
      </Modal>
    </div>
  )
}
