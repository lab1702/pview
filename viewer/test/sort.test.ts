import { it, expect } from 'vitest'
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

it('sorts missing/non-numeric values to the end in both directions', () => {
  const withBad: Item[] = [
    { id: 0, values: { age: 30, name: 'Bob' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { age: 'n/a', name: 'Ada' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 2, values: { age: 10, name: 'Cy' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  // The non-numeric value (id 1) trails the real numbers regardless of direction.
  expect(sortIds([0, 1, 2], withBad, 'age', 'asc', facets)).toEqual([2, 0, 1])
  expect(sortIds([0, 1, 2], withBad, 'age', 'desc', facets)).toEqual([0, 2, 1])
})

it('sorts numeric-looking category values numerically, not lexicographically', () => {
  const f: Facet[] = [{ name: 'rank', type: 'category', values: ['2', '9', '10'] }]
  const its: Item[] = [
    { id: 0, values: { rank: '10' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { rank: '2' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 2, values: { rank: '9' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  expect(sortIds([0, 1, 2], its, 'rank', 'asc', f)).toEqual([1, 2, 0]) // 2, 9, 10
})

it('sorts numeric null to the end in both directions', () => {
  const its: Item[] = [
    { id: 0, values: { age: 30 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { age: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 2, values: { age: 10 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  expect(sortIds([0, 1, 2], its, 'age', 'asc', facets)).toEqual([2, 0, 1])
  expect(sortIds([0, 1, 2], its, 'age', 'desc', facets)).toEqual([0, 2, 1])
})

it('sorts category/date null to the end in both directions', () => {
  const f: Facet[] = [{ name: 'd', type: 'date', min: '2000-01-01', max: '2030-01-01' }]
  const its: Item[] = [
    { id: 0, values: { d: '2010-01-01' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { d: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 2, values: { d: '2005-01-01' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  expect(sortIds([0, 1, 2], its, 'd', 'asc', f)).toEqual([2, 0, 1])
  expect(sortIds([0, 1, 2], its, 'd', 'desc', f)).toEqual([0, 2, 1])
})
