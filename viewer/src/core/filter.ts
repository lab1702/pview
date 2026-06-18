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
    const value = item.values[name]
    if (facet.type === 'category') {
      const set = constraint as CategoryConstraint
      if (set.size === 0) continue
      if (!set.has(String(value))) return false
    } else if (facet.type === 'numeric') {
      const { min, max } = constraint as { min: number; max: number }
      const v = Number(value)
      if (Number.isNaN(v) || v < min || v > max) return false
    } else if (facet.type === 'date') {
      const { min, max } = constraint as { min: string; max: string }
      const v = String(value)
      if (v < min || v > max) return false
    }
    // text facets are not filtered here
  }
  return true
}
