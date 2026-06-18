import type { Item } from './bundle'

/** Lower-case and strip diacritics so an ASCII query (e.g. "pokemon") matches
 *  accented text ("Pokémon"). */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function matchQuery(item: Item, query: string, textFacetNames: string[]): boolean {
  const q = fold(query.trim())
  if (q === '') return true
  const hay = fold(textFacetNames.map((n) => String(item.values[n] ?? '')).join(' '))
  return q.split(/\s+/).every((token) => hay.includes(token))
}
