# Viewer Depth Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the pview viewer chrome from flat dark to a layered "refined dark" frosted-glass language, and make sidebar facets collapsible.

**Architecture:** Rewrite `viewer/src/styles.css` around a `:root` design-token layer (surfaces, accent, elevation, text, radius, motion) and apply a frosted-glass treatment to the topbar, sidebar facet panels, range slider, and detail card, plus an atmospheric CSS backdrop on the transparent-rendered canvas. Add an in-memory collapse/expand behavior to `viewer/src/ui/Sidebar.tsx`. Finally regenerate the committed `src/pview/viewer_assets` bundle so the new look ships in the Python package.

**Tech Stack:** Preact + `@preact/signals`, Pixi.js (untouched), Vite, Vitest + `@testing-library/preact`, plain CSS (no preprocessor, no CSS-in-JS).

## Global Constraints

- All npm commands run from the `viewer/` directory.
- No new dependencies. Use plain CSS and existing Preact hooks only.
- Dark theme only — no light variant, no theme toggle.
- Accent color is `#6aa8ff` (token `--accent`). Do not introduce other accent hues.
- Collapse state is **in-memory only** (resets on reload); no persistence.
- Do not touch the Pixi renderer, layout math, camera, core filtering/sort/search/faceting logic, the bundle format, or any Python in `src/` — except the regenerated `src/pview/viewer_assets/` build output in Task 3.
- The Pixi canvas is transparent (`backgroundAlpha: 0`, `viewer/src/scene/Scene.ts:50`); the atmospheric backdrop is pure CSS on `.pview-canvas`.
- Tests do **not** use `@testing-library/jest-dom`; assert on attributes with `element.getAttribute(...)`, not `toHaveAttribute`.

---

## File Structure

- **Modify** `viewer/src/styles.css` — full rewrite around design tokens; all presentational changes live here (Task 1). Also gains the collapsible-facet and reduced-motion rules.
- **Modify** `viewer/src/ui/Sidebar.tsx` — facet header becomes a `<button>` with `aria-expanded`; facet body wrapped in a collapsible container; in-memory collapsed-set state (Task 2).
- **Modify** `viewer/test/Sidebar.test.tsx` — add a collapse/expand test (Task 2). Existing tests stay unchanged.
- **Regenerate** `src/pview/viewer_assets/{app.js,app.css,index.html}` — production build output, committed (Task 3).

No other files change.

---

## Task 1: Token-based glass stylesheet

Pure presentational rewrite of `viewer/src/styles.css`. CSS is not unit-tested; verification is typecheck + existing test suite + a manual visual check. This task writes the complete stylesheet, including rules for the collapsible-facet markup that Task 2 adds (CSS for not-yet-present elements is harmless).

**Files:**
- Modify: `viewer/src/styles.css` (full replacement)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS class contract the components rely on. Classes used by existing markup (unchanged names): `.pview-root`, `.pview-topbar`, `.pview-topbar-title`, `.pview-search`, `.pview-count`, `.pview-body`, `.pview-sidebar`, `.pview-clear`, `.pview-facet`, `.pview-checkboxes`, `.pview-canvas`, `.pview-range`, `.pview-range-track`, `.pview-range-fill`, `.pview-range-handle`, `.pview-range-labels`, `.pview-empty`, `.pview-error`, `.pview-view-toggle`, `.pview-groupby`, `.pview-sort`, `.pview-detail`, `.pview-detail-close`, `.pview-detail-image`, `.pview-detail-generated`, `.pview-detail-attrs`, `.pview-detail-row`. New classes Task 2 will attach to markup: `.pview-facet-header`, `.pview-facet-chev`, `.pview-facet-body`. The collapsed state is expressed by `.pview-facet-header[aria-expanded='false']` and `.pview-facet-body[aria-hidden='true']`.

- [ ] **Step 1: Replace the stylesheet contents**

Replace the entire contents of `viewer/src/styles.css` with:

```css
/* ---- Design tokens ---- */
:root {
  /* Surfaces */
  --bg-base: #0a0b10;
  --surface-solid: #161a22;
  --surface-glass: rgba(40, 46, 60, 0.40);
  --surface-input: rgba(12, 14, 18, 0.6);
  --surface-raised: rgba(255, 255, 255, 0.04);
  --border-soft: rgba(255, 255, 255, 0.08);
  --border-hair: rgba(255, 255, 255, 0.06);
  --highlight-top: inset 0 1px 0 rgba(255, 255, 255, 0.10);

  /* Accent */
  --accent: #6aa8ff;
  --accent-strong: #5b8fe0;
  --accent-glow: rgba(106, 168, 255, 0.45);
  --accent-ring: rgba(106, 168, 255, 0.35);

  /* Text */
  --text: #e7e9ee;
  --text-dim: #aeb6c6;
  --text-faint: #717a8c;

  /* Elevation */
  --elev-2: inset 0 1px 0 rgba(255, 255, 255, 0.10), 0 8px 22px rgba(0, 0, 0, 0.30);
  --elev-3: inset 0 1px 0 rgba(255, 255, 255, 0.10), 0 24px 60px rgba(0, 0, 0, 0.6);
  --blur: 14px;
  --blur-soft: 8px;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 14px;

  /* Motion */
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
}

/* ---- Base ---- */
html, body, #app { margin: 0; height: 100%; }
.pview-root {
  display: flex; flex-direction: column; width: 100vw; height: 100vh;
  overflow: hidden; color: var(--text);
  font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
  background: var(--bg-base);
}

/* ---- Topbar (glass) ---- */
.pview-topbar {
  display: flex; align-items: center; gap: 14px; padding: 11px 18px;
  background: rgba(22, 26, 34, 0.55);
  -webkit-backdrop-filter: blur(var(--blur)); backdrop-filter: blur(var(--blur));
  border-bottom: 1px solid var(--border-hair);
  box-shadow: var(--highlight-top);
}
.pview-topbar-title { font-weight: 650; font-size: 15px; letter-spacing: 0.2px; }
.pview-search {
  width: 230px; padding: 7px 12px; border-radius: var(--radius-sm);
  font-size: 13px; color: var(--text); background: var(--surface-input);
  border: 1px solid var(--border-soft);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
}
.pview-search::placeholder { color: var(--text-faint); }
.pview-search:focus-visible {
  outline: none; border-color: var(--accent);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5), 0 0 0 3px var(--accent-ring);
}
.pview-count { margin-left: auto; color: var(--text-dim); font-variant-numeric: tabular-nums; font-size: 13px; }

/* Topbar selects (sort / group by) */
.pview-sort, .pview-groupby { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-dim); }
.pview-sort select, .pview-groupby select, .pview-sort button {
  padding: 6px 10px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer;
  color: var(--text); background: var(--surface-input); border: 1px solid var(--border-soft);
}
.pview-sort button:hover { border-color: var(--accent); }
.pview-sort button:focus-visible, .pview-sort select:focus-visible, .pview-groupby select:focus-visible {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring);
}

/* View toggle (segmented control) */
.pview-view-toggle {
  display: inline-flex; border-radius: var(--radius-sm); overflow: hidden;
  border: 1px solid var(--border-soft); background: var(--surface-input);
}
.pview-view-toggle button {
  background: transparent; border: none; color: var(--text-dim);
  padding: 6px 13px; font-size: 13px; cursor: pointer;
  transition: background 0.15s var(--ease), color 0.15s var(--ease);
}
.pview-view-toggle button[aria-pressed='true'] {
  background: linear-gradient(var(--accent), var(--accent-strong));
  color: #06122a; font-weight: 650; box-shadow: 0 1px 6px var(--accent-glow);
}
.pview-view-toggle button:disabled { opacity: 0.4; cursor: default; }

/* ---- Body / sidebar ---- */
.pview-body { flex: 1; display: flex; min-height: 0; }
.pview-sidebar {
  width: 250px; overflow-y: auto; padding: 14px 13px;
  background: rgba(16, 19, 25, 0.45);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border-right: 1px solid var(--border-hair);
}
.pview-clear {
  font-size: 12px; color: var(--text-dim); cursor: pointer; margin-bottom: 14px;
  background: var(--surface-raised); border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm); padding: 6px 11px;
  transition: border-color 0.15s var(--ease), color 0.15s var(--ease);
}
.pview-clear:hover { border-color: var(--accent); color: var(--text); }

/* Facet glass card */
.pview-facet {
  background: var(--surface-glass);
  -webkit-backdrop-filter: blur(var(--blur-soft)); backdrop-filter: blur(var(--blur-soft));
  border-radius: var(--radius-md); padding: 10px 13px; margin-bottom: 12px;
  border: 1px solid var(--border-soft); box-shadow: var(--elev-2);
}
.pview-facet-header {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  padding: 2px 0; background: none; border: none; cursor: pointer;
  color: var(--text-dim); font: inherit;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.9px; font-weight: 700;
}
.pview-facet-header:focus-visible {
  outline: none; box-shadow: 0 0 0 3px var(--accent-ring); border-radius: 4px;
}
.pview-facet-chev { color: var(--text-faint); font-size: 10px; transition: transform 0.2s var(--ease); }
.pview-facet-header[aria-expanded='false'] .pview-facet-chev { transform: rotate(-90deg); }

/* Collapsible body — grid-rows height animation */
.pview-facet-body {
  display: grid; grid-template-rows: 1fr; opacity: 1;
  transition: grid-template-rows 0.22s var(--ease), opacity 0.22s var(--ease);
}
.pview-facet-body > * { min-height: 0; overflow: hidden; }
.pview-facet-body[aria-hidden='true'] { grid-template-rows: 0fr; opacity: 0; pointer-events: none; }

.pview-checkboxes { list-style: none; margin: 8px 0 0; padding: 0; }
.pview-checkboxes label { display: flex; gap: 8px; align-items: center; padding: 3px 0; font-size: 13px; color: var(--text-dim); }
.pview-checkboxes input { accent-color: var(--accent); }

/* Range slider */
.pview-range { padding: 6px 4px; }
.pview-range-track {
  position: relative; height: 5px; border-radius: 4px; margin: 16px 6px;
  background: #0c0e12; box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}
.pview-range-fill {
  position: absolute; height: 100%; border-radius: 4px;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  box-shadow: 0 0 8px var(--accent-glow);
}
.pview-range-handle {
  position: absolute; top: 50%; width: 14px; height: 14px; margin-left: -7px;
  transform: translateY(-50%); background: #dfe8fb; border-radius: 50%; cursor: pointer;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.6);
}
.pview-range-handle:focus-visible {
  outline: none; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.6), 0 0 0 3px var(--accent-ring);
}
.pview-range-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-faint); }

/* ---- Canvas + atmospheric backdrop ---- */
.pview-canvas {
  position: relative; flex: 1; min-width: 0;
  background:
    radial-gradient(90% 70% at 18% 8%, rgba(106, 168, 255, 0.12), transparent 55%),
    radial-gradient(80% 80% at 92% 96%, rgba(132, 98, 220, 0.12), transparent 55%),
    linear-gradient(160deg, #11131a, #0a0b10 70%);
}

/* ---- Empty / error ---- */
.pview-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px;
  background: rgba(10, 11, 16, 0.7); pointer-events: auto;
}
.pview-error { color: var(--text); font: 16px sans-serif; padding: 1rem; }

/* ---- Detail card (strongest glass) ---- */
.pview-detail {
  position: absolute; max-height: 80vh; display: flex; flex-direction: column;
  background: rgba(20, 23, 30, 0.72);
  -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
  border: 1px solid var(--border-soft); border-radius: var(--radius-lg);
  box-shadow: var(--elev-3); overflow: hidden; z-index: 20;
}
.pview-detail-close {
  position: absolute; top: 6px; right: 8px; width: 26px; height: 26px;
  background: rgba(0, 0, 0, 0.5); color: var(--text); border: none; border-radius: 50%;
  font-size: 18px; line-height: 1; cursor: pointer;
  transition: transform 0.15s var(--ease), background 0.15s var(--ease);
}
.pview-detail-close:hover { transform: scale(1.1); background: rgba(0, 0, 0, 0.7); }
.pview-detail-image img { display: block; width: 100%; height: auto; max-height: 60vh; object-fit: contain; background: #000; }
.pview-detail-generated {
  width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  color: #fff; font: 600 22px sans-serif; padding: 12px; text-align: center; box-sizing: border-box;
}
.pview-detail-attrs { margin: 0; padding: 10px 14px; overflow-y: auto; }
.pview-detail-row { display: flex; gap: 8px; padding: 2px 0; font-size: 14px; }
.pview-detail-row dt { color: var(--accent); min-width: 90px; }
.pview-detail-row dd { margin: 0; color: var(--text); }

/* ---- Reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

Run (from `viewer/`): `npm run typecheck`
Expected: exits 0, no output errors.

- [ ] **Step 3: Verify the existing test suite still passes**

Run (from `viewer/`): `npm test`
Expected: all tests pass (no component test asserts on the colors/styles changed here, so the suite is green).

- [ ] **Step 4: Manual visual check (optional but recommended)**

Run (from `viewer/`): `npm run fixtures` then `npm run dev`, open the printed localhost URL.
Expected: glass topbar, glass sidebar facet cards on a darker panel, glowing segmented Grid/Histogram toggle, atmospheric canvas backdrop behind the cards, glass detail card on selection. (Facets are not yet collapsible — that is Task 2.)

- [ ] **Step 5: Commit**

```bash
git add viewer/src/styles.css
git commit -m "Restyle viewer chrome with token-based frosted glass"
```

---

## Task 2: Collapsible facets

Make each sidebar facet header a button that collapses/expands its body. TDD: the behavior (header toggles `aria-expanded`, body toggles `aria-hidden`) is unit-tested.

**Files:**
- Modify: `viewer/src/ui/Sidebar.tsx`
- Test: `viewer/test/Sidebar.test.tsx`

**Interfaces:**
- Consumes: the CSS classes `.pview-facet-header`, `.pview-facet-chev`, `.pview-facet-body` and the `[aria-expanded]` / `[aria-hidden]` styling from Task 1; the existing `Sidebar({ bundle, state })` signature and `createViewerState` (unchanged).
- Produces: facet header rendered as `<button class="pview-facet-header" aria-expanded={isOpen}>` containing a `<span>` with the facet name and a `<span class="pview-facet-chev" aria-hidden="true">`; facet body rendered as `<div class="pview-facet-body" aria-hidden={isOpen ? undefined : 'true'}>` wrapping the category/numeric/date control. Default state expanded for all facets.

- [ ] **Step 1: Write the failing test**

Add this test to `viewer/test/Sidebar.test.tsx` (keep the existing tests and imports; `fireEvent` and `screen` are already imported):

```tsx
it('collapses and expands a facet when its header is clicked', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  const header = screen.getByRole('button', { name: 'g' }) // facet "g" header
  expect(header.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(header)
  expect(header.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(header)
  expect(header.getAttribute('aria-expanded')).toBe('true')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `viewer/`): `npx vitest run test/Sidebar.test.tsx`
Expected: the new test FAILS (no button with accessible name `g` — the facet name is currently an `<h3>`).

- [ ] **Step 3: Implement collapsible facets**

Edit `viewer/src/ui/Sidebar.tsx`. Add the `useState` import at the top:

```tsx
import { useState } from 'preact/hooks'
```

Replace the `Sidebar` function body (lines for the component, from `export function Sidebar` through its `return (...)`) with:

```tsx
export function Sidebar({ bundle, state }: { bundle: Bundle; state: ViewerState }) {
  const filterable = bundle.facets.filter((f) => f.type !== 'text')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapse = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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
      {filterable.map((f) => {
        const isOpen = !collapsed.has(f.name)
        return (
          <div class="pview-facet" key={f.name}>
            <button
              type="button"
              class="pview-facet-header"
              aria-expanded={isOpen}
              onClick={() => toggleCollapse(f.name)}
            >
              <span>{f.name}</span>
              <span class="pview-facet-chev" aria-hidden="true">
                ▾
              </span>
            </button>
            <div class="pview-facet-body" aria-hidden={isOpen ? undefined : 'true'}>
              <div>
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
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

Leave the `CategoryFilter`, `NumericFilter`, and `DateFilter` helper functions below unchanged.

Note: the extra inner `<div>` wrapping the control is the single grid child the `.pview-facet-body > *` rule animates and clips.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `viewer/`): `npx vitest run test/Sidebar.test.tsx`
Expected: all tests in the file PASS, including the new collapse/expand test and the two existing ones (`renders a checkbox per category value…`, `does not render a control for text facets`).

- [ ] **Step 5: Verify typecheck and the full suite**

Run (from `viewer/`): `npm run typecheck && npm test`
Expected: typecheck exits 0; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/ui/Sidebar.tsx viewer/test/Sidebar.test.tsx
git commit -m "Make sidebar facets collapsible"
```

---

## Task 3: Regenerate the shipped viewer bundle

The Python package serves the prebuilt viewer from `src/pview/viewer_assets/` (`src/pview/bundle.py:42`). Rebuild it so the restyle and collapsible facets ship.

**Files:**
- Regenerate: `src/pview/viewer_assets/app.js`, `src/pview/viewer_assets/app.css`, `src/pview/viewer_assets/index.html`

**Interfaces:**
- Consumes: the finished `viewer/src/*` from Tasks 1–2.
- Produces: updated committed build artifacts (no code interface).

- [ ] **Step 1: Build the viewer**

Run (from `viewer/`): `npm run build`
Expected: Vite build succeeds and writes `app.js`, `app.css`, and `index.html` into `../src/pview/viewer_assets/`.

- [ ] **Step 2: Confirm the artifacts changed**

Run (from repo root): `git status --short src/pview/viewer_assets`
Expected: `app.js`, `app.css` show as modified (and `index.html` if the template changed).

- [ ] **Step 3: Sanity-check the built CSS contains the new tokens**

Run (from repo root): `grep -c -- "--accent" src/pview/viewer_assets/app.css`
Expected: a count of 1 or more (the design tokens made it into the bundle).

- [ ] **Step 4: Commit**

```bash
git add src/pview/viewer_assets
git commit -m "Rebuild viewer_assets bundle for the depth restyle"
```

---

## Self-Review

**Spec coverage:**
- Design tokens (`:root` layer) → Task 1, Step 1 token block. ✓
- Glass topbar (blur, segmented toggle, pill inputs) → Task 1 topbar rules. ✓
- Glass sidebar facet cards, restrained behind text → Task 1 `.pview-facet`. ✓
- Range slider (inset track, glowing fill, raised handles, focus ring) → Task 1 range rules. ✓
- Detail card (strongest glass) → Task 1 `.pview-detail`. ✓
- Atmospheric canvas backdrop (CSS on transparent canvas) → Task 1 `.pview-canvas`. ✓
- Collapsible facets (button + `aria-expanded`, in-memory state, default expanded, keyboard accessible) → Task 2. ✓
- Motion & polish (chevron rotation, hover lifts, focus-visible rings, checkbox accent, body transition) → Task 1 transitions + `.pview-facet-chev` + `.pview-detail-close:hover`. ✓
- `prefers-reduced-motion` → Task 1 final media block. ✓
- Existing tests keep passing; add a collapse/expand test → Task 2 Steps 1 & 5. ✓
- Ships in the Python package → Task 3. ✓
- Out of scope (light theme, persistence, teal, card pipeline) → none added. ✓

**Placeholder scan:** No TBD/TODO; all CSS and TSX is complete and literal.

**Type consistency:** `toggleCollapse(name: string)`, `collapsed: Set<string>`, `isOpen = !collapsed.has(f.name)`, `aria-expanded={isOpen}`, `aria-hidden={isOpen ? undefined : 'true'}` are used consistently between the implementation and the test (which reads `aria-expanded` via `getAttribute`). Class names in Task 2 markup (`pview-facet-header`, `pview-facet-chev`, `pview-facet-body`) match the Task 1 stylesheet exactly.
