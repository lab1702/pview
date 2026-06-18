import { describe, it, expect } from 'vitest'
import { parseBundle } from '../src/core/bundle'

function v2bundle() {
  return {
    version: 2,
    title: 'People',
    tileSize: 256,
    facets: [{ name: 'age', type: 'numeric', min: 1, max: 9 }],
    cardFields: ['name'],
    atlases: [{ file: 'atlas/atlas_0.png', width: 2048, height: 2048 }],
    items: [
      { id: 0, values: { name: 'Ada' }, atlas: 0, rect: [0, 0, 256, 256], detail: 'detail/0.png' },
    ],
  }
}

describe('parseBundle', () => {
  it('parses a v2 bundle', () => {
    const b = parseBundle(v2bundle())
    expect(b.title).toBe('People')
    expect(b.items[0].detail).toBe('detail/0.png')
    expect(b.items[0].rect).toEqual([0, 0, 256, 256])
    expect(b.atlases[0].file).toBe('atlas/atlas_0.png')
  })

  it('normalizes a missing detail (v1 bundle) to null', () => {
    const v1: any = v2bundle()
    v1.version = 1
    delete v1.items[0].detail
    const b = parseBundle(v1)
    expect(b.items[0].detail).toBeNull()
  })

  it('throws on a too-new version', () => {
    const bad: any = v2bundle()
    bad.version = 3
    expect(() => parseBundle(bad)).toThrow(/version 3/)
  })

  it('throws on a non-object', () => {
    expect(() => parseBundle(null)).toThrow()
    expect(() => parseBundle(42)).toThrow()
  })

  it('throws when items is missing', () => {
    const bad: any = v2bundle()
    delete bad.items
    expect(() => parseBundle(bad)).toThrow(/items/)
  })

  it('throws when atlases is missing', () => {
    const bad: any = v2bundle()
    delete bad.atlases
    expect(() => parseBundle(bad)).toThrow(/atlases/)
  })
})

describe('parseBundle field guards', () => {
  function base() {
    return {
      version: 2,
      atlases: [{ file: 'a', width: 1, height: 1 }],
      items: [{ id: 0, values: {}, atlas: 0, rect: [0, 0, 1, 1], detail: null }],
    }
  }

  it('throws on a non-numeric id', () => {
    const bad: any = base()
    bad.items[0].id = 'x'
    expect(() => parseBundle(bad)).toThrow(/id/)
  })

  it('throws on a non-numeric atlas', () => {
    const bad: any = base()
    bad.items[0].atlas = null
    expect(() => parseBundle(bad)).toThrow(/atlas/)
  })

  it('throws on a malformed rect', () => {
    const bad: any = base()
    bad.items[0].rect = [0, 0, 1]
    expect(() => parseBundle(bad)).toThrow(/rect/)
  })

  it('accepts a well-formed item', () => {
    const ok = parseBundle(base())
    expect(ok.items[0].rect).toEqual([0, 0, 1, 1])
  })
})
