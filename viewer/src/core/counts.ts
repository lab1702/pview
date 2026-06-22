import type { Facet, Item } from './bundle'
import { passesConstraint, type Constraint, type FilterState } from './filter'
import { isMissingFor, NULL_KEY } from './nulls'

/** Per-category-facet value counts under the current filter, where each facet's
 *  own constraint is excluded from its own counts (so toggling a value doesn't
 *  zero out its siblings). Equivalent to running applyFilters once per facet
 *  with that facet relaxed, but in a single O(items × constraints) pass: an item
 *  counts toward facet X iff the only constraint it fails (if any) is X's. */
export function facetedCounts(
  items: Item[],
  facets: Facet[],
  state: FilterState,
): Map<string, Map<string, number>> {
  const byName = new Map(facets.map((f) => [f.name, f]))
  const categoryFacets = facets.filter((f) => f.type === 'category')

  // The active constraints applyFilters would enforce, resolved once.
  const constraints: { name: string; facet: Facet; constraint: Constraint }[] = []
  for (const name of Object.keys(state)) {
    const constraint = state[name]
    if (constraint === undefined) continue
    const facet = byName.get(name)
    if (!facet) continue
    constraints.push({ name, facet, constraint })
  }

  const result = new Map<string, Map<string, number>>()
  for (const f of categoryFacets) {
    const m = new Map<string, number>((f.values as string[]).map((v) => [v, 0]))
    if (items.some((it) => isMissingFor('category', it.values[f.name]))) m.set(NULL_KEY, 0)
    result.set(f.name, m)
  }

  const bump = (facetName: string, value: unknown) => {
    const counts = result.get(facetName)
    if (!counts) return
    const key = isMissingFor('category', value) ? NULL_KEY : String(value)
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1)
  }

  for (const item of items) {
    // Find which constraints this item fails. We only care whether the count is
    // 0, exactly 1, or ≥2, so stop after the second failure.
    let failedName: string | null = null
    let failedCount = 0
    for (const { name, facet, constraint } of constraints) {
      if (!passesConstraint(item, facet, constraint)) {
        failedCount++
        failedName = name
        if (failedCount > 1) break
      }
    }
    if (failedCount === 0) {
      // Passes everything → counts toward every category facet.
      for (const f of categoryFacets) bump(f.name, item.values[f.name])
    } else if (failedCount === 1) {
      // Fails exactly one constraint → counts only toward that facet, whose own
      // constraint its counts are allowed to ignore.
      bump(failedName!, item.values[failedName!])
    }
  }
  return result
}
