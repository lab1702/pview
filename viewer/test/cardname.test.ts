import { it, expect } from 'vitest'
import { cardName } from '../src/core/cardname'
import type { Item } from '../src/core/bundle'

const item = (values: Record<string, unknown>): Item => ({
  id: 0,
  values,
  atlas: 0,
  rect: [0, 0, 1, 1],
  detail: null,
})

it('uses the value at nameKey', () => {
  expect(cardName(item({ name: 'Ada', rank: 1 }), 'name')).toBe('Ada')
})

it('coerces non-string values to a string', () => {
  expect(cardName(item({ rank: 7 }), 'rank')).toBe('7')
})

it('falls back to the first value when nameKey is missing', () => {
  expect(cardName(item({ group: 'A', rank: 1 }), 'name')).toBe('A')
})

it('returns an empty string when there are no values', () => {
  expect(cardName(item({}), 'name')).toBe('')
})
