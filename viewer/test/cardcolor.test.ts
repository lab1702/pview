import { it, expect } from 'vitest'
import { generatedColor } from '../src/core/cardcolor'

it('is deterministic and returns a #rrggbb string', () => {
  expect(generatedColor(0)).toMatch(/^#[0-9a-f]{6}$/)
  expect(generatedColor(7)).toBe(generatedColor(7))
})

it('gives different colors to different ids', () => {
  expect(generatedColor(1)).not.toBe(generatedColor(2))
})

it('matches the known color for id 0', () => {
  // hue=0, HLS(0, L=0.45, S=0.55) -> floor(.*255) -> #b13333
  expect(generatedColor(0)).toBe('#b13333')
})
