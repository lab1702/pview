import { Container, Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import { resolveAtlasUrl } from './urls'

export type TextureLoader = (url: string) => Promise<Texture>

export async function buildSprites(
  bundle: Bundle,
  world: Container,
  loadTexture: TextureLoader,
  baseUrl: string,
): Promise<Map<number, Sprite>> {
  const sources: TextureSource[] = []
  for (const atlas of bundle.atlases) {
    const tex = await loadTexture(resolveAtlasUrl(atlas.file, baseUrl))
    sources.push(tex.source)
  }
  const sprites = new Map<number, Sprite>()
  for (const item of bundle.items) {
    const source = sources[item.atlas]
    if (!source) continue
    const [x, y, w, h] = item.rect
    const texture = new Texture({ source, frame: new Rectangle(x, y, w, h) })
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    world.addChild(sprite)
    sprites.set(item.id, sprite)
  }
  return sprites
}
