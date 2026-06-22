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

it('excludes a missing numeric value when nulls are turned off (not coerced to 0)', () => {
  const withMissing: Item[] = [
    ...items,
    { id: 3, values: { g: 'a', age: null, bio: 'q' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  // Range spans 0; Number(null) is 0, so id 3 would slip in if not guarded.
  const out = applyFilters(withMissing, facets, { age: { min: 0, max: 100, includeNull: false } })
  expect(out.has(3)).toBe(false)
})

it('date range filters inclusively and includes missing dates by default', () => {
  const f: Facet[] = [{ name: 'joined', type: 'date', min: '2000-01-01', max: '2030-01-01' }]
  const its: Item[] = [
    { id: 0, values: { joined: '2010-05-01' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { joined: '2025-05-01' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 2, values: { joined: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const out = applyFilters(its, f, { joined: { min: '2010-01-01', max: '2020-01-01' } })
  expect([...out].sort()).toEqual([0, 2]) // id 1 out of range; id 2 missing -> included by default
})

it('numeric range includes nulls by default and excludes them when turned off', () => {
  const withMissing: Item[] = [
    ...items,
    { id: 3, values: { g: 'a', age: null, bio: 'q' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const def = applyFilters(withMissing, facets, { age: { min: 0, max: 100 } })
  expect(def.has(3)).toBe(true) // included by default
  const off = applyFilters(withMissing, facets, { age: { min: 0, max: 100, includeNull: false } })
  expect(off.has(3)).toBe(false)
  // a null is included regardless of whether its (missing) value falls "in range"
  const narrow = applyFilters(withMissing, facets, { age: { min: 0, max: 20 } })
  expect([...narrow].sort()).toEqual([0, 3]) // id0 in range, id3 null included; id1/id2 out
})

it('a non-numeric (non-missing) value is excluded even with nulls included', () => {
  const withBad: Item[] = [
    ...items,
    { id: 3, values: { g: 'a', age: 'n/a', bio: 'q' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const out = applyFilters(withBad, facets, { age: { min: 0, max: 100 } }) // nulls on by default
  expect(out.has(3)).toBe(false)
})

it('date range includes missing dates by default and excludes them when turned off', () => {
  const f: Facet[] = [{ name: 'joined', type: 'date', min: '2000-01-01', max: '2030-01-01' }]
  const its: Item[] = [
    { id: 0, values: { joined: '2010-05-01' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { joined: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const def = applyFilters(its, f, { joined: { min: '2010-01-01', max: '2020-01-01' } })
  expect([...def].sort()).toEqual([0, 1]) // missing included by default
  const off = applyFilters(its, f, { joined: { min: '2010-01-01', max: '2020-01-01', includeNull: false } })
  expect([...off]).toEqual([0])
})

it('category includes missing items in an active selection by default, excludes when turned off', () => {
  const f: Facet[] = [{ name: 'g', type: 'category', values: ['a', 'b'] }]
  const its: Item[] = [
    { id: 0, values: { g: 'a' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { g: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const def = applyFilters(its, f, { g: { values: new Set(['a']) } })
  expect([...def].sort()).toEqual([0, 1]) // null included by default
  const off = applyFilters(its, f, { g: { values: new Set(['a']), includeNull: false } })
  expect([...off]).toEqual([0])
})

it('category with no selection passes everything (incl. nulls)', () => {
  const f: Facet[] = [{ name: 'g', type: 'category', values: ['a'] }]
  const its: Item[] = [
    { id: 0, values: { g: 'a' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { g: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  expect(applyFilters(its, f, { g: { values: new Set() } }).size).toBe(2)
})

it('turning nulls off with no category selection hides only missing items', () => {
  const f: Facet[] = [{ name: 'g', type: 'category', values: ['a'] }]
  const its: Item[] = [
    { id: 0, values: { g: 'a' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { g: null }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const out = applyFilters(its, f, { g: { values: new Set(), includeNull: false } })
  expect([...out]).toEqual([0])
})
