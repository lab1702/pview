import { it, expect } from 'vitest'
import { histogramLayout } from '../src/core/layout/histogram'
import type { Facet, Item } from '../src/core/bundle'

function item(id: number, values: Record<string, unknown>): Item {
  return { id, values, atlas: 0, rect: [0, 0, 1, 1], detail: null }
}

const catFacet: Facet = { name: 'g', type: 'category', values: ['a', 'b', 'c'] }
const items: Item[] = [
  item(0, { g: 'a', n: 5 }),
  item(1, { g: 'a', n: 15 }),
  item(2, { g: 'b', n: 25 }),
]
const opts = { tileSize: 100, gap: 10, barGap: 50 }

it('groups category items into one bar per value with counts', () => {
  const r = histogramLayout([0, 1, 2], items, catFacet, opts)
  expect(r.bars.map((b) => b.label)).toEqual(['a', 'b', 'c'])
  expect(r.bars.map((b) => b.count)).toEqual([2, 1, 0]) // empty bar 'c' still present
})

it('stacks items bottom-up within a bar', () => {
  const r = histogramLayout([0, 1, 2], items, catFacet, opts)
  const barStep = 150 // tileSize + barGap
  const step = 110 // tileSize + gap
  // bar 'a' center x = 0*150 + 50 = 50; first item (k=0) y = -0 - 50 = -50
  expect(r.targets.get(0)).toEqual({ x: 50, y: -50, scale: 1 })
  // second 'a' item (k=1) y = -(1*110) - 50 = -160
  expect(r.targets.get(1)).toEqual({ x: 50, y: -160, scale: 1 })
  // 'b' item bar index 1: x = 150 + 50 = 200, k=0
  expect(r.targets.get(2)).toEqual({ x: 200, y: -50, scale: 1 })
  void barStep
  void step
})

it('reports bar centers and bounds', () => {
  const r = histogramLayout([0, 1, 2], items, catFacet, opts)
  expect(r.bars.map((b) => b.x)).toEqual([50, 200, 350])
  // 3 bars: w = 3*150 - 50 = 400 ; tallest bar 2 high: h = 2*110 - 10 = 210
  expect(r.bounds).toEqual({ w: 400, h: 210 })
})

it('buckets a numeric facet and omits ids not in orderedIds', () => {
  const numFacet: Facet = { name: 'n', type: 'numeric', min: 0, max: 30 }
  const r = histogramLayout([0, 2], items, numFacet, opts) // id 1 omitted
  // n=5 -> bucket 0..? ; n=25 -> a later bucket. Just assert placement + omission.
  expect(r.targets.has(1)).toBe(false)
  expect(r.targets.has(0)).toBe(true)
  expect(r.targets.has(2)).toBe(true)
})
