import { it, expect } from 'vitest'
import { valueToFraction, fractionToValue, clampLow, clampHigh } from '../src/core/rangeModel'

it('maps value to fraction', () => {
  expect(valueToFraction(5, 0, 10)).toBeCloseTo(0.5)
  expect(valueToFraction(-1, 0, 10)).toBe(0)
  expect(valueToFraction(11, 0, 10)).toBe(1)
})

it('degenerate range maps to 0', () => {
  expect(valueToFraction(5, 5, 5)).toBe(0)
})

it('maps fraction to value', () => {
  expect(fractionToValue(0.5, 0, 10)).toBeCloseTo(5)
})

it('snaps to step', () => {
  expect(fractionToValue(0.27, 0, 10, 1)).toBe(3)
})

it('clamps handles so they cannot cross', () => {
  expect(clampLow(8, 5, 0)).toBe(5) // low cannot exceed high
  expect(clampHigh(3, 5, 10)).toBe(5) // high cannot fall below low
})

it('clamps handles to the facet bounds', () => {
  expect(clampLow(-5, 5, 0)).toBe(0) // low cannot go below min
  expect(clampHigh(15, 5, 10)).toBe(10) // high cannot exceed max
})
