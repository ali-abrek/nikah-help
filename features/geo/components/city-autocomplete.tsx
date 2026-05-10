'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

interface City {
  id: number
  name: string
  region: string | null
  country: string
  population: number | null
}

interface CityAutocompleteProps {
  value: string
  onChange: (cityName: string) => void
  countryCode: string
}

async function fetchCities(query: string, country: string): Promise<City[]> {
  if (!country || query.length < 1) return []
  const params = new URLSearchParams({ q: query, country })
  const res = await fetch(`/api/geo/cities?${params}`)
  if (!res.ok) return []
  const data = (await res.json()) as { cities?: City[] }
  return data.cities ?? []
}

export function CityAutocomplete({ value, onChange, countryCode }: CityAutocompleteProps) {
  const [open, setOpen] = useState(false)
  // `query` is local input state that we keep in sync with the external
  // committed `value`. We track the last committed value in a ref and reset
  // `query` only when it actually drifts — the cheap render-time check
  // satisfies React Compiler's `set-state-in-effect` rule (no setState
  // inside an effect just to mirror a prop).
  const [query, setQuery] = useState(value ?? '')
  // Mirror the committed `value` into `query` only when it actually changes.
  // This is the React-blessed prop-to-state-derivation pattern documented at
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  // The compiler-aware `react-hooks/refs` rule rejects ref reads/writes
  // during render, but this is exactly the case the docs sanction.
  const lastCommittedRef = useRef(value ?? '')
  /* eslint-disable react-hooks/refs */
  if (value !== lastCommittedRef.current) {
    lastCommittedRef.current = value ?? ''
    if (query !== (value ?? '')) {
      setQuery(value ?? '')
    }
  }
  /* eslint-enable react-hooks/refs */

  const containerRef = useRef<HTMLDivElement>(null)
  // Track the most recent query for which we've already opened the menu so
  // we don't loop on every render. Declared early so the country-change
  // reset below can access it.
  const lastQueryWithResultsRef = useRef('')
  const disabled = !countryCode

  // Reset auto-open tracking when country changes so the dropdown re-opens
  // for the same query string under a different country.
  const prevCountryRef = useRef(countryCode)
  /* eslint-disable react-hooks/refs */
  if (countryCode !== prevCountryRef.current) {
    prevCountryRef.current = countryCode
    lastQueryWithResultsRef.current = ''
  }
  /* eslint-enable react-hooks/refs */

  // Debounce the query so we don't fire a request on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data: cities = [], isFetching: loading } = useQuery({
    queryKey: ['geo', 'cities', countryCode, debouncedQuery],
    queryFn: () => fetchCities(debouncedQuery, countryCode),
    enabled: !disabled && debouncedQuery.length > 0,
    placeholderData: (prev) =>
      prev && prev.length > 0 && prev[0]?.country === countryCode ? prev : undefined,
  })

  // Derive `open` from the actual query state during render rather than
  // mirroring it via setState inside an effect. The local `open` state still
  // exists so the user can explicitly close the menu (Escape, outside click);
  // we only force it open when results arrive for the current query.
  const shouldShowMenu = open && !disabled && cities.length > 0 && debouncedQuery.length > 0
  /* eslint-disable react-hooks/refs */
  if (
    !disabled &&
    cities.length > 0 &&
    debouncedQuery.length > 0 &&
    debouncedQuery !== lastQueryWithResultsRef.current
  ) {
    lastQueryWithResultsRef.current = debouncedQuery
    if (!open) setOpen(true)
  }
  /* eslint-enable react-hooks/refs */

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selectCity = useCallback(
    (city: City) => {
      onChange(city.name)
      setQuery(city.name)
      setOpen(false)
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
      if (e.key === 'Enter' && open && cities.length > 0) {
        e.preventDefault()
        if (cities.length === 1 && cities[0]) {
          selectCity(cities[0])
        }
      }
    },
    [open, cities, selectCity],
  )

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
        }}
        onFocus={() => {
          if (!disabled && cities.length > 0) setOpen(true)
        }}
        placeholder={disabled ? 'Сначала выберите страну' : 'Начните вводить город...'}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${
          disabled
            ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900'
            : 'border-zinc-300 bg-white text-foreground placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900'
        }`}
      />

      {shouldShowMenu && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="max-h-60 overflow-auto">
            {loading ? (
              <p className="px-3 py-2 text-sm text-zinc-400">Поиск...</p>
            ) : (
              cities.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectCity(c)
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950 ${
                    c.name === value
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                      : 'text-foreground'
                  }`}
                >
                  <span>{c.name}</span>
                  {c.region && <span className="ml-2 text-xs text-zinc-400">{c.region}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
