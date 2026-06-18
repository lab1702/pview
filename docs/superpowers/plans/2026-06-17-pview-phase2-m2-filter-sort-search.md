# pview Phase 2 — M2: Filter / Sort / Search + Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the M1 sprite wall interactive — faceted filtering, sorting, search, faceted counts, and animated grid re-layout — plus four foundation-hardening carry-ins.

**Architecture:** Pure framework-free modules (filter, search, sort, counts, range math, a pure transition controller) with Vitest unit tests; PixiJS only *applies* the transition controller's output; Preact provides the chrome. State flows one direction through `@preact/signals`.

**Tech Stack:** TypeScript 5, PixiJS 8, Preact 10 + @preact/signals 2, Vite 8, Vitest 4 (+ @testing-library/preact, jsdom). Python (pandas/Pillow/pytest) for the contract test.

## Global Constraints

- All `viewer/` commands run from `/home/lab/tmp/pview/viewer`; Python from `/home/lab/tmp/pview`.
- Gates per task: `npm test` (Vitest) green, `npm run typecheck` (tsc --noEmit --strict) clean. Python tasks: `python -m pytest -q` green.
- Pure logic in `core/` and `scene/transitions.ts`/`scene/atlasSources.ts`/`scene/rangeModel.ts` (no Pixi/DOM imports → unit-testable). PixiJS only in `scene/sprites.ts`/`scene/Scene.ts`. Preact only in `ui/*.tsx`.
- Bundle is `version 2`; `Item = {id:number, values:Record<string,unknown>, atlas:number, rect:[x,y,w,h], detail:string|null}`; `Facet` types are `numeric|date|category|text`.
- Faceted counts: each category value's count is computed against all active constraints **except that facet's own**.
- Grid width is constant: `columns = max(1, ceil(sqrt(totalItems)))`; the camera frames once on load and does NOT auto-re-frame on filter/sort.
- Transition engine is a pure `TransitionController` (RAF lerp); Pixi reads its output each ticker frame.
- TDD: failing test → confirm fail → implement → confirm pass → commit.
- M2 does NOT commit built `viewer_assets/` (that is M5); the last task verifies the build then restores the placeholder.
- Component tests use `@testing-library/preact` + jsdom (`// @vitest-environment jsdom` docblock per `.test.tsx`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `viewer/src/core/filter.ts` | `FilterState` + `applyFilters` |
| `viewer/src/core/search.ts` | `matchQuery` |
| `viewer/src/core/sort.ts` | `sortIds` |
| `viewer/src/core/counts.ts` | `facetedCounts` (exclude-own-facet) |
| `viewer/src/core/rangeModel.ts` | pure dual-slider math |
| `viewer/src/core/bundle.ts` | parseBundle field guards (carry-in) |
| `viewer/src/scene/atlasSources.ts` | `loadAtlasSources` (pixi-light, resilient) |
| `viewer/src/scene/transitions.ts` | `TransitionController` |
| `viewer/src/scene/sprites.ts` / `Scene.ts` | use atlasSources; `setLayout` + ticker |
| `viewer/src/ui/state.ts` | `createViewerState(bundle)` |
| `viewer/src/ui/RangeSlider.tsx` | dual-handle slider |
| `viewer/src/ui/Sidebar.tsx` `Topbar.tsx` `EmptyState.tsx` `App.tsx` | chrome |
| `tests/test_bundle_contract.py` | producer/consumer contract (carry-in) |

---

## Task 1: Carry-in — Vitest Preact-JSX transform + @testing-library/preact

**Files:**
- Modify: `viewer/package.json`, `viewer/vite.config.ts`
- Test: `viewer/test/probe.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a working component-test toolchain — `.test.tsx` files render Preact components via `@testing-library/preact` under jsdom. Unblocks all later component tests.

- [ ] **Step 1: Add dependencies**

Run (from `viewer/`): `npm install -D @testing-library/preact @preact/preset-vite`
Expected: both added to `devDependencies`. (`jsdom` is already present.)

- [ ] **Step 2: Wire the Preact preset and `.test.tsx` include in `viewer/vite.config.ts`**

Add the import at the top and the plugin + test include. The full file becomes:

```ts
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
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
  plugins: [preact(), emitIndexHtml()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
```

- [ ] **Step 3: Write the probe component test** `viewer/test/probe.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'

function Hello({ name }: { name: string }) {
  return <div>Hello {name}</div>
}

describe('preact jsx renders under vitest+jsdom', () => {
  it('renders a component', () => {
    render(<Hello name="Ada" />)
    expect(screen.getByText('Hello Ada')).toBeTruthy()
  })
})
```

- [ ] **Step 4: Run the probe**

Run (from `viewer/`): `npm test`
Expected: PASS, including `probe.test.tsx`, with **no** "react/jsx-runtime"-not-found error and no esbuild/oxc warning.

If the probe fails because `@preact/preset-vite` is incompatible with Vite 8: remove the `preact()` plugin, and instead make the JSX transform tsconfig-driven for tests by adding to the `test` block: `transformMode: { web: [/\.[jt]sx$/] }` is not needed — instead the reliable fallback is to keep `preact()` off and add `esbuild: { jsx: 'automatic', jsxImportSource: 'preact' }` back ONLY if Vitest's transformer honors it (it warned before, so this is unlikely). Prefer `@preact/preset-vite`. If neither works, STOP and report BLOCKED with the exact error — the toolchain choice needs escalation.

- [ ] **Step 5: Confirm the build and typecheck still pass**

Run: `npm run typecheck` → exit 0.
Run: `npx vite build --outDir /tmp/pview-m2t1 >/dev/null 2>&1 && echo BUILD_OK` → prints `BUILD_OK` (verifies `preact()` didn't break the production build; output to a throwaway dir so the committed placeholder is untouched). Then `rm -rf /tmp/pview-m2t1`.

- [ ] **Step 6: Commit**

```bash
git add viewer/package.json viewer/package-lock.json viewer/vite.config.ts viewer/test/probe.test.tsx
git commit -m "test(viewer): wire Preact JSX transform for Vitest component tests"
```

---

## Task 2: Carry-in — parseBundle field guards

**Files:**
- Modify: `viewer/src/core/bundle.ts`
- Test: `viewer/test/bundle.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseBundle` throws a clear error when any item's `id`/`atlas` is non-numeric or `rect` isn't a length-4 number array.

- [ ] **Step 1: Write failing tests** — append to `viewer/test/bundle.test.ts`:

```ts
describe('parseBundle field guards', () => {
  function base() {
    return {
      version: 2,
      atlases: [{ file: 'a', width: 1, height: 1 }],
      items: [{ id: 0, values: {}, atlas: 0, rect: [0, 0, 1, 1], detail: null }],
    }
  }

  it('throws on a non-numeric id', () => {
    const bad: any = base()
    bad.items[0].id = 'x'
    expect(() => parseBundle(bad)).toThrow(/id/)
  })

  it('throws on a non-numeric atlas', () => {
    const bad: any = base()
    bad.items[0].atlas = null
    expect(() => parseBundle(bad)).toThrow(/atlas/)
  })

  it('throws on a malformed rect', () => {
    const bad: any = base()
    bad.items[0].rect = [0, 0, 1]
    expect(() => parseBundle(bad)).toThrow(/rect/)
  })

  it('accepts a well-formed item', () => {
    const ok = parseBundle(base())
    expect(ok.items[0].rect).toEqual([0, 0, 1, 1])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/bundle.test.ts`
Expected: FAIL — the unguarded casts don't throw.

- [ ] **Step 3: Replace the items mapping** in `viewer/src/core/bundle.ts`. Replace the block from the `// Per-item field validation ...` comment through the `}))` that closes the `.map(` with:

```ts
  const items: Item[] = (b.items as unknown[]).map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`pview: item ${i} is not an object`)
    }
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'number') {
      throw new Error(`pview: item ${i} has a non-numeric id`)
    }
    if (typeof r.atlas !== 'number') {
      throw new Error(`pview: item ${i} has a non-numeric atlas`)
    }
    if (
      !Array.isArray(r.rect) ||
      r.rect.length !== 4 ||
      !r.rect.every((n) => typeof n === 'number')
    ) {
      throw new Error(`pview: item ${i} has an invalid rect (expected 4 numbers)`)
    }
    return {
      id: r.id,
      values: (r.values ?? {}) as Record<string, unknown>,
      atlas: r.atlas,
      rect: r.rect as [number, number, number, number],
      detail: (r.detail ?? null) as string | null,
    }
  })
```

- [ ] **Step 4: Run to verify they pass**

Run (from `viewer/`): `npm test`
Expected: PASS (all bundle tests + prior suite).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/core/bundle.ts viewer/test/bundle.test.ts
git commit -m "feat(viewer): parseBundle validates item id/atlas/rect"
```

---

## Task 3: Carry-in — per-sheet atlas resilience

**Files:**
- Create: `viewer/src/scene/atlasSources.ts`
- Modify: `viewer/src/scene/sprites.ts`
- Test: `viewer/test/atlasSources.test.ts`

**Interfaces:**
- Consumes: `AtlasMeta` (bundle), `resolveAtlasUrl` (urls).
- Produces:
  - `type TextureLoader = (url: string) => Promise<Texture>` (moved here; re-exported from `sprites.ts`).
  - `loadAtlasSources(atlases, baseUrl, loadTexture) -> Promise<(TextureSource | null)[]>`: a failed atlas load becomes `null` (warned) instead of rejecting. Only type-level pixi imports, so it's unit-testable in node.
- `buildSprites` uses it; a `null` source means that sheet's items are skipped (existing `if (!source) continue`).

- [ ] **Step 1: Write the failing test** `viewer/test/atlasSources.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { loadAtlasSources } from '../src/scene/atlasSources'

const atlases = [
  { file: 'atlas/atlas_0.png', width: 8, height: 8 },
  { file: 'atlas/atlas_1.png', width: 8, height: 8 },
]

describe('loadAtlasSources', () => {
  it('returns a source per atlas and resolves urls against base', async () => {
    const seen: string[] = []
    const loader = async (url: string) => {
      seen.push(url)
      return { source: { id: url } } as any
    }
    const sources = await loadAtlasSources(atlases, '/fixtures/', loader)
    expect(seen).toEqual(['/fixtures/atlas/atlas_0.png', '/fixtures/atlas/atlas_1.png'])
    expect(sources).toHaveLength(2)
    expect(sources[0]).not.toBeNull()
  })

  it('keeps going when one atlas fails, returning null for it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loader = async (url: string) => {
      if (url.endsWith('_1.png')) throw new Error('boom')
      return { source: { id: url } } as any
    }
    const sources = await loadAtlasSources(atlases, '', loader)
    expect(sources[0]).not.toBeNull()
    expect(sources[1]).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run (from `viewer/`): `npx vitest run test/atlasSources.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `viewer/src/scene/atlasSources.ts`**

```ts
import type { Texture, TextureSource } from 'pixi.js'
import type { AtlasMeta } from '../core/bundle'
import { resolveAtlasUrl } from './urls'

export type TextureLoader = (url: string) => Promise<Texture>

export async function loadAtlasSources(
  atlases: AtlasMeta[],
  baseUrl: string,
  loadTexture: TextureLoader,
): Promise<(TextureSource | null)[]> {
  const sources: (TextureSource | null)[] = []
  for (let i = 0; i < atlases.length; i++) {
    try {
      const tex = await loadTexture(resolveAtlasUrl(atlases[i].file, baseUrl))
      sources.push(tex.source)
    } catch (err) {
      console.warn(`pview: atlas ${i} failed to load: ${(err as Error).message}`)
      sources.push(null)
    }
  }
  return sources
}
```

- [ ] **Step 4: Refactor `viewer/src/scene/sprites.ts`** to use it. Replace the whole file with:

```ts
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
```

(`Scene.ts` imports `type TextureLoader` from `./sprites`, which still re-exports it — no Scene change needed.)

- [ ] **Step 5: Run to verify pass + typecheck**

Run (from `viewer/`): `npm test` → PASS. `npm run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/scene/atlasSources.ts viewer/src/scene/sprites.ts viewer/test/atlasSources.test.ts
git commit -m "feat(viewer): per-sheet atlas load resilience"
```

---

## Task 4: Carry-in — producer/consumer contract test (pytest)

**Files:**
- Create: `tests/test_bundle_contract.py`

**Interfaces:**
- Consumes: the Python `build` API.
- Produces: a test pinning `data.json`'s shape to the viewer's `Bundle` contract.

- [ ] **Step 1: Write the test** `tests/test_bundle_contract.py`

```python
import json

import pandas as pd
from PIL import Image

from pview import build

TOP_KEYS = {"version", "title", "tileSize", "facets", "cardFields", "atlases", "items"}
ITEM_KEYS = {"id", "values", "atlas", "rect", "detail"}
FACET_TYPES = {"numeric", "date", "category", "text"}


def test_data_json_matches_viewer_bundle_contract(tmp_path):
    p = tmp_path / "a.png"
    Image.new("RGB", (16, 16), (1, 2, 3)).save(p)
    df = pd.DataFrame({"name": ["A", "B"], "age": [1, 2], "photo": [str(p), ""]})
    out = build(df, name_col="name", image_col="photo", out_dir=tmp_path / "site")
    data = json.loads((out / "data.json").read_text())

    assert set(data) == TOP_KEYS
    assert data["version"] == 2
    assert isinstance(data["atlases"], list)
    for atlas in data["atlases"]:
        assert set(atlas) == {"file", "width", "height"}
    for facet in data["facets"]:
        assert facet["type"] in FACET_TYPES
        assert "name" in facet
    for item in data["items"]:
        assert set(item) == ITEM_KEYS
        assert isinstance(item["id"], int)
        assert isinstance(item["atlas"], int)
        assert isinstance(item["rect"], list) and len(item["rect"]) == 4
        assert all(isinstance(n, int) for n in item["rect"])
        assert isinstance(item["values"], dict)
        assert item["detail"] is None or isinstance(item["detail"], str)
```

- [ ] **Step 2: Run it**

Run (from repo root): `python -m pytest tests/test_bundle_contract.py -v`
Expected: PASS (the bundle already conforms; this pins it against future drift).

- [ ] **Step 3: Confirm the whole Python suite is green**

Run: `python -m pytest -q` → 47 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/test_bundle_contract.py
git commit -m "test: pin data.json shape to the viewer Bundle contract"
```

---

## Task 5: core — filter.ts + search.ts

**Files:**
- Create: `viewer/src/core/filter.ts`, `viewer/src/core/search.ts`
- Test: `viewer/test/filter.test.ts`, `viewer/test/search.test.ts`

**Interfaces:**
- Consumes: `Item`, `Facet` (bundle).
- Produces:
  - `filter.ts`: `CategoryConstraint = Set<string>`; `RangeConstraint = {min:number,max:number} | {min:string,max:string}`; `FilterState = Record<string, Set<string> | RangeConstraint | undefined>`; `applyFilters(items, facets, state) -> Set<number>`.
  - `search.ts`: `matchQuery(item, query, textFacetNames) -> boolean`.

- [ ] **Step 1: Write failing tests** `viewer/test/filter.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { applyFilters, type FilterState } from '../src/core/filter'
import type { Facet, Item } from '../src/core/bundle'

const facets: Facet[] = [
  { name: 'g', type: 'category', values: ['a', 'b'] },
  { name: 'age', type: 'numeric', min: 0, max: 100 },
  { name: 'bio', type: 'text' },
]
const items: Item[] = [
  { id: 0, values: { g: 'a', age: 10, bio: 'x' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 1, values: { g: 'b', age: 50, bio: 'y' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 2, values: { g: 'a', age: 90, bio: 'z' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
]

it('empty state passes everything', () => {
  expect(applyFilters(items, facets, {}).size).toBe(3)
})

it('category constraint filters by membership', () => {
  const state: FilterState = { g: new Set(['a']) }
  expect([...applyFilters(items, facets, state)].sort()).toEqual([0, 2])
})

it('empty category set passes all', () => {
  expect(applyFilters(items, facets, { g: new Set() }).size).toBe(3)
})

it('numeric range filters inclusively', () => {
  expect([...applyFilters(items, facets, { age: { min: 10, max: 50 } })].sort()).toEqual([0, 1])
})

it('combines constraints with AND', () => {
  const state: FilterState = { g: new Set(['a']), age: { min: 0, max: 50 } }
  expect([...applyFilters(items, facets, state)]).toEqual([0])
})

it('ignores text-facet constraints', () => {
  expect(applyFilters(items, facets, { bio: new Set(['x']) }).size).toBe(3)
})
```

And `viewer/test/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchQuery } from '../src/core/search'
import type { Item } from '../src/core/bundle'

const item: Item = {
  id: 0,
  values: { name: 'Ada Lovelace', note: 'first programmer' },
  atlas: 0,
  rect: [0, 0, 1, 1],
  detail: null,
}
const textFacets = ['name', 'note']

it('empty query matches', () => {
  expect(matchQuery(item, '   ', textFacets)).toBe(true)
})

it('matches a case-insensitive substring', () => {
  expect(matchQuery(item, 'LOVE', textFacets)).toBe(true)
})

it('requires all tokens to match', () => {
  expect(matchQuery(item, 'ada programmer', textFacets)).toBe(true)
  expect(matchQuery(item, 'ada nope', textFacets)).toBe(false)
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/filter.test.ts test/search.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `viewer/src/core/filter.ts`**

```ts
import type { Facet, Item } from './bundle'

export type CategoryConstraint = Set<string>
export type RangeConstraint = { min: number; max: number } | { min: string; max: string }
export type Constraint = CategoryConstraint | RangeConstraint
export type FilterState = Record<string, Constraint | undefined>

export function applyFilters(items: Item[], facets: Facet[], state: FilterState): Set<number> {
  const byName = new Map(facets.map((f) => [f.name, f]))
  const out = new Set<number>()
  for (const item of items) {
    if (passes(item, byName, state)) out.add(item.id)
  }
  return out
}

function passes(item: Item, byName: Map<string, Facet>, state: FilterState): boolean {
  for (const name of Object.keys(state)) {
    const constraint = state[name]
    if (constraint === undefined) continue
    const facet = byName.get(name)
    if (!facet) continue
    const value = item.values[name]
    if (facet.type === 'category') {
      const set = constraint as CategoryConstraint
      if (set.size === 0) continue
      if (!set.has(String(value))) return false
    } else if (facet.type === 'numeric') {
      const { min, max } = constraint as { min: number; max: number }
      const v = Number(value)
      if (Number.isNaN(v) || v < min || v > max) return false
    } else if (facet.type === 'date') {
      const { min, max } = constraint as { min: string; max: string }
      const v = String(value)
      if (v < min || v > max) return false
    }
    // text facets are not filtered here
  }
  return true
}
```

- [ ] **Step 4: Implement `viewer/src/core/search.ts`**

```ts
import type { Item } from './bundle'

export function matchQuery(item: Item, query: string, textFacetNames: string[]): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  const hay = textFacetNames
    .map((n) => String(item.values[n] ?? ''))
    .join(' ')
    .toLowerCase()
  return q.split(/\s+/).every((token) => hay.includes(token))
}
```

- [ ] **Step 5: Run to verify pass**

Run (from `viewer/`): `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/core/filter.ts viewer/src/core/search.ts viewer/test/filter.test.ts viewer/test/search.test.ts
git commit -m "feat(viewer): faceted filter + text search core"
```

---

## Task 6: core — sort.ts + counts.ts

**Files:**
- Create: `viewer/src/core/sort.ts`, `viewer/src/core/counts.ts`
- Test: `viewer/test/sort.test.ts`, `viewer/test/counts.test.ts`

**Interfaces:**
- Consumes: `Item`, `Facet` (bundle), `applyFilters`/`FilterState` (filter).
- Produces:
  - `sort.ts`: `SortDir = 'asc'|'desc'`; `sortIds(ids, items, facetName, dir, facets) -> number[]` (stable; `null` facet → unchanged copy).
  - `counts.ts`: `facetedCounts(items, facets, state) -> Map<string, Map<string, number>>` for category facets, excluding each facet's own constraint.

- [ ] **Step 1: Write failing tests** `viewer/test/sort.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { sortIds } from '../src/core/sort'
import type { Facet, Item } from '../src/core/bundle'

const facets: Facet[] = [
  { name: 'age', type: 'numeric', min: 0, max: 100 },
  { name: 'name', type: 'text' },
]
const items: Item[] = [
  { id: 0, values: { age: 30, name: 'Bob' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 1, values: { age: 10, name: 'Ada' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 2, values: { age: 30, name: 'Cy' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
]

it('sorts numeric ascending', () => {
  expect(sortIds([0, 1, 2], items, 'age', 'asc', facets)).toEqual([1, 0, 2])
})

it('sorts numeric descending', () => {
  expect(sortIds([0, 1, 2], items, 'age', 'desc', facets)).toEqual([0, 2, 1])
})

it('is stable for equal keys (asc keeps input order)', () => {
  // ids 0 and 2 both have age 30 -> keep [0, 2]
  expect(sortIds([0, 1, 2], items, 'age', 'asc', facets)).toEqual([1, 0, 2])
})

it('sorts text', () => {
  expect(sortIds([0, 1, 2], items, 'name', 'asc', facets)).toEqual([1, 0, 2])
})

it('null facet returns an unchanged copy', () => {
  const input = [2, 0, 1]
  const out = sortIds(input, items, null, 'asc', facets)
  expect(out).toEqual([2, 0, 1])
  expect(out).not.toBe(input)
})
```

And `viewer/test/counts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { facetedCounts } from '../src/core/counts'
import type { Facet, Item } from '../src/core/bundle'

const facets: Facet[] = [
  { name: 'g', type: 'category', values: ['a', 'b'] },
  { name: 'c', type: 'category', values: ['x', 'y'] },
]
const items: Item[] = [
  { id: 0, values: { g: 'a', c: 'x' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 1, values: { g: 'a', c: 'y' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
  { id: 2, values: { g: 'b', c: 'x' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
]

it('counts all values with an empty filter', () => {
  const counts = facetedCounts(items, facets, {})
  expect(counts.get('g')).toEqual(new Map([['a', 2], ['b', 1]]))
})

it("excludes a facet's own constraint from its counts", () => {
  // selecting g=a: g's own counts ignore that constraint (still a:2, b:1),
  // but c's counts reflect g=a -> x:1, y:1
  const state = { g: new Set(['a']) }
  const counts = facetedCounts(items, facets, state)
  expect(counts.get('g')).toEqual(new Map([['a', 2], ['b', 1]]))
  expect(counts.get('c')).toEqual(new Map([['x', 1], ['y', 1]]))
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/sort.test.ts test/counts.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `viewer/src/core/sort.ts`**

```ts
import type { Facet, Item } from './bundle'

export type SortDir = 'asc' | 'desc'

export function sortIds(
  ids: number[],
  items: Item[],
  facetName: string | null,
  dir: SortDir,
  facets: Facet[],
): number[] {
  if (facetName === null) return [...ids]
  const facet = facets.find((f) => f.name === facetName)
  const byId = new Map(items.map((it) => [it.id, it]))
  const sign = dir === 'desc' ? -1 : 1
  const cmp =
    facet?.type === 'numeric'
      ? (a: unknown, b: unknown) => Number(a) - Number(b)
      : (a: unknown, b: unknown) => String(a).localeCompare(String(b))
  return [...ids].sort(
    (a, b) => sign * cmp(byId.get(a)?.values[facetName], byId.get(b)?.values[facetName]),
  )
}
```

- [ ] **Step 4: Implement `viewer/src/core/counts.ts`**

```ts
import type { Facet, Item } from './bundle'
import { applyFilters, type FilterState } from './filter'

export function facetedCounts(
  items: Item[],
  facets: Facet[],
  state: FilterState,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()
  for (const facet of facets) {
    if (facet.type !== 'category') continue
    const others: FilterState = { ...state, [facet.name]: undefined }
    const visible = applyFilters(items, facets, others)
    const counts = new Map<string, number>()
    for (const v of facet.values) counts.set(v, 0)
    for (const item of items) {
      if (!visible.has(item.id)) continue
      const key = String(item.values[facet.name])
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    result.set(facet.name, counts)
  }
  return result
}
```

- [ ] **Step 5: Run to verify pass**

Run (from `viewer/`): `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/core/sort.ts viewer/src/core/counts.ts viewer/test/sort.test.ts viewer/test/counts.test.ts
git commit -m "feat(viewer): type-aware sort + faceted counts"
```

---

## Task 7: core — rangeModel.ts

**Files:**
- Create: `viewer/src/core/rangeModel.ts`
- Test: `viewer/test/rangeModel.test.ts`

**Interfaces:**
- Produces: `valueToFraction(value, min, max)`, `fractionToValue(fraction, min, max, step?)`, `clampLow(low, high)`, `clampHigh(high, low)`.

- [ ] **Step 1: Write failing tests** `viewer/test/rangeModel.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { valueToFraction, fractionToValue, clampLow, clampHigh } from '../src/core/rangeModel'

it('maps value to fraction', () => {
  expect(valueToFraction(5, 0, 10)).toBeCloseTo(0.5)
  expect(valueToFraction(-1, 0, 10)).toBe(0)
  expect(valueToFraction(11, 0, 10)).toBe(1)
})

it('degenerate range maps to 0', () => {
  expect(valueToFraction(5, 5, 5)).toBe(0)
})

it('maps fraction to value', () => {
  expect(fractionToValue(0.5, 0, 10)).toBeCloseTo(5)
})

it('snaps to step', () => {
  expect(fractionToValue(0.27, 0, 10, 1)).toBe(3)
})

it('clamps handles so they cannot cross', () => {
  expect(clampLow(8, 5)).toBe(5) // low cannot exceed high
  expect(clampHigh(3, 5)).toBe(5) // high cannot fall below low
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/rangeModel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `viewer/src/core/rangeModel.ts`**

```ts
export function valueToFraction(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

export function fractionToValue(fraction: number, min: number, max: number, step?: number): number {
  const f = Math.min(1, Math.max(0, fraction))
  let v = min + f * (max - min)
  if (step && step > 0) v = Math.round((v - min) / step) * step + min
  return Math.min(max, Math.max(min, v))
}

export function clampLow(low: number, high: number): number {
  return Math.min(low, high)
}

export function clampHigh(high: number, low: number): number {
  return Math.max(high, low)
}
```

- [ ] **Step 4: Run to verify pass**

Run (from `viewer/`): `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/core/rangeModel.ts viewer/test/rangeModel.test.ts
git commit -m "feat(viewer): pure dual-range slider math"
```

---

## Task 8: scene — TransitionController + Scene.setLayout

**Files:**
- Create: `viewer/src/scene/transitions.ts`
- Modify: `viewer/src/scene/Scene.ts`
- Test: `viewer/test/transitions.test.ts`

**Interfaces:**
- Produces:
  - `transitions.ts`: `SpriteState = {x,y,scale,alpha}`; `easeInOutCubic(t)`; `class TransitionController` with `register(id, initial)`, `setTargets(targets, visible)`, `tick(dtMs)->boolean`, `snap()`, `get(id)->SpriteState|undefined`.
  - `Scene.ts`: replaces `placeSprites` with `setLayout(targets: Map<number,LayoutTarget>, visible: Set<number>, animate = true)`; a Pixi ticker applies the controller each frame. Used by Task 11's App.

- [ ] **Step 1: Write failing tests** `viewer/test/transitions.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { TransitionController, easeInOutCubic } from '../src/scene/transitions'

it('ease is 0 at 0 and 1 at 1', () => {
  expect(easeInOutCubic(0)).toBe(0)
  expect(easeInOutCubic(1)).toBe(1)
})

it('tick(0) leaves current at start; full duration reaches target', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 0, y: 0, scale: 1, alpha: 1 })
  c.setTargets(new Map([[0, { x: 10, y: 20, scale: 2 }]]), new Set([0]))
  c.tick(0)
  expect(c.get(0)).toEqual({ x: 0, y: 0, scale: 1, alpha: 1 })
  c.tick(100)
  const s = c.get(0)!
  expect(s.x).toBeCloseTo(10)
  expect(s.y).toBeCloseTo(20)
  expect(s.scale).toBeCloseTo(2)
  expect(s.alpha).toBeCloseTo(1)
})

it('a filtered-out id animates alpha toward 0', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 0, y: 0, scale: 1, alpha: 1 })
  c.setTargets(new Map(), new Set()) // not visible
  c.tick(100)
  expect(c.get(0)!.alpha).toBeCloseTo(0)
})

it('setTargets mid-flight re-bases from the current position', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 0, y: 0, scale: 1, alpha: 1 })
  c.setTargets(new Map([[0, { x: 100, y: 0, scale: 1 }]]), new Set([0]))
  c.tick(50) // halfway-ish
  const mid = c.get(0)!.x
  expect(mid).toBeGreaterThan(0)
  expect(mid).toBeLessThan(100)
  c.setTargets(new Map([[0, { x: 0, y: 0, scale: 1 }]]), new Set([0]))
  c.tick(0)
  expect(c.get(0)!.x).toBeCloseTo(mid) // re-based, no jump
})

it('snap jumps current to target', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 0, y: 0, scale: 1, alpha: 1 })
  c.setTargets(new Map([[0, { x: 5, y: 5, scale: 1 }]]), new Set([0]))
  c.snap()
  expect(c.get(0)).toEqual({ x: 5, y: 5, scale: 1, alpha: 1 })
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/transitions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `viewer/src/scene/transitions.ts`**

```ts
export interface SpriteState {
  x: number
  y: number
  scale: number
  alpha: number
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

interface Entry {
  start: SpriteState
  target: SpriteState
  current: SpriteState
}

export class TransitionController {
  private entries = new Map<number, Entry>()
  private elapsed = 0

  constructor(private durationMs = 400) {}

  register(id: number, initial: SpriteState): void {
    this.entries.set(id, {
      start: { ...initial },
      target: { ...initial },
      current: { ...initial },
    })
  }

  setTargets(
    targets: Map<number, { x: number; y: number; scale: number }>,
    visible: Set<number>,
  ): void {
    for (const [id, e] of this.entries) {
      const t = targets.get(id)
      e.start = { ...e.current }
      e.target = {
        x: t ? t.x : e.current.x,
        y: t ? t.y : e.current.y,
        scale: t ? t.scale : e.current.scale,
        alpha: visible.has(id) ? 1 : 0,
      }
    }
    this.elapsed = 0
  }

  tick(dtMs: number): boolean {
    this.elapsed += dtMs
    const t = this.durationMs > 0 ? Math.min(1, this.elapsed / this.durationMs) : 1
    const e = easeInOutCubic(t)
    for (const entry of this.entries.values()) {
      entry.current = {
        x: lerp(entry.start.x, entry.target.x, e),
        y: lerp(entry.start.y, entry.target.y, e),
        scale: lerp(entry.start.scale, entry.target.scale, e),
        alpha: lerp(entry.start.alpha, entry.target.alpha, e),
      }
    }
    return t < 1
  }

  snap(): void {
    for (const entry of this.entries.values()) {
      entry.current = { ...entry.target }
      entry.start = { ...entry.target }
    }
    this.elapsed = this.durationMs
  }

  get(id: number): SpriteState | undefined {
    return this.entries.get(id)?.current
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run (from `viewer/`): `npx vitest run test/transitions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire it into `viewer/src/scene/Scene.ts`** (typecheck-gated). Make these edits:

(a) Update imports at the top:
```ts
import { Application, Assets, Container, Sprite } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import type { LayoutTarget } from '../core/layout/grid'
import { buildSprites, type TextureLoader } from './sprites'
import { type Camera, fitToBounds, panBy, zoomAt } from './camera'
import { TransitionController } from './transitions'
```

(b) Add a controller field next to the others:
```ts
  private transitions = new TransitionController()
```

(c) In `mount`, after `this.app.stage.addChild(this.world)`, add the ticker:
```ts
    this.app.ticker.add(this.onTick)
```

(d) In `setSprites`, after the `this.sprites = await buildSprites(...)` line, register each sprite:
```ts
    for (const [id, sp] of this.sprites) {
      this.transitions.register(id, { x: sp.position.x, y: sp.position.y, scale: sp.scale.x, alpha: 1 })
    }
```

(e) Replace the entire `placeSprites` method with `setLayout` plus the ticker callback:
```ts
  setLayout(targets: Map<number, LayoutTarget>, visible: Set<number>, animate = true): void {
    this.transitions.setTargets(targets, visible)
    if (!animate) this.transitions.snap()
  }

  private onTick = (): void => {
    this.transitions.tick(this.app.ticker.deltaMS)
    for (const [id, sp] of this.sprites) {
      const s = this.transitions.get(id)
      if (!s) continue
      sp.position.set(s.x, s.y)
      sp.scale.set(s.scale)
      sp.alpha = s.alpha
      sp.visible = s.alpha > 0.01
    }
  }
```

- [ ] **Step 6: Typecheck + run suite**

Run (from `viewer/`): `npm run typecheck` → exit 0 (note: `placeSprites` is gone; the App still references it but is rewritten in Task 11 — so typecheck of `App.tsx` will FAIL here). To keep this task self-contained, temporarily update the one call site in `viewer/src/ui/App.tsx`: replace `scene.placeSprites(targets)` with `scene.setLayout(targets, new Set(bundle.items.map((it) => it.id)), false)`. This keeps typecheck + the existing behavior (instant initial layout) green until Task 11 wires the reactive effect.

Run: `npm run typecheck` → exit 0. `npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add viewer/src/scene/transitions.ts viewer/src/scene/Scene.ts viewer/src/ui/App.tsx viewer/test/transitions.test.ts
git commit -m "feat(viewer): RAF lerp transition engine + Scene.setLayout"
```

---

## Task 9: ui — createViewerState

**Files:**
- Create: `viewer/src/ui/state.ts`
- Test: `viewer/test/state.test.ts`

**Interfaces:**
- Consumes: `Bundle` (bundle), `applyFilters`/`FilterState` (filter), `matchQuery` (search), `sortIds`/`SortDir` (sort), `facetedCounts` (counts), `@preact/signals`.
- Produces: `createViewerState(bundle) -> { filter, sort, query, visibleIds, sortedVisible, counts, reset }` (signals + computeds; no globals).

- [ ] **Step 1: Write failing tests** `viewer/test/state.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createViewerState } from '../src/ui/state'
import type { Bundle } from '../src/core/bundle'

function bundle(): Bundle {
  return {
    version: 2,
    title: 'T',
    tileSize: 64,
    facets: [
      { name: 'name', type: 'text' },
      { name: 'g', type: 'category', values: ['a', 'b'] },
      { name: 'age', type: 'numeric', min: 0, max: 100 },
    ],
    cardFields: ['name'],
    atlases: [{ file: 'a', width: 1, height: 1 }],
    items: [
      { id: 0, values: { name: 'Ada', g: 'a', age: 10 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
      { id: 1, values: { name: 'Bob', g: 'b', age: 50 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
      { id: 2, values: { name: 'Cy', g: 'a', age: 90 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    ],
  }
}

it('visibleIds reflects filters', () => {
  const s = createViewerState(bundle())
  expect(s.visibleIds.value.size).toBe(3)
  s.filter.value = { g: new Set(['a']) }
  expect([...s.visibleIds.value].sort()).toEqual([0, 2])
})

it('visibleIds reflects search AND filters', () => {
  const s = createViewerState(bundle())
  s.query.value = 'ada'
  expect([...s.visibleIds.value]).toEqual([0])
})

it('sortedVisible applies sort', () => {
  const s = createViewerState(bundle())
  s.sort.value = { facet: 'age', dir: 'desc' }
  expect(s.sortedVisible.value).toEqual([2, 1, 0])
})

it('counts reflect other filters but not own facet', () => {
  const s = createViewerState(bundle())
  s.filter.value = { g: new Set(['a']) }
  expect(s.counts.value.get('g')).toEqual(new Map([['a', 2], ['b', 1]]))
})

it('reset clears filter and query', () => {
  const s = createViewerState(bundle())
  s.filter.value = { g: new Set(['a']) }
  s.query.value = 'x'
  s.reset()
  expect(s.filter.value).toEqual({})
  expect(s.query.value).toBe('')
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `viewer/src/ui/state.ts`**

```ts
import { signal, computed, type Signal, type ReadonlySignal } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { applyFilters, type FilterState } from '../core/filter'
import { matchQuery } from '../core/search'
import { sortIds, type SortDir } from '../core/sort'
import { facetedCounts } from '../core/counts'

export interface ViewerState {
  filter: Signal<FilterState>
  sort: Signal<{ facet: string | null; dir: SortDir }>
  query: Signal<string>
  visibleIds: ReadonlySignal<Set<number>>
  sortedVisible: ReadonlySignal<number[]>
  counts: ReadonlySignal<Map<string, Map<string, number>>>
  reset: () => void
}

export function createViewerState(bundle: Bundle): ViewerState {
  const filter = signal<FilterState>({})
  const sort = signal<{ facet: string | null; dir: SortDir }>({ facet: null, dir: 'asc' })
  const query = signal<string>('')
  const textFacetNames = bundle.facets.filter((f) => f.type === 'text').map((f) => f.name)

  const visibleIds = computed(() => {
    const filtered = applyFilters(bundle.items, bundle.facets, filter.value)
    const q = query.value
    if (q.trim() === '') return filtered
    const out = new Set<number>()
    for (const item of bundle.items) {
      if (filtered.has(item.id) && matchQuery(item, q, textFacetNames)) out.add(item.id)
    }
    return out
  })

  const sortedVisible = computed(() =>
    sortIds([...visibleIds.value], bundle.items, sort.value.facet, sort.value.dir, bundle.facets),
  )

  const counts = computed(() => facetedCounts(bundle.items, bundle.facets, filter.value))

  const reset = () => {
    filter.value = {}
    query.value = ''
  }

  return { filter, sort, query, visibleIds, sortedVisible, counts, reset }
}
```

- [ ] **Step 4: Run to verify pass**

Run (from `viewer/`): `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/ui/state.ts viewer/test/state.test.ts
git commit -m "feat(viewer): createViewerState signals + computeds"
```

---

## Task 10: ui — RangeSlider component

**Files:**
- Create: `viewer/src/ui/RangeSlider.tsx`
- Test: `viewer/test/RangeSlider.test.tsx`

**Interfaces:**
- Consumes: `valueToFraction`/`fractionToValue`/`clampLow`/`clampHigh` (rangeModel).
- Produces: `RangeSlider` Preact component with props `{ min:number, max:number, low:number, high:number, step?:number, onChange:(low:number, high:number)=>void, formatLabel?:(v:number)=>string }`. Two handles with `role="slider"` + `aria-valuemin/valuemax/valuenow`; arrow keys nudge by `step` (default 1); handles can't cross.

- [ ] **Step 1: Write the failing component test** `viewer/test/RangeSlider.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/preact'
import { RangeSlider } from '../src/ui/RangeSlider'

function setup(low = 2, high = 8) {
  const onChange = vi.fn()
  render(<RangeSlider min={0} max={10} low={low} high={high} step={1} onChange={onChange} />)
  const handles = screen.getAllByRole('slider')
  return { onChange, lowHandle: handles[0], highHandle: handles[1] }
}

it('exposes two ARIA sliders with correct bounds', () => {
  const { lowHandle, highHandle } = setup()
  expect(lowHandle.getAttribute('aria-valuemin')).toBe('0')
  expect(lowHandle.getAttribute('aria-valuemax')).toBe('10')
  expect(lowHandle.getAttribute('aria-valuenow')).toBe('2')
  expect(highHandle.getAttribute('aria-valuenow')).toBe('8')
})

it('ArrowRight on the low handle increases it and calls onChange', () => {
  const { onChange, lowHandle } = setup()
  fireEvent.keyDown(lowHandle, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledWith(3, 8)
})

it('the low handle cannot cross the high handle', () => {
  const { onChange, lowHandle } = setup(8, 8)
  fireEvent.keyDown(lowHandle, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledWith(8, 8) // clamped, cannot exceed high
})
```

- [ ] **Step 2: Run to verify it fails**

Run (from `viewer/`): `npx vitest run test/RangeSlider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `viewer/src/ui/RangeSlider.tsx`**

```tsx
import { useRef } from 'preact/hooks'
import { valueToFraction, fractionToValue, clampLow, clampHigh } from '../core/rangeModel'

interface Props {
  min: number
  max: number
  low: number
  high: number
  step?: number
  onChange: (low: number, high: number) => void
  formatLabel?: (v: number) => string
}

export function RangeSlider({ min, max, low, high, step = 1, onChange, formatLabel }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const fmt = formatLabel ?? ((v: number) => String(v))

  const nudge = (which: 'low' | 'high', delta: number) => {
    if (which === 'low') {
      onChange(clampLow(low + delta, high), high)
    } else {
      onChange(low, clampHigh(high + delta, low))
    }
  }

  const onKey = (which: 'low' | 'high') => (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      nudge(which, step)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      nudge(which, -step)
    }
  }

  const dragTo = (which: 'low' | 'high', clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    if (rect.width === 0) return
    const v = fractionToValue((clientX - rect.left) / rect.width, min, max, step)
    if (which === 'low') onChange(clampLow(v, high), high)
    else onChange(low, clampHigh(v, low))
  }

  const onPointerDown = (which: 'low' | 'high') => (e: PointerEvent) => {
    e.preventDefault()
    const move = (ev: PointerEvent) => dragTo(which, ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const lowPct = valueToFraction(low, min, max) * 100
  const highPct = valueToFraction(high, min, max) * 100

  return (
    <div class="pview-range">
      <div class="pview-range-track" ref={trackRef}>
        <div class="pview-range-fill" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        <div
          class="pview-range-handle"
          role="slider"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={low}
          style={{ left: `${lowPct}%` }}
          onKeyDown={onKey('low')}
          onPointerDown={onPointerDown('low')}
        />
        <div
          class="pview-range-handle"
          role="slider"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={high}
          style={{ left: `${highPct}%` }}
          onKeyDown={onKey('high')}
          onPointerDown={onPointerDown('high')}
        />
      </div>
      <div class="pview-range-labels">
        <span>{fmt(low)}</span>
        <span>{fmt(high)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run (from `viewer/`): `npx vitest run test/RangeSlider.test.tsx` → PASS. `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/ui/RangeSlider.tsx viewer/test/RangeSlider.test.tsx
git commit -m "feat(viewer): accessible dual-handle RangeSlider"
```

---

## Task 11: ui — Sidebar, Topbar, EmptyState, App wiring + styles

**Files:**
- Create: `viewer/src/ui/Sidebar.tsx`, `viewer/src/ui/Topbar.tsx`, `viewer/src/ui/EmptyState.tsx`
- Modify: `viewer/src/ui/App.tsx`, `viewer/src/styles.css`
- Test: `viewer/test/Sidebar.test.tsx`, `viewer/test/Topbar.test.tsx`, `viewer/test/EmptyState.test.tsx`

**Interfaces:**
- Consumes: `ViewerState`/`createViewerState` (state), `RangeSlider`, `gridLayout` (layout), `Scene` (scene), `Bundle`/`Facet` (bundle), `@preact/signals`'s `effect`.
- Produces: the full interactive chrome wired to the scene.

- [ ] **Step 1: Write failing component tests**

`viewer/test/EmptyState.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import { EmptyState } from '../src/ui/EmptyState'

it('renders a message and a clear action', () => {
  const onClear = vi.fn()
  render(<EmptyState onClear={onClear} />)
  expect(screen.getByText(/no items match/i)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /clear/i }))
  expect(onClear).toHaveBeenCalled()
})
```

`viewer/test/Topbar.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import { Topbar } from '../src/ui/Topbar'
import { createViewerState } from '../src/ui/state'
import type { Bundle } from '../src/core/bundle'

function bundle(): Bundle {
  return {
    version: 2, title: 'People', tileSize: 64,
    facets: [{ name: 'name', type: 'text' }, { name: 'age', type: 'numeric', min: 0, max: 9 }],
    cardFields: ['name'],
    atlases: [{ file: 'a', width: 1, height: 1 }],
    items: [
      { id: 0, values: { name: 'Ada', age: 1 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
      { id: 1, values: { name: 'Bob', age: 2 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    ],
  }
}

it('shows the title and the N of M count', () => {
  const state = createViewerState(bundle())
  render(<Topbar bundle={bundle()} state={state} />)
  expect(screen.getByText('People')).toBeTruthy()
  expect(screen.getByText(/2 of 2/)).toBeTruthy()
})

it('typing in search updates the query signal', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Topbar bundle={b} state={state} />)
  fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'ada' } })
  expect(state.query.value).toBe('ada')
})
```

`viewer/test/Sidebar.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import { Sidebar } from '../src/ui/Sidebar'
import { createViewerState } from '../src/ui/state'
import type { Bundle } from '../src/core/bundle'

function bundle(): Bundle {
  return {
    version: 2, title: 'T', tileSize: 64,
    facets: [
      { name: 'name', type: 'text' },
      { name: 'g', type: 'category', values: ['a', 'b'] },
    ],
    cardFields: ['name'],
    atlases: [{ file: 'a', width: 1, height: 1 }],
    items: [
      { id: 0, values: { name: 'A', g: 'a' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
      { id: 1, values: { name: 'B', g: 'b' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    ],
  }
}

it('renders a checkbox per category value with counts and toggles the filter', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  const checkbox = screen.getByLabelText(/a \(1\)/) // value "a", count 1
  fireEvent.click(checkbox)
  const constraint = state.filter.value['g'] as Set<string>
  expect(constraint.has('a')).toBe(true)
})

it('does not render a control for text facets', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  expect(screen.queryByText('name')).toBeNull()
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/EmptyState.test.tsx test/Topbar.test.tsx test/Sidebar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `viewer/src/ui/EmptyState.tsx`**

```tsx
export function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div class="pview-empty">
      <p>No items match your filters.</p>
      <button type="button" onClick={onClear}>
        Clear all
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Implement `viewer/src/ui/Topbar.tsx`**

```tsx
import type { Bundle } from '../core/bundle'
import type { ViewerState } from './state'

export function Topbar({ bundle, state }: { bundle: Bundle; state: ViewerState }) {
  const sortable = bundle.facets.filter((f) => f.type !== 'text' || f.name === bundle.cardFields[0])
  const total = bundle.items.length
  const visible = state.visibleIds.value.size

  return (
    <div class="pview-topbar">
      <span class="pview-topbar-title">{bundle.title}</span>
      <input
        class="pview-search"
        type="search"
        placeholder="Search…"
        value={state.query.value}
        onInput={(e) => {
          state.query.value = (e.target as HTMLInputElement).value
        }}
      />
      <label class="pview-sort">
        Sort:
        <select
          value={state.sort.value.facet ?? ''}
          onChange={(e) => {
            const facet = (e.target as HTMLSelectElement).value || null
            state.sort.value = { ...state.sort.value, facet }
          }}
        >
          <option value="">—</option>
          {sortable.map((f) => (
            <option value={f.name}>{f.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            state.sort.value = {
              ...state.sort.value,
              dir: state.sort.value.dir === 'asc' ? 'desc' : 'asc',
            }
          }}
        >
          {state.sort.value.dir === 'asc' ? '↑' : '↓'}
        </button>
      </label>
      <span class="pview-count">
        {visible.toLocaleString()} of {total.toLocaleString()}
      </span>
    </div>
  )
}
```

- [ ] **Step 5: Implement `viewer/src/ui/Sidebar.tsx`**

```tsx
import type { Bundle, Facet } from '../core/bundle'
import type { ViewerState } from './state'
import type { CategoryConstraint } from '../core/filter'
import { RangeSlider } from './RangeSlider'

export function Sidebar({ bundle, state }: { bundle: Bundle; state: ViewerState }) {
  const filterable = bundle.facets.filter((f) => f.type !== 'text')

  const toggleCategory = (name: string, value: string) => {
    const cur = (state.filter.value[name] as CategoryConstraint) ?? new Set<string>()
    const next = new Set(cur)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    state.filter.value = { ...state.filter.value, [name]: next }
  }

  const setRange = (name: string, low: number, high: number) => {
    state.filter.value = { ...state.filter.value, [name]: { min: low, max: high } }
  }

  const setRangeStr = (name: string, low: string, high: string) => {
    state.filter.value = { ...state.filter.value, [name]: { min: low, max: high } }
  }

  return (
    <div class="pview-sidebar">
      <button type="button" class="pview-clear" onClick={() => state.reset()}>
        Clear all
      </button>
      {filterable.map((f) => (
        <div class="pview-facet">
          <h3>{f.name}</h3>
          {f.type === 'category' && (
            <CategoryFilter facet={f} state={state} onToggle={(v) => toggleCategory(f.name, v)} />
          )}
          {f.type === 'numeric' && (
            <NumericFilter facet={f} state={state} onChange={(lo, hi) => setRange(f.name, lo, hi)} />
          )}
          {f.type === 'date' && (
            <DateFilter facet={f} state={state} onChange={(lo, hi) => setRangeStr(f.name, lo, hi)} />
          )}
        </div>
      ))}
    </div>
  )
}

function CategoryFilter({
  facet,
  state,
  onToggle,
}: {
  facet: Extract<Facet, { type: 'category' }>
  state: ViewerState
  onToggle: (value: string) => void
}) {
  const counts = state.counts.value.get(facet.name)
  const selected = (state.filter.value[facet.name] as Set<string>) ?? new Set<string>()
  return (
    <ul class="pview-checkboxes">
      {facet.values.map((v) => (
        <li>
          <label>
            <input type="checkbox" checked={selected.has(v)} onChange={() => onToggle(v)} />
            {v} ({counts?.get(v) ?? 0})
          </label>
        </li>
      ))}
    </ul>
  )
}

function NumericFilter({
  facet,
  state,
  onChange,
}: {
  facet: Extract<Facet, { type: 'numeric' }>
  state: ViewerState
  onChange: (low: number, high: number) => void
}) {
  const c = state.filter.value[facet.name] as { min: number; max: number } | undefined
  const low = c ? c.min : facet.min
  const high = c ? c.max : facet.max
  return (
    <RangeSlider min={facet.min} max={facet.max} low={low} high={high} onChange={onChange} />
  )
}

function DateFilter({
  facet,
  state,
  onChange,
}: {
  facet: Extract<Facet, { type: 'date' }>
  state: ViewerState
  onChange: (low: string, high: string) => void
}) {
  const toMs = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()
  const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const dayMs = 86_400_000
  const minMs = toMs(facet.min)
  const maxMs = toMs(facet.max)
  const c = state.filter.value[facet.name] as { min: string; max: string } | undefined
  const lowMs = c ? toMs(c.min) : minMs
  const highMs = c ? toMs(c.max) : maxMs
  return (
    <RangeSlider
      min={minMs}
      max={maxMs}
      low={lowMs}
      high={highMs}
      step={dayMs}
      formatLabel={(v) => toIso(v)}
      onChange={(lo, hi) => onChange(toIso(lo), toIso(hi))}
    />
  )
}
```

The date facet's `RangeSlider` operates on epoch-millisecond timestamps with `step` = one day, formats handle labels back to ISO dates, and stores `{min, max}` as ISO strings in the filter — which `applyFilters`'s date branch compares lexicographically (valid for `YYYY-MM-DD`).

- [ ] **Step 6: Rewrite `viewer/src/ui/App.tsx`** to compose the chrome and drive the scene via an effect:

```tsx
import { useEffect, useRef } from 'preact/hooks'
import { effect } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { gridLayout } from '../core/layout/grid'
import { Scene } from '../scene/Scene'
import { createViewerState } from './state'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { EmptyState } from './EmptyState'

export function App({ bundle, baseUrl }: { bundle: Bundle; baseUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(createViewerState(bundle))
  const state = stateRef.current

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new Scene()
    let disposed = false
    let destroyed = false
    let disposeEffect: (() => void) | undefined
    const teardown = () => {
      if (destroyed) return
      destroyed = true
      disposeEffect?.()
      scene.destroy()
    }
    const columns = Math.max(1, Math.ceil(Math.sqrt(bundle.items.length)))
    const gap = Math.round(bundle.tileSize * 0.08)

    void (async () => {
      try {
        await scene.mount(host)
        if (disposed) return teardown()
        await scene.setSprites(bundle, baseUrl)
        // initial instant layout + frame
        const all = new Set(bundle.items.map((it) => it.id))
        const first = gridLayout(
          state.sortedVisible.value,
          { columns, tileSize: bundle.tileSize, gap },
        )
        scene.setLayout(first.targets, new Set(state.visibleIds.value), false)
        scene.frame(first.bounds)
        // reactive re-layout on filter/sort/search changes
        disposeEffect = effect(() => {
          const { targets } = gridLayout(state.sortedVisible.value, {
            columns,
            tileSize: bundle.tileSize,
            gap,
          })
          scene.setLayout(targets, new Set(state.visibleIds.value))
        })
        void all
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

  return (
    <div class="pview-root">
      <Topbar bundle={bundle} state={state} />
      <div class="pview-body">
        <Sidebar bundle={bundle} state={state} />
        <div class="pview-canvas" ref={hostRef} />
      </div>
      {state.visibleIds.value.size === 0 && <EmptyState onClear={() => state.reset()} />}
    </div>
  )
}
```

- [ ] **Step 7: Update `viewer/src/styles.css`** — replace its contents with:

```css
html, body, #app { margin: 0; height: 100%; }
.pview-root { display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden; background: #111; color: #eee; font-family: sans-serif; }
.pview-topbar { display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: #1b1b1b; border-bottom: 1px solid #333; }
.pview-topbar-title { font-weight: 600; }
.pview-search { padding: 4px 8px; background: #222; border: 1px solid #444; color: #eee; border-radius: 4px; }
.pview-count { margin-left: auto; color: #aaa; font-variant-numeric: tabular-nums; }
.pview-body { flex: 1; display: flex; min-height: 0; }
.pview-sidebar { width: 240px; overflow-y: auto; padding: 10px 12px; background: #181818; border-right: 1px solid #333; }
.pview-facet h3 { margin: 14px 0 6px; font-size: 13px; text-transform: uppercase; color: #9ad; }
.pview-checkboxes { list-style: none; margin: 0; padding: 0; }
.pview-checkboxes label { display: flex; gap: 6px; align-items: center; padding: 2px 0; font-size: 14px; }
.pview-clear { margin-bottom: 8px; }
.pview-canvas { position: relative; flex: 1; min-width: 0; }
.pview-range { padding: 6px 4px; }
.pview-range-track { position: relative; height: 6px; background: #333; border-radius: 3px; margin: 14px 6px; }
.pview-range-fill { position: absolute; height: 100%; background: #4a90d9; border-radius: 3px; }
.pview-range-handle { position: absolute; top: 50%; width: 14px; height: 14px; margin-left: -7px; transform: translateY(-50%); background: #cde; border-radius: 50%; cursor: pointer; }
.pview-range-handle:focus { outline: 2px solid #9ad; }
.pview-range-labels { display: flex; justify-content: space-between; font-size: 12px; color: #aaa; }
.pview-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: rgba(17,17,17,0.7); pointer-events: auto; }
.pview-error { color: #eee; font: 16px sans-serif; padding: 1rem; }
```

- [ ] **Step 8: Run component tests + typecheck**

Run (from `viewer/`): `npm test` → PASS (all unit + component tests). `npm run typecheck` → exit 0.

- [ ] **Step 9: Regenerate the fixture and verify the build end-to-end (then restore the placeholder)**

Run (from `viewer/`): `npm run fixtures` → writes `viewer/fixtures/`.
Run: `npm run build` → emits `app.js`/`app.css`/`index.html` to `../src/pview/viewer_assets/`. Then verify and **restore** (from the repo root `/home/lab/tmp/pview`):
```bash
test -s src/pview/viewer_assets/app.js && echo APP_JS_OK
python3 - <<'PY'
import tempfile, os, pandas as pd
from PIL import Image
import sys; sys.path.insert(0, "src")
from pview import build
d = tempfile.mkdtemp()
p = os.path.join(d, "a.png"); Image.new("RGB", (64, 64), (200, 60, 60)).save(p)
df = pd.DataFrame({"name": ["A", "B", "C"], "g": ["x", "y", "x"], "photo": [p, "", ""]})
out = build(df, name_col="name", image_col="photo", out_dir=os.path.join(d, "site"))
for f in ("index.html", "app.js", "app.css", "data.json"):
    assert (out / f).exists(), f
print("FOLDER_BUNDLE_OK")
PY
git checkout -- src/pview/viewer_assets
git status --porcelain src/pview/viewer_assets && echo "(viewer_assets clean)"
```
Expected: `APP_JS_OK`, `FOLDER_BUNDLE_OK`, `(viewer_assets clean)`.

- [ ] **Step 10: Confirm the Python suite is still green**

Run (from repo root): `python -m pytest -q` → 47 passed (placeholder restored).

- [ ] **Step 11: Manual dev smoke (report observations)**

Run (from `viewer/`): `npm run dev`, open the URL, confirm: the wall renders; the sidebar shows category checkboxes (with counts) and a numeric range slider; checking a box / dragging the slider / typing in search animates the wall re-packing; clearing shows all; an over-restrictive filter shows the empty state. Stop the server. Record the result (or note if no browser is available and rely on the unit/component/build gates).

- [ ] **Step 12: Commit**

```bash
git add viewer/src/ui/Sidebar.tsx viewer/src/ui/Topbar.tsx viewer/src/ui/EmptyState.tsx viewer/src/ui/App.tsx viewer/src/styles.css viewer/test/Sidebar.test.tsx viewer/test/Topbar.test.tsx viewer/test/EmptyState.test.tsx
git commit -m "feat(viewer): Sidebar/Topbar/EmptyState chrome + reactive re-layout"
```

---

## Self-Review

**Spec coverage (M2 design → tasks):**
- Faceted filtering (category checkboxes, numeric + date range sliders) → Tasks 5, 10, 11. ✓
- Faceted counts (exclude own facet) → Task 6 + Sidebar (Task 11). ✓
- Sort (type-aware, asc/desc) → Task 6 + Topbar. ✓
- Search (token substring, AND with filters) → Task 5 + state + Topbar. ✓
- Animated grid re-layout (A1) → Task 8 (TransitionController + Scene.setLayout) + Task 11 (effect). ✓
- Constant-width grid, no auto-reframe → Task 11 (columns from total; frame once). ✓
- Empty state → Task 11. ✓
- Carry-ins: JSX transform (1), atlas resilience (3), parse guards (2), contract test (4). ✓
- Testing: unit (5–9), component (10–11), contract (4), Scene typecheck+smoke (8, 11). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `FilterState`/`applyFilters` (5) consumed by `counts` (6) and `state` (9); `SortDir`/`sortIds` (6) by `state` (9); `TransitionController`/`SpriteState` (8) by `Scene` (8); `ViewerState`/`createViewerState` (9) by Topbar/Sidebar/App (11); `RangeSlider` props (10) consumed by Sidebar's `NumericFilter` (11); `TextureLoader` re-exported from `sprites.ts` so `Scene` import is unchanged (3). `Scene.setLayout(targets, visible, animate?)` defined in 8, called in 8 (temporary) and 11 (effect). Names align.

**Notes / deferrals:**
- Search debounce: M2 writes `query` directly on input (simpler, fully testable, functionally identical); the ~150 ms debounce is a perf optimization deferred to M5 polish (spec open question). All facet types (category, numeric, date) are filterable in M2.
- Task 1 (Vitest Preact-JSX transform) is the one toolchain unknown; it has an explicit BLOCKED escape hatch if `@preact/preset-vite` is incompatible with Vite 8.
- M2 does not commit built `viewer_assets/` (restored in Task 11 Step 9); committing is M5.
