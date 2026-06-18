# pview Phase 2 — M4: Semantic Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click a card to select it, animate the camera to zoom into it, and reveal a DOM detail card with the lazy-loaded full-res image (or a generated header for no-photo items) + all attributes; deselect returns to the wall.

**Architecture:** New pure modules (`lerpCamera` in `camera.ts`, `hitTest`, `generatedColor`) with Vitest unit tests; the `Scene` gains a spatial `pick`, tap detection, and an animated camera focus tween on the existing ticker (typecheck + dev smoke); a Preact `DetailCard` (component-tested) anchored to the focused sprite's on-screen rect via an `onFocusRect` callback; the App wires selection → focus → detail.

**Tech Stack:** TypeScript 5, PixiJS 8, Preact 10 + @preact/signals 2, Vite 8, Vitest 4 (+ @testing-library/preact, jsdom).

## Global Constraints

- All `viewer/` commands run from `/home/lab/tmp/pview/viewer`; Python from `/home/lab/tmp/pview`.
- Gates per task: `npm test` green, `npm run typecheck` clean. Pixi/DOM code (`Scene.ts`, `App.tsx`) is typecheck-gated + dev-smoke (no WebGL unit tests).
- Hit-testing is a spatial lookup run only on a click (not per frame); filtered-out sprites (alpha ≤ 0.01) are not pickable; the topmost (last-in-scan) match wins.
- The camera focus tween centers + zooms the selected sprite to `zoom = min(zoomToFill, MAX_ZOOM)` where `zoomToFill = min(vpW, vpH) / tileSize * 0.8`; a user pan/zoom cancels the tween but keeps the selection; deselect tweens back to the pre-focus camera.
- The `DetailCard` is anchored to the focused sprite's on-screen rect (`{cx, cy, size, progress}` emitted each camera change), fades in with `progress`, lays out stacked (image/header on top, attribute rows below), and lazily loads `item.detail` via `resolveAtlasUrl` (folder path or single-file data URI). `detail: null` → a `generatedColor(id)` header + the item's name.
- A detail image load error degrades to a placeholder (the card still shows attributes).
- Deselect on: Esc, the close button, a background tap, or any `view`/`histogramFacet`/`filter`/`sort`/`query` change.
- Component tests use `// @vitest-environment jsdom` + `@testing-library/preact` with a synchronous `afterEach(() => cleanup())`.
- M4 does NOT commit built `viewer_assets/` (verify-then-restore in the final task); committing is M5.
- TDD: failing test → confirm fail → implement → confirm pass → commit.

---

## File Structure

| File | Change |
|------|--------|
| `viewer/src/scene/camera.ts` | + `lerpCamera(a,b,t)` |
| `viewer/src/core/hittest.ts` | NEW `hitTest` |
| `viewer/src/core/cardcolor.ts` | NEW `generatedColor` |
| `viewer/src/scene/Scene.ts` | + `pick` + tap detection + `onSelect`; camera focus tween + `onFocusRect` |
| `viewer/src/ui/state.ts` | + `selectedId` signal |
| `viewer/src/ui/DetailCard.tsx` | NEW anchored detail overlay |
| `viewer/src/ui/App.tsx` | wire pick→selectedId→focus, render DetailCard, deselect triggers |
| `viewer/src/styles.css` | + detail-card styling |

---

## Task 1: pure modules — lerpCamera + hitTest + generatedColor

**Files:**
- Modify: `viewer/src/scene/camera.ts`
- Create: `viewer/src/core/hittest.ts`, `viewer/src/core/cardcolor.ts`
- Test: `viewer/test/camera.test.ts` (append), `viewer/test/hittest.test.ts`, `viewer/test/cardcolor.test.ts`

**Interfaces:**
- Produces:
  - `lerpCamera(a: Camera, b: Camera, t: number) -> Camera` (interpolates x/y/zoom, clamps t).
  - `HitEntry = { id: number; x: number; y: number; alpha: number }`; `hitTest(worldX, worldY, entries: HitEntry[], tileSize) -> number | null`.
  - `generatedColor(id: number) -> string` (`#rrggbb`, matching the Python generated-card background).

- [ ] **Step 1: Write failing tests.** Append to `viewer/test/camera.test.ts`:

```ts
it('lerpCamera interpolates x/y/zoom and clamps t', () => {
  const a = { x: 0, y: 0, zoom: 1 }
  const b = { x: 10, y: 20, zoom: 5 }
  expect(lerpCamera(a, b, 0)).toEqual(a)
  expect(lerpCamera(a, b, 1)).toEqual(b)
  const mid = lerpCamera(a, b, 0.5)
  expect(mid.x).toBeCloseTo(5)
  expect(mid.y).toBeCloseTo(10)
  expect(mid.zoom).toBeCloseTo(3)
  expect(lerpCamera(a, b, 2)).toEqual(b) // clamped
})
```

Add `lerpCamera` to the import at the top of `camera.test.ts` (it currently imports from `../src/scene/camera`).

Create `viewer/test/hittest.test.ts`:

```ts
import { it, expect } from 'vitest'
import { hitTest, type HitEntry } from '../src/core/hittest'

const entries: HitEntry[] = [
  { id: 0, x: 0, y: 0, alpha: 1 },
  { id: 1, x: 100, y: 0, alpha: 1 },
]

it('returns the id of the tile containing the point', () => {
  expect(hitTest(5, 5, entries, 64)).toBe(0) // within 0±32
  expect(hitTest(100, 10, entries, 64)).toBe(1)
})

it('returns null when no tile contains the point', () => {
  expect(hitTest(60, 0, entries, 64)).toBeNull() // between the two tiles
})

it('skips faded-out (alpha<=0.01) tiles', () => {
  const faded: HitEntry[] = [{ id: 0, x: 0, y: 0, alpha: 0 }]
  expect(hitTest(0, 0, faded, 64)).toBeNull()
})

it('returns the last (topmost) match when tiles overlap', () => {
  const stacked: HitEntry[] = [
    { id: 0, x: 0, y: 0, alpha: 1 },
    { id: 1, x: 0, y: 0, alpha: 1 },
  ]
  expect(hitTest(0, 0, stacked, 64)).toBe(1)
})
```

Create `viewer/test/cardcolor.test.ts`:

```ts
import { it, expect } from 'vitest'
import { generatedColor } from '../src/core/cardcolor'

it('is deterministic and returns a #rrggbb string', () => {
  expect(generatedColor(0)).toMatch(/^#[0-9a-f]{6}$/)
  expect(generatedColor(7)).toBe(generatedColor(7))
})

it('gives different colors to different ids', () => {
  expect(generatedColor(1)).not.toBe(generatedColor(2))
})

it('matches the known color for id 0', () => {
  // hue=0, HLS(0, L=0.45, S=0.55) -> floor(.*255) -> #b13333
  expect(generatedColor(0)).toBe('#b13333')
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/camera.test.ts test/hittest.test.ts test/cardcolor.test.ts`
Expected: FAIL — `lerpCamera` undefined; the two modules not found.

- [ ] **Step 3: Add `lerpCamera` to `viewer/src/scene/camera.ts`** (append at the end of the file):

```ts
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  const f = Math.min(1, Math.max(0, t))
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    zoom: a.zoom + (b.zoom - a.zoom) * f,
  }
}
```

- [ ] **Step 4: Implement `viewer/src/core/hittest.ts`**

```ts
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
```

- [ ] **Step 5: Implement `viewer/src/core/cardcolor.ts`** (replicates the Python `_bg_color`: golden-ratio hue, `colorsys.hls_to_rgb(hue, 0.45, 0.55)`, `int(·*255)`)

```ts
function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) {
    const v = Math.floor(l * 255)
    return [v, v, v]
  }
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s
  const m1 = 2 * l - m2
  const channel = (hue: number): number => {
    let x = hue % 1
    if (x < 0) x += 1
    let c: number
    if (x < 1 / 6) c = m1 + (m2 - m1) * x * 6
    else if (x < 1 / 2) c = m2
    else if (x < 2 / 3) c = m1 + (m2 - m1) * (2 / 3 - x) * 6
    else c = m1
    return Math.floor(c * 255)
  }
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
}

export function generatedColor(id: number): string {
  const hue = (id * 0.61803398875) % 1
  const [r, g, b] = hlsToRgb(hue, 0.45, 0.55)
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
```

- [ ] **Step 6: Run to verify they pass**

Run (from `viewer/`): `npm test` → PASS. `npm run typecheck` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add viewer/src/scene/camera.ts viewer/src/core/hittest.ts viewer/src/core/cardcolor.ts viewer/test/camera.test.ts viewer/test/hittest.test.ts viewer/test/cardcolor.test.ts
git commit -m "feat(viewer): lerpCamera, spatial hitTest, generated-card color"
```

---

## Task 2: Scene — pick + tap detection + onSelect

**Files:**
- Modify: `viewer/src/scene/Scene.ts`

**Interfaces:**
- Consumes: `hitTest`/`HitEntry` (core/hittest), `screenToWorld` (camera).
- Produces: `Scene.pick(sx, sy) -> number | null`; a public `Scene.onSelect: ((id: number | null) => void) | null` invoked on a canvas tap (vs drag); `tileSize` captured from the bundle.

- [ ] **Step 1: Update imports** at the top of `viewer/src/scene/Scene.ts`:

```ts
import { type Camera, fitToBounds, panBy, screenToWorld, zoomAt } from './camera'
```
and add:
```ts
import { hitTest, type HitEntry } from '../core/hittest'
```

- [ ] **Step 2: Add fields** next to the existing private fields:

```ts
  private tileSize = 256
  private downX = 0
  private downY = 0
  private moved = false
  onSelect: ((id: number | null) => void) | null = null
```

- [ ] **Step 3: Capture `tileSize` in `setSprites`** — change the first lines of `setSprites` so it reads:

```ts
  async setSprites(bundle: Bundle, baseUrl: string): Promise<void> {
    this.transitions.clear()
    this.tileSize = bundle.tileSize
    this.sprites = await buildSprites(bundle, this.world, this.loadTexture, baseUrl)
    for (const [id, sp] of this.sprites) {
      this.transitions.register(id, { x: sp.position.x, y: sp.position.y, scale: sp.scale.x, alpha: 1 })
    }
  }
```

- [ ] **Step 4: Add the `pick` method** (place it after `setSprites`):

```ts
  pick(sx: number, sy: number): number | null {
    const world = screenToWorld(this.cam, sx, sy, this.viewport())
    const entries: HitEntry[] = []
    for (const [id, sp] of this.sprites) {
      entries.push({ id, x: sp.position.x, y: sp.position.y, alpha: sp.alpha })
    }
    return hitTest(world.x, world.y, entries, this.tileSize)
  }
```

- [ ] **Step 5: Wire tap detection into the pointer handlers.** Replace `onPointerDown`, `onPointerMove`, and `onPointerUp` with:

```ts
  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true
    this.moved = false
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.downX = e.clientX
    this.downY = e.clientY
  }

  private onPointerUp = (): void => {
    if (this.dragging && !this.moved) {
      const rect = this.app.canvas.getBoundingClientRect()
      this.onSelect?.(this.pick(this.downX - rect.left, this.downY - rect.top))
    }
    this.dragging = false
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return
    if (!this.moved && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 3) {
      this.moved = true
    }
    this.cam = panBy(this.cam, e.clientX - this.lastX, e.clientY - this.lastY)
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.applyCamera()
  }
```

- [ ] **Step 6: Typecheck + suite**

Run (from `viewer/`): `npm run typecheck` → exit 0. `npm test` → all green (no behavior change to existing tests).

- [ ] **Step 7: Commit**

```bash
git add viewer/src/scene/Scene.ts
git commit -m "feat(viewer): Scene.pick + tap-vs-drag detection + onSelect"
```

---

## Task 3: Scene — camera focus tween + onFocusRect

**Files:**
- Modify: `viewer/src/scene/Scene.ts`

**Interfaces:**
- Consumes: `lerpCamera`/`worldToScreen`/`MAX_ZOOM` (camera), `easeInOutCubic` (transitions).
- Produces: `Scene.focusOn(id)` / `Scene.focusReset()`; a public `Scene.onFocusRect: ((r: { cx: number; cy: number; size: number; progress: number }) => void) | null` called on each camera change while focused; a user pan/zoom cancels the active tween.

- [ ] **Step 1: Update imports.** Extend the camera import and add `easeInOutCubic`:

```ts
import {
  type Camera,
  fitToBounds,
  lerpCamera,
  MAX_ZOOM,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './camera'
import { TransitionController, easeInOutCubic } from './transitions'
```

Also add a module-level constant just below the imports:

```ts
const CAM_DURATION = 400
```

- [ ] **Step 2: Add fields** next to the existing private fields:

```ts
  private focusedId: number | null = null
  private camFrom: Camera | null = null
  private camTo: Camera | null = null
  private camElapsed = 0
  private prefocusCam: Camera | null = null
  onFocusRect: ((r: { cx: number; cy: number; size: number; progress: number }) => void) | null = null
```

- [ ] **Step 3: Add `focusOn` / `focusReset` / `startCamTween`** (place after `pick`):

```ts
  focusOn(id: number): void {
    const sp = this.sprites.get(id)
    if (!sp) return
    this.focusedId = id
    if (!this.prefocusCam) this.prefocusCam = { ...this.cam }
    const vp = this.viewport()
    const zoom = Math.min(MAX_ZOOM, (Math.min(vp.width, vp.height) / this.tileSize) * 0.8)
    this.startCamTween({ x: sp.position.x, y: sp.position.y, zoom })
  }

  focusReset(): void {
    this.focusedId = null
    if (this.prefocusCam) {
      this.startCamTween(this.prefocusCam)
      this.prefocusCam = null
    }
  }

  private startCamTween(to: Camera): void {
    this.camFrom = { ...this.cam }
    this.camTo = to
    this.camElapsed = 0
  }
```

- [ ] **Step 4: Replace `onTick`** so the sprite-apply idle short-circuit no longer blocks the camera tween:

```ts
  private onTick = (): void => {
    const active = this.transitions.tick(this.app.ticker.deltaMS)
    if (!(this.settled && !active)) {
      for (const [id, sp] of this.sprites) {
        const s = this.transitions.get(id)
        if (!s) continue
        sp.position.set(s.x, s.y)
        sp.scale.set(s.scale)
        sp.alpha = s.alpha
        sp.visible = s.alpha > 0.01
      }
      this.settled = !active
    }
    if (this.camFrom && this.camTo) {
      this.camElapsed += this.app.ticker.deltaMS
      const t = Math.min(1, this.camElapsed / CAM_DURATION)
      this.cam = lerpCamera(this.camFrom, this.camTo, easeInOutCubic(t))
      this.applyCamera()
      if (t >= 1) {
        this.camFrom = null
        this.camTo = null
      }
    }
  }
```

- [ ] **Step 5: Emit the focus rect on every camera change.** Add `this.emitFocusRect()` to `applyCamera` (last line) and add the method:

```ts
  private applyCamera = (): void => {
    const vp = this.viewport()
    this.world.scale.set(this.cam.zoom)
    this.world.position.set(
      vp.width / 2 - this.cam.x * this.cam.zoom,
      vp.height / 2 - this.cam.y * this.cam.zoom,
    )
    this.applyLabelScale()
    this.emitFocusRect()
  }

  private emitFocusRect(): void {
    if (this.focusedId === null || !this.onFocusRect) return
    const sp = this.sprites.get(this.focusedId)
    if (!sp) return
    const s = worldToScreen(this.cam, sp.position.x, sp.position.y, this.viewport())
    const progress = this.camTo ? Math.min(1, this.camElapsed / CAM_DURATION) : 1
    this.onFocusRect({ cx: s.x, cy: s.y, size: this.tileSize * this.cam.zoom, progress })
  }
```

- [ ] **Step 6: Cancel the tween on a manual pan/zoom.** In `onPointerMove`, after `this.applyCamera()`, add the cancel; and in `onWheel`, after `this.applyCamera()`, add the cancel. Both gain:

```ts
    this.camFrom = null
    this.camTo = null
```

So `onPointerMove` ends with:
```ts
    this.cam = panBy(this.cam, e.clientX - this.lastX, e.clientY - this.lastY)
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.applyCamera()
    this.camFrom = null
    this.camTo = null
  }
```
and `onWheel` ends with:
```ts
    this.cam = zoomAt(this.cam, e.clientX - rect.left, e.clientY - rect.top, factor, this.viewport())
    this.applyCamera()
    this.camFrom = null
    this.camTo = null
  }
```

- [ ] **Step 7: Typecheck + suite**

Run (from `viewer/`): `npm run typecheck` → exit 0. `npm test` → all green.

- [ ] **Step 8: Commit**

```bash
git add viewer/src/scene/Scene.ts
git commit -m "feat(viewer): camera focus tween + onFocusRect anchoring"
```

---

## Task 4: state.selectedId + DetailCard component

**Files:**
- Modify: `viewer/src/ui/state.ts`, `viewer/src/styles.css`
- Create: `viewer/src/ui/DetailCard.tsx`
- Test: `viewer/test/DetailCard.test.tsx`

**Interfaces:**
- Consumes: `Item` (bundle), `resolveAtlasUrl` (scene/urls), `generatedColor` (core/cardcolor).
- Produces: `state.selectedId: Signal<number | null>`; `DetailCard` Preact component with props `{ item, baseUrl, rect: {cx,cy,size,progress}, onClose }`.

- [ ] **Step 1: Write the failing component tests** `viewer/test/DetailCard.test.tsx`

```tsx
// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { DetailCard } from '../src/ui/DetailCard'
import type { Item } from '../src/core/bundle'

afterEach(() => cleanup())

const rect = { cx: 100, cy: 100, size: 300, progress: 1 }

function item(detail: string | null): Item {
  return { id: 0, values: { name: 'Ada', age: 36 }, atlas: 0, rect: [0, 0, 1, 1], detail }
}

it('renders the detail image when the item has a detail url', () => {
  render(<DetailCard item={item('detail/0.png')} baseUrl="./" rect={rect} onClose={() => {}} />)
  const img = document.querySelector('img')
  expect(img).not.toBeNull()
  expect(img!.getAttribute('src')).toBe('./detail/0.png')
})

it('renders a generated header (no img) for a detail-less item', () => {
  render(<DetailCard item={item(null)} baseUrl="./" rect={rect} onClose={() => {}} />)
  expect(document.querySelector('img')).toBeNull()
  expect(document.querySelector('.pview-detail-generated')).not.toBeNull()
})

it('renders all attribute rows and a working close button', () => {
  const onClose = vi.fn()
  render(<DetailCard item={item('detail/0.png')} baseUrl="./" rect={rect} onClose={onClose} />)
  expect(screen.getByText('name')).toBeTruthy()
  expect(screen.getByText('age')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/DetailCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `selectedId` to `viewer/src/ui/state.ts`.** Add to the `ViewerState` interface (after `histogramFacet`):

```ts
  selectedId: Signal<number | null>
```

In `createViewerState`, after the `histogramFacet` signal, add:

```ts
  const selectedId = signal<number | null>(null)
```

And add `selectedId` to the returned object:

```ts
  return { filter, sort, query, view, histogramFacet, selectedId, visibleIds, sortedVisible, counts, reset }
```

- [ ] **Step 4: Implement `viewer/src/ui/DetailCard.tsx`**

```tsx
import { useState } from 'preact/hooks'
import type { Item } from '../core/bundle'
import { resolveAtlasUrl } from '../scene/urls'
import { generatedColor } from '../core/cardcolor'

interface Props {
  item: Item
  baseUrl: string
  rect: { cx: number; cy: number; size: number; progress: number }
  onClose: () => void
}

export function DetailCard({ item, baseUrl, rect, onClose }: Props) {
  const [imgError, setImgError] = useState(false)
  const width = Math.max(240, Math.min(rect.size, 520))
  const opacity = Math.max(0, Math.min(1, (rect.progress - 0.3) / 0.5))
  const headerName = String(item.values[Object.keys(item.values)[0]] ?? '')

  return (
    <div
      class="pview-detail"
      style={{
        left: `${rect.cx}px`,
        top: `${rect.cy}px`,
        width: `${width}px`,
        transform: 'translate(-50%, -50%)',
        opacity: String(opacity),
      }}
    >
      <button type="button" class="pview-detail-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div class="pview-detail-image">
        {item.detail && !imgError ? (
          <img src={resolveAtlasUrl(item.detail, baseUrl)} alt="" onError={() => setImgError(true)} />
        ) : (
          <div class="pview-detail-generated" style={{ background: generatedColor(item.id) }}>
            {headerName}
          </div>
        )}
      </div>
      <dl class="pview-detail-attrs">
        {Object.entries(item.values).map(([k, v]) => (
          <div class="pview-detail-row" key={k}>
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
```

- [ ] **Step 5: Add styles** — append to `viewer/src/styles.css`:

```css
.pview-detail { position: absolute; max-height: 80vh; display: flex; flex-direction: column; background: #1b1b1b; border: 1px solid #444; border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.6); overflow: hidden; z-index: 20; }
.pview-detail-close { position: absolute; top: 6px; right: 8px; background: rgba(0,0,0,0.5); color: #eee; border: none; border-radius: 50%; width: 26px; height: 26px; font-size: 18px; line-height: 1; cursor: pointer; }
.pview-detail-image img { display: block; width: 100%; height: auto; max-height: 60vh; object-fit: contain; background: #000; }
.pview-detail-generated { width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; color: #fff; font: 600 22px sans-serif; padding: 12px; text-align: center; box-sizing: border-box; }
.pview-detail-attrs { margin: 0; padding: 10px 14px; overflow-y: auto; }
.pview-detail-row { display: flex; gap: 8px; padding: 2px 0; font-size: 14px; }
.pview-detail-row dt { color: #9ad; min-width: 90px; }
.pview-detail-row dd { margin: 0; color: #eee; }
```

- [ ] **Step 6: Run to verify pass + typecheck**

Run (from `viewer/`): `npm test` → PASS (DetailCard tests + suite). `npm run typecheck` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add viewer/src/ui/state.ts viewer/src/ui/DetailCard.tsx viewer/src/styles.css viewer/test/DetailCard.test.tsx
git commit -m "feat(viewer): selectedId signal + anchored DetailCard"
```

---

## Task 5: App wiring + build verify

**Files:**
- Modify: `viewer/src/ui/App.tsx`
- Test: end-to-end build verification (no new unit test)

**Interfaces:**
- Consumes: `Scene` (`pick`/`onSelect`/`focusOn`/`focusReset`/`onFocusRect`), `createViewerState` (`selectedId`), `DetailCard`.
- Produces: full semantic-zoom wiring — tap selects, selection focuses + reveals the DetailCard, deselect on Esc/close/background/view-or-filter change.

- [ ] **Step 1: Rewrite `viewer/src/ui/App.tsx`** to add the selection wiring:

```tsx
import { useEffect, useRef } from 'preact/hooks'
import { effect, useSignal } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { gridLayout } from '../core/layout/grid'
import { histogramLayout } from '../core/layout/histogram'
import { Scene } from '../scene/Scene'
import { createViewerState } from './state'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { EmptyState } from './EmptyState'
import { DetailCard } from './DetailCard'

export function App({ bundle, baseUrl }: { bundle: Bundle; baseUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(createViewerState(bundle))
  const state = stateRef.current
  const focusRect = useSignal({ cx: 0, cy: 0, size: 0, progress: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new Scene()
    let disposed = false
    let destroyed = false
    const disposers: Array<() => void> = []
    const teardown = () => {
      if (destroyed) return
      destroyed = true
      for (const d of disposers) d()
      window.removeEventListener('keydown', onKey)
      scene.destroy()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.selectedId.value = null
    }
    window.addEventListener('keydown', onKey)

    const columns = Math.max(1, Math.ceil(Math.sqrt(bundle.items.length)))
    const gap = Math.round(bundle.tileSize * 0.08)
    const barGap = Math.round(bundle.tileSize * 0.5)

    const computeLayout = (): {
      targets: Map<number, { x: number; y: number; scale: number }>
      bounds: { w: number; h: number }
      center?: { x: number; y: number }
    } => {
      if (state.view.value === 'histogram' && state.histogramFacet.value) {
        const facet = bundle.facets.find((f) => f.name === state.histogramFacet.value)
        if (facet) {
          const r = histogramLayout(state.sortedVisible.value, bundle.items, facet, {
            tileSize: bundle.tileSize,
            gap,
            barGap,
          })
          scene.setBars(r.bars)
          return { targets: r.targets, bounds: r.bounds, center: { x: r.bounds.w / 2, y: -r.bounds.h / 2 } }
        }
      }
      scene.setBars([])
      const g = gridLayout(state.sortedVisible.value, { columns, tileSize: bundle.tileSize, gap })
      return { targets: g.targets, bounds: g.bounds }
    }

    let lastMode = ''

    void (async () => {
      try {
        await scene.mount(host)
        if (disposed) return teardown()
        await scene.setSprites(bundle, baseUrl)
        scene.onSelect = (id) => {
          state.selectedId.value = id
        }
        scene.onFocusRect = (r) => {
          focusRect.value = r
        }
        const first = computeLayout()
        scene.setLayout(first.targets, new Set(state.visibleIds.value), false)
        scene.frame(first.bounds, first.center)
        lastMode = `${state.view.value}:${state.histogramFacet.value}`

        // re-layout on filter/sort/search/view changes; re-frame only on mode change
        disposers.push(
          effect(() => {
            const r = computeLayout()
            scene.setLayout(r.targets, new Set(state.visibleIds.value))
            const mode = `${state.view.value}:${state.histogramFacet.value}`
            if (mode !== lastMode) {
              scene.frame(r.bounds, r.center)
              lastMode = mode
            }
          }),
        )
        // selection -> camera focus / reset
        disposers.push(
          effect(() => {
            const id = state.selectedId.value
            if (id !== null) scene.focusOn(id)
            else scene.focusReset()
          }),
        )
        // deselect whenever the layout identity or visible set changes
        disposers.push(
          effect(() => {
            // subscribe to the layout-affecting signals
            void state.view.value
            void state.histogramFacet.value
            void state.filter.value
            void state.sort.value
            void state.query.value
            state.selectedId.value = null
          }),
        )
      } catch (err) {
        teardown()
        const div = document.createElement('div')
        div.className = 'pview-error'
        div.textContent = `pview: ${(err as Error).message}`
        host.replaceChildren(div)
      }
    })()
    return () => {
      disposed = true
      teardown()
    }
  }, [bundle, baseUrl])

  const selectedItem =
    state.selectedId.value !== null
      ? bundle.items.find((it) => it.id === state.selectedId.value) ?? null
      : null

  return (
    <div class="pview-root">
      <Topbar bundle={bundle} state={state} />
      <div class="pview-body">
        <Sidebar bundle={bundle} state={state} />
        <div class="pview-canvas" ref={hostRef} />
      </div>
      {state.visibleIds.value.size === 0 && <EmptyState onClear={() => state.reset()} />}
      {selectedItem && (
        <DetailCard
          item={selectedItem}
          baseUrl={baseUrl}
          rect={focusRect.value}
          onClose={() => (state.selectedId.value = null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + suite**

Run (from `viewer/`): `npm run typecheck` → exit 0. `npm test` → all green.

- [ ] **Step 3: Verify the production build, then RESTORE the placeholder**

Run (from `viewer/`): `npm run build`. Then verify + restore (from the repo root `/home/lab/tmp/pview`):

```bash
test -s src/pview/viewer_assets/app.js && echo APP_JS_OK
python3 - <<'PY'
import tempfile, os, pandas as pd
from PIL import Image
import sys; sys.path.insert(0, "src")
from pview import build
d = tempfile.mkdtemp()
p = os.path.join(d, "a.png"); Image.new("RGB", (64, 64), (200, 60, 60)).save(p)
df = pd.DataFrame({"name": ["A", "B"], "age": [10, 20], "photo": [p, ""]})
out = build(df, name_col="name", image_col="photo", out_dir=os.path.join(d, "site"))
for f in ("index.html", "app.js", "app.css", "data.json"):
    assert (out / f).exists(), f
print("FOLDER_BUNDLE_OK")
PY
git checkout -- src/pview/viewer_assets
git status --porcelain src/pview/viewer_assets && echo "(viewer_assets clean)"
```
Expected: `APP_JS_OK`, `FOLDER_BUNDLE_OK`, `(viewer_assets clean)`.

- [ ] **Step 4: Confirm the Python suite is still green**

Run (from repo root): `python -m pytest -q` → 47 passed.

- [ ] **Step 5: Manual dev smoke (report observations)**

Run (from `viewer/`): `npm run dev`; open the URL; confirm: clicking a card flies the camera into it and a detail card fades in with the full-res image (or a generated-color header + name for a no-photo item) + all attributes; the card stays anchored as it zooms in; Esc / the × / clicking the background closes it and the camera animates back; clicking a card in histogram view also focuses it; changing a filter/view deselects. Stop the server. Record the result (or note no browser available and rely on the unit/typecheck/build/python gates).

- [ ] **Step 6: Commit**

```bash
git add viewer/src/ui/App.tsx
git commit -m "feat(viewer): wire click-to-select, camera focus, and DetailCard"
```

---

## Self-Review

**Spec coverage (M4 design → tasks):**
- Spatial click-to-select (`hitTest`, alpha-skip, topmost) → Task 1 + Task 2 (`pick`). ✓
- Animated camera focus (fill ~80%, MAX_ZOOM clamp, pan/zoom cancels, reset to pre-focus) → Task 1 (`lerpCamera`) + Task 3. ✓
- Anchored DetailCard (tracks on-screen rect, fades with progress) → Task 3 (`onFocusRect`) + Task 4/5. ✓
- Detail content: lazy `item.detail` image / generated header + name; all attributes; close → Task 4. ✓
- Generated color matches the Python card → Task 1 (`generatedColor`). ✓
- Deselect on Esc / close / background / view·filter·sort·query change → Task 5. ✓
- Image-load fallback → Task 4 (`onError` placeholder). ✓
- Testing: pure (1), DetailCard component (4), Scene/App typecheck+smoke (2/3/5). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `lerpCamera`/`hitTest`/`HitEntry`/`generatedColor` (1) consumed by Scene (2/3) and DetailCard (4); `Scene.pick`/`onSelect`/`focusOn`/`focusReset`/`onFocusRect` (2/3) consumed by App (5); the `{cx,cy,size,progress}` rect shape is identical across Scene `onFocusRect` (3), `DetailCard` props (4), and the App `focusRect` signal (5); `selectedId` (4) consumed by App (5). Names align.

**Notes:**
- The generated header shows `item.values`' first key's value as the name (column order puts the name first); an explicit name key is an M5 refinement.
- M4 does not commit built `viewer_assets/` (restored in Task 5 Step 3); committing is M5.
- The deselect effect reads the layout signals and writes `selectedId` (it does not read `selectedId`, so no feedback loop); it also clears selection once on mount (already null — harmless).
