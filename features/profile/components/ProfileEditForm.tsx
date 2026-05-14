'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { saveOnboardingStep1, saveOnboardingStep2 } from '../actions'

interface ProfileEditFormProps {
  profile: Record<string, unknown>
}

export function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  // Section 1: Basic data
  const [name, setName] = useState(String(profile.name ?? ''))
  const [city, setCity] = useState(String(profile.city ?? ''))
  const [nationality, setNationality] = useState(String(profile.nationality ?? ''))
  const [height, setHeight] = useState(profile.height != null ? String(profile.height) : '')
  const [weight, setWeight] = useState(profile.weight != null ? String(profile.weight) : '')
  const [allowGeolocation, setAllowGeolocation] = useState(profile.allow_geolocation === true)

  // Section 2: Extended
  const [maritalStatus, setMaritalStatus] = useState(String(profile.marital_status ?? ''))
  const [childrenCount, setChildrenCount] = useState(
    profile.children_count != null ? String(profile.children_count) : '',
  )
  const [incomeLevel, setIncomeLevel] = useState(String(profile.income_level ?? ''))
  const [housing, setHousing] = useState(String(profile.housing ?? ''))
  const [willingToRelocate, setWillingToRelocate] = useState(
    String(profile.willing_to_relocate ?? ''),
  )
  const [polygynyAttitude, setPolygynyAttitude] = useState(String(profile.polygyny_attitude ?? ''))
  const [hijabAttitude, setHijabAttitude] = useState(String(profile.hijab_attitude ?? ''))
  const [aboutSelf, setAboutSelf] = useState(String(profile.about_self ?? ''))

  const gender = String(profile.gender ?? 'male')
  const isMale = gender === 'male'

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSaving(true)
      setMessage('')

      try {
        // Save step 1
        const fd1 = new FormData()
        fd1.set('name', name)
        fd1.set('birth_date', String(profile.birth_date ?? ''))
        fd1.set('gender', gender)
        fd1.set('country', String(profile.country ?? ''))
        fd1.set('city', city)
        fd1.set('nationality', nationality)
        fd1.set('height', height)
        fd1.set('weight', weight)
        fd1.set('allow_geolocation', String(allowGeolocation))

        const r1 = await saveOnboardingStep1(fd1)
        if (!r1.success) {
          setMessage(r1.error?.message ?? 'Ошибка сохранения основных данных')
          setMessageType('error')
          return
        }

        // Save step 2
        const fd2 = new FormData()
        fd2.set('gender', gender)
        fd2.set('marital_status', maritalStatus)
        fd2.set('children_count', childrenCount)
        fd2.set('about_self', aboutSelf)
        if (isMale) {
          fd2.set('income_level', incomeLevel)
          fd2.set('housing', housing)
        } else {
          fd2.set('willing_to_relocate', willingToRelocate)
          fd2.set('polygyny_attitude', polygynyAttitude)
          fd2.set('hijab_attitude', hijabAttitude)
        }

        const r2 = await saveOnboardingStep2(fd2)
        if (!r2.success) {
          setMessage(r2.error?.message ?? 'Ошибка сохранения дополнительных данных')
          setMessageType('error')
          return
        }

        setMessage('Профиль обновлён')
        setMessageType('success')
        router.refresh()
      } catch {
        setMessage('Не удалось сохранить профиль')
        setMessageType('error')
      } finally {
        setSaving(false)
      }
    },
    [
      name,
      city,
      nationality,
      height,
      weight,
      allowGeolocation,
      maritalStatus,
      childrenCount,
      incomeLevel,
      housing,
      willingToRelocate,
      polygynyAttitude,
      hijabAttitude,
      aboutSelf,
      gender,
      isMale,
      profile,
      router,
    ],
  )

  return (
    <form onSubmit={handleSave} className="space-y-10">
      {/* Section 1: Basic Data */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">1. Основные данные</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Имя" value={name} onChange={setName} required />
          <Field label="Пол" value={gender === 'male' ? 'Мужской' : 'Женский'} disabled />
          <Field label="Город" value={city} onChange={setCity} />
          <Field label="Национальность" value={nationality} onChange={setNationality} />
          <Field label="Рост (см)" value={height} onChange={setHeight} type="number" />
          <Field label="Вес (кг)" value={weight} onChange={setWeight} type="number" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Разрешить геолокацию для поиска поблизости
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={allowGeolocation}
            onClick={() => setAllowGeolocation((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              allowGeolocation ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                allowGeolocation ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Section 2: Extended Data */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">2. Дополнительная информация</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Семейное положение"
            value={maritalStatus}
            onChange={setMaritalStatus}
            options={isMale ? MARITAL_STATUS_OPTIONS_MALE : MARITAL_STATUS_OPTIONS_FEMALE}
          />
          <SelectField
            label="Дети"
            value={childrenCount}
            onChange={setChildrenCount}
            options={CHILDREN_OPTIONS}
          />
          {!isMale && (
            <>
              <SelectField
                label="Отношение к многожёнству"
                value={polygynyAttitude}
                onChange={setPolygynyAttitude}
                options={POLYGYNY_OPTIONS}
              />
              <SelectField
                label="Хиджаб"
                value={hijabAttitude}
                onChange={setHijabAttitude}
                options={HIJAB_OPTIONS}
              />
              <SelectField
                label="Готовность к переезду"
                value={willingToRelocate}
                onChange={setWillingToRelocate}
                options={RELOCATION_OPTIONS}
              />
            </>
          )}
          {isMale && (
            <>
              <SelectField
                label="Уровень дохода"
                value={incomeLevel}
                onChange={setIncomeLevel}
                options={INCOME_OPTIONS}
              />
              <SelectField
                label="Жильё"
                value={housing}
                onChange={setHousing}
                options={HOUSING_OPTIONS}
              />
            </>
          )}
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            О себе
          </label>
          <textarea
            value={aboutSelf}
            onChange={(e) => setAboutSelf(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            placeholder="Расскажите о себе..."
          />
        </div>
      </section>

      {/* Message */}
      {message && (
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            messageType === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
          )}
        >
          {message}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-primary px-8 py-3 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-zinc-200 px-8 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
        >
          Отмена
        </button>
      </div>
    </form>
  )
}

// ── Form Field Components ──────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  disabled,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  type?: string
  required?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        required={required}
        disabled={disabled}
        className={cn(
          'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm',
          'dark:border-zinc-700 dark:bg-zinc-800',
          disabled && 'cursor-not-allowed bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50',
        )}
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
      >
        <option value="">Не выбрано</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Option lists ────────────────────────────────────────────────────

const MARITAL_STATUS_OPTIONS_MALE = [
  { value: 'single', label: 'Женат не был' },
  { value: 'divorced', label: 'Разведён' },
  { value: 'widowed', label: 'Вдовец' },
  { value: 'married_1', label: 'Женат на одной' },
  { value: 'married_2', label: 'Женат на двух' },
  { value: 'married_3', label: 'Женат на трёх' },
]

const MARITAL_STATUS_OPTIONS_FEMALE = [
  { value: 'single', label: 'Замужем не была' },
  { value: 'divorced', label: 'Разведена' },
  { value: 'widowed', label: 'Вдова' },
]

const CHILDREN_OPTIONS = [
  { value: '0', label: 'Детей нет' },
  { value: '1', label: '1 ребёнок' },
  { value: '2', label: '2 ребёнка' },
  { value: '3', label: '3 ребёнка' },
  { value: '4', label: '4 ребёнка' },
  { value: '5', label: '5 или более детей' },
]

const POLYGYNY_OPTIONS = [
  { value: 'positive', label: 'Положительное' },
  { value: 'negative', label: 'Отрицательное' },
]

const HIJAB_OPTIONS = [
  { value: 'no_hijab', label: 'Не покрываюсь' },
  { value: 'hijab', label: 'Ношу хиджаб' },
  { value: 'niqab', label: 'Ношу никаб' },
]

const RELOCATION_OPTIONS = [
  { value: 'none', label: 'Не готова к переезду' },
  { value: 'region', label: 'Внутри региона' },
  { value: 'country', label: 'Внутри страны' },
  { value: 'abroad', label: 'В другую страну' },
]

const INCOME_OPTIONS = [
  { value: 'low', label: 'Живу скромно' },
  { value: 'middle', label: 'Средний достаток' },
  { value: 'high', label: 'Хорошо обеспечен' },
]

const HOUSING_OPTIONS = [
  { value: 'rent', label: 'Арендую' },
  { value: 'apartment', label: 'Своя квартира' },
  { value: 'house', label: 'Свой дом' },
  { value: 'parents', label: 'Живу с родителями' },
]
