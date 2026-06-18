# pview Phase 2 — M1: Viewer Foundation Design

**Status:** Design approved (2026-06-17)
**Depends on:** Phase 1 (pipeline + bundle format) and Phase 2 M0 (bundle `version 2` + `detail` field), both merged.
**Parent spec:** `docs/superpowers/specs/2026-06-17-pview-phase2-viewer-design.md` (M1 is the first viewer milestone).
**Scope:** Stand up the `viewer/` TypeScript project and render a real pview bundle as a zoomable, pannable sprite wall. No filtering, sorting, search, histogram, or semantic zoom yet — those are M2–M4.

## Summary

M1 creates the `viewer/` project (Vite + TypeScript + PixiJS + Preact + Vitest) and delivers the foundation the later milestones build on: parse a bundle, build one GPU sprite per item from the atlas sheets, lay them out in a static grid, and let the user pan and zoom the wall. It renders from a **real pview-generated bundle** — both live via the Vite dev server (against a generated fixture) and as compiled assets in `src/pview/viewer_assets/` so a `pview build` folder bundle opens and renders end-to-end.

All consequential logic lives in pure, framework-free modules (`parseBundle`, `gridLayout`, camera transform math) that are unit-tested without a browser. PixiJS is confined to `Scene`/`sprites`; Preact is a one-component shell that hosts the canvas.

## Goals

- A `viewer/` Vite + TS project with PixiJS 8, Preact 10 + signals 2, Vitest 4.
- `parseBundle(json)` — accepts bundle `version <= 2`, normalizes missing `detail` to `null`.
- Build one sprite per item from the atlas `rect`, sharing a `TextureSource` per atlas sheet.
- Static grid layout (pure function) + camera pan/zoom (cursor-centered) with initial fit-to-content.
- Dual-mode bundle loading: inlined `#pview-data` (single-file) or `fetch("./data.json")` (folder).
- `vite build` → stable `app.js` / `app.css` / `index.html` in `src/pview/viewer_assets/` (single self-contained IIFE), so the same `app.js` works via `<script src>` and inlined.
- Unit tests for `parseBundle`, `gridLayout`, and camera math.

## Non-goals (M1)

- Filtering, sorting, search, faceted counts (M2).
- Histogram view and bucketing (M3).
- Semantic zoom / detail card / lazy detail loading (M4).
- Animated transitions (M2+); M1 places sprites statically.
- Commit/staleness automation for built assets, and visual polish (M5).
- Reactive Preact state/signals beyond mounting the canvas (M2).
- ESLint/Prettier (deferred; `tsc --strict` + Vitest are the M1 guardrails).
- Unit tests for PixiJS/DOM code and Playwright E2E (deferred; verified via dev-server smoke).

## Toolchain (resolved versions)

| Package | Version line |
|---|---|
| pixi.js | ^8 (8.19+) |
| preact | ^10 |
| @preact/signals | ^2 |
| vite | ^8 |
| vitest | ^4 |
| typescript | ^5 |
| jsdom | latest (devDep; for future component tests) |

Node is a **dev-only** dependency; end users still `pip install pview` with no Node.

## Architecture & repo layout

```
viewer/                          # Vite + TypeScript project (dev-only; not a runtime dep)
├── package.json                 # deps: pixi.js, preact, @preact/signals
│                                # devDeps: vite, vitest, typescript, jsdom
├── tsconfig.json                # "strict": true
├── vite.config.ts               # IIFE build → ../src/pview/viewer_assets/ (stable names)
├── index.html                   # dev entry + built template; #app mount; classic-script app.js/app.css
├── README.md                    # npm run dev / build / test / fixtures
├── fixtures/                    # git-ignored: a real pview-generated sample bundle (for dev)
├── scripts/make-fixture.py      # regenerates fixtures/ via the pview pipeline
├── src/
│   ├── core/                    # PURE logic — no Pixi, no DOM. Unit-tested.
│   │   ├── bundle.ts            # Bundle/Item/Facet types + parseBundle(json)
│   │   └── layout/grid.ts       # gridLayout(ids, opts)
│   ├── scene/                   # PixiJS shell
│   │   ├── camera.ts            # pure {x,y,zoom} transform math
│   │   ├── sprites.ts           # atlas TextureSource -> per-item Sprite
│   │   └── Scene.ts             # Pixi.Application + world container + camera glue + interaction
│   ├── ui/App.tsx               # minimal Preact shell: mounts the canvas
│   └── main.ts                  # dual-mode bundle load -> render App
└── test/                        # Vitest specs: bundle, grid, camera
```

Repo `.gitignore` gains `viewer/node_modules/`, `viewer/fixtures/`, `viewer/dist/`.

**Data flow (M1):** `main.ts` loads the bundle → `parseBundle` → `render(<App bundle>)` → `App` creates `Scene`, `Scene.setSprites(bundle)` (via `sprites.ts`) → `gridLayout` computes targets → `Scene.placeSprites(targets)` → `camera.fitToBounds` frames the wall → pointer/wheel drive `camera` pan/zoom.

## Core modules (pure, unit-tested)

### `core/bundle.ts`

- Types: `Facet` is a tagged union (`numeric{min,max}`, `date{min,max}`, `category{values}`, `text`). `Item = {id:number, values:Record<string,unknown>, atlas:number, rect:[number,number,number,number], detail:string|null}`. `Bundle = {version:number, title:string, tileSize:number, facets:Facet[], cardFields:string[], atlases:{file:string,width:number,height:number}[], items:Item[]}`.
- `parseBundle(json: unknown) -> Bundle`: throws a clear `Error` when `version > 2` or required top-level fields are missing/wrong-typed; normalizes each item's missing `detail` to `null` (so v1 bundles load). Returns the typed `Bundle`.

### `core/layout/grid.ts`

- `gridLayout(ids: number[], opts: {columns:number, tileSize:number, gap:number}) -> {targets: Map<number,{x:number,y:number,scale:number}>, bounds:{w:number,h:number}}`.
- Places ids left-to-right, top-to-bottom across `columns` columns at `tileSize+gap` spacing, `scale:1` (world-space). `bounds` is the total content extent (`columns*(tileSize+gap)-gap` wide; row count derives the height). Empty `ids` → empty targets and zero bounds.
- The caller chooses `columns = ceil(sqrt(n))` for a roughly square wall. M1 orders ids by `item.id`.

## Scene, sprites, camera

### `scene/camera.ts` (pure)

- `Camera = {x:number, y:number, zoom:number}` — `(x,y)` is the world point at the viewport center; `zoom` is world→screen scale.
- `screenToWorld(cam, sx, sy, vp) -> {x,y}` and `worldToScreen(cam, wx, wy, vp) -> {x,y}` (`vp = {width,height}`).
- `zoomAt(cam, sx, sy, factor, vp) -> Camera`: scales `zoom` by `factor` while keeping the world point under `(sx,sy)` fixed on screen.
- `panBy(cam, dxScreen, dyScreen) -> Camera`: shifts the center by a screen-space delta (converted by `zoom`).
- `fitToBounds(bounds, vp, padding?) -> Camera`: centers on the bounds and sets `zoom` to fit them within the viewport.
- No Pixi imports — directly unit-tested.

### `scene/sprites.ts`

- `buildSprites(bundle, world, loadTexture) -> Map<number, Sprite>`: for each `bundle.atlases[i]`, obtains a `TextureSource` (via an injected `loadTexture(file) -> Promise<TextureSource>` that wraps Pixi `Assets`/`Texture.from`, so the function is testable and works for both URL and data-URI `file` values). For each item, builds a `Texture` with `frame = new Rectangle(...rect)` over its atlas source, wraps it in a `Sprite` (anchor 0.5), adds it to the `world` container, and indexes it by `item.id`.

### `scene/Scene.ts`

- Owns the Pixi `Application` (v8 async `init`, WebGL-preferred), a world `Container` on the stage, and the current `Camera`.
- `mount(el)` attaches `app.canvas`; `setSprites(bundle)` builds sprites into the world; `placeSprites(targets)` sets each sprite's `position`/`scale` from a layout map (M1: direct set, no animation).
- Interaction: pointer-drag → `panBy`; wheel → `zoomAt` (cursor-centered); applies the camera to the world container transform on each change; handles window/canvas resize. `frame(bounds)` calls `fitToBounds` and applies it.

## Preact shell & entry

### `ui/App.tsx`

- Props: `{ bundle: Bundle }`. Renders a full-window canvas host (and the `bundle.title` in a corner). On mount (ref + effect): create `Scene`, `mount` into the ref, `setSprites(bundle)`, compute `gridLayout` (columns = `ceil(sqrt(items.length))`), `placeSprites`, then `frame(bounds)`. Tears down the `Scene` on unmount. No signals/state yet.

### `main.ts`

- Dual-mode loader: if `document.getElementById("pview-data")` exists, parse its text content (single-file mode); else `await fetch("./data.json").then(r => r.json())` (folder mode). Then `parseBundle` → `render(<App bundle={bundle} />, document.getElementById("app"))`. Any load/parse error renders an error message into `#app`.

## Build wiring (Vite → `viewer_assets/`)

- `vite.config.ts` builds a **single self-contained IIFE** bundle named `app.js` (no ES-module syntax in the output, no code-splitting, no content hashes) plus `app.css`, with `build.outDir = "../src/pview/viewer_assets"` and `emptyOutDir` scoped so it does not delete unrelated files. Output filenames are pinned to `app.js` / `app.css`.
- The built `index.html` references `./app.js` and `./app.css` as **classic scripts/links** (relative `base: "./"`). The same `app.js`, being an IIFE with no imports, runs correctly both as `<script src="app.js">` (folder mode) and inlined as `<script>…</script>` (single-file mode, exactly how `bundle.py` already embeds `app.js`).
- `app.js` mounts into `#app` and reads the inlined `#pview-data` script if present, else fetches `./data.json` — matching `bundle.py`'s single-file template (`#app` div + `#pview-data` payload) and its folder layout (`data.json` + `atlas/` + `detail/` siblings).
- Commit/staleness automation is **out of scope** (M5). M1 just produces correct output; running `vite build` updates `viewer_assets/` so a `pview build` folder bundle renders.

## Dev fixture

- `scripts/make-fixture.py` runs the pview pipeline on a small toy DataFrame (a handful of items: some with images, some generated) writing a folder bundle into `viewer/fixtures/`. An `npm run fixtures` script invokes it.
- The Vite dev server serves `viewer/fixtures/` so `npm run dev` shows a live wall from a **real** bundle. `fixtures/` is git-ignored (regenerable).

## Error handling

- **WebGL unavailable** → Pixi `init` rejects → caught → "WebGL is required to view this collection" rendered into `#app`.
- **Bundle load/parse failure** (missing `data.json`, `version > 2`, malformed JSON) → a friendly message in `#app`, never a blank page.
- **Atlas texture load failure** → logged via the injected `loadTexture` rejection; affected sprites are skipped/placeholdered; the rest of the wall still renders.

## Testing strategy

- **Vitest unit (TDD), node environment:**
  - `core/bundle.ts`: a real v2 fixture object parses to the right shape; a synthetic **v1** object (no `detail`) yields `detail: null` on every item (backward-compat); `version: 3` throws; malformed/missing required fields throw clearly.
  - `core/layout/grid.ts`: exact `targets` and `bounds` for a small id set, correct column wrapping, empty-input case.
  - `scene/camera.ts`: `zoomAt` keeps the cursor world-point fixed on screen; `fitToBounds` centers and scales to fit; `panBy` shifts by the right world delta; `screenToWorld`/`worldToScreen` round-trip.
- **No unit tests for `Scene`/`sprites`/`App`** (real WebGL/DOM) in M1 — verified manually via `npm run dev` against the fixture. The injected `loadTexture` seam and pure-module split keep them testable later; Playwright remains deferred (parent spec).
- `jsdom` is installed as a devDep for future component tests but unused in M1's pure specs.

## Milestone task breakdown (informs the plan)

1. **Scaffold + toolchain** — `viewer/` `package.json`, `tsconfig` (strict), `vite.config.ts` (IIFE → `viewer_assets`), Vitest config, `index.html`, npm scripts, `.gitignore` entries; a trivial passing test proving the toolchain runs.
2. **`core/bundle.ts`** — `parseBundle` + tests.
3. **`core/layout/grid.ts`** — `gridLayout` + tests.
4. **`scene/camera.ts`** — pure transform math + tests.
5. **`scene/sprites.ts` + `scene/Scene.ts`** — atlas textures, sprite build, camera glue, pan/zoom interaction.
6. **`ui/App.tsx` + `main.ts` + dev fixture + `vite build` → `viewer_assets/`** — dual-mode loader, end-to-end wiring, dev-server smoke, compiled assets render a real folder bundle.

## Open questions / deferred

- Exact wheel-zoom sensitivity and min/max zoom clamps — start with sane defaults, tune later.
- Whether to show the collection title in M1 or defer all chrome to M2 — current decision: a minimal corner title is fine, full chrome is M2.
- Device-pixel-ratio / high-DPI handling in the Pixi app — use Pixi's default `resolution` handling in M1; revisit if blurry.
- `gap` and default `tileSize`-derived spacing values — pick sensible constants in M1, expose later.
