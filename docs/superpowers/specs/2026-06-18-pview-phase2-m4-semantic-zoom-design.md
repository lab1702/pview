# pview Phase 2 — M4: Semantic Zoom Design

**Status:** Design approved (2026-06-18)
**Depends on:** Phase 1, Phase 2 M0 (bundle `detail` originals), M1/M2/M3, all merged.
**Parent spec:** `docs/superpowers/specs/2026-06-17-pview-phase2-viewer-design.md` (M4 milestone).
**Scope:** Click a card → it's selected → the camera animates to zoom into it → a crisp DOM detail card reveals the lazy-loaded full-resolution image (or a generated header for no-photo items) plus every attribute. Deselect returns to the wall. This is where the Phase-1/M0 `detail` originals are finally used. Approach **B1** (canvas animates the zoom, DOM renders the detail). Build/commit automation and polish are M5.

## Summary

M4 adds the signature PivotViewer "focus one item" interaction. Clicking the canvas hit-tests which sprite is under the pointer (a cheap spatial scan, run only on click). The selected id drives a camera tween in the `Scene` that flies the camera to center on that sprite and zoom it to fill most of the viewport. While focused, the `Scene` emits the focused sprite's on-screen rect each frame so a Preact `DetailCard` stays glued to it as it flies in. The detail card renders, stacked: the full-resolution image lazily loaded from the item's `detail` URL (or a deterministic generated-color header + name when `detail` is `null`), then every attribute as `label: value` rows. Esc, a close button, or clicking the background deselects and animates the camera back.

All consequential new logic is pure and unit-tested (`lerpCamera`, the `hitTest` math, the generated-card color); PixiJS hit-testing/camera-tween stay in the `Scene` (typecheck + dev smoke); the detail card is a Preact component (component-tested).

## Goals

- **Click-to-select** via spatial hit-test (`Scene.pick`), ignoring filtered-out (alpha≈0) sprites; clicking the background deselects.
- **Animated camera focus**: a tween centers + zooms the selected sprite to fill ~80% of the viewport; a user pan/zoom cancels the tween (selection persists); deselect animates back to the pre-focus camera.
- **Anchored DOM `DetailCard`** (B1): tracks the focused sprite's on-screen rect every frame, fading in as the focus progresses.
- **Detail content (stacked)**: full-res image lazily loaded from `item.detail` (folder path or single-file data URI), or a generated-color header + name when `detail` is `null`; then all attributes as scrollable `label: value` rows.
- **Deselect**: Esc, the card's close button, or a background click; changing view/filter/sort/search also deselects.
- **Graceful fallback**: a detail image that fails to load degrades to a neutral placeholder (the card still shows attributes).

## Non-goals (M4)

- Keyboard navigation between items while focused (next/prev) — M5.
- Multi-resolution DeepZoom pyramids — a single full-res original per item (from M0) is used as-is.
- Committing built `viewer_assets/` + staleness automation; visual polish; search debounce (M5).
- Re-focusing/keeping selection across a view/filter change (M4 deselects instead).
- Hover affordances / tooltips (still deferred).

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Hit-testing | Spatial lookup in the Scene (`pick` over the sprite map, click-only) |
| Detail card layout | Stacked: image on top, attribute rows below (scrollable) |
| No-photo item detail | Generated-style header (deterministic color block + name) above attributes |
| Camera focus animation | A camera tween in the Scene + a pure `lerpCamera` (A1) |
| Detail card anchoring | Tracks the focused sprite's on-screen rect each frame via an `onFocusRect` callback |

## Architecture & module map

```
viewer/src/
├── core/
│   ├── hittest.ts          # NEW  hitTest(worldX, worldY, entries, tileSize) -> id|null (pure)
│   └── cardcolor.ts        # NEW  generatedColor(id) -> css color (matches the Python generated-card bg)
├── scene/
│   ├── camera.ts           # + lerpCamera(a, b, t) (pure camera math, already unit-tested here)
│   └── Scene.ts            # + pick(); tap detection; camera focus tween (focusOn/focusReset);
│                           #   onSelect + onFocusRect callbacks; ticker advances the camera tween
├── ui/
│   ├── state.ts            # + selectedId: Signal<number|null>
│   ├── DetailCard.tsx      # NEW  anchored detail overlay (image/header + attribute rows + close)
│   ├── App.tsx             # wire pick->selectedId->focus; render DetailCard; Esc/deselect; clear on view/filter change
│   └── styles.css          # + detail-card styling
└── scene/urls.ts           # reused: resolveAtlasUrl(detail, baseUrl) resolves folder paths + data URIs
```

**Data flow:**
```
canvas tap -> Scene.pick(sx,sy) -> id|null -> Scene.onSelect(id|null)
  -> App: state.selectedId.value = id (or null on background tap)
  -> effect: selectedId set   -> scene.focusOn(id)     (tween camera to focus)
            selectedId null   -> scene.focusReset()    (tween back to pre-focus camera)
  -> while focused: Scene.onFocusRect({cx,cy,size,progress}) each frame
       -> App updates a focusRect signal -> DetailCard positions/fades from it
DetailCard renders when selectedId != null: image (lazy from item.detail) or generated header + attribute rows.
Esc / close button / background tap / view|filter|sort|query change -> selectedId = null
```

## Core modules (pure, unit-tested)

### `scene/camera.ts` (+ `lerpCamera`)
- `lerpCamera(a: Camera, b: Camera, t: number) -> Camera` — linearly interpolates `{x, y, zoom}` (clamped `t∈[0,1]`). Added alongside the existing pure camera math (`fitToBounds`/`zoomAt`/…) and tested in `test/camera.test.ts`. Used by the Scene's focus tween.

### `core/hittest.ts`
- `hitTest(worldX, worldY, entries: { id: number; x: number; y: number; alpha: number }[], tileSize: number) -> number | null` — returns the id of the entry whose centered tile rect (`x ± tileSize/2`, `y ± tileSize/2`) contains the world point and whose `alpha > 0.01`; scans in array order and returns the **last** match (topmost in stacking order). `null` if none. Pure; the Scene calls it with its sprites' current positions/alphas.

### `core/cardcolor.ts`
- `generatedColor(id: number) -> string` — replicates the Python generated-card background: `hue = (id · 0.61803398875) mod 1`, then `hslToRgb(hue, 0.55, 0.45)` → a `#rrggbb` string, so the no-photo detail header matches its tile. Pure, unit-tested against a couple of known ids.

## Scene changes (PixiJS — typecheck + dev smoke)

- **`pick(screenX, screenY) -> number | null`** — `screenToWorld(cam, …)` then `hitTest(worldX, worldY, entries, tileSize)` where `entries` are built from the sprite map (`{id, x: sp.position.x, y: sp.position.y, alpha: sp.alpha}`). `tileSize` is captured in `setSprites`.
- **Tap detection** — the existing pan handlers track pointer movement; on `pointerup`, if the total movement since `pointerdown` is below a small threshold (a tap, not a drag), call `pick` and fire `onSelect(id)` (id may be `null` for a background tap).
- **Camera focus tween** — new fields `camStart`/`camTarget`/`focusElapsed` and a `prefocusCam`. `focusOn(id)`: store `prefocusCam = cam`; compute `camTarget` = camera centered on the sprite's world position with `zoom = focusZoom` (so the tile fills ~80% of the smaller viewport dimension: `min(vpW, vpH) / tileSize · 0.8`, clamped to `MAX_ZOOM`); start the tween. `focusReset()`: tween back to `prefocusCam`. The ticker advances the tween via `lerpCamera(camStart, camTarget, ease(t))` and calls `applyCamera()`. A user pan/zoom (the existing `panBy`/`zoomAt` handlers) cancels the active tween (sets it complete) but leaves the selection intact.
- **`onSelect` / `onFocusRect` callbacks** — public settable callbacks. While a selection is active, each ticker frame the Scene computes the focused sprite's on-screen rect (`worldToScreen(cam, sp.x, sp.y)` for the center, `size = tileSize · cam.zoom`) and a `progress` (the focus-tween fraction), and calls `onFocusRect({ cx, cy, size, progress })`. When nothing is selected, no `onFocusRect` calls.
- **No regression to grid/histogram**: focus is an additive camera state; `setLayout`/`setBars`/`frame` are unchanged. The idle ticker (M3) wakes for the focus tween and idles again when it settles.

## State & chrome

### `state.ts`
Adds `selectedId: Signal<number | null>` (default `null`) to `createViewerState`. `reset()` (clear filters/query) does not touch `selectedId`.

### `DetailCard.tsx`
- Props: `{ item: Item; baseUrl: string; rect: { cx: number; cy: number; size: number; progress: number }; onClose: () => void }`.
- **Position/fade**: an absolutely-positioned container centered on `(rect.cx, rect.cy)`, sized from `rect.size` (clamped to a sensible min/max so the card stays readable), with `opacity` ramped from `rect.progress` (fully visible once progress passes a threshold). Tracks the sprite as it flies in.
- **Image area (stacked, top):** if `item.detail` is set → `<img src={resolveAtlasUrl(item.detail, baseUrl)}>` (lazy; folder path or single-file data URI), with an `onError` that swaps to a neutral placeholder; if `item.detail` is `null` → a generated header: a block filled with `generatedColor(item.id)` showing the item's name.
- **Attributes (below, scrollable):** every entry in `item.values` rendered as a `label: value` row.
- **Close**: a `×` button calling `onClose`.

### `App.tsx`
- Sets `scene.onSelect = (id) => { state.selectedId.value = id }` (a background tap passes `null`).
- Sets `scene.onFocusRect = (r) => { focusRect.value = r }` (a local `focusRect` signal).
- An effect watches `selectedId`: a non-null id → `scene.focusOn(id)`; `null` → `scene.focusReset()`.
- Renders `<DetailCard item={...} baseUrl rect={focusRect.value} onClose={() => (selectedId.value = null)} />` when `selectedId.value` is non-null (looked up in `bundle.items`).
- A document `keydown` (Esc) listener clears `selectedId` (registered/removed in the same effect that owns the scene).
- Changing `view`/`histogramFacet`/`filter`/`sort`/`query` clears `selectedId` (the layout effect deselects when the layout identity or visible set changes) — the M2 "changing view/filter clears selection" rule.

## Error handling / edge cases

- **Background tap** (no sprite under pointer) → `pick` returns `null` → deselect.
- **Filtered-out sprite** (alpha≈0) is not pickable (`hitTest` skips `alpha ≤ 0.01`).
- **Detail image load failure** → `onError` swaps to a neutral placeholder; the card still shows attributes.
- **Selecting then changing view/filter** → the selection clears and the camera returns to the (new) layout framing.
- **`focusZoom` clamp** — capped at `MAX_ZOOM` so a tiny tile doesn't demand impossible zoom.
- **Deselect while the focus tween is mid-flight** → `focusReset` re-bases from the current camera (continuous, no jump).

## Testing strategy

- **Vitest unit (node):**
  - `lerpCamera` (in `camera.test.ts`): `t=0 → a`, `t=1 → b`, midpoint interpolation of x/y/zoom, clamp.
  - `hittest.ts`: a point inside a tile returns its id; outside returns `null`; an `alpha≤0.01` entry is skipped; overlapping entries return the last (topmost).
  - `cardcolor.ts`: `generatedColor` is deterministic and returns a valid `#rrggbb`; spot-check a known id.
- **Component (Vitest + jsdom + @testing-library/preact, sync `afterEach(cleanup)`):** `DetailCard` renders an `<img>` for an item with `detail`, a generated header (no `<img>`) for `detail: null`, all attribute rows, and a working close button.
- **Scene `pick`/focus tween/`onFocusRect`** — typecheck-gated + dev-smoke (no WebGL unit tests), per the project's testing decision; `hitTest`/`lerpCamera` carry the logic and are unit-tested.
- **`App` wiring** — typecheck + build + dev smoke.

## Milestone task breakdown (informs the plan)

1. **`scene/camera.ts` `lerpCamera` + `core/hittest.ts` + `core/cardcolor.ts`** (+ unit tests).
2. **`Scene.pick` + tap detection** (uses `hitTest`; `onSelect` callback) — typecheck.
3. **`Scene` camera focus tween** (`focusOn`/`focusReset`/`onFocusRect`, ticker integration, pan/zoom cancels) — typecheck.
4. **`state.ts` `selectedId`** + **`DetailCard.tsx`** (+ component tests) + styles.
5. **`App.tsx` wiring** (pick→selectedId→focus, DetailCard + focusRect, Esc/background/close deselect, clear-on-view/filter change) + build-verify + dev smoke.

## Open questions / deferred

- `focusZoom` fill fraction (~80%) and the detail-card min/max on-screen size — sane defaults, tunable in M5.
- Next/prev keyboard navigation while focused — M5.
- A crisper DOM-overlay axis (M3 carry) and search debounce — still M5.
- Whether the detail card should show `cardFields` prominently vs all `values` equally — M4 shows all `values`; a prioritized layout is an M5 refinement.
