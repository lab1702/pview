# Viewer depth restyle — design

## Summary

Restyle the pview viewer chrome from its current flat dark theme into a
layered, "refined dark" frosted-glass language. The cards stay the content;
the chrome becomes dimensional and recedes around them. The work is almost
entirely a rewrite of `viewer/src/styles.css` around a token layer, plus one
small behavioral addition (collapsible facets) in `viewer/src/ui/Sidebar.tsx`.

No changes to the Pixi renderer, layout math, camera, or data flow.

## Direction (decided during brainstorming)

- **Mood:** refined dark — deeper, layered, gallery-like, one confident accent.
- **Surface treatment:** frosted glass (translucent panels + `backdrop-filter`
  blur + thin inner top-highlight + soft drop shadow).
- **Accent:** refined blue `#6aa8ff` (close to today's `#4a90d9`, with a glow
  variant for focus rings and slider fill).
- **Glass intensity:** balanced. Restrained behind dense sidebar text for
  legibility; richer glass on the topbar and detail card where text is sparse.
- **Scope:** whole chrome — topbar, sidebar, range slider, detail card, plus an
  atmospheric canvas backdrop.

## Feasibility note

The Pixi `Application` is initialized with `backgroundAlpha: 0`
(`viewer/src/scene/Scene.ts:50`), so the WebGL canvas is transparent. The
atmospheric backdrop is therefore pure CSS on the `.pview-canvas` container —
cards render on top of it. No renderer changes required.

## Components

### 1. Design tokens (`:root` in `styles.css`)

Introduce a single token block at the top of `styles.css`; every rule below
references it so the theme is defined once.

- **Surfaces:** `--bg-base` (deep near-black, ~`#0a0b10`), `--surface-glass`
  (translucent rgba for sidebar facet panels), `--surface-solid` (topbar /
  detail base).
- **Accent:** `--accent: #6aa8ff`, `--accent-glow` (rgba for shadows/rings),
  `--accent-fill` gradient pair for the slider.
- **Elevation:** `--elev-1`, `--elev-2`, `--elev-3` shadow recipes (each = soft
  drop shadow + inset top highlight); `--blur` for `backdrop-filter`; a
  `--radius-sm/md/lg` scale.
- **Text:** `--text`, `--text-dim`, `--text-faint`.

### 2. Glass chrome

- **Topbar** — translucent background + `backdrop-filter: blur(var(--blur))`,
  thin top highlight (`inset 0 1px 0 rgba(255,255,255,.06)`). Grid/Histogram
  view toggle becomes a segmented control with a glowing active segment.
  Search, sort, and group-by inputs become pills with inset shadows.
- **Sidebar** — translucent panel; each `.pview-facet` becomes a rounded glass
  card (`--surface-glass`, `--radius-md`, `--elev-2`) with an inset
  top-highlight. Blur/glow kept restrained behind the checkbox lists.
  Checkbox `.box` styled with accent fill + soft ring when checked.
- **Range slider** — recessed inset track, gradient accent fill with a soft
  glow, raised round handles with drop shadow. `:focus-visible` shows an accent
  ring (replaces today's hard `outline`).
- **Detail card** — strongest glass (higher opacity + `--blur`), `--elev-3`,
  since it floats over content. Close button gets a hover lift.
- **Canvas backdrop** — `.pview-canvas` gets layered radial-gradient corner
  glows over a dark linear gradient, so transparent-rendered cards float in
  atmospheric space.

### 3. Collapsible facets (`Sidebar.tsx`)

Each facet header (`<h3>`) becomes a `<button>` carrying `aria-expanded` and a
chevron indicator. Clicking toggles its body (the checkboxes / slider) via a
height + opacity CSS transition.

- Default state: **expanded**.
- State is held in component state (a `Set<string>` of collapsed facet names or
  equivalent), **in-memory only** — resets on reload, no persistence.
- Keyboard accessible: real `<button>`, `aria-expanded`, chevron rotates with
  state.
- This is the only change to `Sidebar.tsx` logic; the rest of the file
  (filter/range wiring) is unchanged.

### 4. Motion & polish

- Hover lifts on facet cards and the detail close button.
- `:focus-visible` accent rings replacing hard outlines.
- Checkbox check transition.
- Chevron rotation + body height/opacity transition on collapse/expand.
- All transitions wrapped so a `@media (prefers-reduced-motion: reduce)` block
  disables them.

## What does NOT change

- Pixi renderer, sprite/atlas pipeline, camera, transitions
  (`viewer/src/scene/*`).
- Layout math (`viewer/src/core/layout/*`).
- Filtering, sorting, search, counts, faceting logic
  (`viewer/src/core/*`).
- Bundle format and the Python build side (`src/`).
- The DOM structure of components, except `Sidebar.tsx`'s facet header
  (`<h3>` → `<button>`) and an added wrapper for the collapsible body.

## Testing

- Existing component tests (`Sidebar.test.tsx`, `Topbar.test.tsx`,
  `DetailCard.test.tsx`, `RangeSlider.test.tsx`) must keep passing. The
  `<h3>` → `<button>` change may require updating selectors in
  `Sidebar.test.tsx`.
- Add a test for collapse/expand: clicking a facet header toggles
  `aria-expanded` and hides/shows the facet body.
- No new tests needed for pure-CSS changes.

## Out of scope (YAGNI)

- Light theme / theme toggle (decided dark-only).
- Persisting collapse state across reloads.
- Teal/cyan accent variant (blue chosen).
- Any change to card rendering or the generated-card image pipeline.
