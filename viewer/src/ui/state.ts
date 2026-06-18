import { signal, computed, type Signal, type ReadonlySignal } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { applyFilters, type FilterState } from '../core/filter'
import { matchQuery } from '../core/search'
import { sortIds, type SortDir } from '../core/sort'
import { facetedCounts } from '../core/counts'
import { isBucketable } from '../core/facets'

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
  const bucketable = bundle.facets.filter(isBucketable)
  const view = signal<'grid' | 'histogram'>('grid')
  const histogramFacet = signal<string | null>(bucketable[0]?.name ?? null)
  const selectedId = signal<number | null>(null)
  const textFacetNames = bundle.facets.filter((f) => f.type === 'text').map((f) => f.name)
  // Built once; the item set is immutable for a bundle. Reused by the query pass
  // below instead of rescanning all items on every keystroke.
  const byId = new Map(bundle.items.map((it) => [it.id, it]))

  const visibleIds = computed(() => {
    const filtered = applyFilters(bundle.items, bundle.facets, filter.value)
    const q = query.value
    if (q.trim() === '') return filtered
    // Only re-test the already-filtered set, not the whole corpus.
    const out = new Set<number>()
    for (const id of filtered) {
      const item = byId.get(id)
      if (item && matchQuery(item, q, textFacetNames)) out.add(id)
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
