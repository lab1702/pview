# pview Phase 2 — M3: Histogram View Design

**Status:** Design approved (2026-06-18)
**Depends on:** Phase 1, Phase 2 M0/M1/M2, all merged.
**Parent spec:** `docs/superpowers/specs/2026-06-17-pview-phase2-viewer-design.md` (M3 milestone).
**Scope:** Add the histogram view — items grouped into bars by a chosen facet, with single-column stacks, "nice" numeric/date bucketing, counter-scaled canvas axis labels, a Topbar view toggle + group-by picker, and animated grid↔histogram transitions (reusing the existing transition engine). Plus the two M2-review carry-ins. Semantic zoom (M4) and polish (M5) are out of scope.

## Summary

M3 adds the iconic PivotViewer histogram: each item sprite flies from the sorted grid into a vertical stack above its bar, where bars are grouped by a chosen facet (one bar per category value, or per "nice"-rounded numeric/date bucket). The grouping and layout math live in pure, unit-tested modules (`buckets.ts`, `histogram.ts`); the existing `Scene.setLayout` RAF-lerp engine animates the transition; the `Scene` renders constant-on-screen-size axis labels as counter-scaled `Pixi.Text`. A Topbar Grid/Histogram toggle and a "Group by" picker drive new `view`/`histogramFacet` signals.

M3 also folds in the two carry-ins the M2 final review flagged: a `TransitionController.clear()` and an idle-when-settled optimization in the Scene ticker (so a static wall/chart no longer rewrites every sprite each frame).

## Goals

- **Histogram view**: visible item sprites stack bottom-up in single-column bars; bar height ∝ count.
- **Grouping**: category facet → one bar per value; numeric/date facet → one bar per bucket.
- **"Nice" bucketing**: numeric/date buckets snap boundaries to friendly 1/2/5×10ⁿ steps, ~10 buckets, readable labels.
- **Axis labels**: per-bar value/range label (and a count above) as `Pixi.Text`, counter-scaled to stay constant on-screen size at any zoom.
- **Animated grid↔histogram**: reuse the existing `Scene.setLayout` transition engine.
- **Topbar**: Grid/Histogram toggle + a "Group by" facet picker (histogram view only).
- **Re-frame on mode change**: camera fits the new layout when `view`/`histogramFacet` changes; filter/sort within a view leaves the camera put.
- **Carry-ins**: `TransitionController.clear()`; Scene ticker idles when the animation has settled.

## Non-goals (M3)

- Semantic zoom / detail card / lazy detail (M4).
- Multi-column bar packing (single-column stacks only).
- DOM-overlay axis labels (canvas `Pixi.Text` only; a DOM upgrade is possible M5 polish).
- Committing built `viewer_assets/` + staleness automation; visual polish; search debounce (M5).
- Selecting/sorting items *within* a bar by a per-bar criterion (within-bar order is the global sorted order).

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Within-bar arrangement | Single-column stacks (bar height ∝ count) |
| Numeric/date bucketing | "Nice" rounded buckets (~10), readable labels |
| Axis-label rendering | Canvas `Pixi.Text`, counter-scaled to constant on-screen size |
| Camera on mode change | Re-frame to fit on `view`/`histogramFacet` change; stay put on filter/sort |
| Carry-ins | `TransitionController.clear()` + Scene ticker idle-when-settled |

## Architecture & module map

```
viewer/src/
├── core/
│   ├── buckets.ts          # NEW  computeBuckets + bucketIndexOf ("nice" numbers)
│   └── layout/
│       └── histogram.ts    # NEW  histogramLayout(orderedIds, items, facet, opts)
├── scene/
│   ├── transitions.ts      # + clear()
│   └── Scene.ts            # + setBars(bars); Pixi.Text labels counter-scaled; ticker idle; clear() on setSprites
├── ui/
│   ├── state.ts            # + view + histogramFacet signals
│   ├── Topbar.tsx          # + Grid/Histogram toggle + Group-by picker
│   └── App.tsx             # effect branches grid vs histogram; re-frame on mode change
```

**Data flow (extends M2):**
```
signals: filter, sort, query, view, histogramFacet
  -> visibleIds / sortedVisible / counts (unchanged from M2)
  -> effect:
       view==='grid'      -> gridLayout(sortedVisible) ; scene.setLayout(targets, visible) ; scene.setBars([])
       view==='histogram' -> histogramLayout(sortedVisible, items, facetFor(histogramFacet))
                             ; scene.setLayout(targets, visible) ; scene.setBars(bars)
  -> when (view, histogramFacet) identity changes: scene.frame(bounds)   // re-frame on mode change only
```

## Core modules (pure, unit-tested)

### `buckets.ts`

- `niceNum(range, round) -> number` — the standard "nice number" helper (snaps to 1/2/5×10ⁿ).
- `computeBuckets(min: number, max: number, targetCount = 10) -> { edges: number[]; labels: string[] }` — produces nice, evenly-stepped edges spanning `[min, max]` (e.g. `[0,97]` → edges `0,10,…,100`, labels `"0–10", …, "90–100"`). For a degenerate `min === max`, returns a single bucket `[min, min]` with one label. `labels[i]` describes the bucket between `edges[i]` and `edges[i+1]`.
- `bucketIndexOf(value: number, edges: number[]) -> number` — the index of the bucket containing `value` (clamped into `[0, edges.length-2]`; values `≥` the last edge go in the final bucket).

### `layout/histogram.ts`

- `histogramLayout(orderedIds: number[], items: Item[], facet: Facet, opts: { tileSize: number; gap: number; barGap: number; dateFormat?: (ms: number) => string }) -> { targets: Map<number,{x,y,scale}>, bars: { label: string; x: number; count: number }[], bounds: { w: number; h: number } }`:
  - **Bars / grouping:**
    - `category` → one bar per `facet.values` (in declared order); an item joins the bar matching `String(item.values[facet.name])`.
    - `numeric` → `computeBuckets(facet.min, facet.max)` → one bar per bucket; item joins `bucketIndexOf(Number(value), edges)`.
    - `date` → bucket on timestamps (`Date.parse(ISO)`); bar labels via `opts.dateFormat` (caller supplies; default ISO date).
    - Items whose id is not in `orderedIds` are omitted (they fade out via the existing alpha path). An item whose value falls in no bar (e.g. unparseable) is skipped.
  - **Layout:** bar `b` center is `x_b = b·(tileSize + barGap) + tileSize/2`. Within a bar, items are placed bottom-up in `orderedIds` order: the `k`-th item (0-based from the bottom) has center `{ x: x_b, y: -(k·(tileSize+gap)) - tileSize/2, scale: 1 }` (negative `y` = upward from the baseline `y=0`).
  - **Returns:** `bars` (each with its `label`, center `x`, and `count`) for the Scene to render labels, and `bounds` (`w = nBars·(tileSize+barGap) - barGap`, `h = maxCount·(tileSize+gap)`) for the camera fit. Empty category/numeric bars still appear (count 0, label present) so the axis is stable.

## Scene changes

- **`setBars(bars: { label: string; x: number; count: number }[])`** — maintains a pool of `Pixi.Text` objects: one value/range label per bar positioned at `(bar.x, labelY)` just below the baseline, and one count label at the bar's top. The pool is reused across calls (grow/shrink as needed); `setBars([])` (grid view) hides them all.
- **Counter-scaling** — labels are children of the world container (so they pan with bars). In the camera-apply path, after `world.scale = zoom`, each visible label's `scale` is set to `1/zoom`, keeping it a constant on-screen size at any zoom level. This rides the existing camera-change path; no per-frame DOM work.
- **`transitions.ts` `clear()`** — empties the controller's entries; `Scene.setSprites` calls it before registering, so re-running `setSprites` (M4) starts from a clean controller.
- **Ticker idle** — `Scene.onTick` calls `transitions.tick(dt)`; when it reports settled (returns `false`), the Scene applies one final settle frame, then skips the per-sprite write loop on subsequent frames until the next `setLayout` marks it active again. (Pixi still renders each frame; only the 20k-sprite transform write is skipped while idle.)
- The camera continues to be applied independently (pan/zoom remain responsive while idle, and re-apply the label counter-scale).

## State & chrome

### `state.ts`
Adds two signals to `createViewerState`:
- `view = signal<'grid' | 'histogram'>('grid')`.
- `histogramFacet = signal<string | null>(firstBucketableFacetName(bundle) ?? null)` where bucketable = `category | numeric | date`.

### `Topbar.tsx`
- A **Grid / Histogram** segmented toggle bound to `view`. The Histogram button is `disabled` when there is no bucketable facet.
- When `view === 'histogram'`, a **"Group by"** `<select>` of bucketable facets, bound to `histogramFacet`.

### `App.tsx`
The layout effect branches on `view.value`:
- `grid` → `gridLayout(sortedVisible, {columns})`; `scene.setLayout(targets, visible)`; `scene.setBars([])`.
- `histogram` → look up the `Facet` for `histogramFacet.value`; `histogramLayout(sortedVisible.value, items, facet, {tileSize, gap, barGap})`; `scene.setLayout(targets, visible)`; `scene.setBars(bars)`.

A ref holds the last `(view, histogramFacet)` identity; when it changes, the effect calls `scene.frame(bounds)` (grid bounds or histogram bounds) to fit the new layout. Filter/sort/search changes within a view do not re-frame (the M2 rule). The M2 `EmptyState` still shows when `visibleIds.size === 0`.

## Error handling / edge cases

- **No bucketable facet** → Histogram toggle disabled; viewer stays grid-only. (`histogramFacet` is `null`; the effect never enters the histogram branch.)
- **Zero visible items in histogram** → all bars render their labels with empty stacks; `EmptyState` overlays as in M2.
- **Empty bucket / category value** → the bar still appears (count 0, label present) so the axis is stable.
- **`min === max` numeric facet** → `computeBuckets` returns a single bucket; one bar.
- **Unparseable/missing value for the bucket facet** → that item is skipped in the histogram (not placed; it fades out).

## Testing strategy

- **Vitest unit (node):**
  - `buckets.ts`: `computeBuckets` produces nice edges/labels for representative ranges (`[0,97]`, `[0,1]`, negative ranges), the degenerate `min===max` case, and `bucketIndexOf` boundary placement (value on an edge, below min, at/above max).
  - `histogram.ts`: category grouping (one bar per value, declared order, correct counts), numeric bucketing (correct bar assignment), within-bar bottom-up stacking positions, bar-center `x` spacing, `bars` metadata (`label`/`x`/`count`), `bounds` (`w`/`h`), empty-bar inclusion, and omission of ids not in `orderedIds`.
- **Component (Vitest + jsdom + @testing-library/preact, with the synchronous `afterEach(() => cleanup())`):** Topbar renders the Grid/Histogram toggle and updates `view`; the toggle is disabled with no bucketable facet; the Group-by picker appears in histogram view and updates `histogramFacet`.
- **`transitions.ts` `clear()`** — unit-tested (after `clear()`, `get(id)` is `undefined`; `tick` is a no-op).
- **Pixi `Scene` (`setBars`, label pool, counter-scale, ticker idle)** — typecheck-gated + dev-smoke verified (no WebGL unit tests), per the project's testing decision.
- **`App.tsx` view branching / re-frame** — typecheck + build + dev smoke.

## Milestone task breakdown (informs the plan)

1. **Carry-ins:** `TransitionController.clear()` (+ test) and `Scene.onTick` idle-when-settled + `clear()` on `setSprites` (typecheck).
2. **`core/buckets.ts`** (+ tests).
3. **`core/layout/histogram.ts`** (+ tests).
4. **`Scene.setBars` + Pixi.Text label pool + counter-scale + on-demand frame** (typecheck).
5. **`state.ts` `view`/`histogramFacet` signals + `Topbar` toggle/picker** (+ component tests).
6. **`App.tsx` grid/histogram branch + re-frame + build-verify + dev smoke.**

## Open questions / deferred

- Exact axis-label font size / count-label formatting — sane defaults, tunable in M5.
- Whether very many category bars need horizontal scrolling vs. shrink-to-fit — fit-to-bounds covers it for now; refine in M5.
- Default bucket target count (10) — fixed for M3, expose later.
- A DOM-overlay axis (crisper text) — possible M5 upgrade over the M3 canvas labels.
