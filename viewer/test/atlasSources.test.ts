import { describe, it, expect, vi } from 'vitest'
import { loadAtlasSources } from '../src/scene/atlasSources'

const atlases = [
  { file: 'atlas/atlas_0.png', width: 8, height: 8 },
  { file: 'atlas/atlas_1.png', width: 8, height: 8 },
]

describe('loadAtlasSources', () => {
  it('returns a source per atlas and resolves urls against base', async () => {
    const seen: string[] = []
    const loader = async (url: string) => {
      seen.push(url)
      return { source: { id: url } } as any
    }
    const sources = await loadAtlasSources(atlases, '/fixtures/', loader)
    expect(seen).toEqual(['/fixtures/atlas/atlas_0.png', '/fixtures/atlas/atlas_1.png'])
    expect(sources).toHaveLength(2)
    expect(sources[0]).not.toBeNull()
  })

  it('keeps going when one atlas fails, returning null for it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loader = async (url: string) => {
      if (url.endsWith('_1.png')) throw new Error('boom')
      return { source: { id: url } } as any
    }
    const sources = await loadAtlasSources(atlases, '', loader)
    expect(sources[0]).not.toBeNull()
    expect(sources[1]).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
