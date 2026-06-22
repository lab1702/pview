import type { Facet, Item } from './bundle'

/** Reserved key for the synthetic "(no value)" entry in a category count map.
 *  The leading-space prefix keeps it from colliding with any real category. */
export const NULL_KEY = ' __pview_null__'

/** Base "missing" test: JSON null or absent. */
export const isMissing = (v: unknown): boolean => v === null || v === undefined

/** Whether a value is missing for a facet of the given type. Numeric and date
 *  also treat '' as missing ('' is never a valid number or date, and
 *  Number('') === 0 would otherwise slip through a range spanning 0). Category
 *  treats only null/undefined as missing, so a genuine empty-string category
 *  survives Python's astype(str) as a selectable value. */
export function isMissingFor(type: Facet['type'], v: unknown): boolean {
  if (isMissing(v)) return true
  if ((type === 'numeric' || type === 'date') && v === '') return true
  return false
}

/** Names of filterable facets (numeric/date/category) that have at least one
 *  missing value across items. Drives whether the null filter control and the
 *  histogram null bucket appear. */
export function facetsWithNull(items: Item[], facets: Facet[]): Set<string> {
  const out = new Set<string>()
  for (const f of facets) {
    if (f.type === 'text') continue
    for (const it of items) {
      if (isMissingFor(f.type, it.values[f.name])) {
        out.add(f.name)
        break
      }
    }
  }
  return out
}
