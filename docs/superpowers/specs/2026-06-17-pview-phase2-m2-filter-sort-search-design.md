# pview Phase 2 — M2: Filter / Sort / Search + Chrome Design

**Status:** Design approved (2026-06-17)
**Depends on:** Phase 1, Phase 2 M0 (bundle v2 + detail), Phase 2 M1 (viewer foundation: sprite wall + pan/zoom), all merged.
**Parent spec:** `docs/superpowers/specs/2026-06-17-pview-phase2-viewer-design.md` (M2 milestone).
**Scope:** Make the M1 sprite wall interactive — faceted filtering, sorting, search, faceted counts, animated grid re-layout (the A1 transition engine), and empty states — plus folding in the four hardening carry-ins from the M1 final review. Histogram view (M3) and semantic zoom (M4) are out of scope.

## Summary

M2 turns the static M1 wall into an interactive faceted browser. All consequential logic stays in pure, framework-free modules (filter, search, sort, faceted counts, the dual-slider range math, and a pure transition controller) with unit tests; PixiJS only *applies* the transition controller's output; Preact provides the chrome (Sidebar, Topbar, RangeSlider, EmptyState). State flows one direction through `@preact/signals`: filter/sort/query signals → computed `visibleIds`/`sortedVisible`/`counts` → an effect computes a grid layout and calls `Scene.setLayout`, which the RAF lerp engine animates.

M2 also folds in the four M1-review carry-ins: the Vitest-side Preact JSX transform (a prerequisite for component tests), per-sheet atlas-load resilience, `parseBundle` field-level guards, and a producer/consumer contract test.

## Goals

- **Faceted filtering**: category facets via checkboxes; numeric/date facets via an accessible dual-handle range slider.
- **Faceted counts**: each category value's count computed against all active constraints *except that facet's own* (so toggling a box never zeroes its siblings).
- **Sort**: by any facet, ascending/descending.
- **Search**: token substring match over text facets (incl. name), AND-combined with filters.
- **Animated grid re-layout**: filtered-out sprites fade/shrink; remaining sprites re-pack via the per-sprite RAF lerp engine (A1).
- **Empty state**: a "no items match" overlay when nothing passes.
- **Carry-ins**: Vitest Preact-JSX transform + `@testing-library/preact`; per-sheet atlas resilience; `parseBundle` field guards; producer/consumer contract test.

## Non-goals (M2)

- Histogram view + bucketing (M3).
- Semantic zoom / detail card / lazy detail (M4).
- Committing built `viewer_assets/` + staleness automation; visual polish; a "fit/reset view" affordance (M5).
- Auto-re-framing the camera on filter/sort changes (deliberately omitted — see Layout behavior).
- A grid/histogram view toggle in the Topbar (added in M3).

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Numeric/date filter control | Custom accessible dual-handle range slider (pure `rangeModel` + thin Preact shell) |
| Carry-ins | Fold all four into M2 (JSX setup, atlas resilience, parse guards, contract test) |
| Transition engine | Per-sprite RAF lerp via a pure `TransitionController`; Pixi only applies its output (A1) |
| Grid width on filter | Constant `columns = ceil(sqrt(totalItems))`; remaining items re-pack, filtered fade in place |
| Camera on filter/sort | Stays put (frame once on initial load); no auto-re-frame |

## Architecture & module map

```
viewer/src/
├── core/
│   ├── bundle.ts        # parseBundle: + field-level guards (carry-in 3)
│   ├── filter.ts        # NEW  FilterState + applyFilters(items, facets, state) -> Set<id>
│   ├── search.ts        # NEW  matchQuery(item, query, textFacetNames) -> boolean
│   ├── sort.ts          # NEW  sortIds(ids, items, facetName, dir) -> id[]
│   ├── counts.ts        # NEW  facetedCounts(items, facets, state) -> Map<facet, Map<value, n>>
│   ├── rangeModel.ts    # NEW  pure dual-slider math
│   └── layout/grid.ts   # (unchanged from M1)
├── scene/
│   ├── transitions.ts   # NEW  pure TransitionController (RAF lerp state)  [A1]
│   ├── Scene.ts         # + setLayout(targets, visible); ticker applies controller
│   ├── sprites.ts       # per-sheet atlas resilience (carry-in 2)
│   ├── camera.ts urls.ts# (unchanged)
├── ui/
│   ├── state.ts         # NEW  createViewerState(bundle) -> signals + computeds
│   ├── RangeSlider.tsx  # NEW  dual-handle slider (shell over rangeModel)
│   ├── Sidebar.tsx      # NEW  per-facet filter controls + faceted counts
│   ├── Topbar.tsx       # NEW  sort + search + live count
│   ├── EmptyState.tsx   # NEW  "no items match" overlay
│   └── App.tsx          # + chrome composition + signals->scene effect
│   └── styles.css       # + topbar/sidebar/canvas/empty layout
tests/ (Python)          # + producer/consumer contract test (carry-in 4)
```

**Data flow (one direction):**
```
signals: filter, sort, query
  -> visibleIds  = applyFilters(items, facets, filter) ∩ matchQuery(query)
  -> sortedVisible = sortIds(visibleIds, items, sort.facet, sort.dir)
  -> counts = facetedCounts(items, facets, filter)
  -> effect: gridLayout(sortedVisible, {columns}) -> Scene.setLayout(targets, new Set(visibleIds))
  -> TransitionController.setTargets re-bases; Pixi ticker lerps each sprite to target
Sidebar reads counts; Topbar reads visibleIds.size; EmptyState shows when size === 0.
```

## Core logic modules (pure, unit-tested)

### `filter.ts`
- `CategoryConstraint = Set<string>` (empty = all pass). `RangeConstraint = { min: number|string, max: number|string } | null`.
- `FilterState = Record<facetName, CategoryConstraint | RangeConstraint>`.
- `applyFilters(items, facets, state) -> Set<number>`: an item passes if, for every facet with an active constraint, `item.values[name]` satisfies it — category: `String(value)` ∈ set; numeric: `min <= Number(value) <= max`; date: ISO-string range compare (`min <= value <= max`). Facets with no/empty constraint and text facets are ignored.

### `search.ts`
- `matchQuery(item, query, textFacetNames) -> boolean`: lowercase; every whitespace-separated token of `query` must be a substring of the item's concatenated text-facet values (including the name facet). Empty/blank query → `true`.

### `sort.ts`
- `sortIds(ids, items, facetName, dir) -> number[]`: returns a new array sorted stably by `item.values[facetName]` using a type-aware comparator (numeric by `Number`, date by ISO/string, category/text by `localeCompare`). `dir: 'asc' | 'desc'`. A `null` facet returns ids unchanged.

### `counts.ts`
- `facetedCounts(items, facets, state) -> Map<facetName, Map<string, number>>`, for category facets only: for each category facet `F`, count items that satisfy every active constraint **except `F`'s own**, grouped by `String(item.values[F])`. This yields counts that reflect the rest of the filter without zeroing `F`'s own options.

### `rangeModel.ts`
- `valueToFraction(value, min, max) -> number` (0..1), `fractionToValue(fraction, min, max, step?) -> number` (optional snap to `step`), `clampLow(low, high) -> number` / `clampHigh(low, high) -> number` so the low handle can't exceed the high handle (and vice-versa). Pure; the `RangeSlider` is a thin shell over it.

## Transition engine (A1) & Scene

### `transitions.ts` — `TransitionController` (pure, unit-tested)
- State per id: `{ start, target, current }`, each `{ x, y, scale, alpha }`. Plus `elapsed` and `durationMs` (default 400).
- `register(id, initial)` — record a sprite's initial `current` (and `target = current`).
- `setTargets(targets: Map<id, {x,y,scale}>, visible: Set<id>)` — for each registered id: `start = {...current}`; `target = { x, y, scale (from targets if present, else current), alpha: visible.has(id) ? 1 : 0 }`; reset `elapsed = 0`.
- `tick(dtMs) -> boolean` — `elapsed += dt`; `t = clamp(elapsed/durationMs, 0, 1)`; `e = easeInOutCubic(t)`; `current = lerp(start, target, e)` per id; returns `t < 1` (still active).
- `get(id) -> current`.

### `Scene.ts` (changes)
- Owns a `TransitionController`. After `setSprites`, `register`s each sprite with `{x,y,scale:1,alpha:1}`.
- Pixi ticker callback: `controller.tick(ticker.deltaMS)`, then for each sprite apply `controller.get(id)` → `sprite.position/scale/alpha`, and `sprite.visible = current.alpha > 0.01`.
- `setLayout(targets, visibleSet)` → `controller.setTargets(...)`. Initial placement uses an instant path (set `current = target` directly, no animation); subsequent calls animate.

## Signals state & wiring

### `state.ts` — `createViewerState(bundle)`
Returns `{ filter, sort, query, visibleIds, sortedVisible, counts, reset }`:
- `filter` (signal `FilterState`, initially empty), `sort` (signal `{facet: string|null, dir: 'asc'|'desc'}`, default `{facet: null, dir: 'asc'}`), `query` (signal `''`).
- `visibleIds = computed(() => applyFilters(...) intersect matchQuery(...))`.
- `sortedVisible = computed(() => sortIds([...visibleIds.value], ...))`.
- `counts = computed(() => facetedCounts(items, facets, filter.value))`.
- `reset()` clears `filter` and `query`.
No module-level singletons — App creates one instance; tests create their own.

### Layout behavior
- `columns = max(1, ceil(sqrt(bundle.items.length)))` — derived from the **total** item count and held constant, so the wall keeps a stable width. `gridLayout(sortedVisible, {columns, tileSize, gap})` re-packs the visible items into the top-left; filtered-out sprites are absent from `targets` so they fade in place (alpha→0).
- The camera frames once on initial load (`Scene.frame(bounds)`); filter/sort changes animate sprites only and leave the camera where the user left it.

### `App.tsx`
Creates the state once; after the scene mounts and sprites are built, registers a Preact `effect(() => { read sortedVisible.value; const {targets} = gridLayout(...); scene.setLayout(targets, new Set(visibleIds.value)) })`. Disposes the effect on unmount.

## Chrome components

- **`RangeSlider.tsx`** — props `{ min, max, value: {low, high}, onChange, step?, formatLabel? }`. Renders a track + two handles, each `role="slider"` with `aria-valuemin/valuemax/valuenow` and `tabindex=0`. Pointer drag moves the nearer handle (mapped via `rangeModel`, clamped so handles don't cross); arrow keys nudge the focused handle by `step`; touch via pointer events. Date facets pass `min/max` as timestamps with a `formatLabel` that renders ISO dates; the component converts back to the facet's value type in `onChange`.
- **`Sidebar.tsx`** — one block per filterable facet (category/numeric/date; not text). Category → checkbox list with faceted counts from `counts`; numeric/date → `RangeSlider` seeded from facet min/max. "Clear all" → `reset()`.
- **`Topbar.tsx`** — title; sort facet `<select>` + asc/desc toggle bound to `sort`; debounced search `<input>` bound to `query`; a live "N of M" count.
- **`EmptyState.tsx`** — centered overlay shown when `visibleIds.size === 0`, with a "Clear all" action.
- **`App.tsx` + `styles.css`** — Topbar across the top, Sidebar on the left, canvas filling the rest, EmptyState as an overlay.

## Carry-ins (M1 review)

1. **Vitest Preact-JSX transform**: add `@testing-library/preact` (devDep); configure the Vitest test transform so `.test.tsx` files render Preact JSX (via oxc `jsx` options or `@preact/preset-vite`, whichever works with Vite 8 + Vitest 4); extend `test.include` to match `**/*.test.tsx`. Verified by a trivial component render test. This unblocks all M2 component tests.
2. **Per-sheet atlas resilience** (`sprites.ts`): wrap each atlas `loadTexture` in try/catch; on failure `console.warn` and push a sentinel so items on that sheet are skipped (`if (!source) continue`), and `buildSprites` still resolves. Tested with an injected loader that rejects one atlas.
3. **`parseBundle` field guards** (`core/bundle.ts`): throw a clear error when an item's `id`/`atlas` isn't a number or `rect` isn't a length-4 number array. Tested with malformed items.
4. **Producer/consumer contract test** (pytest, `tests/`): build a small bundle and assert `data.json`'s top-level keys equal the documented v2 set and each item's keys/types match `{id:int, values:dict, atlas:int, rect:[4 ints], detail:str|None}` — pinning the Python producer against the viewer's `Bundle` shape.

## Error handling / edge cases

- **Zero matches** → `EmptyState`; `gridLayout([])` returns empty; `setLayout` fades all sprites out. No crash.
- **Numeric facet with `min === max`** → `rangeModel` yields coincident handles; slider is degenerate but functional.
- **Category value not present after other filters** → faceted count `0`, checkbox still toggleable (its own facet is excluded from its count).
- **Atlas load failure** → carry-in 2 (skip sheet, warn, keep rendering the rest).
- **Malformed bundle item** → carry-in 3 (clear parse error rather than an opaque Pixi crash).

## Testing strategy

- **Vitest unit (node):** `filter` (each facet type, combinations, empty constraints), `search` (tokens, empty, case), `sort` (each type, both directions, stability, null facet), `counts` (exclude-own-facet correctness), `rangeModel` (value↔fraction, step snap, handle clamping), `transitions` (`setTargets` re-base, `tick` at t=0/mid/1, mid-flight re-base), `sprites` resilience (injected failing loader), `parseBundle` field guards.
- **Component (Vitest + jsdom + @testing-library/preact):** `RangeSlider` (pointer drag + keyboard updates, handles don't cross, ARIA attrs), `Sidebar` (right control per facet type, emits filter changes, renders faceted counts), `Topbar` (sort/search wiring, count), `EmptyState` (visible at 0).
- **Integration (non-browser):** `createViewerState(bundle)` → set filter/query/sort → assert `visibleIds`/`sortedVisible`/`counts`.
- **Contract (pytest):** carry-in 4.
- **Pixi `Scene`** stays typecheck-gated + dev-smoke verified (no WebGL unit tests), per the M1 testing decision.

## Milestone task breakdown (informs the plan)

1. **Carry-in: Vitest Preact-JSX transform** + `@testing-library/preact` + a trivial component render test (unblocks component testing).
2. **Carry-in: `parseBundle` field guards** (+ tests).
3. **Carry-in: per-sheet atlas resilience** in `sprites.ts` (+ test).
4. **Carry-in: producer/consumer contract test** (pytest).
5. **`core/filter.ts` + `core/search.ts`** (+ tests).
6. **`core/sort.ts` + `core/counts.ts`** (+ tests).
7. **`core/rangeModel.ts`** (+ tests).
8. **`scene/transitions.ts` `TransitionController`** (+ tests) + `Scene.setLayout` wiring (typecheck).
9. **`ui/state.ts` `createViewerState`** (+ integration tests).
10. **`ui/RangeSlider.tsx`** (+ component tests).
11. **`ui/Sidebar.tsx` + `Topbar.tsx` + `EmptyState.tsx` + `App.tsx` wiring + `styles.css`** (+ component tests) + build-verify + dev smoke.

The plan may be executed in two batches (carry-ins + core: 1–7; engine + state + chrome: 8–11).

## Open questions / deferred

- Transition duration/easing default (~400 ms ease-in-out) — tunable; revisit in M5 polish.
- Whether very large category facets need a "show more"/scroll cap in the Sidebar — start simple (scroll), refine later.
- A "fit/reset view" affordance and optional gentle re-frame on filter — deferred to M5.
- Debounce interval for search (~150 ms default) — tunable.
