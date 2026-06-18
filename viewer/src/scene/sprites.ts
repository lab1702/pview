import { Container, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import { cardName } from '../core/cardname'
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
  const nameKey = bundle.cardFields[0] ?? ''
  const fieldOrder = bundle.facets.map((f) => f.name)
  for (const item of bundle.items) {
    const source = sources[item.atlas]
    if (!source) continue
    const [x, y, w, h] = item.rect
    const texture = new Texture({ source, frame: new Rectangle(x, y, w, h) })
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    // Imageless cards (detail === null) are generated tiles that already paint
    // the name into the artwork, so an overlay would just double it up.
    if (item.detail !== null) addNameLabel(sprite, cardName(item, nameKey, fieldOrder), bundle.tileSize)
    world.addChild(sprite)
    sprites.set(item.id, sprite)
  }
  return sprites
}

/** Overlay the card name across the top of a tile. The label is a child of the
 *  sprite, so it pans, zooms, and fades together with its tile for free. White
 *  glyphs with a black outline and a soft drop shadow keep it readable over
 *  both light and dark images. */
function addNameLabel(sprite: Sprite, name: string, tileSize: number): void {
  if (!name) return
  const pad = tileSize * 0.06
  const label = new Text({
    text: name,
    style: {
      fill: 0xffffff,
      fontFamily: 'sans-serif',
      fontSize: Math.round(tileSize * 0.1),
      fontWeight: '700',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: tileSize - pad * 2,
      stroke: { color: 0x000000, width: Math.max(2, Math.round(tileSize * 0.014)) },
      dropShadow: { color: 0x000000, alpha: 0.9, blur: 4, distance: 0 },
    },
  })
  label.anchor.set(0.5, 0)
  // Children ignore the sprite's anchor, so local (0,0) is the tile centre;
  // -tileSize/2 + pad lifts the label to just inside the top edge.
  label.position.set(0, -tileSize / 2 + pad)
  label.eventMode = 'none'
  sprite.addChild(label)
}
