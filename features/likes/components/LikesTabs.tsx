'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

type Tab = 'incoming' | 'outgoing' | 'matches'

interface TabConfig {
  key: Tab
  label: string
  count: number
}

interface LikeProfileData {
  id: string
  name: string | null
  gender: string | null
  age: number | null
  city: string | null
  photo_url: string | null
  liked_at?: string | null
  match_id?: string
  matched_at?: string | null
}

interface LikesTabsProps {
  incoming: LikeProfileData[]
  outgoing: LikeProfileData[]
  matches: LikeProfileData[]
}

export function LikesTabs({ incoming, outgoing, matches }: LikesTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('incoming')

  const tabs: TabConfig[] = [
    { key: 'incoming', label: 'Лайкнули вас', count: incoming.length },
    { key: 'outgoing', label: 'Вы лайкнули', count: outgoing.length },
    { key: 'matches', label: 'Мэтчи', count: matches.length },
  ]

  const data = activeTab === 'incoming' ? incoming : activeTab === 'outgoing' ? outgoing : matches

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-zinc-500 hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {data.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          data.map((profile) => (
            <ProfileRow key={profile.id} profile={profile} tab={activeTab} />
          ))
        )}
      </div>
    </div>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, string> = {
    incoming: 'Пока никто не лайкнул ваш профиль',
    outgoing: 'Вы пока никого не лайкнули',
    matches: 'У вас пока нет мэтчей',
  }

  return (
    <div className="py-16 text-center text-zinc-500">
      <p>{messages[tab]}</p>
    </div>
  )
}

function ProfileRow({ profile, tab }: { profile: LikeProfileData; tab: Tab }) {
  const dateStr = profile.liked_at ?? profile.matched_at
  const timestamp = dateStr ? new Date(dateStr).toLocaleDateString('ru-RU') : ''

  return (
    <a
      href={`/profile/${profile.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
    >
      {/* Avatar */}
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        {profile.photo_url ? (
          <img
            src={`/api/photos/stream/${profile.id}/${profile.photo_url}`}
            alt={profile.name ?? ''}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">
            {profile.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {profile.name ?? 'Без имени'}
          </span>
          {profile.age != null && (
            <span className="text-xs text-zinc-500">{profile.age} л.</span>
          )}
        </div>
        {profile.city && (
          <p className="truncate text-xs text-zinc-500">{profile.city}</p>
        )}
      </div>

      {/* Time */}
      {timestamp && (
        <span className="shrink-0 text-xs text-zinc-400">{timestamp}</span>
      )}

      {/* Chat button for matches */}
      {tab === 'matches' && profile.match_id && (
        <a
          href={`/chats/${profile.match_id}`}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
          onClick={(e) => e.stopPropagation()}
        >
          Чат
        </a>
      )}
    </a>
  )
}
