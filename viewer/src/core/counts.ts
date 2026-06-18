import type { Facet, Item } from './bundle'
import { applyFilters, type FilterState } from './filter'

export function facetedCounts(
  items: Item[],
  facets: Facet[],
  state: FilterState,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()
  for (const facet of facets) {
    if (facet.type !== 'category') continue
    const others: FilterState = { ...state, [facet.name]: undefined }
    const visible = applyFilters(items, facets, others)
    const counts = new Map<string, number>()
    for (const v of facet.values) counts.set(v, 0)
    for (const item of items) {
      if (!visible.has(item.id)) continue
      const key = String(item.values[facet.name])
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    result.set(facet.name, counts)
  }
  return result
}
