'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { PhotoSlider } from './PhotoSlider'
import { useMatch } from '@/features/likes/hooks/MatchProvider'
import type { ProfileDetailData } from '../server/get-profile'

function calcAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return age
}

interface ProfileDetailProps {
  profile: ProfileDetailData
  isOwnProfile: boolean
}

export function ProfileDetail({ profile, isOwnProfile }: ProfileDetailProps) {
  const age = profile.birth_date ? calcAge(profile.birth_date) : null
  const showFull = isOwnProfile || profile.viewer_is_match

  return (
    <div className="mx-auto max-w-2xl">
      {/* Photos */}
      <PhotoSlider photos={profile.photos} showFull={showFull} />

      {/* Basic info */}
      <div className="mt-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-foreground">{profile.name}</h1>
          {age != null && <span className="text-xl text-zinc-500">{age} лет</span>}
        </div>

        {(profile.city || profile.country) && (
          <p className="mt-1 text-zinc-500">
            {[profile.city, profile.country].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      {/* AI Bio */}
      {profile.ai_bio && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-2 text-sm font-medium text-zinc-500">О себе</h3>
          <p className="whitespace-pre-wrap text-foreground">{profile.ai_bio}</p>
        </div>
      )}

      {/* About self (raw text) */}
      {profile.about_self && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-2 text-sm font-medium text-zinc-500">Подробнее</h3>
          <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
            {profile.about_self}
          </p>
        </div>
      )}

      {/* Details grid */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        {profile.nationality && <DetailItem label="Национальность" value={profile.nationality} />}
        {profile.height != null && <DetailItem label="Рост" value={`${profile.height} см`} />}
        {profile.weight != null && <DetailItem label="Вес" value={`${profile.weight} кг`} />}
        {profile.marital_status && (
          <DetailItem
            label="Семейное положение"
            value={maritalStatusLabel(profile.marital_status)}
          />
        )}
        {profile.children_count != null && (
          <DetailItem label="Дети" value={String(profile.children_count)} />
        )}
        {profile.education && <DetailItem label="Образование" value={profile.education} />}
        {profile.income_level && (
          <DetailItem label="Уровень дохода" value={incomeLabel(profile.income_level)} />
        )}
        {profile.housing && <DetailItem label="Жильё" value={housingLabel(profile.housing)} />}
        {profile.willing_to_relocate != null && (
          <DetailItem
            label="Готовность к переезду"
            value={profile.willing_to_relocate ? 'Да' : 'Нет'}
          />
        )}
        {profile.polygyny_attitude && (
          <DetailItem
            label="Отношение к многожёнству"
            value={polygynyLabel(profile.polygyny_attitude)}
          />
        )}
        {profile.hijab_attitude && (
          <DetailItem label="Хиджаб" value={hijabLabel(profile.hijab_attitude)} />
        )}
      </div>

      {/* Action buttons */}
      {!isOwnProfile && (
        <div className="mt-8 flex gap-3">
          <LikeButton
            profileId={profile.id}
            hasLiked={profile.viewer_has_liked}
            profile={profile}
          />
          <button
            type="button"
            className={cn(
              'rounded-xl border border-zinc-200 px-6 py-3 text-sm font-medium',
              'text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800',
            )}
          >
            Пожаловаться
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}

function LikeButton({
  profileId,
  hasLiked,
  profile,
}: {
  profileId: string
  hasLiked: boolean
  profile: ProfileDetailData
}) {
  const [liked, setLiked] = useState(hasLiked)
  const [loading, setLoading] = useState(false)
  const { triggerMatch } = useMatch()

  const handleLike = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_user_id: profileId, action: liked ? 'unlike' : 'like' }),
      })
      if (res.ok) {
        const data = await res.json()
        setLiked(!liked)

        // If match was created, show match modal
        if (data.matched) {
          triggerMatch({
            myProfile: null,
            theirProfile: {
              id: profile.id,
              name: profile.name,
              gender: profile.gender,
              photos: profile.photos,
            },
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleLike}
      className={cn(
        'rounded-xl px-6 py-3 text-sm font-medium transition-colors',
        liked
          ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
          : 'bg-primary text-white hover:bg-primary-hover',
      )}
    >
      {liked ? 'Убрать лайк' : 'Лайк'}
    </button>
  )
}

// ── Label helpers ───────────────────────────────────────────────────

function maritalStatusLabel(v: string): string {
  const map: Record<string, string> = {
    single: 'Не в браке',
    divorced: 'Разведён(а)',
    widowed: 'Вдовец/Вдова',
    married_1: 'В браке (1 жена)',
    married_2: 'В браке (2 жены)',
    married_3: 'В браке (3 жены)',
  }
  return map[v] ?? v
}

function incomeLabel(v: string): string {
  const map: Record<string, string> = {
    low: 'Низкий',
    middle: 'Средний',
    high: 'Высокий',
  }
  return map[v] ?? v
}

function housingLabel(v: string): string {
  const map: Record<string, string> = {
    own: 'Своё жильё',
    rent: 'Аренда',
    parents: 'С родителями',
    shared: 'Совместное',
  }
  return map[v] ?? v
}

function polygynyLabel(v: string): string {
  const map: Record<string, string> = {
    positive: 'Положительное',
    neutral: 'Нейтральное',
    negative: 'Отрицательное',
  }
  return map[v] ?? v
}

function hijabLabel(v: string): string {
  const map: Record<string, string> = {
    niqab: 'Никаб',
    hijab_full: 'Хиджаб полностью',
    hijab_partial: 'Хиджаб частично',
    no_hijab: 'Без хиджаба',
  }
  return map[v] ?? v
}
