export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Viewport {
  width: number
  height: number
}

// Sane default zoom clamps (tunable). They keep zoom strictly positive, which
// guards every divide-by-cam.zoom below against 0/negative/Infinity.
export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 40

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
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
  const zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  // Compute the cursor's world point at the new zoom (keeping the OLD center),
  // then shift the center so that point stays under the cursor on screen. At a
  // clamp boundary `after` equals `before`, so the camera simply stops moving.
  const after = screenToWorld({ ...cam, zoom }, sx, sy, vp)
  return { x: cam.x + (before.x - after.x), y: cam.y + (before.y - after.y), zoom }
}

export function fitToBounds(
  bounds: { w: number; h: number },
  vp: Viewport,
  padding = 0.9,
  center?: { x: number; y: number },
): Camera {
  if (bounds.w <= 0 || bounds.h <= 0) {
    return { x: 0, y: 0, zoom: 1 }
  }
  const zoom = Math.min(vp.width / bounds.w, vp.height / bounds.h) * padding
  // Grid content spans [0, w]×[0, h] so its center is (w/2, h/2); the histogram
  // stacks upward into negative Y, so the caller passes an explicit center.
  return { x: center?.x ?? bounds.w / 2, y: center?.y ?? bounds.h / 2, zoom }
}
