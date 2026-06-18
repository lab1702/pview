import type { Facet, Item } from './bundle'

export type CategoryConstraint = Set<string>
export type RangeConstraint = { min: number; max: number } | { min: string; max: string }
export type Constraint = CategoryConstraint | RangeConstraint
export type FilterState = Record<string, Constraint | undefined>

export function applyFilters(items: Item[], facets: Facet[], state: FilterState): Set<number> {
  const byName = new Map(facets.map((f) => [f.name, f]))
  const out = new Set<number>()
  for (const item of items) {
    if (passes(item, byName, state)) out.add(item.id)
  }
  return out
}

function passes(item: Item, byName: Map<string, Facet>, state: FilterState): boolean {
  for (const name of Object.keys(state)) {
    const constraint = state[name]
    if (constraint === undefined) continue
    const facet = byName.get(name)
    if (!facet) continue
    if (!passesConstraint(item, facet, constraint)) return false
  }
  return true
}

/** Whether a single facet's constraint admits this item. An empty category set
 *  (and text facets) impose no constraint. Shared by applyFilters and the
 *  faceted-count pass so both agree on what "passes" means. */
export function passesConstraint(item: Item, facet: Facet, constraint: Constraint): boolean {
  const value = item.values[facet.name]
  if (facet.type === 'category') {
    const set = constraint as CategoryConstraint
    if (set.size === 0) return true
    return set.has(String(value))
  }
  if (facet.type === 'numeric') {
    const { min, max } = constraint as { min: number; max: number }
    // An item lacking a value for this facet does not satisfy a range
    // constraint. Reject it explicitly: Number(null)/Number('') are 0, which
    // would otherwise let a missing value slip through whenever 0 is in range.
    if (value === null || value === undefined || value === '') return false
    const v = Number(value)
    return !(Number.isNaN(v) || v < min || v > max)
  }
  if (facet.type === 'date') {
    const { min, max } = constraint as { min: string; max: string }
    // Likewise, a missing date does not satisfy a date-range constraint.
    if (value === null || value === undefined || value === '') return false
    const v = String(value)
    return !(v < min || v > max)
  }
  // text facets are not filtered
  return true
}
