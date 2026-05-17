'use client'

import { Photo as PhotoStream } from '@/features/photos/components/Photo'
import type {
  OnboardingStep1Data,
  OnboardingStep2MaleData,
  OnboardingStep2FemaleData,
} from '../schemas'
import type { WizardPhoto } from './onboarding-step3'

type Props = {
  isPending?: boolean
  step1Data: Partial<OnboardingStep1Data> | null
  step2Data: Partial<OnboardingStep2MaleData | OnboardingStep2FemaleData> | null
  gender: 'male' | 'female'
  photos: WizardPhoto[]
}

// ── Label maps ─────────────────────────────────────────────────────

const maritalLabelsMale: Record<string, string> = {
  single: 'Женат не был',
  divorced: 'Разведён',
  widowed: 'Вдовец',
  married_1: 'Женат на одной',
  married_2: 'Женат на двух',
  married_3: 'Женат на трёх',
}

const maritalLabelsFemale: Record<string, string> = {
  single: 'Замужем не была',
  divorced: 'Разведена',
  widowed: 'Вдова',
}

const childrenLabels: Record<string, string> = {
  '0': 'Детей нет',
  '1': '1 ребёнок',
  '2': '2 ребёнка',
  '3': '3 ребёнка',
  '4': '4 ребёнка',
  '5': '5 или более детей',
}

const incomeLabels: Record<string, string> = {
  low: 'Живу скромно',
  middle: 'Средний достаток',
  high: 'Хорошо обеспечен',
}

const housingLabels: Record<string, string> = {
  rent: 'Арендую',
  apartment: 'Своя квартира',
  house: 'Свой дом',
  parents: 'Живу с родителями',
}

const polygynyLabels: Record<string, string> = {
  positive: 'Положительное',
  negative: 'Отрицательное',
}

const hijabLabels: Record<string, string> = {
  no_hijab: 'Не покрываюсь',
  hijab: 'Ношу хиджаб',
  niqab: 'Ношу никаб',
}

const relocationLabels: Record<string, string> = {
  none: 'Не готова к переезду',
  region: 'Внутри региона',
  country: 'Внутри страны',
  abroad: 'В другую страну',
}

const genderLabels: Record<string, string> = {
  male: 'Мужчина',
  female: 'Женщина',
}

function ageFromBirthDate(birthDate: string): number | null {
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

export function OnboardingStep4({ isPending, step1Data, step2Data, gender, photos }: Props) {
  const s1 = step1Data
  const s2 = step2Data
  const age = s1?.birth_date ? ageFromBirthDate(s1.birth_date) : null
  const sortedPhotos = [...photos].sort((a, b) => a.position - b.position)

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Проверьте введённые данные. После завершения, ИИ создаст вашу анкету, и ваш профиль станет
        доступен в ленте.
      </p>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-medium text-foreground">Ваши данные</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {s1?.name && <SummaryItem label="Имя" value={s1.name} />}
          {age != null && <SummaryItem label="Возраст" value={`${age} лет`} />}
          {s1?.gender && <SummaryItem label="Пол" value={genderLabels[s1.gender] ?? s1.gender} />}
          {s1?.country && <SummaryItem label="Страна" value={s1.country} />}
          {s1?.city && <SummaryItem label="Город" value={s1.city} />}
          {s1?.nationality && <SummaryItem label="Национальность" value={s1.nationality} />}
          {s1?.height != null && <SummaryItem label="Рост" value={`${s1.height} см`} />}
          {s1?.weight != null && <SummaryItem label="Вес" value={`${s1.weight} кг`} />}

          {s2?.marital_status && (
            <SummaryItem
              label="Семейное положение"
              value={
                gender === 'male'
                  ? (maritalLabelsMale[String(s2.marital_status)] ?? String(s2.marital_status))
                  : (maritalLabelsFemale[String(s2.marital_status)] ?? String(s2.marital_status))
              }
            />
          )}

          {s2?.children_count != null && (
            <SummaryItem
              label="Дети"
              value={childrenLabels[String(s2.children_count)] ?? String(s2.children_count)}
            />
          )}

          {gender === 'male' && s2 && 'income_level' in s2 && s2.income_level && (
            <SummaryItem
              label="Уровень дохода"
              value={incomeLabels[String(s2.income_level)] ?? String(s2.income_level)}
            />
          )}

          {gender === 'male' && s2 && 'housing' in s2 && s2.housing && (
            <SummaryItem
              label="Жильё"
              value={housingLabels[String(s2.housing)] ?? String(s2.housing)}
            />
          )}

          {gender === 'female' && s2 && 'willing_to_relocate' in s2 && s2.willing_to_relocate && (
            <SummaryItem
              label="Готовность к переезду"
              value={
                relocationLabels[String(s2.willing_to_relocate)] ?? String(s2.willing_to_relocate)
              }
            />
          )}

          {gender === 'female' && s2 && 'polygyny_attitude' in s2 && s2.polygyny_attitude && (
            <SummaryItem
              label="Отношение к многожёнству"
              value={polygynyLabels[String(s2.polygyny_attitude)] ?? String(s2.polygyny_attitude)}
            />
          )}

          {gender === 'female' && s2 && 'hijab_attitude' in s2 && s2.hijab_attitude && (
            <SummaryItem
              label="Отношение к хиджабу"
              value={hijabLabels[String(s2.hijab_attitude)] ?? String(s2.hijab_attitude)}
            />
          )}
        </dl>

        {s2 && 'about_self' in s2 && s2.about_self && (
          <div className="mt-3">
            <dt className="text-xs text-zinc-500">О себе</dt>
            <dd className="mt-0.5 text-sm text-foreground">{String(s2.about_self)}</dd>
          </div>
        )}

        {sortedPhotos.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs text-zinc-500">Фотографии</div>
            <div className="grid grid-cols-3 gap-2">
              {sortedPhotos.map((p) => (
                <div
                  key={p.id}
                  className="relative aspect-[4/5] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                  {p.localPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- object URL preview
                    <img
                      src={p.localPreview}
                      alt={`Фото ${p.position}`}
                      className="h-full w-full object-cover"
                    />
                  ) : p.uploading ? (
                    <div className="h-full w-full bg-zinc-100 dark:bg-zinc-800" />
                  ) : (
                    <PhotoStream
                      photoId={p.id}
                      variant="cover"
                      alt={`Фото ${p.position}`}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isPending && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <svg className="h-5 w-5 animate-spin text-amber-600" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm text-amber-800 dark:text-amber-200">
            ИИ генерирует вашу анкету...
          </span>
        </div>
      )}
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}
