'use client'

import { FilterPanel } from '@/features/feed/components/FilterPanel'
import { useFilters } from '@/features/feed/hooks/useFilters'

export default function FiltersSlot() {
  // Feed filters use the viewer's opposite-gender perspective.
  // The viewerGender is available via the search params or server context.
  // For now we derive it from the filters context; default to 'male' (filtering females).
  const { filters, setFilter, clearFilters, activeCount } = useFilters('male')

  return (
    <aside className="w-full lg:w-72 lg:flex-shrink-0">
      <FilterPanel
        filters={filters}
        setFilter={setFilter}
        clearFilters={clearFilters}
        activeCount={activeCount}
      />
    </aside>
  )
}
