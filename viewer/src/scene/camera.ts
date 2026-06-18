export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Viewport {
  width: number
  height: number
}

export function worldToScreen(cam: Camera, wx: number, wy: number, vp: Viewport) {
  return {
    x: (wx - cam.x) * cam.zoom + vp.width / 2,
    y: (wy - cam.y) * cam.zoom + vp.height / 2,
  }
}

export function screenToWorld(cam: Camera, sx: number, sy: number, vp: Viewport) {
  return {
    x: (sx - vp.width / 2) / cam.zoom + cam.x,
    y: (sy - vp.height / 2) / cam.zoom + cam.y,
  }
}

export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom }
}

export function zoomAt(cam: Camera, sx: number, sy: number, factor: number, vp: Viewport): Camera {
  const before = screenToWorld(cam, sx, sy, vp)
  const zoom = cam.zoom * factor
  const after = {
    x: (sx - vp.width / 2) / zoom + cam.x,
    y: (sy - vp.height / 2) / zoom + cam.y,
  }
  return { x: cam.x + (before.x - after.x), y: cam.y + (before.y - after.y), zoom }
}

export function fitToBounds(bounds: { w: number; h: number }, vp: Viewport, padding = 0.9): Camera {
  if (bounds.w <= 0 || bounds.h <= 0) {
    return { x: 0, y: 0, zoom: 1 }
  }
  const zoom = Math.min(vp.width / bounds.w, vp.height / bounds.h) * padding
  return { x: bounds.w / 2, y: bounds.h / 2, zoom }
}
