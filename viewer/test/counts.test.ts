import { it, expect } from 'vitest'
import { facetedCounts } from '../src/core/counts'
import type { Facet, Item } from '../src/core/bundle'

const facets: Facet[] = [
  { name: 'g', type: 'category', values: ['a', 'b'] },
  { name: 'c', type: 'category', values: ['x', 'y'] },
]
const items: Item[] = [
  { id: 0, values: { g: 'a', c: 'x' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 1, values: { g: 'a', c: 'y' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 2, values: { g: 'b', c: 'x' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
]

it('counts all values with an empty filter', () => {
  const counts = facetedCounts(items, facets, {})
  expect(counts.get('g')).toEqual(new Map([['a', 2], ['b', 1]]))
})

it("excludes a facet's own constraint from its counts", () => {
  // selecting g=a: g's own counts ignore that constraint (still a:2, b:1),
  // but c's counts reflect g=a -> x:1, y:1
  const state = { g: new Set(['a']) }
  const counts = facetedCounts(items, facets, state)
  expect(counts.get('g')).toEqual(new Map([['a', 2], ['b', 1]]))
  expect(counts.get('c')).toEqual(new Map([['x', 1], ['y', 1]]))
})
