import type { Facet, Item } from './bundle'

export type SortDir = 'asc' | 'desc'

export function sortIds(
  ids: number[],
  items: Item[],
  facetName: string | null,
  dir: SortDir,
  facets: Facet[],
): number[] {
  if (facetName === null) return [...ids]
  const facet = facets.find((f) => f.name === facetName)
  const byId = new Map(items.map((it) => [it.id, it]))
  const sign = dir === 'desc' ? -1 : 1
  const numeric = facet?.type === 'numeric'
  const cmp = (a: unknown, b: unknown): number => {
    if (numeric) {
      // A missing/non-numeric value coerces to NaN; `NaN - x` is NaN, and a
      // comparator returning NaN leaves Array.sort order undefined. Sort such
      // values to the end regardless of direction instead.
      const na = Number(a)
      const nb = Number(b)
      const aBad = Number.isNaN(na)
      const bBad = Number.isNaN(nb)
      if (aBad || bBad) return aBad && bBad ? 0 : aBad ? 1 : -1
      return sign * (na - nb)
    }
    // numeric:true so "2" sorts before "10" rather than lexicographically.
    return sign * String(a).localeCompare(String(b), undefined, { numeric: true })
  }
  return [...ids].sort((a, b) => cmp(byId.get(a)?.values[facetName], byId.get(b)?.values[facetName]))
}
