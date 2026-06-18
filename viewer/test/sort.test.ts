import { describe, it, expect } from 'vitest'
import { sortIds } from '../src/core/sort'
import type { Facet, Item } from '../src/core/bundle'

const facets: Facet[] = [
  { name: 'age', type: 'numeric', min: 0, max: 100 },
  { name: 'name', type: 'text' },
]
const items: Item[] = [
  { id: 0, values: { age: 30, name: 'Bob' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 1, values: { age: 10, name: 'Ada' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 2, values: { age: 30, name: 'Cy' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
]

it('sorts numeric ascending', () => {
  expect(sortIds([0, 1, 2], items, 'age', 'asc', facets)).toEqual([1, 0, 2])
})

it('sorts numeric descending', () => {
  expect(sortIds([0, 1, 2], items, 'age', 'desc', facets)).toEqual([0, 2, 1])
})

it('is stable for equal keys (asc keeps input order)', () => {
  // ids 0 and 2 both have age 30 -> keep [0, 2]
  expect(sortIds([0, 1, 2], items, 'age', 'asc', facets)).toEqual([1, 0, 2])
})

it('sorts text', () => {
  expect(sortIds([0, 1, 2], items, 'name', 'asc', facets)).toEqual([1, 0, 2])
})

it('null facet returns an unchanged copy', () => {
  const input = [2, 0, 1]
  const out = sortIds(input, items, null, 'asc', facets)
  expect(out).toEqual([2, 0, 1])
  expect(out).not.toBe(input)
})
