'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  onboardingStep2MaleSchema,
  onboardingStep2FemaleSchema,
  type OnboardingStep2MaleData,
  type OnboardingStep2FemaleData,
} from '../schemas'

type Props = {
  gender: 'male' | 'female'
  onSubmit: (data: FormData) => void
  defaultValues?: Partial<OnboardingStep2MaleData | OnboardingStep2FemaleData>
  isPending?: boolean
}

const inputClass = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900'

const maritalStatusOptions = [
  { value: 'single', label: 'Не в браке' },
  { value: 'divorced', label: 'Разведён(а)' },
  { value: 'widowed', label: 'Вдовец/Вдова' },
  { value: 'married_1', label: 'В браке (1 жена)' },
  { value: 'married_2', label: 'В браке (2 жены)' },
  { value: 'married_3', label: 'В браке (3 жены)' },
]

const educationOptions = [
  { value: 'none', label: 'Нет' },
  { value: 'school', label: 'Школьное' },
  { value: 'vocational', label: 'Среднее специальное' },
  { value: 'bachelor', label: 'Бакалавр' },
  { value: 'master', label: 'Магистр' },
  { value: 'phd', label: 'Кандидат/Доктор наук' },
]

const incomeLevelOptions = [
  { value: 'low', label: 'Низкий' },
  { value: 'middle', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
]

const housingOptions = [
  { value: 'own', label: 'Своё жильё' },
  { value: 'rent', label: 'Снимаю' },
  { value: 'parents', label: 'Живу с родителями' },
  { value: 'shared', label: 'Общежитие/Комната' },
]

const polygynyOptions = [
  { value: 'positive', label: 'Положительное' },
  { value: 'neutral', label: 'Нейтральное' },
  { value: 'negative', label: 'Отрицательное' },
]

const hijabOptions = [
  { value: 'niqab', label: 'Никаб' },
  { value: 'hijab_full', label: 'Хиджаб (полное покрытие)' },
  { value: 'hijab_partial', label: 'Хиджаб (частичное покрытие)' },
  { value: 'no_hijab', label: 'Без хиджаба' },
]

type FieldErrors = Record<string, { message?: string } | undefined>

// Simplified register type to avoid react-hook-form union schema issues
type SimpleRegister = (name: string, opts?: Record<string, unknown>) => {
  id: string
  name: string
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  onBlur: () => void
  ref: React.RefCallback<HTMLElement>
}

function SelectField({
  name,
  label,
  register,
  error,
  options,
}: {
  name: string
  label: string
  register: SimpleRegister
  error?: { message?: string }
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      <select {...register(name)} id={name} className={inputClass}>
        <option value="">Выберите...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error.message}</p>}
    </div>
  )
}

export function OnboardingStep2({ gender, onSubmit, defaultValues, isPending }: Props) {
  const schema = gender === 'male' ? onboardingStep2MaleSchema : onboardingStep2FemaleSchema

  const {
    register,
    handleSubmit,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<any>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: defaultValues ?? {
      children_count: 0,
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = register as any as SimpleRegister
  const errs = errors as FieldErrors

  const onFormSubmit = (data: Record<string, unknown>) => {
    const fd = new FormData()
    fd.append('gender', gender)
    Object.entries(data).forEach(([key, value]) => {
      fd.append(key, String(value))
    })
    onSubmit(fd)
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
      <SelectField
        name="marital_status"
        label="Семейное положение"
        register={reg}
        error={errs.marital_status}
        options={maritalStatusOptions}
      />

      <div>
        <label htmlFor="children_count" className="mb-1 block text-sm font-medium text-foreground">
          Количество детей
        </label>
        <input
          type="number"
          {...reg('children_count', { valueAsNumber: true })}
          id="children_count"
          className={inputClass}
          min={0}
          max={20}
        />
        {errs.children_count && (
          <p className="mt-1 text-xs text-red-600">{errs.children_count.message}</p>
        )}
      </div>

      <SelectField
        name="education"
        label="Образование"
        register={reg}
        error={errs.education}
        options={educationOptions}
      />

      {gender === 'male' && (
        <>
          <SelectField
            name="income_level"
            label="Уровень дохода"
            register={reg}
            error={errs.income_level}
            options={incomeLevelOptions}
          />
          <SelectField
            name="housing"
            label="Жильё"
            register={reg}
            error={errs.housing}
            options={housingOptions}
          />
        </>
      )}

      {gender === 'female' && (
        <>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              {...reg('willing_to_relocate')}
              id="willing_to_relocate"
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="willing_to_relocate" className="text-sm text-zinc-600 dark:text-zinc-400">
              Готова к переезду
            </label>
          </div>

          <SelectField
            name="polygyny_attitude"
            label="Отношение к многожёнству"
            register={reg}
            error={errs.polygyny_attitude}
            options={polygynyOptions}
          />

          <SelectField
            name="hijab_attitude"
            label="Отношение к хиджабу"
            register={reg}
            error={errs.hijab_attitude}
            options={hijabOptions}
          />
        </>
      )}

      <div>
        <label htmlFor="about_self" className="mb-1 block text-sm font-medium text-foreground">
          О себе
        </label>
        <textarea
          {...reg('about_self')}
          id="about_self"
          rows={4}
          className={inputClass}
          placeholder="Расскажите о себе, своих интересах, религиозных взглядах..."
        />
        {errs.about_self && (
          <p className="mt-1 text-xs text-red-600">{errs.about_self.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? 'Сохранение...' : 'Сохранить'}
      </button>
    </form>
  )
}
