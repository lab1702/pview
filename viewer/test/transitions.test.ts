import { it, expect } from 'vitest'
import { TransitionController, easeInOutCubic } from '../src/scene/transitions'

it('ease is 0 at 0 and 1 at 1', () => {
  expect(easeInOutCubic(0)).toBe(0)
  expect(easeInOutCubic(1)).toBe(1)
})

it('tick(0) leaves current at start; full duration reaches target', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 0, y: 0, scale: 1, alpha: 1 })
  c.setTargets(new Map([[0, { x: 10, y: 20, scale: 2 }]]), new Set([0]))
  c.tick(0)
  expect(c.get(0)).toEqual({ x: 0, y: 0, scale: 1, alpha: 1 })
  c.tick(100)
  const s = c.get(0)!
  expect(s.x).toBeCloseTo(10)
  expect(s.y).toBeCloseTo(20)
  expect(s.scale).toBeCloseTo(2)
  expect(s.alpha).toBeCloseTo(1)
})

it('a filtered-out id animates alpha toward 0', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 0, y: 0, scale: 1, alpha: 1 })
  c.setTargets(new Map(), new Set()) // not visible
  c.tick(100)
  expect(c.get(0)!.alpha).toBeCloseTo(0)
})

it('setTargets mid-flight re-bases from the current position', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 0, y: 0, scale: 1, alpha: 1 })
  c.setTargets(new Map([[0, { x: 100, y: 0, scale: 1 }]]), new Set([0]))
  c.tick(50) // halfway-ish
  const mid = c.get(0)!.x
  expect(mid).toBeGreaterThan(0)
  expect(mid).toBeLessThan(100)
  c.setTargets(new Map([[0, { x: 0, y: 0, scale: 1 }]]), new Set([0]))
  c.tick(0)
  expect(c.get(0)!.x).toBeCloseTo(mid) // re-based, no jump
})

it('snap jumps current to target', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 0, y: 0, scale: 1, alpha: 1 })
  c.setTargets(new Map([[0, { x: 5, y: 5, scale: 1 }]]), new Set([0]))
  c.snap()
  expect(c.get(0)).toEqual({ x: 5, y: 5, scale: 1, alpha: 1 })
})

it('clear() removes all entries', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 1, y: 2, scale: 1, alpha: 1 })
  c.setTargets(new Map([[0, { x: 9, y: 9, scale: 1 }]]), new Set([0]))
  c.clear()
  expect(c.get(0)).toBeUndefined()
})
