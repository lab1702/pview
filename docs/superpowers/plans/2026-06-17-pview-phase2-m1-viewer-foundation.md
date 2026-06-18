# pview Phase 2 — M1: Viewer Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `viewer/` TypeScript project and render a real pview bundle as a zoomable, pannable PixiJS sprite wall.

**Architecture:** A Vite + TypeScript project under `viewer/`. All consequential logic (bundle parsing, grid layout, camera transform math, atlas-URL resolution) lives in pure, framework-free modules with Vitest unit tests. PixiJS is confined to `scene/sprites.ts` + `scene/Scene.ts`; Preact is a one-component shell that hosts the canvas. The production build emits a single self-contained IIFE `app.js` (+ `app.css` + `index.html`) that works both as a folder-bundle asset and inlined in single-file mode.

**Tech Stack:** TypeScript 5, PixiJS 8, Preact 10 + @preact/signals 2, Vite 8, Vitest 4. Node is dev-only.

## Global Constraints

- Dependencies: `pixi.js` ^8, `preact` ^10, `@preact/signals` ^2; devDeps `vite` ^8, `vitest` ^4, `typescript` ^5, `jsdom`.
- Node is a **dev-only** dependency; end users `pip install pview` with no Node.
- All consequential logic in pure framework-free modules (`parseBundle`, `gridLayout`, camera math, `resolveAtlasUrl`) — unit-tested. PixiJS only in `scene/sprites.ts`/`scene/Scene.ts`; Preact only in `ui/App.tsx`.
- `parseBundle` accepts bundle `version <= 2` and normalizes a missing `detail` field to `null`.
- The bundle format is `version 2`; each item is `{id, values, atlas, rect:[x,y,w,h], detail: string|null}`.
- Vite build output: a single self-contained **IIFE** `app.js` (no ES-module syntax, no code-splitting, no content hashes) + `app.css` + `index.html` (classic scripts), written to `src/pview/viewer_assets/` with those exact stable filenames.
- **M1 does NOT commit the built `viewer_assets/`** (committing + staleness automation is M5). M1 builds to verify, then restores the committed placeholder.
- TDD for pure modules; `npm run typecheck` (`tsc --noEmit --strict`) + Vitest are the guardrails. No ESLint.
- Pixi/DOM code (`sprites.ts`, `Scene.ts`, `App.tsx`) is verified by `npm run typecheck` + manual `npm run dev` smoke, not unit tests.
- All `viewer/` commands run from the `viewer/` directory. `npm install` requires network access.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `viewer/package.json` `tsconfig.json` `vite.config.ts` | toolchain: deps, strict TS, IIFE build, Vitest |
| `viewer/index.html` | dev entry (loads `/src/main.tsx`) |
| `viewer/template.html` | production HTML, copied to `viewer_assets/index.html` by the build |
| `viewer/src/vite-env.d.ts` | `vite/client` types (`import.meta.env`) |
| `viewer/src/core/bundle.ts` | `Bundle`/`Item`/`Facet` types + `parseBundle` |
| `viewer/src/core/layout/grid.ts` | `gridLayout` |
| `viewer/src/scene/urls.ts` | `resolveAtlasUrl` (pure) |
| `viewer/src/scene/camera.ts` | pure `{x,y,zoom}` transform math |
| `viewer/src/scene/sprites.ts` | atlas `TextureSource` → per-item `Sprite` |
| `viewer/src/scene/Scene.ts` | Pixi `Application` + world container + camera glue + interaction |
| `viewer/src/ui/App.tsx` | minimal Preact shell hosting the canvas |
| `viewer/src/main.tsx` | dual-mode bundle load → render `App` |
| `viewer/src/styles.css` | viewer CSS (emitted as `app.css`) |
| `viewer/scripts/make-fixture.py` | regenerate `viewer/fixtures/` via the pview pipeline |
| `viewer/test/*.test.ts` | Vitest specs (bundle, grid, camera, urls) |

---

## Task 1: Project scaffold + toolchain

**Files:**
- Create: `viewer/package.json`, `viewer/tsconfig.json`, `viewer/vite.config.ts`, `viewer/index.html`, `viewer/template.html`, `viewer/src/vite-env.d.ts`, `viewer/test/smoke.test.ts`
- Modify: `/home/lab/tmp/pview/.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `viewer/` project where `npm test` (Vitest) and `npm run typecheck` (`tsc --noEmit`) pass. Build config targets a single IIFE `app.js`/`app.css`/`index.html` in `../src/pview/viewer_assets`.

- [ ] **Step 1: Create `viewer/package.json`**

```json
{
  "name": "pview-viewer",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "fixtures": "python3 scripts/make-fixture.py"
  },
  "dependencies": {
    "pixi.js": "^8.19.0",
    "preact": "^10.29.0",
    "@preact/signals": "^2.9.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^8.0.0",
    "vitest": "^4.0.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create `viewer/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `viewer/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Copy the production HTML template into the build output as index.html.
function emitIndexHtml() {
  return {
    name: 'emit-index-html',
    closeBundle() {
      copyFileSync(
        resolve(import.meta.dirname, 'template.html'),
        resolve(import.meta.dirname, '../src/pview/viewer_assets/index.html'),
      )
    },
  }
}

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: '../src/pview/viewer_assets',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/main.tsx'),
      formats: ['iife'],
      name: 'PviewViewer',
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
  },
  plugins: [emitIndexHtml()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `viewer/index.html` (dev entry) and `viewer/template.html` (production)**

`viewer/index.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>pview viewer (dev)</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`viewer/template.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>pview</title>
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="./app.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `viewer/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Create the smoke test `viewer/test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

function add(a: number, b: number): number {
  return a + b
}

describe('toolchain', () => {
  it('runs vitest and typescript', () => {
    expect(add(2, 3)).toBe(5)
  })
})
```

- [ ] **Step 7: Append viewer entries to the repo `.gitignore`** (`/home/lab/tmp/pview/.gitignore`)

Add these lines:
```
viewer/node_modules/
viewer/dist/
viewer/fixtures/
```

- [ ] **Step 8: Install dependencies**

Run (from `viewer/`): `npm install`
Expected: completes and creates `viewer/node_modules`. If npm reports a peer-dependency conflict between `vite` and `vitest`, install the latest mutually compatible pair instead (e.g. `npm install vitest@latest vite@latest`) and note the resolved versions in your report. If `npm install` fails for lack of network, report BLOCKED.

- [ ] **Step 9: Run the smoke test and typecheck to verify the toolchain**

Run (from `viewer/`): `npm test`
Expected: PASS (1 test).
Run: `npm run typecheck`
Expected: no type errors (exit 0).

- [ ] **Step 10: Commit**

```bash
git add viewer/package.json viewer/package-lock.json viewer/tsconfig.json viewer/vite.config.ts viewer/index.html viewer/template.html viewer/src/vite-env.d.ts viewer/test/smoke.test.ts .gitignore
git commit -m "feat(viewer): scaffold Vite + TS + Vitest project"
```

---

## Task 2: `core/bundle.ts` — parseBundle

**Files:**
- Create: `viewer/src/core/bundle.ts`
- Test: `viewer/test/bundle.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types `Facet`, `Item`, `AtlasMeta`, `Bundle` (see code).
  - `SUPPORTED_VERSION = 2`.
  - `parseBundle(json: unknown) -> Bundle`: throws `Error` for non-objects, missing numeric `version`, `version > 2`, or missing `items`/`atlases`; normalizes each item's missing `detail` to `null`.

- [ ] **Step 1: Write the failing tests** in `viewer/test/bundle.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parseBundle } from '../src/core/bundle'

function v2bundle() {
  return {
    version: 2,
    title: 'People',
    tileSize: 256,
    facets: [{ name: 'age', type: 'numeric', min: 1, max: 9 }],
    cardFields: ['name'],
    atlases: [{ file: 'atlas/atlas_0.png', width: 2048, height: 2048 }],
    items: [
      { id: 0, values: { name: 'Ada' }, atlas: 0, rect: [0, 0, 256, 256], detail: 'detail/0.png' },
    ],
  }
}

describe('parseBundle', () => {
  it('parses a v2 bundle', () => {
    const b = parseBundle(v2bundle())
    expect(b.title).toBe('People')
    expect(b.items[0].detail).toBe('detail/0.png')
    expect(b.items[0].rect).toEqual([0, 0, 256, 256])
    expect(b.atlases[0].file).toBe('atlas/atlas_0.png')
  })

  it('normalizes a missing detail (v1 bundle) to null', () => {
    const v1: any = v2bundle()
    v1.version = 1
    delete v1.items[0].detail
    const b = parseBundle(v1)
    expect(b.items[0].detail).toBeNull()
  })

  it('throws on a too-new version', () => {
    const bad: any = v2bundle()
    bad.version = 3
    expect(() => parseBundle(bad)).toThrow(/version 3/)
  })

  it('throws on a non-object', () => {
    expect(() => parseBundle(null)).toThrow()
    expect(() => parseBundle(42)).toThrow()
  })

  it('throws when items is missing', () => {
    const bad: any = v2bundle()
    delete bad.items
    expect(() => parseBundle(bad)).toThrow(/items/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `viewer/`): `npx vitest run test/bundle.test.ts`
Expected: FAIL — cannot resolve `../src/core/bundle`.

- [ ] **Step 3: Implement `viewer/src/core/bundle.ts`**

```ts
export type Facet =
  | { name: string; type: 'numeric'; min: number; max: number }
  | { name: string; type: 'date'; min: string; max: string }
  | { name: string; type: 'category'; values: string[] }
  | { name: string; type: 'text' }

export interface AtlasMeta {
  file: string
  width: number
  height: number
}

export interface Item {
  id: number
  values: Record<string, unknown>
  atlas: number
  rect: [number, number, number, number]
  detail: string | null
}

export interface Bundle {
  version: number
  title: string
  tileSize: number
  facets: Facet[]
  cardFields: string[]
  atlases: AtlasMeta[]
  items: Item[]
}

export const SUPPORTED_VERSION = 2

export function parseBundle(json: unknown): Bundle {
  if (typeof json !== 'object' || json === null) {
    throw new Error('pview: bundle must be a JSON object')
  }
  const b = json as Record<string, unknown>
  const version = b.version
  if (typeof version !== 'number') {
    throw new Error('pview: bundle is missing a numeric "version"')
  }
  if (version > SUPPORTED_VERSION) {
    throw new Error(
      `pview: bundle version ${version} is newer than this viewer supports (${SUPPORTED_VERSION})`,
    )
  }
  if (!Array.isArray(b.items)) {
    throw new Error('pview: bundle is missing an "items" array')
  }
  if (!Array.isArray(b.atlases)) {
    throw new Error('pview: bundle is missing an "atlases" array')
  }
  const items: Item[] = (b.items as Record<string, unknown>[]).map((raw) => ({
    id: raw.id as number,
    values: (raw.values ?? {}) as Record<string, unknown>,
    atlas: raw.atlas as number,
    rect: raw.rect as [number, number, number, number],
    detail: (raw.detail ?? null) as string | null,
  }))
  return {
    version,
    title: (b.title as string) ?? '',
    tileSize: (b.tileSize as number) ?? 256,
    facets: (b.facets as Facet[]) ?? [],
    cardFields: (b.cardFields as string[]) ?? [],
    atlases: b.atlases as AtlasMeta[],
    items,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `viewer/`): `npx vitest run test/bundle.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/core/bundle.ts viewer/test/bundle.test.ts
git commit -m "feat(viewer): parseBundle with v2/v1 handling"
```

---

## Task 3: `core/layout/grid.ts` — gridLayout

**Files:**
- Create: `viewer/src/core/layout/grid.ts`
- Test: `viewer/test/grid.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LayoutTarget = {x:number, y:number, scale:number}`.
  - `gridLayout(ids: number[], opts: {columns:number, tileSize:number, gap:number}) -> {targets: Map<number, LayoutTarget>, bounds:{w:number,h:number}}`. Targets are tile **centers** (so sprites can be anchored 0.5). Content spans `[0, bounds.w] x [0, bounds.h]`.

- [ ] **Step 1: Write the failing tests** in `viewer/test/grid.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { gridLayout } from '../src/core/layout/grid'

describe('gridLayout', () => {
  it('places ids as tile centers, left-to-right, top-to-bottom', () => {
    const { targets } = gridLayout([10, 11, 12, 13, 14], { columns: 2, tileSize: 64, gap: 6 })
    // step = 70, center offset = 32
    expect(targets.get(10)).toEqual({ x: 32, y: 32, scale: 1 })
    expect(targets.get(11)).toEqual({ x: 102, y: 32, scale: 1 })
    expect(targets.get(12)).toEqual({ x: 32, y: 102, scale: 1 })
    expect(targets.get(13)).toEqual({ x: 102, y: 102, scale: 1 })
    expect(targets.get(14)).toEqual({ x: 32, y: 172, scale: 1 })
  })

  it('computes bounds for a full grid', () => {
    const { bounds } = gridLayout([0, 1, 2, 3], { columns: 2, tileSize: 64, gap: 6 })
    expect(bounds).toEqual({ w: 134, h: 134 }) // 2*70 - 6
  })

  it('computes bounds for a single partial row', () => {
    const { bounds } = gridLayout([0, 1, 2], { columns: 5, tileSize: 64, gap: 6 })
    expect(bounds).toEqual({ w: 204, h: 64 }) // 3*70-6 wide, 1*70-6 tall
  })

  it('handles empty input', () => {
    const r = gridLayout([], { columns: 4, tileSize: 64, gap: 6 })
    expect(r.targets.size).toBe(0)
    expect(r.bounds).toEqual({ w: 0, h: 0 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `viewer/`): `npx vitest run test/grid.test.ts`
Expected: FAIL — cannot resolve `../src/core/layout/grid`.

- [ ] **Step 3: Implement `viewer/src/core/layout/grid.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `viewer/`): `npx vitest run test/grid.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/core/layout/grid.ts viewer/test/grid.test.ts
git commit -m "feat(viewer): gridLayout pure function"
```

---

## Task 4: `scene/camera.ts` — pure transform math

**Files:**
- Create: `viewer/src/scene/camera.ts`
- Test: `viewer/test/camera.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Camera = {x:number, y:number, zoom:number}` (`(x,y)` = world point at viewport center; `zoom` = world→screen scale). `Viewport = {width:number, height:number}`.
  - `worldToScreen(cam, wx, wy, vp)`, `screenToWorld(cam, sx, sy, vp)`, `panBy(cam, dxScreen, dyScreen)`, `zoomAt(cam, sx, sy, factor, vp)`, `fitToBounds(bounds:{w,h}, vp, padding?)` — all returning plain objects.

- [ ] **Step 1: Write the failing tests** in `viewer/test/camera.test.ts`

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `viewer/`): `npx vitest run test/camera.test.ts`
Expected: FAIL — cannot resolve `../src/scene/camera`.

- [ ] **Step 3: Implement `viewer/src/scene/camera.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `viewer/`): `npx vitest run test/camera.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/scene/camera.ts viewer/test/camera.test.ts
git commit -m "feat(viewer): pure camera transform math"
```

---

## Task 5: `scene/urls.ts` + `scene/sprites.ts` + `scene/Scene.ts` (PixiJS)

**Files:**
- Create: `viewer/src/scene/urls.ts`, `viewer/src/scene/sprites.ts`, `viewer/src/scene/Scene.ts`
- Test: `viewer/test/urls.test.ts`

**Interfaces:**
- Consumes: `Bundle` (Task 2), `LayoutTarget` (Task 3), `Camera`/`fitToBounds`/`panBy`/`zoomAt` (Task 4).
- Produces:
  - `resolveAtlasUrl(file: string, baseUrl: string) -> string` (pure; data URIs pass through, else `baseUrl + file`).
  - `buildSprites(bundle, world, loadTexture, baseUrl) -> Promise<Map<number, Sprite>>`. `loadTexture: (url:string) => Promise<Texture>` is injectable.
  - `class Scene` with `mount(el)`, `setSprites(bundle, baseUrl)`, `placeSprites(targets)`, `frame(bounds)`, `destroy()`.
- Note: `sprites.ts`/`Scene.ts` are PixiJS code with **no unit tests** — verified via `npm run typecheck`. Only the pure `resolveAtlasUrl` is unit-tested (kept in its own pixi-free module so the test never imports pixi).

- [ ] **Step 1: Write the failing test** in `viewer/test/urls.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { resolveAtlasUrl } from '../src/scene/urls'

describe('resolveAtlasUrl', () => {
  it('passes data URIs through unchanged', () => {
    expect(resolveAtlasUrl('data:image/png;base64,AAA', '/fixtures/')).toBe('data:image/png;base64,AAA')
  })

  it('prefixes relative files with the base url', () => {
    expect(resolveAtlasUrl('atlas/atlas_0.png', '/fixtures/')).toBe('/fixtures/atlas/atlas_0.png')
    expect(resolveAtlasUrl('atlas/atlas_0.png', './')).toBe('./atlas/atlas_0.png')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `viewer/`): `npx vitest run test/urls.test.ts`
Expected: FAIL — cannot resolve `../src/scene/urls`.

- [ ] **Step 3: Implement `viewer/src/scene/urls.ts`**

```ts
export function resolveAtlasUrl(file: string, baseUrl: string): string {
  return file.startsWith('data:') ? file : baseUrl + file
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `viewer/`): `npx vitest run test/urls.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `viewer/src/scene/sprites.ts`**

```ts
import { Container, Rectangle, Sprite, Texture } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import { resolveAtlasUrl } from './urls'

export type TextureLoader = (url: string) => Promise<Texture>

export async function buildSprites(
  bundle: Bundle,
  world: Container,
  loadTexture: TextureLoader,
  baseUrl: string,
): Promise<Map<number, Sprite>> {
  const sources = []
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
```

- [ ] **Step 6: Implement `viewer/src/scene/Scene.ts`**

```ts
import { Application, Assets, Container, Sprite } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import type { LayoutTarget } from '../core/layout/grid'
import { buildSprites, type TextureLoader } from './sprites'
import { type Camera, fitToBounds, panBy, zoomAt } from './camera'

export class Scene {
  private app = new Application()
  private world = new Container()
  private sprites = new Map<number, Sprite>()
  private cam: Camera = { x: 0, y: 0, zoom: 1 }
  private loadTexture: TextureLoader

  constructor(loadTexture: TextureLoader = (url) => Assets.load(url)) {
    this.loadTexture = loadTexture
  }

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: el, backgroundAlpha: 0, antialias: true, preference: 'webgl' })
    el.appendChild(this.app.canvas)
    this.app.stage.addChild(this.world)
    this.attachInteraction()
    window.addEventListener('resize', this.applyCamera)
  }

  async setSprites(bundle: Bundle, baseUrl: string): Promise<void> {
    this.sprites = await buildSprites(bundle, this.world, this.loadTexture, baseUrl)
  }

  placeSprites(targets: Map<number, LayoutTarget>): void {
    for (const [id, t] of targets) {
      const sp = this.sprites.get(id)
      if (!sp) continue
      sp.position.set(t.x, t.y)
      sp.scale.set(t.scale)
    }
  }

  frame(bounds: { w: number; h: number }): void {
    this.cam = fitToBounds(bounds, this.viewport())
    this.applyCamera()
  }

  private viewport() {
    return { width: this.app.renderer.width, height: this.app.renderer.height }
  }

  private applyCamera = (): void => {
    const vp = this.viewport()
    this.world.scale.set(this.cam.zoom)
    this.world.position.set(
      vp.width / 2 - this.cam.x * this.cam.zoom,
      vp.height / 2 - this.cam.y * this.cam.zoom,
    )
  }

  private attachInteraction(): void {
    const canvas = this.app.canvas
    let dragging = false
    let lastX = 0
    let lastY = 0
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    })
    window.addEventListener('pointerup', () => {
      dragging = false
    })
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return
      this.cam = panBy(this.cam, e.clientX - lastX, e.clientY - lastY)
      lastX = e.clientX
      lastY = e.clientY
      this.applyCamera()
    })
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        this.cam = zoomAt(this.cam, e.clientX - rect.left, e.clientY - rect.top, factor, this.viewport())
        this.applyCamera()
      },
      { passive: false },
    )
  }

  destroy(): void {
    window.removeEventListener('resize', this.applyCamera)
    this.app.destroy(true)
  }
}
```

- [ ] **Step 7: Typecheck the Pixi code**

Run (from `viewer/`): `npm run typecheck`
Expected: no type errors (exit 0). If a Pixi-v8 type name differs in the installed version (e.g. the texture `source` accessor), adjust the call to the installed API and note it in your report — do not weaken `strict` or add `any` casts to silence it without explanation.

- [ ] **Step 8: Run the full Vitest suite to confirm nothing broke**

Run (from `viewer/`): `npm test`
Expected: PASS (smoke + bundle + grid + camera + urls).

- [ ] **Step 9: Commit**

```bash
git add viewer/src/scene/urls.ts viewer/src/scene/sprites.ts viewer/src/scene/Scene.ts viewer/test/urls.test.ts
git commit -m "feat(viewer): atlas sprites + Pixi Scene with pan/zoom"
```

---

## Task 6: Preact shell, entry, dev fixture, and end-to-end build verification

**Files:**
- Create: `viewer/src/ui/App.tsx`, `viewer/src/main.tsx`, `viewer/src/styles.css`, `viewer/scripts/make-fixture.py`
- Test: end-to-end build verification (no new unit test)

**Interfaces:**
- Consumes: `Bundle`/`parseBundle` (Task 2), `gridLayout` (Task 3), `Scene` (Task 5).
- Produces: `App({bundle, baseUrl})` Preact component; `main.tsx` dual-mode loader; a `make-fixture.py` that writes a real bundle into `viewer/fixtures/`; a working `vite build` that emits `app.js`/`app.css`/`index.html` to `viewer_assets/`.

- [ ] **Step 1: Create `viewer/src/styles.css`**

```css
html, body, #app { margin: 0; height: 100%; }
.pview-root { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #111; }
.pview-canvas { position: absolute; inset: 0; }
.pview-title { position: absolute; top: 12px; left: 14px; color: #eee; font: 600 16px sans-serif; pointer-events: none; }
.pview-error { color: #eee; font: 16px sans-serif; padding: 1rem; }
```

- [ ] **Step 2: Create `viewer/src/ui/App.tsx`**

```tsx
import { useEffect, useRef } from 'preact/hooks'
import type { Bundle } from '../core/bundle'
import { gridLayout } from '../core/layout/grid'
import { Scene } from '../scene/Scene'

export function App({ bundle, baseUrl }: { bundle: Bundle; baseUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new Scene()
    let disposed = false
    void (async () => {
      try {
        await scene.mount(host)
        if (disposed) {
          scene.destroy()
          return
        }
        await scene.setSprites(bundle, baseUrl)
        const columns = Math.max(1, Math.ceil(Math.sqrt(bundle.items.length)))
        const { targets, bounds } = gridLayout(
          bundle.items.map((it) => it.id),
          { columns, tileSize: bundle.tileSize, gap: Math.round(bundle.tileSize * 0.08) },
        )
        scene.placeSprites(targets)
        scene.frame(bounds)
      } catch (err) {
        host.innerHTML = `<div class="pview-error">pview: ${(err as Error).message}</div>`
      }
    })()
    return () => {
      disposed = true
      scene.destroy()
    }
  }, [bundle, baseUrl])

  return (
    <div class="pview-root">
      <div class="pview-canvas" ref={hostRef} />
      <div class="pview-title">{bundle.title}</div>
    </div>
  )
}
```

- [ ] **Step 3: Create `viewer/src/main.tsx`**

```tsx
import { render } from 'preact'
import './styles.css'
import { parseBundle, type Bundle } from './core/bundle'
import { App } from './ui/App'

async function loadBundleJson(): Promise<{ json: unknown; baseUrl: string }> {
  const inlined = document.getElementById('pview-data')
  if (inlined?.textContent) {
    return { json: JSON.parse(inlined.textContent), baseUrl: '' }
  }
  const baseUrl = import.meta.env.DEV ? '/fixtures/' : './'
  const resp = await fetch(baseUrl + 'data.json')
  if (!resp.ok) throw new Error(`failed to load data.json (${resp.status})`)
  return { json: await resp.json(), baseUrl }
}

function showError(message: string): void {
  const el = document.getElementById('app')
  if (el) el.innerHTML = `<div class="pview-error">${message}</div>`
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) return
  try {
    const { json, baseUrl } = await loadBundleJson()
    const bundle: Bundle = parseBundle(json)
    render(<App bundle={bundle} baseUrl={baseUrl} />, root)
  } catch (err) {
    showError(`pview: ${(err as Error).message}`)
  }
}

void boot()
```

- [ ] **Step 4: Create `viewer/scripts/make-fixture.py`**

```python
"""Generate a small real pview bundle into viewer/fixtures/ for dev."""
import os
import sys

import pandas as pd
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "src"))

from pview import build  # noqa: E402

OUT = os.path.join(HERE, "..", "fixtures")


def main() -> None:
    src_imgs = os.path.join(OUT, "_src")
    os.makedirs(src_imgs, exist_ok=True)
    rows = []
    for i in range(12):
        photo = ""
        if i % 3 == 0:
            p = os.path.join(src_imgs, f"{i}.png")
            Image.new("RGB", (200, 200), ((i * 40) % 255, 80, 160)).save(p)
            photo = p
        rows.append(
            {"name": f"Item {i}", "group": ["A", "B", "C"][i % 3], "rank": i, "photo": photo}
        )
    df = pd.DataFrame(rows)
    build(
        df,
        name_col="name",
        image_col="photo",
        card_fields=["name", "group", "rank"],
        title="Fixture",
        out_dir=OUT,
    )
    print(f"wrote fixture bundle to {OUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Generate the dev fixture and typecheck**

Run (from `viewer/`): `npm run fixtures`
Expected: prints `wrote fixture bundle to .../viewer/fixtures` and creates `viewer/fixtures/data.json` + `viewer/fixtures/atlas/`.
Run: `npm run typecheck`
Expected: no type errors.
Run: `npm test`
Expected: PASS (all prior unit tests still green).

- [ ] **Step 6: Verify the production build output shape (then restore the placeholder)**

The committed placeholder `viewer_assets/` must NOT be replaced in M1 (committing built assets is M5). Build into it only to verify, then restore it.

Run (from `viewer/`): `npm run build`
Expected: completes; writes `../src/pview/viewer_assets/app.js`, `app.css`, and `index.html`.

Verify the output (from `viewer/`):
```bash
test -s ../src/pview/viewer_assets/app.js && echo APP_JS_OK
test -s ../src/pview/viewer_assets/app.css && echo APP_CSS_OK
grep -q 'src="./app.js"' ../src/pview/viewer_assets/index.html && echo INDEX_OK
```
Expected: prints `APP_JS_OK`, `APP_CSS_OK`, `INDEX_OK`.

Verify a real folder bundle renders end-to-end with the freshly built assets (from the repo root `/home/lab/tmp/pview`):
```bash
python3 - <<'PY'
import tempfile, os, pandas as pd
from PIL import Image
import sys; sys.path.insert(0, "src")
from pview import build
d = tempfile.mkdtemp()
p = os.path.join(d, "a.png"); Image.new("RGB", (64, 64), (200, 60, 60)).save(p)
df = pd.DataFrame({"name": ["A", "B"], "photo": [p, ""]})
out = build(df, name_col="name", image_col="photo", out_dir=os.path.join(d, "site"))
for f in ("index.html", "app.js", "app.css", "data.json"):
    assert (out / f).exists(), f
assert 'src="./app.js"' in (out / "index.html").read_text()
print("FOLDER BUNDLE OK")
PY
```
Expected: prints `FOLDER BUNDLE OK`.

Restore the committed placeholder assets (from the repo root):
```bash
git checkout -- src/pview/viewer_assets
```
Expected: `git status` shows `viewer_assets/` unmodified.

- [ ] **Step 7: Confirm the Python suite is still green on the restored placeholder**

Run (from the repo root `/home/lab/tmp/pview`): `python -m pytest -q`
Expected: PASS (46 tests) — the placeholder is restored, so the placeholder-string test still passes.

- [ ] **Step 8: Manual dev smoke (report observations)**

Run (from `viewer/`): `npm run dev`, open the printed URL, and confirm: a grid of 12 tiles renders, drag pans, and wheel zooms. Stop the server. Record the result in your report (this is a manual check, not an automated gate; if you cannot run a browser in this environment, say so and rely on the build + typecheck gates).

- [ ] **Step 9: Commit**

```bash
git add viewer/src/ui/App.tsx viewer/src/main.tsx viewer/src/styles.css viewer/scripts/make-fixture.py
git commit -m "feat(viewer): Preact shell, dual-mode loader, dev fixture"
```

---

## Self-Review

**Spec coverage (M1 design → tasks):**
- `viewer/` Vite+TS+Vitest project, versions → Task 1. ✓
- `parseBundle` (v<=2, missing detail → null, backward-compat v1) → Task 2. ✓
- `gridLayout` pure + tested → Task 3. ✓
- Pure camera math (zoomAt cursor-fixed, fitToBounds, pan, round-trip) → Task 4. ✓
- Atlas → sprites (texture frame over shared source), `Scene` pan/zoom, `resolveAtlasUrl` → Task 5. ✓
- Preact shell mounting canvas, dual-mode loader (`#pview-data` vs fetch), dev fixture, IIFE build → `viewer_assets`, end-to-end render → Task 6. ✓
- Error handling (WebGL/parse/atlas) → main.tsx `showError` + App try/catch (Task 6), parseBundle throws (Task 2). ✓
- M1 does not commit built assets (restored placeholder) → Task 6 Steps 6–7. ✓
- Testing: pure modules unit-tested; Pixi/DOM typecheck-gated → Tasks 2–5 tests; Task 5/6 typecheck. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `Bundle`/`Item` (Task 2) consumed by `buildSprites`/`Scene`/`App` (Tasks 5–6); `LayoutTarget` + `gridLayout` return shape (Task 3) consumed by `Scene.placeSprites`/`App` (Tasks 5–6); `Camera` + `fitToBounds`/`panBy`/`zoomAt` (Task 4) consumed by `Scene` (Task 5); `resolveAtlasUrl` (Task 5) used by `buildSprites`. Grid targets are tile centers and sprites anchor 0.5 — consistent. Camera `applyCamera` transform matches `worldToScreen`. Names align across tasks.

**Notes:**
- `</script>`-escaping for inlining the real `app.js` in single-file mode, committing the built assets, and the staleness check are **M5** (out of M1 scope), because M1 keeps the committed placeholder.
- If `npm install` hits a vite/vitest peer-dependency conflict, Task 1 Step 8 allows resolving to the latest compatible pair (reported by the implementer).
- Pixi-v8 API specifics in Task 5 are gated by `npm run typecheck`; the implementer adjusts to the installed API if a type name differs, without weakening `strict`.
