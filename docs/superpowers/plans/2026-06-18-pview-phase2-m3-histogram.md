# pview Phase 2 — M3: Histogram View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the histogram view — items grouped into single-column bars by a chosen facet, with "nice" numeric/date bucketing, counter-scaled canvas axis labels, a Topbar Grid/Histogram toggle + group-by picker, and animated grid↔histogram transitions reusing the existing engine.

**Architecture:** New pure modules `buckets.ts` (nice-number bucketing) and `layout/histogram.ts` (grouping + single-column stack positions) with Vitest unit tests; the existing `Scene.setLayout` RAF-lerp engine animates the transition; the `Scene` renders per-bar `Pixi.Text` labels counter-scaled to constant on-screen size. Two `view`/`histogramFacet` signals drive a Topbar toggle/picker and the App layout effect.

**Tech Stack:** TypeScript 5, PixiJS 8, Preact 10 + @preact/signals 2, Vite 8, Vitest 4 (+ @testing-library/preact, jsdom).

## Global Constraints

- All `viewer/` commands run from `/home/lab/tmp/pview/viewer`; Python from `/home/lab/tmp/pview`.
- Gates per task: `npm test` green, `npm run typecheck` clean. Pixi/DOM code (`Scene.ts`, `App.tsx`) is typecheck-gated + dev-smoke (no WebGL unit tests).
- Bucketable facet = `category | numeric | date` (a histogram groups by one of these; never `text`).
- Histogram bars are **single-column stacks**: bar `b` center is `x = b·(tileSize+barGap) + tileSize/2`; the `k`-th item from the bottom (0-based) has center `{ x, y: -(k·(tileSize+gap)) - tileSize/2, scale: 1 }` (baseline `y=0`, stacks go upward = negative `y`).
- Numeric/date buckets are "nice"-rounded (~10 buckets) via `buckets.ts`; dates bucket on `Date.parse` timestamps.
- Axis labels are canvas `Pixi.Text`, scaled by `1/cameraZoom` so they stay constant on-screen size.
- Re-frame the camera (`Scene.frame`) only when the `(view, histogramFacet)` identity changes; filter/sort/search within a view leaves the camera put (the M2 rule).
- Carry-ins: `TransitionController.clear()`; `Scene.onTick` idles (skips the per-sprite write loop) once the transition has settled, until the next `setLayout`.
- Component tests use `// @vitest-environment jsdom` + `@testing-library/preact` with a synchronous `afterEach(() => cleanup())`.
- M3 does NOT commit built `viewer_assets/` (verify-then-restore in the final task); committing is M5.
- TDD: failing test → confirm fail → implement → confirm pass → commit.

---

## File Structure

| File | Change |
|------|--------|
| `viewer/src/scene/transitions.ts` | + `clear()` |
| `viewer/src/scene/Scene.ts` | ticker idle + `clear()` on setSprites; `setBars` + Pixi.Text label pool + counter-scale |
| `viewer/src/core/buckets.ts` | NEW `niceNum` / `computeBuckets` / `bucketIndexOf` |
| `viewer/src/core/layout/histogram.ts` | NEW `histogramLayout` |
| `viewer/src/ui/state.ts` | + `view` / `histogramFacet` signals |
| `viewer/src/ui/Topbar.tsx` | + Grid/Histogram toggle + Group-by picker |
| `viewer/src/ui/App.tsx` | effect branches grid vs histogram; re-frame on mode change |
| `viewer/src/styles.css` | + toggle/picker styling |

---

## Task 1: Carry-ins — TransitionController.clear() + Scene ticker idle

**Files:**
- Modify: `viewer/src/scene/transitions.ts`, `viewer/src/scene/Scene.ts`
- Test: `viewer/test/transitions.test.ts`

**Interfaces:**
- Produces: `TransitionController.clear()` (empties entries; `get(id)` → `undefined` after). `Scene` registers sprites after a `clear()`, and `Scene.onTick` skips the per-sprite write loop once settled (re-armed by `setLayout`).

- [ ] **Step 1: Write the failing test** — append to `viewer/test/transitions.test.ts`:

```ts
it('clear() removes all entries', () => {
  const c = new TransitionController(100)
  c.register(0, { x: 1, y: 2, scale: 1, alpha: 1 })
  c.setTargets(new Map([[0, { x: 9, y: 9, scale: 1 }]]), new Set([0]))
  c.clear()
  expect(c.get(0)).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify it fails**

Run (from `viewer/`): `npx vitest run test/transitions.test.ts`
Expected: FAIL — `clear` is not a function.

- [ ] **Step 3: Add `clear()` to `viewer/src/scene/transitions.ts`** (inside the `TransitionController` class, after `snap()`):

```ts
  clear(): void {
    this.entries.clear()
    this.elapsed = 0
  }
```

- [ ] **Step 4: Run to verify it passes**

Run (from `viewer/`): `npx vitest run test/transitions.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the carry-ins into `viewer/src/scene/Scene.ts`** (typecheck-gated):

(a) Add a `settled` field next to the others:
```ts
  private settled = false
```

(b) In `setSprites`, clear the controller first — replace the method body's first line so it reads:
```ts
  async setSprites(bundle: Bundle, baseUrl: string): Promise<void> {
    this.transitions.clear()
    this.sprites = await buildSprites(bundle, this.world, this.loadTexture, baseUrl)
    for (const [id, sp] of this.sprites) {
      this.transitions.register(id, { x: sp.position.x, y: sp.position.y, scale: sp.scale.x, alpha: 1 })
    }
  }
```

(c) In `setLayout`, re-arm the ticker by clearing `settled` — the method becomes:
```ts
  setLayout(targets: Map<number, LayoutTarget>, visible: Set<number>, animate = true): void {
    this.transitions.setTargets(targets, visible)
    if (!animate) this.transitions.snap()
    this.settled = false
  }
```

(d) Replace `onTick` with the idling version:
```ts
  private onTick = (): void => {
    const active = this.transitions.tick(this.app.ticker.deltaMS)
    if (this.settled && !active) return
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
```

- [ ] **Step 6: Typecheck + full suite**

Run (from `viewer/`): `npm run typecheck` → exit 0. `npm test` → all green (the new `clear()` test included).

- [ ] **Step 7: Commit**

```bash
git add viewer/src/scene/transitions.ts viewer/src/scene/Scene.ts viewer/test/transitions.test.ts
git commit -m "feat(viewer): TransitionController.clear() + idle Scene ticker when settled"
```

---

## Task 2: core — buckets.ts

**Files:**
- Create: `viewer/src/core/buckets.ts`
- Test: `viewer/test/buckets.test.ts`

**Interfaces:**
- Produces:
  - `niceNum(range: number, round: boolean) -> number`.
  - `computeBuckets(min: number, max: number, targetCount = 10) -> { edges: number[]; labels: string[] }` (nice edges; `labels[i]` describes `[edges[i], edges[i+1]]`; degenerate `min===max` → one bucket).
  - `bucketIndexOf(value: number, edges: number[]) -> number` (bucket index, clamped; `≥` last edge → final bucket).

- [ ] **Step 1: Write failing tests** `viewer/test/buckets.test.ts`

```ts
import { it, expect } from 'vitest'
import { computeBuckets, bucketIndexOf } from '../src/core/buckets'

it('produces nice 0..100 edges for [0,97]', () => {
  const { edges, labels } = computeBuckets(0, 97)
  expect(edges).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
  expect(labels[0]).toBe('0–10')
  expect(labels[labels.length - 1]).toBe('90–100')
})

it('produces nice 0..1 edges for [0,1]', () => {
  const { edges } = computeBuckets(0, 1)
  expect(edges[0]).toBe(0)
  expect(edges[edges.length - 1]).toBe(1)
  expect(edges.length).toBe(11)
})

it('returns a single bucket for a degenerate range', () => {
  const { edges, labels } = computeBuckets(5, 5)
  expect(edges).toEqual([5, 5])
  expect(labels).toEqual(['5'])
})

it('assigns values to buckets, clamping out-of-range', () => {
  const edges = [0, 10, 20, 30]
  expect(bucketIndexOf(0, edges)).toBe(0)
  expect(bucketIndexOf(5, edges)).toBe(0)
  expect(bucketIndexOf(10, edges)).toBe(1)
  expect(bucketIndexOf(29, edges)).toBe(2)
  expect(bucketIndexOf(30, edges)).toBe(2) // at/above last edge -> final bucket
  expect(bucketIndexOf(-5, edges)).toBe(0) // below min -> first bucket
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/buckets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `viewer/src/core/buckets.ts`**

```ts
export function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range))
  const frac = range / Math.pow(10, exp)
  let nice: number
  if (round) {
    if (frac < 1.5) nice = 1
    else if (frac < 3) nice = 2
    else if (frac < 7) nice = 5
    else nice = 10
  } else {
    if (frac <= 1) nice = 1
    else if (frac <= 2) nice = 2
    else if (frac <= 5) nice = 5
    else nice = 10
  }
  return nice * Math.pow(10, exp)
}

function clean(v: number): number {
  return Math.round(v * 1e6) / 1e6
}

export function computeBuckets(
  min: number,
  max: number,
  targetCount = 10,
): { edges: number[]; labels: string[] } {
  if (!(max > min)) {
    return { edges: [min, min], labels: [String(clean(min))] }
  }
  const range = niceNum(max - min, false)
  const step = niceNum(range / (targetCount - 1), true)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const count = Math.round((niceMax - niceMin) / step)
  const edges = Array.from({ length: count + 1 }, (_, i) => clean(niceMin + i * step))
  const labels = edges.slice(0, -1).map((_, i) => `${edges[i]}–${edges[i + 1]}`)
  return { edges, labels }
}

export function bucketIndexOf(value: number, edges: number[]): number {
  const n = edges.length - 1
  if (n <= 0) return 0
  if (value <= edges[0]) return 0
  if (value >= edges[n]) return n - 1
  for (let i = 0; i < n; i++) {
    if (value >= edges[i] && value < edges[i + 1]) return i
  }
  return n - 1
}
```

- [ ] **Step 4: Run to verify they pass**

Run (from `viewer/`): `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/core/buckets.ts viewer/test/buckets.test.ts
git commit -m "feat(viewer): nice-number bucketing (computeBuckets + bucketIndexOf)"
```

---

## Task 3: core — layout/histogram.ts

**Files:**
- Create: `viewer/src/core/layout/histogram.ts`
- Test: `viewer/test/histogram.test.ts`

**Interfaces:**
- Consumes: `Facet`/`Item` (bundle), `computeBuckets`/`bucketIndexOf` (buckets), `LayoutTarget` (grid).
- Produces:
  - `HistogramResult = { targets: Map<number, LayoutTarget>; bars: { label: string; x: number; count: number }[]; bounds: { w: number; h: number } }`.
  - `histogramLayout(orderedIds, items, facet, opts: { tileSize, gap, barGap, dateFormat? }) -> HistogramResult`. Category → one bar per `facet.values`; numeric/date → one bar per nice bucket. Items not in `orderedIds`, or whose value falls in no bar, are omitted. Empty bars still appear (count 0). `bars[i].x` is the bar center; within a bar items stack bottom-up.

- [ ] **Step 1: Write failing tests** `viewer/test/histogram.test.ts`

```ts
import { it, expect } from 'vitest'
import { histogramLayout } from '../src/core/layout/histogram'
import type { Facet, Item } from '../src/core/bundle'

function item(id: number, values: Record<string, unknown>): Item {
  return { id, values, atlas: 0, rect: [0, 0, 1, 1], detail: null }
}

const catFacet: Facet = { name: 'g', type: 'category', values: ['a', 'b', 'c'] }
const items: Item[] = [
  item(0, { g: 'a', n: 5 }),
  item(1, { g: 'a', n: 15 }),
  item(2, { g: 'b', n: 25 }),
]
const opts = { tileSize: 100, gap: 10, barGap: 50 }

it('groups category items into one bar per value with counts', () => {
  const r = histogramLayout([0, 1, 2], items, catFacet, opts)
  expect(r.bars.map((b) => b.label)).toEqual(['a', 'b', 'c'])
  expect(r.bars.map((b) => b.count)).toEqual([2, 1, 0]) // empty bar 'c' still present
})

it('stacks items bottom-up within a bar', () => {
  const r = histogramLayout([0, 1, 2], items, catFacet, opts)
  const barStep = 150 // tileSize + barGap
  const step = 110 // tileSize + gap
  // bar 'a' center x = 0*150 + 50 = 50; first item (k=0) y = -0 - 50 = -50
  expect(r.targets.get(0)).toEqual({ x: 50, y: -50, scale: 1 })
  // second 'a' item (k=1) y = -(1*110) - 50 = -160
  expect(r.targets.get(1)).toEqual({ x: 50, y: -160, scale: 1 })
  // 'b' item bar index 1: x = 150 + 50 = 200, k=0
  expect(r.targets.get(2)).toEqual({ x: 200, y: -50, scale: 1 })
  void barStep
  void step
})

it('reports bar centers and bounds', () => {
  const r = histogramLayout([0, 1, 2], items, catFacet, opts)
  expect(r.bars.map((b) => b.x)).toEqual([50, 200, 350])
  // 3 bars: w = 3*150 - 50 = 400 ; tallest bar 2 high: h = 2*110 - 10 = 210
  expect(r.bounds).toEqual({ w: 400, h: 210 })
})

it('buckets a numeric facet and omits ids not in orderedIds', () => {
  const numFacet: Facet = { name: 'n', type: 'numeric', min: 0, max: 30 }
  const r = histogramLayout([0, 2], items, numFacet, opts) // id 1 omitted
  // n=5 -> bucket 0..? ; n=25 -> a later bucket. Just assert placement + omission.
  expect(r.targets.has(1)).toBe(false)
  expect(r.targets.has(0)).toBe(true)
  expect(r.targets.has(2)).toBe(true)
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/histogram.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `viewer/src/core/layout/histogram.ts`**

```ts
import type { Facet, Item } from '../bundle'
import { computeBuckets, bucketIndexOf } from '../buckets'
import type { LayoutTarget } from './grid'

export interface HistogramResult {
  targets: Map<number, LayoutTarget>
  bars: { label: string; x: number; count: number }[]
  bounds: { w: number; h: number }
}

export function histogramLayout(
  orderedIds: number[],
  items: Item[],
  facet: Facet,
  opts: { tileSize: number; gap: number; barGap: number; dateFormat?: (ms: number) => string },
): HistogramResult {
  const byId = new Map(items.map((it) => [it.id, it]))
  const { tileSize, gap, barGap } = opts

  let barLabels: string[]
  let indexOf: (value: unknown) => number

  if (facet.type === 'category') {
    barLabels = [...facet.values]
    const lut = new Map(facet.values.map((v, i) => [v, i]))
    indexOf = (value) => lut.get(String(value)) ?? -1
  } else if (facet.type === 'numeric') {
    const { edges, labels } = computeBuckets(facet.min, facet.max)
    barLabels = labels
    indexOf = (value) => {
      const v = Number(value)
      return Number.isNaN(v) ? -1 : bucketIndexOf(v, edges)
    }
  } else if (facet.type === 'date') {
    const fmt = opts.dateFormat ?? ((ms: number) => new Date(ms).toISOString().slice(0, 10))
    const { edges } = computeBuckets(Date.parse(facet.min), Date.parse(facet.max))
    barLabels = edges.slice(0, -1).map((e) => fmt(e))
    indexOf = (value) => {
      const v = Date.parse(String(value))
      return Number.isNaN(v) ? -1 : bucketIndexOf(v, edges)
    }
  } else {
    barLabels = []
    indexOf = () => -1
  }

  const nBars = barLabels.length
  const heights = new Array<number>(nBars).fill(0)
  const targets = new Map<number, LayoutTarget>()
  const step = tileSize + gap
  const barStep = tileSize + barGap

  for (const id of orderedIds) {
    const item = byId.get(id)
    if (!item) continue
    const bi = indexOf(item.values[facet.name])
    if (bi < 0 || bi >= nBars) continue
    const k = heights[bi]++
    targets.set(id, { x: bi * barStep + tileSize / 2, y: -(k * step) - tileSize / 2, scale: 1 })
  }

  const bars = barLabels.map((label, i) => ({
    label,
    x: i * barStep + tileSize / 2,
    count: heights[i],
  }))
  const maxCount = heights.reduce((m, h) => Math.max(m, h), 0)
  const bounds = {
    w: nBars > 0 ? nBars * barStep - barGap : 0,
    h: maxCount > 0 ? maxCount * step - gap : 0,
  }
  return { targets, bars, bounds }
}
```

- [ ] **Step 4: Run to verify they pass**

Run (from `viewer/`): `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/core/layout/histogram.ts viewer/test/histogram.test.ts
git commit -m "feat(viewer): histogramLayout (category + bucketed bars, bottom-up stacks)"
```

---

## Task 4: Scene — bar labels (counter-scaled Pixi.Text)

**Files:**
- Modify: `viewer/src/scene/Scene.ts`

**Interfaces:**
- Consumes: the `bars` from `histogramLayout` (`{label, x, count}[]`).
- Produces: `Scene.setBars(bars)` — renders one `Pixi.Text` per bar (value + count) under the baseline at the bar's `x`, counter-scaled to constant on-screen size; `setBars([])` hides all labels. (Pixi code — typecheck-gated + dev smoke.)

- [ ] **Step 1: Add the `Text` import** — change the top import of `viewer/src/scene/Scene.ts` to include `Text`:

```ts
import { Application, Assets, Container, Sprite, Text } from 'pixi.js'
```

- [ ] **Step 2: Add label-layer fields** next to the others:

```ts
  private labelLayer = new Container()
  private labels: Text[] = []
```

- [ ] **Step 3: Mount the label layer on top of sprites** — in `mount`, right after `this.app.stage.addChild(this.world)`, add:

```ts
    this.world.sortableChildren = true
    this.labelLayer.zIndex = 1000
    this.world.addChild(this.labelLayer)
```

- [ ] **Step 4: Add `setBars` and `applyLabelScale`** (place `setBars` after `setLayout`, and `applyLabelScale` after `applyCamera`):

```ts
  setBars(bars: { label: string; x: number; count: number }[]): void {
    while (this.labels.length < bars.length) {
      const t = new Text({
        text: '',
        style: { fill: 0xdddddd, fontFamily: 'sans-serif', fontSize: 14, align: 'center' },
      })
      t.anchor.set(0.5, 0)
      this.labelLayer.addChild(t)
      this.labels.push(t)
    }
    for (const t of this.labels) t.visible = false
    bars.forEach((bar, i) => {
      const t = this.labels[i]
      t.text = `${bar.label}\n${bar.count}`
      t.position.set(bar.x, 8)
      t.visible = true
    })
    this.applyLabelScale()
  }

  private applyLabelScale(): void {
    const inv = 1 / this.cam.zoom
    for (const t of this.labels) {
      if (t.visible) t.scale.set(inv)
    }
  }
```

- [ ] **Step 5: Counter-scale labels on every camera change** — in `applyCamera`, add `this.applyLabelScale()` as the last line so it becomes:

```ts
  private applyCamera = (): void => {
    const vp = this.viewport()
    this.world.scale.set(this.cam.zoom)
    this.world.position.set(
      vp.width / 2 - this.cam.x * this.cam.zoom,
      vp.height / 2 - this.cam.y * this.cam.zoom,
    )
    this.applyLabelScale()
  }
```

- [ ] **Step 6: Typecheck + full suite**

Run (from `viewer/`): `npm run typecheck` → exit 0. `npm test` → all green (no behavior change to existing tests). If a Pixi-v8 `Text` constructor option differs in the installed version, adjust to the installed API and note it in your report — do not weaken `strict` or add `any`.

- [ ] **Step 7: Commit**

```bash
git add viewer/src/scene/Scene.ts
git commit -m "feat(viewer): Scene.setBars renders counter-scaled axis labels"
```

---

## Task 5: state + Topbar — view toggle & group-by picker

**Files:**
- Modify: `viewer/src/ui/state.ts`, `viewer/src/ui/Topbar.tsx`, `viewer/src/styles.css`
- Test: `viewer/test/Topbar.test.tsx`

**Interfaces:**
- Consumes: `Bundle`/`Facet`, `ViewerState`.
- Produces: `state.view: Signal<'grid'|'histogram'>` (default `'grid'`) and `state.histogramFacet: Signal<string|null>` (default the first bucketable facet name, or `null`). Topbar renders a Grid/Histogram toggle (Histogram disabled when no bucketable facet) and a Group-by `<select>` when in histogram view.

- [ ] **Step 1: Write failing component tests** — append to `viewer/test/Topbar.test.tsx`:

```ts
it('toggles to histogram view and shows the group-by picker', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Topbar bundle={b} state={state} />)
  fireEvent.click(screen.getByRole('button', { name: /histogram/i }))
  expect(state.view.value).toBe('histogram')
  // the group-by select appears in histogram view
  const groupBy = screen.getByLabelText(/group by/i)
  fireEvent.change(groupBy, { target: { value: 'age' } })
  expect(state.histogramFacet.value).toBe('age')
})

it('disables the histogram toggle when there is no bucketable facet', () => {
  const b: Bundle = {
    version: 2, title: 'T', tileSize: 64,
    facets: [{ name: 'name', type: 'text' }],
    cardFields: ['name'],
    atlases: [{ file: 'a', width: 1, height: 1 }],
    items: [{ id: 0, values: { name: 'A' }, atlas: 0, rect: [0, 0, 1, 1], detail: null }],
  }
  const state = createViewerState(b)
  render(<Topbar bundle={b} state={state} />)
  const btn = screen.getByRole('button', { name: /histogram/i }) as HTMLButtonElement
  expect(btn.disabled).toBe(true)
})
```

(The existing `bundle()` helper in this file has a `name` text facet and an `age` numeric facet — `age` is bucketable, so the group-by `<select>` will offer it.)

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/Topbar.test.tsx`
Expected: FAIL — no Histogram button / `view` not on state.

- [ ] **Step 3: Add the signals to `viewer/src/ui/state.ts`.** Add to the `ViewerState` interface (after `query`):

```ts
  view: Signal<'grid' | 'histogram'>
  histogramFacet: Signal<string | null>
```

In `createViewerState`, after the `query` signal, add:

```ts
  const bucketable = bundle.facets.filter(
    (f) => f.type === 'category' || f.type === 'numeric' || f.type === 'date',
  )
  const view = signal<'grid' | 'histogram'>('grid')
  const histogramFacet = signal<string | null>(bucketable[0]?.name ?? null)
```

And add `view` and `histogramFacet` to the returned object:

```ts
  return { filter, sort, query, view, histogramFacet, visibleIds, sortedVisible, counts, reset }
```

- [ ] **Step 4: Add the toggle + picker to `viewer/src/ui/Topbar.tsx`.** Replace the whole file with:

```tsx
import type { Bundle } from '../core/bundle'
import type { ViewerState } from './state'

export function Topbar({ bundle, state }: { bundle: Bundle; state: ViewerState }) {
  const sortable = bundle.facets.filter((f) => f.type !== 'text' || f.name === bundle.cardFields[0])
  const bucketable = bundle.facets.filter(
    (f) => f.type === 'category' || f.type === 'numeric' || f.type === 'date',
  )
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
      <div class="pview-view-toggle" role="group" aria-label="View">
        <button
          type="button"
          aria-pressed={state.view.value === 'grid'}
          onClick={() => (state.view.value = 'grid')}
        >
          Grid
        </button>
        <button
          type="button"
          aria-pressed={state.view.value === 'histogram'}
          disabled={bucketable.length === 0}
          onClick={() => (state.view.value = 'histogram')}
        >
          Histogram
        </button>
      </div>
      {state.view.value === 'histogram' && (
        <label class="pview-groupby">
          Group by:
          <select
            value={state.histogramFacet.value ?? ''}
            onChange={(e) => {
              state.histogramFacet.value = (e.target as HTMLSelectElement).value || null
            }}
          >
            {bucketable.map((f) => (
              <option value={f.name}>{f.name}</option>
            ))}
          </select>
        </label>
      )}
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
          aria-label={`Sort direction: ${state.sort.value.dir === 'asc' ? 'ascending' : 'descending'}`}
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

- [ ] **Step 5: Style the new controls** — append to `viewer/src/styles.css`:

```css
.pview-view-toggle { display: inline-flex; }
.pview-view-toggle button { background: #222; border: 1px solid #444; color: #ccc; padding: 4px 10px; cursor: pointer; }
.pview-view-toggle button[aria-pressed='true'] { background: #4a90d9; color: #fff; border-color: #4a90d9; }
.pview-view-toggle button:disabled { opacity: 0.4; cursor: default; }
.pview-groupby { display: inline-flex; align-items: center; gap: 4px; }
```

- [ ] **Step 6: Run to verify pass + typecheck**

Run (from `viewer/`): `npm test` → PASS (Topbar tests included). `npm run typecheck` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add viewer/src/ui/state.ts viewer/src/ui/Topbar.tsx viewer/src/styles.css viewer/test/Topbar.test.tsx
git commit -m "feat(viewer): view toggle + group-by picker (view/histogramFacet signals)"
```

---

## Task 6: App — grid/histogram branch + re-frame + build verify

**Files:**
- Modify: `viewer/src/ui/App.tsx`
- Test: end-to-end build verification (no new unit test)

**Interfaces:**
- Consumes: `gridLayout`, `histogramLayout`, `Scene` (`setLayout`/`setBars`/`frame`), `createViewerState`.
- Produces: the layout effect branches on `view`; histogram view feeds `histogramLayout` targets + `setBars(bars)`; the camera re-frames only when `(view, histogramFacet)` changes.

- [ ] **Step 1: Rewrite `viewer/src/ui/App.tsx`** to branch the layout:

```tsx
import { useEffect, useRef } from 'preact/hooks'
import { effect } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { gridLayout } from '../core/layout/grid'
import { histogramLayout } from '../core/layout/histogram'
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
    const barGap = Math.round(bundle.tileSize * 0.5)

    // Compute the active layout, push bars to the scene, return targets + bounds.
    const computeLayout = (): { targets: Map<number, { x: number; y: number; scale: number }>; bounds: { w: number; h: number } } => {
      if (state.view.value === 'histogram' && state.histogramFacet.value) {
        const facet = bundle.facets.find((f) => f.name === state.histogramFacet.value)
        if (facet) {
          const r = histogramLayout(state.sortedVisible.value, bundle.items, facet, {
            tileSize: bundle.tileSize,
            gap,
            barGap,
          })
          scene.setBars(r.bars)
          return { targets: r.targets, bounds: r.bounds }
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
        const first = computeLayout()
        scene.setLayout(first.targets, new Set(state.visibleIds.value), false)
        scene.frame(first.bounds)
        lastMode = `${state.view.value}:${state.histogramFacet.value}`
        disposeEffect = effect(() => {
          const r = computeLayout()
          scene.setLayout(r.targets, new Set(state.visibleIds.value))
          const mode = `${state.view.value}:${state.histogramFacet.value}`
          if (mode !== lastMode) {
            scene.frame(r.bounds)
            lastMode = mode
          }
        })
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

- [ ] **Step 2: Typecheck + full suite**

Run (from `viewer/`): `npm run typecheck` → exit 0. `npm test` → all green.

- [ ] **Step 3: Verify the production build, then RESTORE the placeholder**

Run (from `viewer/`): `npm run build` (writes to `../src/pview/viewer_assets/`). Then verify and restore (from the repo root `/home/lab/tmp/pview`):

```bash
test -s src/pview/viewer_assets/app.js && echo APP_JS_OK
python3 - <<'PY'
import tempfile, os, pandas as pd
from PIL import Image
import sys; sys.path.insert(0, "src")
from pview import build
d = tempfile.mkdtemp()
p = os.path.join(d, "a.png"); Image.new("RGB", (64, 64), (200, 60, 60)).save(p)
df = pd.DataFrame({"name": ["A", "B", "C", "D"], "grp": ["x", "y", "x", "y"], "age": [10, 20, 30, 40], "photo": [p, "", "", ""]})
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

Run (from `viewer/`): `npm run dev`; open the URL; confirm: switching to **Histogram** flies the tiles into bars grouped by the picked facet with axis labels under each bar; changing **Group by** re-bars and re-frames; switching back to **Grid** animates back; the axis labels stay constant-size while zooming; a filter while in histogram re-stacks the bars without re-framing. Stop the server. Record the result (or note no browser available and rely on the unit/typecheck/build/python gates).

- [ ] **Step 6: Commit**

```bash
git add viewer/src/ui/App.tsx
git commit -m "feat(viewer): grid/histogram view switch with animated re-layout"
```

---

## Self-Review

**Spec coverage (M3 design → tasks):**
- Histogram single-column stacks → Task 3 (`histogramLayout`) + Task 6 (wiring). ✓
- Category bars + nice numeric/date buckets → Task 2 (`buckets.ts`) + Task 3. ✓
- Counter-scaled canvas axis labels → Task 4 (`Scene.setBars`). ✓
- Animated grid↔histogram via existing engine → Task 6 (`setLayout`) — no new animation code. ✓
- Topbar toggle + group-by picker; `view`/`histogramFacet` signals → Task 5. ✓
- Re-frame on mode change only → Task 6 (`lastMode` guard). ✓
- Carry-ins: `TransitionController.clear()` + ticker idle → Task 1. ✓
- Edge cases (no bucketable facet disables toggle; empty bars present; degenerate range) → Tasks 2/3/5. ✓
- Testing: buckets/histogram unit; Topbar component; Scene typecheck+smoke; App build+smoke. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `computeBuckets`/`bucketIndexOf` (2) consumed by `histogramLayout` (3); `HistogramResult.bars` (`{label,x,count}`) consumed by `Scene.setBars` (4) and `App` (6); `view`/`histogramFacet` signals (5) consumed by `Topbar` (5) and `App` (6); `LayoutTarget` shared by grid/histogram so `computeLayout`'s union type is consistent. `Scene.setLayout` re-arms `settled` (1) and `setBars` (4) are both called from App's effect (6).

**Notes:**
- The spec described an optional separate "count label at the bar's top"; M3 renders the count on a second line of the single per-bar label (`${label}\n${count}`) — simpler, fewer Text objects, same information; a top-aligned count is an M5-polish option.
- M3 does not commit built `viewer_assets/` (restored in Task 6 Step 3); committing is M5.
- `histogramLayout`'s `dateFormat` defaults to ISO date; a friendlier date label is an M5 refinement.
