import { it, expect } from 'vitest'
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
  const state: FilterState = { g: { values: new Set(['a']) } }
  expect([...applyFilters(items, facets, state)].sort()).toEqual([0, 2])
})

it('empty category set passes all', () => {
  expect(applyFilters(items, facets, { g: { values: new Set() } }).size).toBe(3)
})

it('numeric range filters inclusively', () => {
  expect([...applyFilters(items, facets, { age: { min: 10, max: 50 } })].sort()).toEqual([0, 1])
})

it('combines constraints with AND', () => {
  const state: FilterState = { g: { values: new Set(['a']) }, age: { min: 0, max: 50 } }
  expect([...applyFilters(items, facets, state)]).toEqual([0])
})

it('ignores text-facet constraints', () => {
  expect(applyFilters(items, facets, { bio: { values: new Set(['x']) } }).size).toBe(3)
})

it('excludes items whose numeric value is non-numeric', () => {
  const withBad: Item[] = [
    ...items,
    { id: 3, values: { g: 'a', age: 'n/a', bio: 'q' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const out = applyFilters(withBad, facets, { age: { min: 0, max: 100 } })
  expect(out.has(3)).toBe(false)
})

it('skips an unknown facet name in the state', () => {
  expect(applyFilters(items, facets, { nope: { values: new Set(['x']) } }).size).toBe(3)
})

it('excludes items with a missing numeric value (not coerced to 0)', () => {
  const withMissing: Item[] = [
    ...items,
    { id: 3, values: { g: 'a', age: null, bio: 'q' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  // Range spans 0; Number(null) is 0, so id 3 would slip in if not guarded.
  const out = applyFilters(withMissing, facets, { age: { min: 0, max: 100 } })
  expect(out.has(3)).toBe(false)
})

it('date range filters inclusively and excludes missing dates', () => {
  const f: Facet[] = [{ name: 'joined', type: 'date', min: '2000-01-01', max: '2030-01-01' }]
  const its: Item[] = [
    { id: 0, values: { joined: '2010-05-01' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { joined: '2025-05-01' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 2, values: { joined: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const out = applyFilters(its, f, { joined: { min: '2010-01-01', max: '2020-01-01' } })
  expect([...out].sort()).toEqual([0]) // id 1 out of range, id 2 missing
})

it('numeric range includes nulls only when includeNull is set', () => {
  const withMissing: Item[] = [
    ...items,
    { id: 3, values: { g: 'a', age: null, bio: 'q' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const off = applyFilters(withMissing, facets, { age: { min: 0, max: 100 } })
  expect(off.has(3)).toBe(false)
  const on = applyFilters(withMissing, facets, { age: { min: 0, max: 100, includeNull: true } })
  expect(on.has(3)).toBe(true)
  // includeNull does not rescue a value that is out of range
  const narrow = applyFilters(withMissing, facets, { age: { min: 0, max: 20, includeNull: true } })
  expect([...narrow].sort()).toEqual([0, 3]) // id0 in range, id3 null; id1/id2 out
})

it('includeNull does not rescue a non-numeric (non-missing) value', () => {
  const withBad: Item[] = [
    ...items,
    { id: 3, values: { g: 'a', age: 'n/a', bio: 'q' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const on = applyFilters(withBad, facets, { age: { min: 0, max: 100, includeNull: true } })
  expect(on.has(3)).toBe(false)
})

it('date range includes missing dates only when includeNull is set', () => {
  const f: Facet[] = [{ name: 'joined', type: 'date', min: '2000-01-01', max: '2030-01-01' }]
  const its: Item[] = [
    { id: 0, values: { joined: '2010-05-01' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { joined: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const off = applyFilters(its, f, { joined: { min: '2010-01-01', max: '2020-01-01' } })
  expect([...off]).toEqual([0])
  const on = applyFilters(its, f, { joined: { min: '2010-01-01', max: '2020-01-01', includeNull: true } })
  expect([...on].sort()).toEqual([0, 1])
})

it('category includeNull controls whether missing items pass an active selection', () => {
  const f: Facet[] = [{ name: 'g', type: 'category', values: ['a', 'b'] }]
  const its: Item[] = [
    { id: 0, values: { g: 'a' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { g: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const off = applyFilters(its, f, { g: { values: new Set(['a']) } })
  expect([...off]).toEqual([0]) // null excluded by default
  const on = applyFilters(its, f, { g: { values: new Set(['a']), includeNull: true } })
  expect([...on].sort()).toEqual([0, 1])
})

it('category with no selection passes everything (incl. nulls)', () => {
  const f: Facet[] = [{ name: 'g', type: 'category', values: ['a'] }]
  const its: Item[] = [
    { id: 0, values: { g: 'a' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { g: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  expect(applyFilters(its, f, { g: { values: new Set() } }).size).toBe(2)
})

it('category includeNull alone selects only missing items', () => {
  const f: Facet[] = [{ name: 'g', type: 'category', values: ['a'] }]
  const its: Item[] = [
    { id: 0, values: { g: 'a' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { g: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const out = applyFilters(its, f, { g: { values: new Set(), includeNull: true } })
  expect([...out]).toEqual([1])
})
