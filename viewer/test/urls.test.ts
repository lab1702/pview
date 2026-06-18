import { describe, it, expect } from 'vitest'
import { resolveAtlasUrl } from '../src/scene/urls'

describe('resolveAtlasUrl', () => {
  it('passes data URIs through unchanged', () => {
    expect(resolveAtlasUrl('data:image/png;base64,AAA', '/fixtures/')).toBe('data:image/png;base64,AAA')
  })

  it('prefixes relative files with the base url', () => {
    expect(resolveAtlasUrl('atlas/atlas_0.png', '/fixtures/')).toBe('/fixtures/atlas/atlas_0.png')
    expect(resolveAtlasUrl('atlas/atlas_0.png', './')).toBe('./atlas/atlas_0.png')
  })
})
