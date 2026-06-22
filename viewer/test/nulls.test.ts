import { it, expect } from 'vitest'
import { isMissing, isMissingFor, facetsWithNull, NULL_KEY } from '../src/core/nulls'
import type { Facet, Item } from '../src/core/bundle'

it('isMissing is true only for null/undefined', () => {
  expect(isMissing(null)).toBe(true)
  expect(isMissing(undefined)).toBe(true)
  expect(isMissing('')).toBe(false)
  expect(isMissing(0)).toBe(false)
})

it('isMissingFor treats empty string as missing for numeric/date only', () => {
  expect(isMissingFor('numeric', '')).toBe(true)
  expect(isMissingFor('date', '')).toBe(true)
  expect(isMissingFor('category', '')).toBe(false)
  expect(isMissingFor('category', null)).toBe(true)
  expect(isMissingFor('numeric', 'n/a')).toBe(false) // junk, not missing
  expect(isMissingFor('numeric', 5)).toBe(false)
})

it('facetsWithNull lists facets with a missing value, per-type rule', () => {
  const facets: Facet[] = [
    { name: 'age', type: 'numeric', min: 0, max: 10 },
    { name: 'full', type: 'numeric', min: 0, max: 10 },
    { name: 'cat', type: 'category', values: ['a'] },
    { name: 'bio', type: 'text' },
  ]
  const items: Item[] = [
    { id: 0, values: { age: null, full: 1, cat: 'a', bio: '' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    { id: 1, values: { age: 5, full: 2, cat: '', bio: 'x' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  ]
  const out = facetsWithNull(items, facets)
  expect(out.has('age')).toBe(true) // null value
  expect(out.has('full')).toBe(false) // all present
  expect(out.has('cat')).toBe(false) // '' is a real category, not missing
  expect(out.has('bio')).toBe(false) // text facets are skipped
})

it('NULL_KEY is a non-empty string', () => {
  expect(typeof NULL_KEY).toBe('string')
  expect(NULL_KEY.length).toBeGreaterThan(0)
})
