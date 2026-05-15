'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header, IconBtn, StickyActions } from '@/components/ui/header'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { PickerRow, ListPicker } from '@/components/ui/picker-row'
import { Segmented } from '@/components/ui/segmented'
import { useLang } from '@/lib/i18n/use-lang'
import { localizePlace } from '@/lib/i18n/dictionary'
import { AGE_RANGE, RADIUS_RANGE } from '@/features/feed/schemas'
import { saveFilterPreferencesAction } from '@/features/feed/actions'
import type { FilterPreferences } from '@/features/feed/schemas'

type LocMode = 'place' | 'radius'

const COUNTRIES = [
  'Russia',
  'Kazakhstan',
  'Uzbekistan',
  'Kyrgyzstan',
  'Tajikistan',
  'Azerbaijan',
  'Turkey',
  'UAE',
  'Egypt',
  'United Kingdom',
] as const

const CITIES: Record<string, string[]> = {
  Russia: ['Moscow', 'Saint Petersburg', 'Kazan', 'Ufa', 'Grozny', 'Makhachkala'],
  Kazakhstan: ['Almaty', 'Astana'],
  Uzbekistan: ['Tashkent'],
  Turkey: ['Istanbul', 'Ankara'],
  UAE: ['Dubai'],
  Egypt: ['Cairo'],
  'United Kingdom': ['London'],
}

const MARITAL_MALE_VIEWING_FEMALES = [
  { value: 'single', tKey: 'm_never_f' as const },
  { value: 'divorced', tKey: 'm_div_f' as const },
  { value: 'widowed', tKey: 'm_widow' as const },
]
const MARITAL_FEMALE_VIEWING_MALES = [
  { value: 'single', tKey: 'm_never' as const },
  { value: 'divorced', tKey: 'm_div' as const },
  { value: 'widowed', tKey: 'm_widower' as const },
  { value: 'married_1', tKey: 'm_married' as const },
]

const HIJAB_OPTIONS = [
  { value: 'hijab', tKey: 'hj_hijab' as const },
  { value: 'niqab', tKey: 'hj_niqab' as const },
]
const INCOME_OPTIONS = [
  { value: 'middle', tKey: 'in_avg' as const },
  { value: 'high', tKey: 'in_secure' as const },
]
const HOUSING_OPTIONS = [
  { value: 'rent', tKey: 'h_rent' as const },
  { value: 'apartment', tKey: 'h_apt' as const },
  { value: 'house', tKey: 'h_house' as const },
  { value: 'parents', tKey: 'h_relatives' as const },
]

interface FiltersScreenProps {
  viewerGender: 'male' | 'female'
  initialFilters?: FilterPreferences | null
}

export function FiltersScreen({ viewerGender, initialFilters }: FiltersScreenProps) {
  const router = useRouter()
  const { t, lang } = useLang()

  const [locMode, setLocMode] = useState<LocMode>(initialFilters?.locMode ?? 'place')
  const [country, setCountry] = useState<string>(initialFilters?.country ?? '')
  const [city, setCity] = useState<string>(initialFilters?.city ?? '')
  const [radiusKm, setRadiusKm] = useState<number>(initialFilters?.radiusKm ?? RADIUS_RANGE.min)
  const [ageMin, setAgeMin] = useState<number>(initialFilters?.ageMin ?? AGE_RANGE.min)
  const [ageMax, setAgeMax] = useState<number>(initialFilters?.ageMax ?? 50)
  const [marital, setMarital] = useState<string | null>(initialFilters?.marital ?? null)
  const [children, setChildren] = useState<'any' | 'none' | 'has'>(
    initialFilters?.children ?? 'any',
  )
  const [polygamy, setPolygamy] = useState<'any' | 'mono' | 'open'>(
    initialFilters?.polygamy ?? 'any',
  )
  const [hijab, setHijab] = useState<string | null>(initialFilters?.hijab ?? null)
  const [income, setIncome] = useState<string | null>(initialFilters?.income ?? null)
  const [housing, setHousing] = useState<string | null>(initialFilters?.housing ?? null)

  const [showCountry, setShowCountry] = useState(false)
  const [showCity, setShowCity] = useState(false)
  const [showMarital, setShowMarital] = useState(false)
  const [showHijab, setShowHijab] = useState(false)
  const [showIncome, setShowIncome] = useState(false)
  const [showHousing, setShowHousing] = useState(false)

  const maritalOptions = useMemo(
    () => (viewerGender === 'male' ? MARITAL_MALE_VIEWING_FEMALES : MARITAL_FEMALE_VIEWING_MALES),
    [viewerGender],
  )

  const buildPrefs = (): FilterPreferences => ({
    locMode,
    country,
    city,
    radiusKm,
    ageMin,
    ageMax,
    marital,
    children,
    polygamy,
    hijab,
    income,
    housing,
  })

  const apply = () => {
    const params = new URLSearchParams()
    if (ageMin !== AGE_RANGE.min) params.set('age_min', String(ageMin))
    if (ageMax !== 50) params.set('age_max', String(ageMax))
    if (locMode === 'radius') params.set('radius_km', String(radiusKm))
    if (marital) params.set('marital_status', marital)
    if (children === 'none') params.set('children_count_max', '0')
    if (viewerGender === 'male') {
      if (polygamy === 'mono') params.set('polygyny_attitude', 'negative')
      else if (polygamy === 'open') params.set('polygyny_attitude', 'positive')
      if (hijab) params.set('hijab_attitude', hijab)
    } else {
      if (income) params.set('income_level', income)
      if (housing) params.set('housing', housing)
    }
    void saveFilterPreferencesAction(buildPrefs())
    router.replace(`/feed${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const reset = () => {
    const empty: FilterPreferences = {
      locMode: 'place',
      country: '',
      city: '',
      radiusKm: RADIUS_RANGE.min,
      ageMin: AGE_RANGE.min,
      ageMax: 50,
      marital: null,
      children: 'any',
      polygamy: 'any',
      hijab: null,
      income: null,
      housing: null,
    }
    setLocMode(empty.locMode!)
    setCountry(empty.country!)
    setCity(empty.city!)
    setRadiusKm(empty.radiusKm!)
    setAgeMin(empty.ageMin!)
    setAgeMax(empty.ageMax!)
    setMarital(null)
    setChildren('any')
    setPolygamy('any')
    setHijab(null)
    setIncome(null)
    setHousing(null)
    void saveFilterPreferencesAction(empty)
  }

  const close = () => router.back()

  return (
    <div className="flex h-full flex-col">
      <Header
        title={t('filters_title')}
        leading="back"
        onLeading={close}
        hairline
        trailing={
          <Link href="/settings" aria-label={t('settings')}>
            <IconBtn icon="gear" ariaLabel={t('settings')} />
          </Link>
        }
      />

      <div className="scroll-area flex-1 overflow-auto px-5 pb-5 pt-4">
        <div className="mb-[18px] overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)]">
          <div className="flex px-2.5 pt-2.5">
            {(
              [
                { v: 'place', l: t('filters_place') },
                { v: 'radius', l: t('filters_radius') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.v}
                type="button"
                onClick={() => setLocMode(tab.v)}
                className={`h-9 flex-1 rounded-lg text-[13.5px] font-semibold transition-colors ${
                  locMode === tab.v
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-transparent text-[var(--ink-3)]'
                }`}
              >
                {tab.l}
              </button>
            ))}
          </div>
          <div className="px-3.5 pb-3.5 pt-3">
            {locMode === 'place' ? (
              <div className="grid gap-2">
                <Field label={t('filters_country')}>
                  <PickerRow
                    value={country ? localizePlace(country, lang) : null}
                    placeholder={t('filters_any')}
                    icon="globe"
                    onClick={() => setShowCountry(true)}
                  />
                </Field>
                <Field label={t('filters_city')}>
                  <PickerRow
                    value={city ? localizePlace(city, lang) : null}
                    placeholder={t('filters_any')}
                    icon="pin"
                    disabled={!country}
                    onClick={() => setShowCity(true)}
                  />
                </Field>
              </div>
            ) : (
              <Field label={`${t('filters_distance')}: ${radiusKm} ${t('km')}`}>
                <input
                  type="range"
                  min={RADIUS_RANGE.min}
                  max={RADIUS_RANGE.max}
                  step={RADIUS_RANGE.step}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="w-full"
                />
              </Field>
            )}
          </div>
        </div>

        <div className="mb-[18px]">
          <Field label={`${t('filters_age')}: ${ageMin}–${ageMax}`}>
            <div className="flex gap-2.5">
              <input
                type="range"
                min={AGE_RANGE.min}
                max={60}
                value={ageMin}
                onChange={(e) => setAgeMin(Math.min(Number(e.target.value), ageMax - 1))}
                className="flex-1"
              />
              <input
                type="range"
                min={AGE_RANGE.min}
                max={60}
                value={ageMax}
                onChange={(e) => setAgeMax(Math.max(Number(e.target.value), ageMin + 1))}
                className="flex-1"
              />
            </div>
          </Field>
        </div>

        <div className="mb-3.5">
          <Field label={t('filters_marital')}>
            <PickerRow
              value={marital ? t(maritalOptions.find((o) => o.value === marital)!.tKey) : null}
              placeholder={t('filters_any')}
              onClick={() => setShowMarital(true)}
            />
          </Field>
        </div>

        <div className="mb-3.5">
          <Field label={t('filters_children')}>
            <Segmented
              value={children}
              onChange={setChildren}
              options={[
                { value: 'any', label: t('filters_any') },
                { value: 'none', label: t('filters_children_none') },
                { value: 'has', label: t('filters_children_has') },
              ]}
            />
          </Field>
        </div>

        {viewerGender === 'male' && (
          <>
            <div className="mb-3.5">
              <Field label={t('filters_polygamy')}>
                <Segmented
                  value={polygamy}
                  onChange={setPolygamy}
                  options={[
                    { value: 'any', label: t('filters_any') },
                    { value: 'mono', label: t('filters_polygamy_mono') },
                    { value: 'open', label: t('filters_polygamy_open') },
                  ]}
                />
              </Field>
            </div>
            <div className="mb-3.5">
              <Field label={t('filters_hijab')}>
                <PickerRow
                  value={hijab ? t(HIJAB_OPTIONS.find((o) => o.value === hijab)!.tKey) : null}
                  placeholder={t('filters_any')}
                  onClick={() => setShowHijab(true)}
                />
              </Field>
            </div>
          </>
        )}

        {viewerGender === 'female' && (
          <>
            <div className="mb-3.5">
              <Field label={t('filters_income')}>
                <PickerRow
                  value={income ? t(INCOME_OPTIONS.find((o) => o.value === income)!.tKey) : null}
                  placeholder={t('filters_any')}
                  onClick={() => setShowIncome(true)}
                />
              </Field>
            </div>
            <div className="mb-3.5">
              <Field label={t('filters_housing')}>
                <PickerRow
                  value={housing ? t(HOUSING_OPTIONS.find((o) => o.value === housing)!.tKey) : null}
                  placeholder={t('filters_any')}
                  onClick={() => setShowHousing(true)}
                />
              </Field>
            </div>
          </>
        )}
      </div>

      <StickyActions>
        <Button kind="soft" size="lg" full onClick={reset}>
          {t('filters_reset')}
        </Button>
        <Button kind="primary" size="lg" full onClick={apply}>
          {t('filters_apply')}
        </Button>
      </StickyActions>

      <Sheet open={showCountry} onClose={() => setShowCountry(false)} title={t('filters_country')}>
        <ListPicker
          items={[
            { value: '', label: t('filters_any') },
            ...COUNTRIES.map((c) => ({ value: c, label: localizePlace(c, lang) })),
          ]}
          selected={country}
          onPick={(v) => {
            setCountry(v as string)
            setCity('')
            setShowCountry(false)
          }}
        />
      </Sheet>

      <Sheet open={showCity} onClose={() => setShowCity(false)} title={t('filters_city')}>
        <ListPicker
          items={[
            { value: '', label: t('filters_any') },
            ...(CITIES[country] ?? []).map((c) => ({ value: c, label: localizePlace(c, lang) })),
          ]}
          selected={city}
          onPick={(v) => {
            setCity(v as string)
            setShowCity(false)
          }}
        />
      </Sheet>

      <Sheet open={showMarital} onClose={() => setShowMarital(false)} title={t('filters_marital')}>
        <ListPicker
          items={[
            { value: '', label: t('filters_any') },
            ...maritalOptions.map((o) => ({ value: o.value, label: t(o.tKey) })),
          ]}
          selected={marital}
          onPick={(v) => {
            setMarital(v === '' ? null : (v as string))
            setShowMarital(false)
          }}
        />
      </Sheet>

      <Sheet open={showHijab} onClose={() => setShowHijab(false)} title={t('filters_hijab')}>
        <ListPicker
          items={[
            { value: '', label: t('filters_any') },
            ...HIJAB_OPTIONS.map((o) => ({ value: o.value, label: t(o.tKey) })),
          ]}
          selected={hijab}
          onPick={(v) => {
            setHijab(v === '' ? null : (v as string))
            setShowHijab(false)
          }}
        />
      </Sheet>

      <Sheet open={showIncome} onClose={() => setShowIncome(false)} title={t('filters_income')}>
        <ListPicker
          items={[
            { value: '', label: t('filters_any') },
            ...INCOME_OPTIONS.map((o) => ({ value: o.value, label: t(o.tKey) })),
          ]}
          selected={income}
          onPick={(v) => {
            setIncome(v === '' ? null : (v as string))
            setShowIncome(false)
          }}
        />
      </Sheet>

      <Sheet open={showHousing} onClose={() => setShowHousing(false)} title={t('filters_housing')}>
        <ListPicker
          items={[
            { value: '', label: t('filters_any') },
            ...HOUSING_OPTIONS.map((o) => ({ value: o.value, label: t(o.tKey) })),
          ]}
          selected={housing}
          onPick={(v) => {
            setHousing(v === '' ? null : (v as string))
            setShowHousing(false)
          }}
        />
      </Sheet>
    </div>
  )
}
