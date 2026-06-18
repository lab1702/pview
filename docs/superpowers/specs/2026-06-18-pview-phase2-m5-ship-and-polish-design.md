# pview Phase 2 — M5: Ship the Real Viewer + CI + Polish Design

**Status:** Design approved (2026-06-18)
**Depends on:** Phase 1, Phase 2 M0–M4, all merged.
**Parent spec:** `docs/superpowers/specs/2026-06-17-pview-phase2-viewer-design.md` (M5 milestone — the finale).
**Scope:** Make `pip install pview` ship the *real* viewer (build + commit `viewer_assets/`, replacing the placeholder), harden single-file inlining, add GitHub Actions CI with a build-staleness guard, and clear the accumulated polish backlog. This completes Phase 2.

## Summary

Through M4 the package still ships a 115-byte placeholder `viewer_assets/`; the real viewer renders only after a local `npm run build`. M5 commits the real built assets so the published package works out of the box. Committing a large minified `app.js` forces a robustness fix: `bundle.py`'s single-file mode inlines `app.js`/`app.css` raw into `<script>`/`<style>`, so any `</script>`/`</style>` substring must be escaped. The Python tests coupled to the placeholder string become structural. A GitHub Actions workflow runs both test suites and a rebuild-and-diff staleness check so the committed assets can't drift from `viewer/src`. Finally, the polish backlog accumulated across M1–M4 is cleared.

## Goals

- **Ship the real viewer**: `viewer_assets/` holds the built `app.js`/`app.css`/`index.html`, committed; `pip install pview` renders the actual viewer in both folder and single-file bundles.
- **Harden single-file inlining**: escape `</script>` in inlined `app.js` and `</style>` in inlined `app.css`.
- **CI + staleness guard**: a GitHub Actions workflow running Python `pytest`, viewer `vitest` + `typecheck`, and a `npm run build` + `git diff --exit-code` staleness check on `src/pview/viewer_assets/`.
- **Polish**: shared `isBucketable`; search debounce; bar-count `toLocaleString`; `DetailCard` focusRect-signal localization; explicit detail-card name key; `onKey`/teardown order.

## Non-goals (M5)

- Hover tooltips, next/prev keyboard nav, DOM-overlay axis labels, multi-resolution detail — out of Phase 2 entirely (future work).
- Publishing to PyPI (the package builds a correct wheel; actually publishing is a separate manual step).
- Changing the bundle format or any viewer feature behavior.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| M5 scope | Ship real viewer + CI/staleness + full polish backlog |
| Staleness guard | GitHub Actions CI (build + `git diff --exit-code`), also runs both test suites |

## Area A — Ship the real viewer

### `bundle.py` single-file hardening
The single-file path inlines `app_js` as `<script>{app_js}</script>` and `app_css` as `<style>{app_css}</style>`. A real minified `app.js` (third-party Pixi/Preact code) can contain the substring `</script>` in a string/regex literal, which would close the tag early and break the page; `app_css` is our own small authored CSS and won't legitimately contain `</style>`, but we escape it for defense-in-depth.

The HTML parser ends a `<script>`/`<style>` element when it scans the literal byte sequence `</script` / `</style` (case-insensitive), regardless of JS/CSS syntax. Inserting a backslash so the bytes become `<\/script` / `<\/style` means the parser never sees the closer, while the runtime is unaffected (`<\/` in a JS string/regex decodes to `</`; the sequence cannot occur as JS *syntax* outside such literals, so the replace is harmless there; our CSS never contains `</style`, so its replace is a no-op in practice).

**Implementation:** before embedding, case-insensitively replace `</script` → `<\/script` in `app_js` and `</style` → `<\/style` in `app_css` (e.g. `re.sub(r"</script", r"<\\/script", app_js, flags=re.I)`). The JSON `#pview-data` payload already replaces every `<` with the JSON unicode escape `<` (the existing M0 single-file behavior), so the data script is unaffected.

**Tested:** a synthetic `app_js` containing `</script>` and `app_css` containing `</style>` are escaped in the emitted single-file HTML — assert the raw breakout sequences are absent and the escaped forms present.

### Placeholder-coupled tests → structural
`tests/test_bundle.py`'s single-file test currently asserts `"pview placeholder loaded" in html`. Replace that with structural assertions that hold for any viewer payload: the inlined data script (`id='pview-data'`) and the app script tag are present, and the `#app` mount exists. This survives the switch to the real bundle.

### Build + commit the real assets
Run `npm ci && npm run build` in `viewer/`; commit the resulting `src/pview/viewer_assets/{app.js,app.css,index.html}` (this is the milestone where committing built assets is intentional — the `apply:'build'` plugin and the "restore the placeholder" dance end here). After this, the committed package renders the real viewer.

### End-to-end verification
A real `pview build` folder bundle and a `--single-file` bundle both open and render the actual viewer (manual dev/file check); the existing 47 Python tests pass against the real (non-placeholder) assets.

## Area B — GitHub Actions CI

`.github/workflows/ci.yml`, triggered on `push` and `pull_request`:

- **Job `python`** (ubuntu-latest): `actions/checkout`; `actions/setup-python` (3.12); `pip install ".[dev,cli]"`; `python -m pytest -q`.
- **Job `viewer`** (ubuntu-latest): `actions/checkout`; `actions/setup-node@v4` (node-version 22); `cd viewer && npm ci`; `npm test`; `npm run typecheck`; `npm run build`; then from the repo root `git diff --exit-code -- src/pview/viewer_assets` (the **staleness check** — fails if the committed assets differ from this fresh build).

Reproducibility: deps are lockfile-pinned (`npm ci`) and Node is pinned to 22, so the Vite/rolldown output is expected to be byte-stable across environments. If cross-environment minification ever proves non-deterministic, the staleness step relaxes to asserting the build succeeded and the three asset files exist and are non-trivial (documented in the workflow). The committed assets in Area A must be built with the same Node 22 + `npm ci` to match CI.

## Area C — Polish backlog

- **Shared `isBucketable`** — `core/facets.ts` (new) exports `isBucketable(facet: Facet): boolean` (`category | numeric | date`). `state.ts` (default `histogramFacet`) and `Topbar.tsx` (bucketable list) both use it. Unit-tested.
- **Search debounce (~150 ms)** — the Topbar search input updates a local value immediately (controlled input) and writes `state.query` through a 150 ms debounce (a timer ref cleared on each keystroke and on unmount). Component-tested with `vi.useFakeTimers()`.
- **Bar-count `toLocaleString`** — `Scene.setBars` renders `${label}\n${count.toLocaleString()}`, matching the Topbar "N of M" formatting.
- **`DetailCard` focusRect localization** — `App` passes the `focusRect` *signal* (typed `ReadonlySignal<{cx,cy,size,progress}>`) to `DetailCard`, which reads `rect.value` internally. The App's render no longer reads `focusRect.value`, so it doesn't re-render (nor re-run the `selectedItem` lookup) on every fly-in frame; only `DetailCard` updates. The DetailCard component test passes a real signal.
- **Explicit detail-card name key** — `App` passes `nameKey={bundle.cardFields[0]}`; `DetailCard`'s generated header shows `item.values[nameKey]` instead of `Object.keys(item.values)[0]`.
- **`onKey`/teardown order** — `onKey` is declared before `teardown` (which references it) in `App.tsx`.

## Error handling / edge cases

- **CI staleness false-positive** from non-deterministic minification → the documented fallback (presence/non-trivial-size check) keeps CI meaningful without flaking.
- **Single-file with a `</script>`-bearing bundle** → escaped (Area A), verified by test.
- **Debounce timer leak** → cleared on each keystroke and on component unmount.
- **`bundle.cardFields[0]` empty** (no card fields) → `DetailCard` falls back to the first `values` key (guarded).

## Testing strategy

- **Python:** `bundle.py` `</script>`/`</style>` escaping (synthetic payloads); the updated structural single-file test; full suite green against the real committed assets.
- **Viewer unit:** `isBucketable` (each facet type).
- **Viewer component (jsdom + @testing-library/preact, sync `afterEach(cleanup)`):** search debounce (fake timers: typing doesn't write `query` until 150 ms elapse); `DetailCard` with a `focusRect` signal + `nameKey` (header shows the right name; image/attrs/close still correct).
- **Scene/App** (`toLocaleString`, focusRect signal wiring, onKey order) → typecheck + the build-and-render check.
- **CI** → validated by the workflow running on push (and a local `npm run build` + `git diff` dry-run before committing).

## Milestone task breakdown (informs the plan)

1. **`bundle.py` single-file `</script>`/`</style>` escaping + structural placeholder-test update** (Python; + escaping test).
2. **Viewer polish A** — `core/facets.ts` `isBucketable` wired into `state.ts`/`Topbar.tsx`; search debounce; bar-count `toLocaleString` (+ unit/component tests).
3. **Viewer polish B** — `DetailCard` focusRect-signal localization + `nameKey`; `App` `onKey` reorder (+ component test).
4. **Build + commit the real `viewer_assets/`** (the ship step) — `npm ci && npm run build`, commit the real assets, end-to-end render check, full Python suite green.
5. **CI workflow** (`.github/workflows/ci.yml`) — added after the real assets so the staleness check passes; includes the documented relax-fallback note.

## Open questions / deferred (post–Phase 2)

- PyPI publish workflow (tag → build → publish) — a future addition once Phase 2 is shipped.
- Hover tooltips, next/prev nav, DOM-overlay axis, multi-res detail — future feature work, not Phase 2.
