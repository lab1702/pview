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

it('reflects constraints on other facet types (numeric) in category counts', () => {
  const f: Facet[] = [...facets, { name: 'age', type: 'numeric', min: 0, max: 100 }]
  const its: Item[] = [
    { id: 0, values: { g: 'a', c: 'x', age: 10 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { g: 'a', c: 'y', age: 80 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 2, values: { g: 'b', c: 'x', age: 90 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  // age <= 50 keeps only item 0; category counts reflect that filter
  const counts = facetedCounts(its, f, { age: { min: 0, max: 50 } })
  expect(counts.get('g')).toEqual(new Map([['a', 1], ['b', 0]]))
  expect(counts.get('c')).toEqual(new Map([['x', 1], ['y', 0]]))
})

it('counts toward a facet items that fail only that facet (two category constraints)', () => {
  // Constrain both g and c. Item 1 (g=a,c=y) fails only c=x, so it should be
  // counted in c's relaxed counts but not g's.
  const state = { g: new Set(['a']), c: new Set(['x']) }
  const counts = facetedCounts(items, facets, state)
  // g relaxed: items passing c=x are 0 (a,x) and 2 (b,x) -> a:1, b:1
  expect(counts.get('g')).toEqual(new Map([['a', 1], ['b', 1]]))
  // c relaxed: items passing g=a are 0 (x) and 1 (y) -> x:1, y:1
  expect(counts.get('c')).toEqual(new Map([['x', 1], ['y', 1]]))
})
