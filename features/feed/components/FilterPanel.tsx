'use client'

import type { FeedFilters } from '../schemas'
import { RADIUS_RANGE, AGE_RANGE } from '../schemas'

interface FilterPanelProps {
  filters: FeedFilters
  setFilter: (key: string, value: string | number | string[] | undefined) => void
  clearFilters: () => void
  activeCount: number
}

// ── Option Lists ────────────────────────────────────────────────────

const MARITAL_STATUSES = [
  { value: 'single', label: 'Не в браке' },
  { value: 'divorced', label: 'Разведён(а)' },
  { value: 'widowed', label: 'Вдовец/Вдова' },
  { value: 'married_1', label: 'В браке (1 жена)' },
  { value: 'married_2', label: 'В браке (2 жены)' },
  { value: 'married_3', label: 'В браке (3 жены)' },
]

const POLYGYNY_ATTITUDES = [
  { value: 'positive', label: 'Положительное' },
  { value: 'neutral', label: 'Нейтральное' },
  { value: 'negative', label: 'Отрицательное' },
]

const HIJAB_ATTITUDES = [
  { value: 'niqab', label: 'Никаб' },
  { value: 'hijab_full', label: 'Хиджаб полностью' },
  { value: 'hijab_partial', label: 'Хиджаб частично' },
  { value: 'no_hijab', label: 'Без хиджаба' },
]

const INCOME_LEVELS = [
  { value: 'low', label: 'Низкий' },
  { value: 'middle', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
]

const HOUSING_TYPES = [
  { value: 'own', label: 'Своё жильё' },
  { value: 'rent', label: 'Аренда' },
  { value: 'parents', label: 'С родителями' },
  { value: 'shared', label: 'Совместное' },
]

const EDUCATION_LEVELS = [
  { value: 'none', label: 'Нет образования' },
  { value: 'school', label: 'Школа' },
  { value: 'vocational', label: 'Среднее специальное' },
  { value: 'bachelor', label: 'Бакалавр' },
  { value: 'master', label: 'Магистр' },
  { value: 'phd', label: 'PhD' },
]

export function FilterPanel({ filters, setFilter, clearFilters, activeCount }: FilterPanelProps) {
  const f = filters as Record<string, unknown>
  const isMaleViewer = filters.gender === 'male' // viewer is male → show filters for females

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Фильтры</h2>
        {activeCount > 0 && (
          <button onClick={clearFilters} className="text-sm text-primary hover:underline">
            Сбросить ({activeCount})
          </button>
        )}
      </div>

      <div className="space-y-5">
        {/* Age Range */}
        <FilterSection title="Возраст">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={AGE_RANGE.min}
              max={AGE_RANGE.max}
              placeholder="от"
              value={f.age_min != null ? String(f.age_min) : ''}
              onChange={(e) =>
                setFilter('age_min', e.target.value ? Number(e.target.value) : undefined)
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <span className="text-zinc-400">—</span>
            <input
              type="number"
              min={AGE_RANGE.min}
              max={AGE_RANGE.max}
              placeholder="до"
              value={f.age_max != null ? String(f.age_max) : ''}
              onChange={(e) =>
                setFilter('age_max', e.target.value ? Number(e.target.value) : undefined)
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
        </FilterSection>

        {/* Radius */}
        <FilterSection title="Радиус поиска (км)">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={RADIUS_RANGE.min}
              max={RADIUS_RANGE.max}
              step={RADIUS_RANGE.step}
              value={f.radius_km != null ? Number(f.radius_km) : RADIUS_RANGE.max}
              onChange={(e) =>
                setFilter(
                  'radius_km',
                  Number(e.target.value) >= RADIUS_RANGE.max ? undefined : Number(e.target.value),
                )
              }
              className="flex-1 accent-primary"
            />
            <span className="w-12 text-center text-sm text-zinc-500">
              {f.radius_km != null ? `${f.radius_km}` : 'Все'}
            </span>
          </div>
        </FilterSection>

        {/* Marital Status */}
        <FilterSection title="Семейное положение">
          <CheckboxGroup
            options={MARITAL_STATUSES}
            selected={(f.marital_status as string[]) ?? []}
            onChange={(v) => setFilter('marital_status', v)}
          />
        </FilterSection>

        {/* Children */}
        <FilterSection title="Максимум детей">
          <input
            type="number"
            min={0}
            max={20}
            placeholder="Любое"
            value={f.children_count_max != null ? String(f.children_count_max) : ''}
            onChange={(e) =>
              setFilter('children_count_max', e.target.value ? Number(e.target.value) : undefined)
            }
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </FilterSection>

        {/* Gender-specific filters */}
        {isMaleViewer ? (
          <>
            <FilterSection title="Отношение к многожёнству">
              <CheckboxGroup
                options={POLYGYNY_ATTITUDES}
                selected={(f.polygyny_attitude as string[]) ?? []}
                onChange={(v) => setFilter('polygyny_attitude', v)}
              />
            </FilterSection>

            <FilterSection title="Хиджаб">
              <CheckboxGroup
                options={HIJAB_ATTITUDES}
                selected={(f.hijab_attitude as string[]) ?? []}
                onChange={(v) => setFilter('hijab_attitude', v)}
              />
            </FilterSection>
          </>
        ) : (
          <>
            <FilterSection title="Уровень дохода">
              <CheckboxGroup
                options={INCOME_LEVELS}
                selected={(f.income_level as string[]) ?? []}
                onChange={(v) => setFilter('income_level', v)}
              />
            </FilterSection>

            <FilterSection title="Тип жилья">
              <CheckboxGroup
                options={HOUSING_TYPES}
                selected={(f.housing as string[]) ?? []}
                onChange={(v) => setFilter('housing', v)}
              />
            </FilterSection>

            <FilterSection title="Образование">
              <CheckboxGroup
                options={EDUCATION_LEVELS}
                selected={(f.education as string[]) ?? []}
                onChange={(v) => setFilter('education', v)}
              />
            </FilterSection>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {title}
      </label>
      {children}
    </div>
  )
}

function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              const next = isSelected
                ? selected.filter((v) => v !== opt.value)
                : [...selected, opt.value]
              onChange(next.length > 0 ? next : [])
            }}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              isSelected
                ? 'border-primary bg-primary text-white'
                : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
