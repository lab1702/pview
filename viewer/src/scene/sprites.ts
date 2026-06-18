import { Container, Rectangle, Sprite, Texture } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import { loadAtlasSources, type TextureLoader } from './atlasSources'

export type { TextureLoader } from './atlasSources'

export async function buildSprites(
  bundle: Bundle,
  world: Container,
  loadTexture: TextureLoader,
  baseUrl: string,
): Promise<Map<number, Sprite>> {
  const sources = await loadAtlasSources(bundle.atlases, baseUrl, loadTexture)
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
