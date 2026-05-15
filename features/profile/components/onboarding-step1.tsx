'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { onboardingStep1Schema, type OnboardingStep1Data } from '../schemas'
import { CountrySelect } from '@/features/geo/components/country-select'
import { CityAutocomplete } from '@/features/geo/components/city-autocomplete'
import { NationalityAutocomplete } from './nationality-autocomplete'

const GENDERS = [
  { value: 'male', label: 'Мужчина', icon: '♂' },
  { value: 'female', label: 'Женщина', icon: '♀' },
] as const

export function OnboardingStep1({
  onSubmit,
  defaultValues,
  isPending,
  locale = 'ru',
}: {
  onSubmit: (data: FormData) => void
  defaultValues?: Partial<OnboardingStep1Data>
  isPending?: boolean
  locale?: string
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OnboardingStep1Data>({
    resolver: zodResolver(onboardingStep1Schema),
    defaultValues: defaultValues ?? {
      gender: undefined,
      country: 'RU',
      allow_geolocation: true,
    },
  })

  // react-hook-form's `watch()` is documented as incompatible with React
  // Compiler memoisation: it returns a fresh function each render and is
  // tracked by the form's internal subscription, so memoising the call
  // would yield stale UI. We accept the compiler-skip on this hook.
  // eslint-disable-next-line react-hooks/incompatible-library -- see comment above
  const selectedCountry = watch('country')

  // Clear city when country changes
  useEffect(() => {
    setValue('city', '')
  }, [selectedCountry, setValue])

  const onFormSubmit = (data: OnboardingStep1Data) => {
    const fd = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      fd.append(key, String(value))
    })
    onSubmit(fd)
  }

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900'

  return (
    <form id="ob-step-1" onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
      {/* Name */}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-foreground">
          Имя
        </label>
        <input {...register('name')} className={inputClass} placeholder="Ваше имя" />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      {/* Birth date */}
      <div>
        <label htmlFor="birth_date" className="mb-1 block text-sm font-medium text-foreground">
          Дата рождения
        </label>
        <input
          type="date"
          {...register('birth_date')}
          className={inputClass}
          max={
            new Date(new Date().setFullYear(new Date().getFullYear() - 18))
              .toISOString()
              .split('T')[0]
          }
        />
        {errors.birth_date && (
          <p className="mt-1 text-xs text-red-600">{errors.birth_date.message}</p>
        )}
      </div>

      {/* Gender */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Пол</label>
        <Controller
          control={control}
          name="gender"
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-3">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => field.onChange(g.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 p-4 transition-colors ${
                    field.value === g.value
                      ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-950'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'
                  }`}
                >
                  <span className="text-2xl">{g.icon}</span>
                  <span className="text-sm font-medium text-foreground">{g.label}</span>
                </button>
              ))}
            </div>
          )}
        />
        {errors.gender && <p className="mt-1 text-xs text-red-600">{errors.gender.message}</p>}
      </div>

      {/* Country */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Страна</label>
        <Controller
          control={control}
          name="country"
          render={({ field }) => (
            <CountrySelect value={field.value ?? ''} onChange={field.onChange} locale={locale} />
          )}
        />
        {errors.country && <p className="mt-1 text-xs text-red-600">{errors.country.message}</p>}
      </div>

      {/* City */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Город</label>
        <Controller
          control={control}
          name="city"
          render={({ field }) => (
            <CityAutocomplete
              value={field.value ?? ''}
              onChange={field.onChange}
              countryCode={selectedCountry ?? ''}
            />
          )}
        />
        {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>}
      </div>

      {/* Nationality */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Национальность</label>
        <Controller
          control={control}
          name="nationality"
          render={({ field }) => (
            <NationalityAutocomplete value={field.value ?? ''} onChange={field.onChange} />
          )}
        />
        {errors.nationality && (
          <p className="mt-1 text-xs text-red-600">{errors.nationality.message}</p>
        )}
      </div>

      {/* Height & Weight */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="height" className="mb-1 block text-sm font-medium text-foreground">
            Рост (см)
          </label>
          <input
            type="number"
            {...register('height', { valueAsNumber: true })}
            className={inputClass}
            placeholder="175"
          />
          {errors.height && <p className="mt-1 text-xs text-red-600">{errors.height.message}</p>}
        </div>
        <div>
          <label htmlFor="weight" className="mb-1 block text-sm font-medium text-foreground">
            Вес (кг)
          </label>
          <input
            type="number"
            {...register('weight', { valueAsNumber: true })}
            className={inputClass}
            placeholder="70"
          />
          {errors.weight && <p className="mt-1 text-xs text-red-600">{errors.weight.message}</p>}
        </div>
      </div>

      {/* Geolocation toggle */}
      <div className="flex items-center justify-between">
        <label htmlFor="allow_geolocation" className="text-sm text-zinc-600 dark:text-zinc-400">
          Разрешить геолокацию для поиска поблизости
        </label>
        <Controller
          control={control}
          name="allow_geolocation"
          render={({ field }) => (
            <button
              type="button"
              id="allow_geolocation"
              role="switch"
              aria-checked={field.value === true}
              onClick={() => field.onChange(!field.value)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                field.value === true ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  field.value === true ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? 'Сохранение...' : 'Продолжить'}
      </button>
    </form>
  )
}
