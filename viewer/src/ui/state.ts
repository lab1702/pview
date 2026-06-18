import { signal, computed, type Signal, type ReadonlySignal } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { applyFilters, type FilterState } from '../core/filter'
import { matchQuery } from '../core/search'
import { sortIds, type SortDir } from '../core/sort'
import { facetedCounts } from '../core/counts'

export interface ViewerState {
  filter: Signal<FilterState>
  sort: Signal<{ facet: string | null; dir: SortDir }>
  query: Signal<string>
  view: Signal<'grid' | 'histogram'>
  histogramFacet: Signal<string | null>
  selectedId: Signal<number | null>
  visibleIds: ReadonlySignal<Set<number>>
  sortedVisible: ReadonlySignal<number[]>
  counts: ReadonlySignal<Map<string, Map<string, number>>>
  reset: () => void
}

export function createViewerState(bundle: Bundle): ViewerState {
  const filter = signal<FilterState>({})
  const sort = signal<{ facet: string | null; dir: SortDir }>({ facet: null, dir: 'asc' })
  const query = signal<string>('')
  const bucketable = bundle.facets.filter(
    (f) => f.type === 'category' || f.type === 'numeric' || f.type === 'date',
  )
  const view = signal<'grid' | 'histogram'>('grid')
  const histogramFacet = signal<string | null>(bucketable[0]?.name ?? null)
  const selectedId = signal<number | null>(null)
  const textFacetNames = bundle.facets.filter((f) => f.type === 'text').map((f) => f.name)

  const visibleIds = computed(() => {
    const filtered = applyFilters(bundle.items, bundle.facets, filter.value)
    const q = query.value
    if (q.trim() === '') return filtered
    const out = new Set<number>()
    for (const item of bundle.items) {
      if (filtered.has(item.id) && matchQuery(item, q, textFacetNames)) out.add(item.id)
    }
    return out
  })

  const sortedVisible = computed(() =>
    sortIds([...visibleIds.value], bundle.items, sort.value.facet, sort.value.dir, bundle.facets),
  )

  const counts = computed(() => facetedCounts(bundle.items, bundle.facets, filter.value))

  const reset = () => {
    filter.value = {}
    query.value = ''
  }

  return { filter, sort, query, view, histogramFacet, selectedId, visibleIds, sortedVisible, counts, reset }
}
