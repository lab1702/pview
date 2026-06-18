import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld, panBy, zoomAt, fitToBounds } from '../src/scene/camera'

const vp = { width: 800, height: 600 }

describe('camera', () => {
  it('round-trips screen<->world', () => {
    const cam = { x: 100, y: 50, zoom: 2 }
    const w = screenToWorld(cam, 400, 300, vp)
    const s = worldToScreen(cam, w.x, w.y, vp)
    expect(s.x).toBeCloseTo(400)
    expect(s.y).toBeCloseTo(300)
  })

  it('maps the camera center to the viewport center', () => {
    const s = worldToScreen({ x: 10, y: 20, zoom: 3 }, 10, 20, vp)
    expect(s.x).toBeCloseTo(400)
    expect(s.y).toBeCloseTo(300)
  })

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const cam = { x: 0, y: 0, zoom: 1 }
    const before = screenToWorld(cam, 600, 200, vp)
    const zoomed = zoomAt(cam, 600, 200, 2, vp)
    const after = worldToScreen(zoomed, before.x, before.y, vp)
    expect(after.x).toBeCloseTo(600)
    expect(after.y).toBeCloseTo(200)
    expect(zoomed.zoom).toBeCloseTo(2)
  })

  it('panBy shifts the center by a screen delta in world units', () => {
    const panned = panBy({ x: 0, y: 0, zoom: 2 }, 100, 0)
    expect(panned.x).toBeCloseTo(-50)
    expect(panned.y).toBeCloseTo(0)
  })

  it('fitToBounds centers and scales to fit', () => {
    const cam = fitToBounds({ w: 400, h: 300 }, vp, 1)
    expect(cam.x).toBeCloseTo(200)
    expect(cam.y).toBeCloseTo(150)
    expect(cam.zoom).toBeCloseTo(2)
  })

  it('fitToBounds handles empty bounds', () => {
    expect(fitToBounds({ w: 0, h: 0 }, vp).zoom).toBe(1)
  })
})
