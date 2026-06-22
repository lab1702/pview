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
  // A value is "bad" if missing (null/undefined/'') or, for numeric facets,
  // non-numeric. Bad values sort to the end in BOTH directions, so `sign` is
  // not applied to the bad-value branch. Number(null) === 0, so the explicit
  // null/'' check is required — NaN detection alone would sort nulls as 0.
  const bad = (x: unknown): boolean =>
    x === null || x === undefined || x === '' || (numeric && Number.isNaN(Number(x)))
  const cmp = (a: unknown, b: unknown): number => {
    const aBad = bad(a)
    const bBad = bad(b)
    if (aBad || bBad) return aBad && bBad ? 0 : aBad ? 1 : -1
    if (numeric) return sign * (Number(a) - Number(b))
    // numeric:true so "2" sorts before "10" rather than lexicographically.
    return sign * String(a).localeCompare(String(b), undefined, { numeric: true })
  }
  return [...ids].sort((a, b) => cmp(byId.get(a)?.values[facetName], byId.get(b)?.values[facetName]))
}
