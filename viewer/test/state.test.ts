import { describe, it, expect } from 'vitest'
import { createViewerState } from '../src/ui/state'
import type { Bundle } from '../src/core/bundle'

function bundle(): Bundle {
  return {
    version: 2,
    title: 'T',
    tileSize: 64,
    facets: [
      { name: 'name', type: 'text' },
      { name: 'g', type: 'category', values: ['a', 'b'] },
      { name: 'age', type: 'numeric', min: 0, max: 100 },
    ],
    cardFields: ['name'],
    atlases: [{ file: 'a', width: 1, height: 1 }],
    items: [
      { id: 0, values: { name: 'Ada', g: 'a', age: 10 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
      { id: 1, values: { name: 'Bob', g: 'b', age: 50 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
      { id: 2, values: { name: 'Cy', g: 'a', age: 90 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    ],
  }
}

it('visibleIds reflects filters', () => {
  const s = createViewerState(bundle())
  expect(s.visibleIds.value.size).toBe(3)
  s.filter.value = { g: new Set(['a']) }
  expect([...s.visibleIds.value].sort()).toEqual([0, 2])
})

it('visibleIds reflects search AND filters', () => {
  const s = createViewerState(bundle())
  s.query.value = 'ada'
  expect([...s.visibleIds.value]).toEqual([0])
})

it('sortedVisible applies sort', () => {
  const s = createViewerState(bundle())
  s.sort.value = { facet: 'age', dir: 'desc' }
  expect(s.sortedVisible.value).toEqual([2, 1, 0])
})

it('counts reflect other filters but not own facet', () => {
  const s = createViewerState(bundle())
  s.filter.value = { g: new Set(['a']) }
  expect(s.counts.value.get('g')).toEqual(new Map([['a', 2], ['b', 1]]))
})

it('reset clears filter and query', () => {
  const s = createViewerState(bundle())
  s.filter.value = { g: new Set(['a']) }
  s.query.value = 'x'
  s.reset()
  expect(s.filter.value).toEqual({})
  expect(s.query.value).toBe('')
})
