import { it, expect } from 'vitest'
import { matchQuery } from '../src/core/search'
import type { Item } from '../src/core/bundle'

const item: Item = {
  id: 0,
  values: { name: 'Ada Lovelace', note: 'first programmer' },
  atlas: 0,
  rect: [0, 0, 1, 1],
  detail: null,
}
const textFacets = ['name', 'note']

it('empty query matches', () => {
  expect(matchQuery(item, '   ', textFacets)).toBe(true)
})

it('matches a case-insensitive substring', () => {
  expect(matchQuery(item, 'LOVE', textFacets)).toBe(true)
})

it('requires all tokens to match', () => {
  expect(matchQuery(item, 'ada programmer', textFacets)).toBe(true)
  expect(matchQuery(item, 'ada nope', textFacets)).toBe(false)
})
