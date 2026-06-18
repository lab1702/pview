# pview Phase 2 — Interactive Viewer Design

**Status:** Design approved (2026-06-17)
**Depends on:** Phase 1 (the Python build pipeline + bundle format), already merged.
**Scope:** The interactive browser viewer that renders a pview bundle, plus a small Phase-1 bundle extension (detail originals) needed to feed it.

## Summary

Phase 2 builds the interactive viewer that makes a pview bundle behave like Microsoft's old PivotViewer: a zoomable wall of item cards that the user can filter by facets, sort into a grid, stack into a histogram grouped by a facet, search, and **semantically zoom into** to reveal a single item's full-resolution image and all its attributes — with smooth animated transitions between every layout, at 20,000+ items.

The viewer is a TypeScript project (`viewer/`) built with Vite into the committed `src/pview/viewer_assets/` directory, so end users still `pip install pview` with **no Node step**. It has three layers:

1. **`core/`** — pure, framework-free TypeScript: bundle parsing, filtering, sorting, search, bucketing, and layout math. All consequential logic lives here and is unit-tested without a browser.
2. **`scene/`** — a PixiJS (WebGL) shell: one sprite per item textured from the atlas, a camera (pan/zoom), and a single RAF lerp engine that animates every transition.
3. **`ui/`** — a Preact + signals shell: the filter sidebar, top bar (view toggle, sort, search), and the semantic-zoom detail card.

Data flows one direction: Preact signals (UI state) → core pure functions compute visible items + layout targets → the scene animates sprites toward those targets.

## Goals

- Render 20,000+ item sprites smoothly from the bundle's atlas sheets.
- **Faceted filtering** (checkboxes for categories with live faceted counts; dual range sliders for numeric/date).
- **Sort + grid view** and **histogram view** (cards stacked into bars grouped by a chosen facet).
- **Search** across text facets.
- **Semantic zoom**: click an item, the camera zooms into that card, and past a threshold a detail card reveals the lazy-loaded full-resolution original image plus all attributes (Approach B1).
- **Animated transitions** for every layout change — grid↔histogram, re-sort, filter, and focus-zoom (Approach A1).
- Ship prebuilt and committed; usable straight from the wheel with zero Node.

## Non-goals (Phase 2)

- Playwright/headless-browser E2E tests (structurally accommodated, deferred).
- Hover tooltips (deferred from v1).
- Editing data, server-side hosting, multi-resolution DeepZoom image pyramids (single full-res original per item instead).
- CI-built/PyPI-published wheels (built assets are committed; CI graduation is future work).

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Canvas renderer | PixiJS (WebGL), one `Container` of `Sprite`s |
| DOM UI framework | Preact + `@preact/signals` |
| Build artifact handling | Commit built `viewer_assets/` to git |
| Test scope (v1) | Vitest unit + Preact component (jsdom); Playwright deferred |
| Item detail interaction | Full semantic zoom into the card (rich detail rendered as DOM, Approach B1) |
| Zoomed-image fidelity | Store original full-res images in the bundle, lazy-loaded |
| Transition engine | Custom RAF lerp over a single sprite container (Approach A1) |

## Architecture & repo layout

```
viewer/                          # TypeScript + Vite project (dev-only; not a runtime dep)
├── package.json  tsconfig.json  vite.config.ts  index.html
├── src/
│   ├── core/                    # PURE logic — no Pixi, no DOM. Unit-tested.
│   │   ├── bundle.ts            # Bundle/Item/Facet types + parseBundle(json)
│   │   ├── filter.ts            # FilterState + applyFilters(items, state) -> Set<id>
│   │   ├── sort.ts              # sortIds(ids, items, facet, dir) -> id[]
│   │   ├── search.ts            # matchQuery(item, query, textFacets) -> boolean
│   │   ├── buckets.ts           # computeBuckets(min, max, n) -> {edges, labels}
│   │   └── layout/
│   │       ├── grid.ts          # gridLayout(orderedIds, viewport, tileSize, gap)
│   │       └── histogram.ts     # histogramLayout(visibleIds, items, facet, viewport)
│   ├── scene/                   # PixiJS shell
│   │   ├── Scene.ts             # Pixi.Application + sprite Container + camera
│   │   ├── sprites.ts           # build Sprites from atlas textures + item rects
│   │   ├── transitions.ts       # RAF lerp engine: setTargets(map); tick(dt)  [A1]
│   │   └── camera.ts            # pan/zoom transform, screen<->world, fitToBounds
│   ├── ui/                      # Preact + signals shell
│   │   ├── state.ts             # signals + derived visibleIds
│   │   ├── App.tsx              # mounts scene + chrome, wires signals -> scene
│   │   ├── Sidebar.tsx          # per-facet filter controls + faceted counts
│   │   ├── Topbar.tsx           # view toggle, sort, search, bucket-by picker, count
│   │   └── DetailCard.tsx       # semantic-zoom detail overlay (B1)
│   └── main.ts                  # read bundle (inlined <script> or data.json), boot App
└── test/                        # Vitest specs mirroring core/ and ui/
```

**Build output:** `npm run build` (Vite) emits stable, unhashed `app.js`, `app.css`, and `index.html` into `src/pview/viewer_assets/` — exactly the filenames `bundle.py` already copies (folder mode) and inlines (single-file mode). These built files are committed to git.

**Data flow (unidirectional):**
```
Preact signals (filter, sort, query, view, selectedId, focus)
   -> core: applyFilters ∩ matchQuery -> visibleIds
   -> core: sortIds -> ordered
   -> core: gridLayout / histogramLayout -> targets: Map<id,{x,y,scale}>
   -> Scene.setLayout(targets, visibleSet)
   -> transitions.ts RAF lerp animates sprites toward targets
```
The `core/` layer never imports Pixi or Preact.

## Bundle format extension (Phase-1 addition, milestone M0)

To feed Approach B1's crisp semantic zoom, the Phase-1 pipeline emits a **detail original** per imaged item:

- For an item with a usable source image, the build writes its **original full-resolution image** to `detail/<id>.<ext>` in the folder bundle and sets `"detail": "detail/<id>.<ext>"` on that item in `data.json`.
- Generated-card items (no source image) get `"detail": null`; the viewer re-renders their detail crisply from `values` + `cardFields` (no stored image needed).
- `data.json` items become `{id, values, atlas, rect, detail}` — an added, backward-compatible field. `version` bumps from `1` to `2`.
- **Single-file mode** inlines detail images as base64 data URIs for self-containment, with a documented note that single-file output suits small collections (originals are heavy).
- Implementation touches `images.py` (retain original bytes alongside the normalized tile), the `build`/`build_with_summary` orchestrator (write detail files + set `item["detail"]`), and `bundle.py` (copy `detail/` in folder mode; inline as data URIs in single-file mode; bump version). Covered by added pytest tests.

The viewer's `parseBundle` accepts `version` 2 and treats a missing `detail` field as `null` (so older bundles still load).

## Core logic modules (the testable heart)

- **`bundle.ts`** — `Facet` is a tagged union: `{name, type:'numeric', min, max}`, `{type:'date', min, max}`, `{type:'category', values}`, `{type:'text'}`. `Item = {id, values: Record<string, JSONValue>, atlas, rect:[x,y,w,h], detail: string|null}`. `parseBundle(json)` validates `version<=2`, normalizes missing `detail` to `null`, returns a typed `Bundle`.
- **`filter.ts`** — `FilterState` maps facet name → constraint: category → `Set<string>` of selected values (empty set = all pass); numeric/date → `{min, max}`. `applyFilters(items, state) -> Set<id>`: an item passes if, for every facet with an active constraint, its value satisfies that constraint. Text facets are not filtered here.
- **`search.ts`** — `matchQuery(item, query, textFacets) -> boolean`: case-insensitive token match over the item's text-facet values (including the name). Empty query matches all. Combined with filters by logical AND.
- **`sort.ts`** — `sortIds(ids, items, facetName, dir) -> id[]`: stable sort with type-aware comparators (numeric ascending by value, date by timestamp, category/text lexicographic). `dir` is `'asc'|'desc'`.
- **`buckets.ts`** — `computeBuckets(min, max, n) -> {edges:number[], labels:string[]}` for numeric and date facets; drives histogram bars and range-slider steps. Date values are bucketed on their numeric timestamps with formatted labels.
- **`layout/grid.ts`** — `gridLayout(orderedIds, viewport, tileSize, gap) -> {targets: Map<id,{x,y,scale}>, bounds:{w,h}}`: derives column count from viewport width, packs ids in order left-to-right/top-to-bottom, returns world-space targets (scale fits tile into cell) and total content bounds for camera-fit.
- **`layout/histogram.ts`** — `histogramLayout(visibleIds, items, facet, viewport) -> {targets, bars:[{label, x, width, count}]}`: groups items into bars (category → one bar per value; numeric/date → buckets from `buckets.ts`); within each bar, sprites stack bottom-up; tile scale fits bar width. Returns bar metadata for axis labels.

All of the above are pure functions with hand-built fixtures — direct Vitest targets, no browser.

## PixiJS scene & the A1 transition engine

- **`Scene.ts`** — owns the `Pixi.Application` (WebGL), a world `Container` holding all sprites, and the camera; handles canvas resize. `setLayout(targets, visibleSet)` writes each sprite's `target` {x,y,scale} and `targetAlpha` (1 if in `visibleSet`, else 0), then ensures the lerp is running.
- **`sprites.ts`** — loads each atlas PNG as a `BaseTexture`; for each item builds a `Sprite` from a sub-texture defined by the item's `rect` frame, anchored at center, added to the world container and indexed by id.
- **`transitions.ts`** — the RAF lerp engine. Each sprite stores `current`, `start`, and `target` for `{x, y, scale, alpha}`. On each Pixi ticker tick, a transition-global progress `t` advances by `dt/duration`, eased; each sprite's `current = start + (target - start) * ease(t)`. A new `setLayout` mid-flight re-bases `start = current` so motion is continuous (no snap). At `t>=1`, `current` snaps to `target` and the lerp idles. Filtered-out sprites animate `alpha`→0 and `scale`→~0. This one mechanism animates grid↔histogram, re-sort, filter, and focus-zoom.
- **`camera.ts`** — world transform (position + zoom). Pan via pointer drag on empty canvas; wheel-zoom centered on the cursor, clamped between a fit-all minimum and a max. `screenToWorld`/`worldToScreen`. `fitToBounds(bounds)` frames a layout. The semantic-zoom "focus" is an animated camera target: center the selected sprite and zoom past the detail threshold.

## Preact chrome (signals state + components)

- **`state.ts`** — signals: `filterState`, `sortState{facet, dir}`, `query`, `view:'grid'|'histogram'`, `histogramFacet`, `selectedId: id|null`, `focus` (0..1 zoom progress for the selected item). Derived `visibleIds = applyFilters(items, filterState)` intersected with `matchQuery`. Effects subscribe: when `visibleIds`/`sortState`/`view`/`histogramFacet` change → recompute layout targets → `scene.setLayout`; when `selectedId`/`focus` change → drive camera focus + `DetailCard`.
- **`App.tsx`** — mounts the Pixi canvas into a container ref, renders `Topbar` + `Sidebar` + `DetailCard`, and wires the signal→scene effects. Receives the `Scene` through an injected interface (so components are testable without a real canvas).
- **`Topbar.tsx`** — collection title; **view toggle** (Grid/Histogram); **sort** facet dropdown + direction; debounced **search** input bound to `query`; in histogram view a **bucket-by facet picker** bound to `histogramFacet`; a live visible/total count.
- **`Sidebar.tsx`** — one control per facet: category → checkbox list with **faceted per-value counts** (each value's count computed against the current filter state *excluding that facet's own constraint*, the classic PivotViewer behavior); numeric/date → a dual range slider seeded from the facet's min/max. A "Clear all" reset.
- **`DetailCard.tsx`** — the B1 semantic-zoom overlay. When `focus` crosses the detail threshold for `selectedId`, it fades in anchored to the selected sprite's on-screen rect (`camera.worldToScreen`). It shows the **lazy-loaded full-resolution `detail` image** (or, for `detail===null` generated items, the card re-rendered from `values`), plus all attribute `label: value` rows. Opacity is tied to focus progress.

## Interaction model

- **Pan**: drag on empty canvas. **Zoom**: wheel centered on cursor, clamped (fit-all min, fixed max).
- **Click a sprite**: sets `selectedId`; the camera animates to center + zoom that sprite to the focus level. As zoom crosses the **detail threshold**, `DetailCard` fades in (semantic-zoom reveal). Zooming back out fades it away.
- **Deselect**: Esc, click on background, or a back affordance → camera animates back to the prior layout framing; `selectedId` cleared.
- **Changing view/filter/sort/search while focused** clears the selection and re-frames the new layout (keeps state transitions predictable for v1).
- **Empty result** (filter/search match nothing): an empty-state overlay; the layout functions handle an empty id set without error.

## Error handling

- **Bundle version too new or unparseable** → a friendly banner rendered into `#app` ("This viewer can't read bundle version N"), never a blank page.
- **Atlas texture fails to load** → log + a placeholder tile; the rest of the wall still renders.
- **Detail image lazy-load fails** → `DetailCard` falls back to the upscaled atlas tile plus a small notice.
- **WebGL unavailable** → a clear "WebGL is required to view this collection" message.
- **Zero items match** → empty-state overlay; no crash.

## Testing strategy

- **Vitest unit (TDD)** over all `core/`: filter predicates (each facet type + combinations + empty constraints), search matching (tokenization, empty query), sort comparators (each type, both directions, stability), bucketing (numeric and date edges/labels, degenerate min==max), grid layout (column count, positions, bounds), histogram layout (bar grouping for category and bucketed facets, bottom-up stacking, bar metadata).
- **Preact component tests** (`@testing-library/preact` + jsdom): Sidebar renders the correct control per facet type and emits filter changes; faceted counts recompute correctly; Topbar view/sort/search/bucket-by wiring; DetailCard renders fields and the image for a selected item. The `Scene` is provided as an injected mock interface — no real WebGL in tests.
- **One non-browser integration test**: parse a small real bundle JSON → run filter→sort→layout → assert `visibleIds` and a few sample target positions.
- **Python (M0)**: pytest coverage for the detail extension — `detail/<id>.<ext>` written for imaged items, `item["detail"]` set (and `null` for generated), `version==2`, single-file mode inlines detail as data URIs, older-style consumers unaffected.
- **Playwright E2E**: deferred; the injected-Scene boundary and bundle-load entry point keep it addable later.

## Build integration & distribution

- `viewer/` is a Vite + TypeScript project. `npm run build` produces stable, unhashed `app.js` / `app.css` / `index.html` in `src/pview/viewer_assets/`.
- The `index.html` template works in both bundle modes: in folder mode it fetches `./data.json` and loads `atlas/`/`detail/` by relative URL; in single-file mode it reads the data inlined by `bundle.py` from the `#pview-data` script element and uses inlined data-URI assets. The viewer's expected element ids are aligned with `bundle.py`'s single-file output.
- **Built assets are committed** to git. A `npm run build` step plus a "build-is-current" check (committed `viewer_assets/` vs. a fresh build) guards against drift, run in CI or as a pre-commit check. Node remains a **dev-only** dependency; the runtime `pyproject.toml` is unchanged. Developer docs describe the workflow.

## Milestones (each independently testable)

- **M0 — Bundle extension (Python, TDD):** emit detail originals + bump `version` to 2. Lands first so the viewer has data to consume.
- **M1 — Viewer foundation:** `viewer/` scaffold (Vite/TS/Vitest), `parseBundle`, atlas sprite construction, static grid layout, camera pan/zoom. Deliverable: the wall renders from a real bundle and you can move around it.
- **M2 — Filter/sort/search + chrome:** `core/` filter, sort, search; Sidebar + Topbar; grid re-layout via the A1 transition engine; faceted counts; empty states.
- **M3 — Histogram view:** `buckets.ts`, `histogramLayout`, bar labels, bucket-by picker, and animated grid↔histogram transitions.
- **M4 — Semantic zoom:** click→focus camera animation + `DetailCard` (B1) with lazy full-res detail and generated-item detail rendering.
- **M5 — Build integration & polish:** commit built assets, staleness check, developer docs, visual polish.

The implementation plan will be structured along these milestones; each may be planned and executed as its own increment.

## Open questions / deferred

- Exact transition duration and easing curve — start with a sane default (~400ms ease-in-out), make it tunable.
- Histogram axis-label density and overlap handling for many category values — start simple, refine in M3.
- Whether single-file mode should omit detail originals (size) rather than inline them — current decision is to inline; revisit if bundle sizes become a problem.
- Number of histogram buckets default for numeric/date — start with a fixed sensible default in `computeBuckets`, expose later.
