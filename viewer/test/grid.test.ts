import { describe, it, expect } from 'vitest'
import { gridLayout } from '../src/core/layout/grid'

describe('gridLayout', () => {
  it('places ids as tile centers, left-to-right, top-to-bottom', () => {
    const { targets } = gridLayout([10, 11, 12, 13, 14], { columns: 2, tileSize: 64, gap: 6 })
    // step = 70, center offset = 32
    expect(targets.get(10)).toEqual({ x: 32, y: 32, scale: 1 })
    expect(targets.get(11)).toEqual({ x: 102, y: 32, scale: 1 })
    expect(targets.get(12)).toEqual({ x: 32, y: 102, scale: 1 })
    expect(targets.get(13)).toEqual({ x: 102, y: 102, scale: 1 })
    expect(targets.get(14)).toEqual({ x: 32, y: 172, scale: 1 })
  })

  it('computes bounds for a full grid', () => {
    const { bounds } = gridLayout([0, 1, 2, 3], { columns: 2, tileSize: 64, gap: 6 })
    expect(bounds).toEqual({ w: 134, h: 134 }) // 2*70 - 6
  })

  it('computes bounds for a single partial row', () => {
    const { bounds } = gridLayout([0, 1, 2], { columns: 5, tileSize: 64, gap: 6 })
    expect(bounds).toEqual({ w: 204, h: 64 }) // 3*70-6 wide, 1*70-6 tall
  })

  it('handles empty input', () => {
    const r = gridLayout([], { columns: 4, tileSize: 64, gap: 6 })
    expect(r.targets.size).toBe(0)
    expect(r.bounds).toEqual({ w: 0, h: 0 })
  })

  it('guards against non-positive columns', () => {
    const r = gridLayout([0, 1, 2], { columns: 0, tileSize: 64, gap: 6 })
    expect(r.targets.size).toBe(0)
    expect(r.bounds).toEqual({ w: 0, h: 0 })
  })

  it('computes bounds for a multi-row grid with a partial last row', () => {
    // 5 ids, 2 columns => 3 rows (last row partial); width uses full columns
    const { bounds } = gridLayout([0, 1, 2, 3, 4], { columns: 2, tileSize: 64, gap: 6 })
    expect(bounds).toEqual({ w: 134, h: 204 }) // 2*70-6 wide, 3*70-6 tall
  })
})
