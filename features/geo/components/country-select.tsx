'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Country {
  iso2: string
  name: string
  phone_prefix: string | null
}

interface CountrySelectProps {
  value: string
  onChange: (iso2: string) => void
  disabled?: boolean
  locale?: string
}

function iso2ToFlag(iso2: string): string {
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  )
}

export function CountrySelect({ value, onChange, disabled, locale = 'ru' }: CountrySelectProps) {
  const [countries, setCountries] = useState<Country[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/geo/countries?locale=${locale}`)
      .then((r) => r.json())
      .then((data) => setCountries(data.countries ?? []))
      .catch(() => setCountries([]))
      .finally(() => setLoading(false))
  }, [locale])

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

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      setSearch('')
    }
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
      // Prevent form submission on Enter when selecting
      if (e.key === 'Enter' && open) {
        e.preventDefault()
        const filtered = countries.filter((c) =>
          c.name.toLowerCase().includes(search.toLowerCase()),
        )
        if (filtered.length === 1 && filtered[0]) {
          onChange(filtered[0].iso2)
          setOpen(false)
        }
      }
    },
    [open, search, countries, onChange],
  )

  const filtered = countries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  )

  const selected = countries.find((c) => c.iso2 === value)
  const displayLabel = selected ? `${iso2ToFlag(selected.iso2)} ${selected.name}` : ''

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
          disabled
            ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900'
            : 'border-zinc-300 bg-white text-foreground hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900'
        }`}
      >
        {value && selected ? (
          displayLabel
        ) : (
          <span className="text-zinc-400">Выберите страну</span>
        )}
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск страны..."
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-foreground placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div className="max-h-60 overflow-auto">
            {loading ? (
              <p className="px-3 py-2 text-sm text-zinc-400">Загрузка...</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-400">
                {countries.length === 0 ? 'Нет доступных стран' : 'Ничего не найдено'}
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.iso2}
                  type="button"
                  onClick={() => {
                    onChange(c.iso2)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950 ${
                    c.iso2 === value
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                      : 'text-foreground'
                  }`}
                >
                  <span className="text-base">{iso2ToFlag(c.iso2)}</span>
                  <span>{c.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
