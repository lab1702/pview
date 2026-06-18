import type { Texture, TextureSource } from 'pixi.js'
import type { AtlasMeta } from '../core/bundle'
import { resolveAtlasUrl } from './urls'

export type TextureLoader = (url: string) => Promise<Texture>

export async function loadAtlasSources(
  atlases: AtlasMeta[],
  baseUrl: string,
  loadTexture: TextureLoader,
): Promise<(TextureSource | null)[]> {
  const sources: (TextureSource | null)[] = []
  for (let i = 0; i < atlases.length; i++) {
    try {
      const tex = await loadTexture(resolveAtlasUrl(atlases[i].file, baseUrl))
      sources.push(tex.source)
    } catch (err) {
      console.warn(`pview: atlas ${i} failed to load: ${(err as Error).message}`)
      sources.push(null)
    }
  }
  return sources
}
