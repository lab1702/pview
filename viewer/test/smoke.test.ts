import { describe, it, expect } from 'vitest'

function add(a: number, b: number): number {
  return a + b
}

describe('toolchain', () => {
  it('runs vitest and typescript', () => {
    expect(add(2, 3)).toBe(5)
  })
})
