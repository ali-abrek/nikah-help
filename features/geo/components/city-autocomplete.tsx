'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

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

export function CityAutocomplete({ value, onChange, countryCode }: CityAutocompleteProps) {
  const [cities, setCities] = useState<City[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState(value ?? '')

  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const disabled = !countryCode

  // Sync input text when external value changes (e.g. form reset)
  useEffect(() => {
    setQuery(value ?? '')
  }, [value])

  // Fetch cities on query change (debounced)
  useEffect(() => {
    if (disabled || query.length < 1) {
      setCities([])
      return
    }

    setLoading(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: query, country: countryCode })
      fetch(`/api/geo/cities?${params}`)
        .then((r) => r.json())
        .then((data) => {
          setCities(data.cities ?? [])
          setOpen((data.cities?.length ?? 0) > 0)
        })
        .catch(() => setCities([]))
        .finally(() => setLoading(false))
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, countryCode, disabled])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
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

  const handleBlur = useCallback(() => {
    // If the user typed something that doesn't match the committed value, revert
    if (query !== value) {
      setQuery(value ?? '')
    }
  }, [query, value])

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(false) // close until new results arrive
        }}
        onFocus={() => {
          if (!disabled && cities.length > 0) setOpen(true)
        }}
        onBlur={handleBlur}
        placeholder={disabled ? 'Сначала выберите страну' : 'Начните вводить город...'}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${
          disabled
            ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900'
            : 'border-zinc-300 bg-white text-foreground placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900'
        }`}
      />

      {open && !disabled && cities.length > 0 && (
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
                    // Prevent onBlur from firing before click
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
                  {c.region && (
                    <span className="ml-2 text-xs text-zinc-400">{c.region}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
