# pview Phase 2 — M5: Ship the Real Viewer + CI + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pip install pview` ship the real built viewer (commit `viewer_assets/`), harden single-file inlining, add GitHub Actions CI with a build-staleness guard, and clear the polish backlog — completing Phase 2.

**Architecture:** Python `bundle.py` gains `</script>`/`</style>` escaping for single-file inlining; the viewer gets small polish changes (shared `isBucketable`, search debounce, bar-count formatting, DetailCard focusRect-signal localization, explicit name key); the real assets are built and committed (ending the placeholder); a GitHub Actions workflow runs both suites and a rebuild-and-diff staleness check.

**Tech Stack:** Python (pandas/Pillow/pytest), TypeScript 5 / PixiJS 8 / Preact 10 / Vite 8 / Vitest 4, GitHub Actions.

## Global Constraints

- All `viewer/` commands run from `/home/lab/tmp/pview/viewer`; Python from `/home/lab/tmp/pview`.
- Gates per task: `npm test` green, `npm run typecheck` clean (viewer tasks); `python -m pytest -q` green (Python tasks).
- Single-file inlining escapes the literal closer: `</script` → `<\/script` in `app.js`, `</style` → `<\/style` in `app.css`, case-insensitively (the runtime is unaffected; it just prevents the HTML parser from closing the tag early).
- After this milestone the committed `src/pview/viewer_assets/` holds the REAL built `app.js`/`app.css`/`index.html` (no placeholder, no restore dance). The real assets must be built with Node 22 + `npm ci` to match CI.
- CI (`.github/workflows/ci.yml`) runs `pytest`, viewer `vitest`+`typecheck`+`build`, and a staleness check `git diff --exit-code src/pview/viewer_assets` (with a documented relax-to-presence-check fallback if minified output proves non-deterministic across environments).
- Component tests use `// @vitest-environment jsdom` + `@testing-library/preact` with a synchronous `afterEach(() => cleanup())`.
- Task order is fixed: escaping + structural test (1) → viewer polish (2, 3) → build+commit real assets (4) → CI (5), so the committed assets reflect final source and the staleness check passes.
- TDD: failing test → confirm fail → implement → confirm pass → commit.

---

## File Structure

| File | Change |
|------|--------|
| `src/pview/bundle.py` | `_escape_script`/`_escape_style` + use in single-file inlining |
| `tests/test_bundle.py` | placeholder-string assertion → structural; + escape unit tests |
| `viewer/src/core/facets.ts` | NEW `isBucketable` |
| `viewer/src/ui/state.ts` `Topbar.tsx` | use `isBucketable`; Topbar search debounce |
| `viewer/src/scene/Scene.ts` | bar-count `toLocaleString` |
| `viewer/src/ui/DetailCard.tsx` | focusRect signal prop + `nameKey` |
| `viewer/src/ui/App.tsx` | pass focusRect signal + `nameKey`; `onKey` before `teardown` |
| `src/pview/viewer_assets/{app.js,app.css,index.html}` | the REAL built assets (committed) |
| `.github/workflows/ci.yml` | NEW CI + staleness guard |

---

## Task 1: bundle.py single-file escaping + structural test

**Files:**
- Modify: `src/pview/bundle.py`
- Test: `tests/test_bundle.py`

**Interfaces:**
- Produces: `_escape_script(js: str) -> str` and `_escape_style(css: str) -> str` (module-level, case-insensitive closer escaping); the single-file `write_bundle` path inlines escaped `app.js`/`app.css`.

- [ ] **Step 1: Write failing tests** — append to `tests/test_bundle.py`:

```python
def test_escape_script_neutralizes_closing_tag():
    from pview.bundle import _escape_script

    out = _escape_script("var a = '</script><b>';")
    assert "</script" not in out
    assert "<\\/script" in out


def test_escape_style_neutralizes_closing_tag():
    from pview.bundle import _escape_style

    out = _escape_style("a{content:'</style>'}")
    assert "</style" not in out
    assert "<\\/style" in out
```

Also update `test_single_file_bundle` (the existing test): replace the line
`assert "pview placeholder loaded" in html  # app.js inlined`
with these structural assertions that hold for any viewer payload:
```python
    assert "id='pview-data'" in html  # inlined data script present
    assert "id='app'" in html  # mount point present
    assert "</script></body>" in html  # the app.js script tag closes the body
```

- [ ] **Step 2: Run to verify they fail**

Run (from repo root): `python -m pytest tests/test_bundle.py -q`
Expected: FAIL — `_escape_script`/`_escape_style` don't exist; (the structural edits to `test_single_file_bundle` still pass against the current placeholder, which is fine.)

- [ ] **Step 3: Add the escape helpers to `src/pview/bundle.py`.** Add `import re` to the imports at the top (next to `import json`), and add these helpers just below the imports (above `_viewer_dir`):

```python
def _escape_script(js: str) -> str:
    # Prevent a minified bundle's `</script>` substring from closing the inline
    # <script> tag early. `<\/script` is identical at runtime (in a JS string/
    # regex `<\/` decodes to `</`; it cannot occur as JS syntax elsewhere).
    return re.sub(r"</script", r"<\\/script", js, flags=re.IGNORECASE)


def _escape_style(css: str) -> str:
    return re.sub(r"</style", r"<\\/style", css, flags=re.IGNORECASE)
```

- [ ] **Step 4: Use the helpers in the single-file branch.** In `write_bundle`'s `if single_file:` block, replace these two lines:

```python
        app_js = viewer.joinpath("app.js").read_text()
        app_css = viewer.joinpath("app.css").read_text()
```

with:

```python
        app_js = _escape_script(viewer.joinpath("app.js").read_text())
        app_css = _escape_style(viewer.joinpath("app.css").read_text())
```

- [ ] **Step 5: Run to verify they pass**

Run (from repo root): `python -m pytest -q`
Expected: PASS (47 + 2 new = 49).

- [ ] **Step 6: Commit**

```bash
git add src/pview/bundle.py tests/test_bundle.py
git commit -m "feat: escape </script> and </style> in single-file inlining"
```

---

## Task 2: viewer polish A — isBucketable + search debounce + bar-count format

**Files:**
- Create: `viewer/src/core/facets.ts`
- Modify: `viewer/src/ui/state.ts`, `viewer/src/ui/Topbar.tsx`, `viewer/src/scene/Scene.ts`
- Test: `viewer/test/facets.test.ts`, `viewer/test/Topbar.test.tsx`

**Interfaces:**
- Produces: `isBucketable(facet: Facet) -> boolean` (`category | numeric | date`). Used by `state.ts` and `Topbar.tsx`. Topbar's search debounces `state.query` by 150 ms. `Scene.setBars` formats the count with `toLocaleString`.

- [ ] **Step 1: Write the failing unit test** `viewer/test/facets.test.ts`

```ts
import { it, expect } from 'vitest'
import { isBucketable } from '../src/core/facets'
import type { Facet } from '../src/core/bundle'

it('treats category/numeric/date as bucketable and text as not', () => {
  expect(isBucketable({ name: 'g', type: 'category', values: [] })).toBe(true)
  expect(isBucketable({ name: 'n', type: 'numeric', min: 0, max: 1 })).toBe(true)
  expect(isBucketable({ name: 'd', type: 'date', min: 'a', max: 'b' })).toBe(true)
  expect(isBucketable({ name: 't', type: 'text' } as Facet)).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run (from `viewer/`): `npx vitest run test/facets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `viewer/src/core/facets.ts`**

```ts
import type { Facet } from './bundle'

export function isBucketable(facet: Facet): boolean {
  return facet.type === 'category' || facet.type === 'numeric' || facet.type === 'date'
}
```

- [ ] **Step 4: Use `isBucketable` in `viewer/src/ui/state.ts`.** Add the import at the top:

```ts
import { isBucketable } from '../core/facets'
```

Replace the `bucketable` block:

```ts
  const bucketable = bundle.facets.filter(
    (f) => f.type === 'category' || f.type === 'numeric' || f.type === 'date',
  )
```

with:

```ts
  const bucketable = bundle.facets.filter(isBucketable)
```

- [ ] **Step 5: Use `isBucketable` + add the search debounce in `viewer/src/ui/Topbar.tsx`.** Replace the whole file with:

```tsx
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Bundle } from '../core/bundle'
import { isBucketable } from '../core/facets'
import type { ViewerState } from './state'

export function Topbar({ bundle, state }: { bundle: Bundle; state: ViewerState }) {
  const sortable = bundle.facets.filter((f) => f.type !== 'text' || f.name === bundle.cardFields[0])
  const bucketable = bundle.facets.filter(isBucketable)
  const total = bundle.items.length
  const visible = state.visibleIds.value.size

  const [searchText, setSearchText] = useState(state.query.value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // keep the box in sync when the query is changed externally (e.g. Clear all)
  useEffect(() => {
    setSearchText(state.query.value)
  }, [state.query.value])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const onSearch = (v: string) => {
    setSearchText(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      state.query.value = v
    }, 150)
  }

  return (
    <div class="pview-topbar">
      <span class="pview-topbar-title">{bundle.title}</span>
      <input
        class="pview-search"
        type="search"
        placeholder="Search…"
        value={searchText}
        onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
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
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
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
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
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

- [ ] **Step 6: Update the existing search test for the debounce** in `viewer/test/Topbar.test.tsx`. Replace the test that currently reads `it('typing in search updates the query signal', ...)` with:

```ts
it('debounces the search input before updating the query signal', () => {
  vi.useFakeTimers()
  try {
    const b = bundle()
    const state = createViewerState(b)
    render(<Topbar bundle={b} state={state} />)
    fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'ada' } })
    expect(state.query.value).toBe('') // not written yet
    vi.advanceTimersByTime(160)
    expect(state.query.value).toBe('ada') // written after the debounce
  } finally {
    vi.useRealTimers()
  }
})
```

(Ensure `vi` is imported in this file — it already imports `vi` from vitest for the other tests.)

- [ ] **Step 7: Format the bar count in `viewer/src/scene/Scene.ts`.** Replace the line:

```ts
      t.text = `${bar.label}\n${bar.count}`
```

with:

```ts
      t.text = `${bar.label}\n${bar.count.toLocaleString()}`
```

- [ ] **Step 8: Run to verify pass + typecheck**

Run (from `viewer/`): `npm test` → PASS (facets + updated Topbar + suite). `npm run typecheck` → exit 0.

- [ ] **Step 9: Commit**

```bash
git add viewer/src/core/facets.ts viewer/src/ui/state.ts viewer/src/ui/Topbar.tsx viewer/src/scene/Scene.ts viewer/test/facets.test.ts viewer/test/Topbar.test.tsx
git commit -m "feat(viewer): isBucketable helper, search debounce, formatted bar count"
```

---

## Task 3: viewer polish B — DetailCard focusRect signal + nameKey; App onKey order

**Files:**
- Modify: `viewer/src/ui/DetailCard.tsx`, `viewer/src/ui/App.tsx`
- Test: `viewer/test/DetailCard.test.tsx`

**Interfaces:**
- Produces: `DetailCard` props become `{ item, baseUrl, rect: ReadonlySignal<{cx,cy,size,progress}>, nameKey: string, onClose }` (reads `rect.value` internally so only DetailCard re-renders per frame). `App` passes the `focusRect` signal and `nameKey={bundle.cardFields[0] ?? ''}`, and declares `onKey` before `teardown`.

- [ ] **Step 1: Update the DetailCard tests** `viewer/test/DetailCard.test.tsx` — replace its body with:

```tsx
// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { signal } from '@preact/signals'
import { DetailCard } from '../src/ui/DetailCard'
import type { Item } from '../src/core/bundle'

afterEach(() => cleanup())

const rect = () => signal({ cx: 100, cy: 100, size: 300, progress: 1 })

function item(detail: string | null): Item {
  return { id: 0, values: { name: 'Ada', age: 36 }, atlas: 0, rect: [0, 0, 1, 1], detail }
}

it('renders the detail image when the item has a detail url', () => {
  render(<DetailCard item={item('detail/0.png')} baseUrl="./" rect={rect()} nameKey="name" onClose={() => {}} />)
  const img = document.querySelector('img')
  expect(img).not.toBeNull()
  expect(img!.getAttribute('src')).toBe('./detail/0.png')
})

it('renders a generated header (no img) showing the nameKey value for a detail-less item', () => {
  render(<DetailCard item={item(null)} baseUrl="./" rect={rect()} nameKey="name" onClose={() => {}} />)
  expect(document.querySelector('img')).toBeNull()
  const header = document.querySelector('.pview-detail-generated')
  expect(header).not.toBeNull()
  expect(header!.textContent).toContain('Ada')
})

it('renders all attribute rows and a working close button', () => {
  const onClose = vi.fn()
  render(<DetailCard item={item('detail/0.png')} baseUrl="./" rect={rect()} nameKey="name" onClose={onClose} />)
  expect(screen.getByText('name')).toBeTruthy()
  expect(screen.getByText('age')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onClose).toHaveBeenCalled()
})

it('falls back to the generated header when the detail image errors', () => {
  render(<DetailCard item={item('detail/0.png')} baseUrl="./" rect={rect()} nameKey="name" onClose={() => {}} />)
  const img = document.querySelector('img') as HTMLImageElement
  fireEvent.error(img)
  expect(document.querySelector('img')).toBeNull()
  expect(document.querySelector('.pview-detail-generated')).not.toBeNull()
})
```

- [ ] **Step 2: Run to verify they fail**

Run (from `viewer/`): `npx vitest run test/DetailCard.test.tsx`
Expected: FAIL — `rect` is now a signal / `nameKey` not a prop; type errors / runtime mismatches.

- [ ] **Step 3: Update `viewer/src/ui/DetailCard.tsx`** — replace the whole file with:

```tsx
import { useEffect, useState } from 'preact/hooks'
import type { ReadonlySignal } from '@preact/signals'
import type { Item } from '../core/bundle'
import { resolveAtlasUrl } from '../scene/urls'
import { generatedColor } from '../core/cardcolor'

interface Props {
  item: Item
  baseUrl: string
  rect: ReadonlySignal<{ cx: number; cy: number; size: number; progress: number }>
  nameKey: string
  onClose: () => void
}

export function DetailCard({ item, baseUrl, rect, nameKey, onClose }: Props) {
  const [imgError, setImgError] = useState(false)
  // Reset the broken-image flag when a different item is shown — the parent
  // patches one DetailCard instance across selections, so a prior error must
  // not suppress the next item's image.
  useEffect(() => {
    setImgError(false)
  }, [item.id])

  const r = rect.value // read the signal here so only DetailCard re-renders per frame
  const width = Math.max(240, Math.min(r.size, 520))
  const opacity = Math.max(0, Math.min(1, (r.progress - 0.3) / 0.5))
  const headerName = String(item.values[nameKey] ?? item.values[Object.keys(item.values)[0]] ?? '')

  return (
    <div
      class="pview-detail"
      style={{
        left: `${r.cx}px`,
        top: `${r.cy}px`,
        width: `${width}px`,
        transform: 'translate(-50%, -50%)',
        opacity: String(opacity),
      }}
    >
      <button type="button" class="pview-detail-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div class="pview-detail-image">
        {item.detail && !imgError ? (
          <img src={resolveAtlasUrl(item.detail, baseUrl)} alt={headerName} onError={() => setImgError(true)} />
        ) : (
          <div class="pview-detail-generated" style={{ background: generatedColor(item.id) }}>
            {headerName}
          </div>
        )}
      </div>
      <dl class="pview-detail-attrs">
        {Object.entries(item.values).map(([k, v]) => (
          <div class="pview-detail-row" key={k}>
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
```

- [ ] **Step 4: Update `viewer/src/ui/App.tsx`.** Two edits:

(a) Move the `onKey` declaration above `teardown` (which references it). Replace this block:

```ts
    const disposers: Array<() => void> = []
    const teardown = () => {
      if (destroyed) return
      destroyed = true
      for (const d of disposers) d()
      window.removeEventListener('keydown', onKey)
      scene.destroy()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.selectedId.value = null
    }
    window.addEventListener('keydown', onKey)
```

with:

```ts
    const disposers: Array<() => void> = []
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.selectedId.value = null
    }
    const teardown = () => {
      if (destroyed) return
      destroyed = true
      for (const d of disposers) d()
      window.removeEventListener('keydown', onKey)
      scene.destroy()
    }
    window.addEventListener('keydown', onKey)
```

(b) Pass the `focusRect` signal (not `.value`) and the `nameKey` to `DetailCard`. Replace the render block:

```tsx
      {selectedItem && (
        <DetailCard
          item={selectedItem}
          baseUrl={baseUrl}
          rect={focusRect.value}
          onClose={() => (state.selectedId.value = null)}
        />
      )}
```

with:

```tsx
      {selectedItem && (
        <DetailCard
          item={selectedItem}
          baseUrl={baseUrl}
          rect={focusRect}
          nameKey={bundle.cardFields[0] ?? ''}
          onClose={() => (state.selectedId.value = null)}
        />
      )}
```

- [ ] **Step 5: Run to verify pass + typecheck**

Run (from `viewer/`): `npx vitest run test/DetailCard.test.tsx` → PASS. `npm test` → all green. `npm run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/ui/DetailCard.tsx viewer/src/ui/App.tsx viewer/test/DetailCard.test.tsx
git commit -m "feat(viewer): localize DetailCard re-render via focusRect signal; explicit name key"
```

---

## Task 4: Build + commit the real viewer_assets (ship)

**Files:**
- Modify (commit the build output): `src/pview/viewer_assets/{app.js,app.css,index.html}`

**Interfaces:**
- Produces: the committed package now contains the real built viewer (no placeholder).

- [ ] **Step 1: Build the real assets** (from `viewer/`, clean install to match CI):

```bash
npm ci
npm run build
```
Expected: writes `../src/pview/viewer_assets/app.js` (a large IIFE, hundreds of KB), `app.css`, and `index.html` (the production template referencing `./app.js`/`./app.css`).

- [ ] **Step 2: Verify the output is the real viewer, not the placeholder** (from the repo root):

```bash
test "$(wc -c < src/pview/viewer_assets/app.js)" -gt 10000 && echo APP_JS_REAL
grep -q 'src="./app.js"' src/pview/viewer_assets/index.html && echo INDEX_REAL
grep -q 'pview placeholder' src/pview/viewer_assets/app.js && echo "STILL PLACEHOLDER (bad)" || echo "NOT PLACEHOLDER (good)"
```
Expected: `APP_JS_REAL`, `INDEX_REAL`, `NOT PLACEHOLDER (good)`.

- [ ] **Step 3: Verify the Python suite is green against the real assets** (from the repo root):

Run: `python -m pytest -q`
Expected: PASS (49) — the structural single-file test (Task 1) and the `</script>` escaping (Task 1) handle the real minified bundle.

- [ ] **Step 4: End-to-end render check** (from the repo root) — a real folder bundle and a single-file bundle both build with the real viewer, and the single-file data script is intact:

```bash
python3 - <<'PY'
import tempfile, os, re, json, pandas as pd
from PIL import Image
import sys; sys.path.insert(0, "src")
from pview import build
d = tempfile.mkdtemp()
p = os.path.join(d, "a.png"); Image.new("RGB", (64, 64), (200, 60, 60)).save(p)
df = pd.DataFrame({"name": ["A", "B"], "g": ["x", "y"], "age": [10, 20], "photo": [p, ""]})
# folder
out = build(df, name_col="name", image_col="photo", out_dir=os.path.join(d, "site"))
for f in ("index.html", "app.js", "app.css", "data.json"):
    assert (out / f).exists(), f
assert "pview placeholder" not in (out / "app.js").read_text()
# single-file: the inlined data JSON survives the real (maybe </script>-bearing) app.js
sf = build(df, name_col="name", image_col="photo", out_dir=os.path.join(d, "sf"), single_file=True)
html = sf.read_text()
m = re.search(r"<script id='pview-data' type='application/json'>(.*?)</script>", html, re.S)
assert m, "data script not found / broken by app.js inlining"
assert len(json.loads(m.group(1))["items"]) == 2
print("SHIP_OK")
PY
```
Expected: prints `SHIP_OK`.

- [ ] **Step 5: Commit the real assets** (from the repo root):

```bash
git add src/pview/viewer_assets/app.js src/pview/viewer_assets/app.css src/pview/viewer_assets/index.html
git commit -m "feat: ship the real built viewer (commit viewer_assets)"
git status --porcelain
```
Expected: the commit succeeds; `git status` is clean.

---

## Task 5: GitHub Actions CI + staleness guard

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: CI that runs both suites and a build-staleness check on every push/PR.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install ".[dev,cli]"
      - run: python -m pytest -q

  viewer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
        working-directory: viewer
      - run: npm test
        working-directory: viewer
      - run: npm run typecheck
        working-directory: viewer
      - run: npm run build
        working-directory: viewer
      # Staleness guard: the committed viewer_assets/ must equal a fresh build.
      # If minified output ever proves non-deterministic across environments,
      # relax this to: `test -s src/pview/viewer_assets/app.js` (+ app.css/index.html).
      - name: viewer_assets is up to date
        run: git diff --exit-code -- src/pview/viewer_assets
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run (from repo root): `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML OK')"`
Expected: prints `YAML OK`. (If PyYAML is not installed, run `pip install pyyaml` first, or visually confirm the indentation; the workflow is validated for real when GitHub runs it on push.)

- [ ] **Step 3: Confirm the staleness check would pass locally** (the committed assets from Task 4 equal a fresh build):

Run (from `viewer/`): `npm run build`. Then (from the repo root): `git diff --exit-code -- src/pview/viewer_assets && echo STALENESS_OK`
Expected: prints `STALENESS_OK` (no diff — the committed assets match a fresh build). If there IS a diff here, the Task-4 assets weren't built cleanly; rebuild with `npm ci && npm run build` in `viewer/` and amend Task 4's commit before continuing.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run both test suites + viewer build-staleness guard"
```

---

## Self-Review

**Spec coverage (M5 design → tasks):**
- Single-file `</script>`/`</style>` escaping → Task 1. ✓
- Placeholder test → structural → Task 1. ✓
- Build + commit the real viewer (ship) → Task 4. ✓
- Shared `isBucketable` → Task 2. ✓
- Search debounce → Task 2. ✓
- Bar-count `toLocaleString` → Task 2. ✓
- DetailCard focusRect-signal localization → Task 3. ✓
- Explicit detail-card name key → Task 3. ✓
- `onKey`/teardown order → Task 3. ✓
- GitHub Actions CI + staleness guard → Task 5. ✓
- Testing: escaping (1), isBucketable (2), debounce (2, fake timers), DetailCard (3), Scene/App typecheck, end-to-end ship check (4), CI YAML + local staleness dry-run (5). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `isBucketable` (2) consumed by `state.ts`/`Topbar.tsx` (2); `DetailCard` props `rect: ReadonlySignal<...>` + `nameKey` (3) match `App`'s passed `focusRect` signal + `bundle.cardFields[0]` (3); the `{cx,cy,size,progress}` shape is unchanged (now wrapped in a signal). `_escape_script`/`_escape_style` (1) used in `write_bundle` (1). Task order (1→2→3→4→5) ensures the committed assets (4) reflect final source and the staleness check (5) passes.

**Notes:**
- Task 4 is the milestone's intentional commit of built assets — there is no "restore the placeholder" step (that pattern ends here).
- The CI staleness check's reproducibility depends on byte-stable builds; the workflow documents the relax-to-presence-check fallback inline. CI runs for real only when the branch is pushed (at merge) — the local dry-run in Task 5 Step 3 is the best pre-merge signal.
