'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

const NATIONALITIES = [
  'абазин', 'абхаз', 'аварец', 'агул', 'адыгеец', 'азербайджанец', 'алтаец',
  'араб', 'армянин', 'ассириец', 'балкарец', 'башкир', 'белорус', 'болгарин',
  'бурят', 'венгр', 'вьетнамец', 'гагауз', 'грузин', 'даргинец', 'долганин',
  'дунганин', 'езид', 'индиец', 'ингуш', 'испанец', 'итальянец', 'кабардинец',
  'казах', 'калмык', 'каракалпак', 'карачаевец', 'карел', 'киргиз', 'китаец',
  'коми', 'кореец', 'крымский татарин', 'кумык', 'курд', 'лак', 'латыш',
  'лезгин', 'литовец', 'манси', 'мариец', 'молдаванин', 'мордвин', 'нганасан',
  'немец', 'ненец', 'ногаец', 'осетин', 'пакистанец', 'перс', 'поляк',
  'пуштун', 'румын', 'рутулец', 'русский', 'саам', 'серб', 'табасаран',
  'таджик', 'талыш', 'татарин', 'тат', 'тувинец', 'туркмен', 'турок',
  'турка-месхетинец', 'удмурт', 'узбек', 'уйгур', 'украинец', 'финн',
  'француз', 'хакас', 'хант', 'цахур', 'черкес', 'чеченец', 'чуваш',
  'чукча', 'шорец', 'эвенк', 'эстонец', 'якут', 'японец',
]

interface NationalityAutocompleteProps {
  value: string
  onChange: (value: string) => void
}

export function NationalityAutocomplete({ value, onChange }: NationalityAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value ?? '')

  const [prevValue, setPrevValue] = useState(value ?? '')
  if (value !== prevValue) {
    setPrevValue(value ?? '')
    if (query !== (value ?? '')) {
      setQuery(value ?? '')
    }
  }

  const containerRef = useRef<HTMLDivElement>(null)

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

  const filtered = NATIONALITIES.filter((n) =>
    n.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 10)

  const shouldShowMenu = open && query.length > 0 && filtered.length > 0

  const selectNationality = useCallback(
    (n: string) => {
      onChange(n)
      setQuery(n)
      setOpen(false)
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
      if (e.key === 'Enter' && open && filtered.length > 0) {
        e.preventDefault()
        if (filtered.length === 1 && filtered[0]) {
          selectNationality(filtered[0])
        }
      }
    },
    [open, filtered, selectNationality],
  )

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (query.length > 0) setOpen(true)
        }}
        placeholder="Например, татарин"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
      />

      {shouldShowMenu && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="max-h-60 overflow-auto">
            {filtered.map((n) => (
              <button
                key={n}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectNationality(n)
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950 ${
                  n === value
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'text-foreground'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
