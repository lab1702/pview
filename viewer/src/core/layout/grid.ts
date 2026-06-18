export interface LayoutTarget {
  x: number
  y: number
  scale: number
}

export interface GridResult {
  targets: Map<number, LayoutTarget>
  bounds: { w: number; h: number }
}

export function gridLayout(
  ids: number[],
  opts: { columns: number; tileSize: number; gap: number },
): GridResult {
  const { columns, tileSize, gap } = opts
  const targets = new Map<number, LayoutTarget>()
  if (ids.length === 0 || columns <= 0) {
    return { targets, bounds: { w: 0, h: 0 } }
  }
  const step = tileSize + gap
  const half = tileSize / 2
  ids.forEach((id, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    targets.set(id, { x: col * step + half, y: row * step + half, scale: 1 })
  })
  const rows = Math.ceil(ids.length / columns)
  const widthCols = rows > 1 ? columns : ids.length
  return {
    targets,
    bounds: { w: widthCols * step - gap, h: rows * step - gap },
  }
}
