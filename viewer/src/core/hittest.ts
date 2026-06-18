export interface HitEntry {
  id: number
  x: number
  y: number
  alpha: number
}

// Returns the id of the tile (centered at x,y, side = tileSize) containing the
// world point, scanning in order and keeping the LAST match (topmost in z-order).
// Faded-out tiles (alpha <= 0.01) are not pickable.
export function hitTest(
  worldX: number,
  worldY: number,
  entries: HitEntry[],
  tileSize: number,
): number | null {
  const half = tileSize / 2
  let hit: number | null = null
  for (const e of entries) {
    if (e.alpha <= 0.01) continue
    if (worldX >= e.x - half && worldX <= e.x + half && worldY >= e.y - half && worldY <= e.y + half) {
      hit = e.id
    }
  }
  return hit
}
