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
  const cmp =
    facet?.type === 'numeric'
      ? (a: unknown, b: unknown) => Number(a) - Number(b)
      : (a: unknown, b: unknown) => String(a).localeCompare(String(b))
  return [...ids].sort(
    (a, b) => sign * cmp(byId.get(a)?.values[facetName], byId.get(b)?.values[facetName]),
  )
}
