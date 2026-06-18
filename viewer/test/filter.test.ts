import { describe, it, expect } from 'vitest'
import { applyFilters, type FilterState } from '../src/core/filter'
import type { Facet, Item } from '../src/core/bundle'

const facets: Facet[] = [
  { name: 'g', type: 'category', values: ['a', 'b'] },
  { name: 'age', type: 'numeric', min: 0, max: 100 },
  { name: 'bio', type: 'text' },
]
const items: Item[] = [
  { id: 0, values: { g: 'a', age: 10, bio: 'x' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 1, values: { g: 'b', age: 50, bio: 'y' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 2, values: { g: 'a', age: 90, bio: 'z' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
]

it('empty state passes everything', () => {
  expect(applyFilters(items, facets, {}).size).toBe(3)
})

it('category constraint filters by membership', () => {
  const state: FilterState = { g: new Set(['a']) }
  expect([...applyFilters(items, facets, state)].sort()).toEqual([0, 2])
})

it('empty category set passes all', () => {
  expect(applyFilters(items, facets, { g: new Set() }).size).toBe(3)
})

it('numeric range filters inclusively', () => {
  expect([...applyFilters(items, facets, { age: { min: 10, max: 50 } })].sort()).toEqual([0, 1])
})

it('combines constraints with AND', () => {
  const state: FilterState = { g: new Set(['a']), age: { min: 0, max: 50 } }
  expect([...applyFilters(items, facets, state)]).toEqual([0])
})

it('ignores text-facet constraints', () => {
  expect(applyFilters(items, facets, { bio: new Set(['x']) }).size).toBe(3)
})
