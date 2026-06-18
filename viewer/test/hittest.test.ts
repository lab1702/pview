import { it, expect } from 'vitest'
import { hitTest, type HitEntry } from '../src/core/hittest'

const entries: HitEntry[] = [
  { id: 0, x: 0, y: 0, alpha: 1 },
  { id: 1, x: 100, y: 0, alpha: 1 },
]

it('returns the id of the tile containing the point', () => {
  expect(hitTest(5, 5, entries, 64)).toBe(0) // within 0±32
  expect(hitTest(100, 10, entries, 64)).toBe(1)
})

it('returns null when no tile contains the point', () => {
  expect(hitTest(60, 0, entries, 64)).toBeNull() // between the two tiles
})

it('skips faded-out (alpha<=0.01) tiles', () => {
  const faded: HitEntry[] = [{ id: 0, x: 0, y: 0, alpha: 0 }]
  expect(hitTest(0, 0, faded, 64)).toBeNull()
})

it('returns the last (topmost) match when tiles overlap', () => {
  const stacked: HitEntry[] = [
    { id: 0, x: 0, y: 0, alpha: 1 },
    { id: 1, x: 0, y: 0, alpha: 1 },
  ]
  expect(hitTest(0, 0, stacked, 64)).toBe(1)
})
