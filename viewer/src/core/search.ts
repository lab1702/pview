import type { Item } from './bundle'

export function matchQuery(item: Item, query: string, textFacetNames: string[]): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  const hay = textFacetNames
    .map((n) => String(item.values[n] ?? ''))
    .join(' ')
    .toLowerCase()
  return q.split(/\s+/).every((token) => hay.includes(token))
}
