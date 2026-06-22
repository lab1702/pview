import type { Facet, Item } from './bundle'
import { isMissingFor } from './nulls'

export type CategoryConstraint = { values: Set<string>; includeNull?: boolean }
export type RangeConstraint =
  | { min: number; max: number; includeNull?: boolean }
  | { min: string; max: string; includeNull?: boolean }
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

/** Whether a single facet's constraint admits this item. An inactive category
 *  constraint (no values selected and includeNull unset) and text facets impose
 *  no constraint. Shared by applyFilters and the faceted-count pass so both
 *  agree on what "passes" means. */
export function passesConstraint(item: Item, facet: Facet, constraint: Constraint): boolean {
  const value = item.values[facet.name]
  if (facet.type === 'category') {
    const { values, includeNull } = constraint as CategoryConstraint
    // No active selection => no constraint; everything passes (incl. nulls).
    if (values.size === 0 && includeNull !== true) return true
    if (isMissingFor('category', value)) return includeNull === true
    return values.has(String(value))
  }
  if (facet.type === 'numeric') {
    const { min, max, includeNull } = constraint as { min: number; max: number; includeNull?: boolean }
    // A missing value satisfies the range only when the user opted in. Note
    // Number(null)/Number('') are 0, so the explicit missing check must come
    // before the numeric coercion below.
    if (isMissingFor('numeric', value)) return includeNull === true
    const v = Number(value)
    return !(Number.isNaN(v) || v < min || v > max)
  }
  if (facet.type === 'date') {
    const { min, max, includeNull } = constraint as { min: string; max: string; includeNull?: boolean }
    if (isMissingFor('date', value)) return includeNull === true
    const v = String(value)
    return !(v < min || v > max)
  }
  // text facets are not filtered
  return true
}
