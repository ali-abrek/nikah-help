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

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900'

const maritalStatusOptionsMale = [
  { value: 'single', label: 'Женат не был' },
  { value: 'divorced', label: 'Разведён' },
  { value: 'widowed', label: 'Вдовец' },
  { value: 'married_1', label: 'Женат на одной' },
  { value: 'married_2', label: 'Женат на двух' },
  { value: 'married_3', label: 'Женат на трёх' },
]

const maritalStatusOptionsFemale = [
  { value: 'single', label: 'Замужем не была' },
  { value: 'divorced', label: 'Разведена' },
  { value: 'widowed', label: 'Вдова' },
]

const childrenOptions = [
  { value: '0', label: 'Детей нет' },
  { value: '1', label: '1 ребёнок' },
  { value: '2', label: '2 ребёнка' },
  { value: '3', label: '3 ребёнка' },
  { value: '4', label: '4 ребёнка' },
  { value: '5', label: '5 или более детей' },
]

const incomeLevelOptions = [
  { value: 'low', label: 'Живу скромно' },
  { value: 'middle', label: 'Средний достаток' },
  { value: 'high', label: 'Хорошо обеспечен' },
]

const housingOptions = [
  { value: 'rent', label: 'Арендую' },
  { value: 'apartment', label: 'Своя квартира' },
  { value: 'house', label: 'Свой дом' },
  { value: 'parents', label: 'Живу с родителями' },
]

const polygynyOptions = [
  { value: 'positive', label: 'Положительное' },
  { value: 'negative', label: 'Отрицательное' },
]

const hijabOptions = [
  { value: 'no_hijab', label: 'Не покрываюсь' },
  { value: 'hijab', label: 'Ношу хиджаб' },
  { value: 'niqab', label: 'Ношу никаб' },
]

const relocationOptions = [
  { value: 'none', label: 'Не готова к переезду' },
  { value: 'region', label: 'Внутри региона' },
  { value: 'country', label: 'Внутри страны' },
  { value: 'abroad', label: 'В другую страну' },
]

type FieldErrors = Record<string, { message?: string } | undefined>

// Simplified register type to avoid react-hook-form union schema issues
type SimpleRegister = (
  name: string,
  opts?: Record<string, unknown>,
) => {
  id: string
  name: string
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void
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

export function OnboardingStep2({ gender, onSubmit, defaultValues }: Props) {
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
      children_count: '0',
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = register as any as SimpleRegister
  const errs = errors as FieldErrors

  const onFormSubmit = (data: Record<string, unknown>) => {
    const fd = new FormData()
    fd.append('gender', gender)
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'children_count') {
        fd.append(key, String(Number(value)))
      } else {
        fd.append(key, String(value ?? ''))
      }
    })
    onSubmit(fd)
  }

  return (
    <form id="ob-step-2" onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
      <SelectField
        name="marital_status"
        label="Семейное положение"
        register={reg}
        error={errs.marital_status}
        options={gender === 'male' ? maritalStatusOptionsMale : maritalStatusOptionsFemale}
      />

      <SelectField
        name="children_count"
        label="Дети"
        register={reg}
        error={errs.children_count}
        options={childrenOptions}
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
          <SelectField
            name="willing_to_relocate"
            label="Готовность к переезду"
            register={reg}
            error={errs.willing_to_relocate}
            options={relocationOptions}
          />

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
        {errs.about_self && <p className="mt-1 text-xs text-red-600">{errs.about_self.message}</p>}
      </div>

    </form>
  )
}
