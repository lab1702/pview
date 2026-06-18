# pview — a PivotViewer-like collection viewer for Python

**Status:** Design approved (2026-06-17)
**Scope of this spec:** Phase 1 — the Python build pipeline and the bundle format contract. The interactive viewer is Phase 2 and will get its own spec.

## Summary

`pview` is a Python package that turns a table of items and attributes (e.g. people with name, age, gender, optional photo) into a **self-contained, interactive, browser-based collection viewer** inspired by Microsoft's old PivotViewer. The viewer lets a user filter by facets, sort items into a grid, stack them into a histogram grouped by a facet, search, and zoom into a single item's details — with smooth animated transitions between layouts.

The system has two units joined by one contract:

1. **The Python build pipeline** (`pview`) — takes a pandas DataFrame (or CSV/Excel via CLI), infers facet types, acquires or generates a card image per item, packs those images into texture atlases, and writes a **bundle** (data JSON + atlases + the prebuilt viewer).
2. **The JS viewer** (prebuilt, shipped inside the wheel) — loads a bundle and runs the interactive canvas UI.

The **bundle format** is the contract between them. This spec defines Phase 1 (the pipeline + the bundle format). Phase 2 (the viewer) is sketched only enough to validate that the bundle format supports it.

## Goals

- Input: a pandas DataFrame, or CSV/Excel through a CLI wrapper.
- Auto-infer each attribute's facet type (numeric / date / category / text), with optional per-column overrides.
- Optional per-item image from a **local path or http(s) URL**.
- When no image is available (or it fails to load), **generate a fallback card** showing the item's name plus a user-specified subset of attributes as text.
- Emit a **self-contained bundle**: a folder by default (`index.html` + assets, no server needed), or a single `.html` file on request.
- Target scale: **20,000+ items**, rendered smoothly with animated transitions (a Phase-2 concern, but the pipeline must produce atlas-based output that makes it feasible).

## Non-goals (Phase 1)

- The interactive viewer's internals (Phase 2, separate spec).
- Live/streaming data, server-side hosting, authentication.
- Editing data in the viewer.

## Architecture & repo layout

```
pview/                          # the repo (uv/pip Python package)
├── pyproject.toml
├── docs/superpowers/specs/
├── src/pview/
│   ├── __init__.py             # public API: build(df, ...) -> Path
│   ├── facets.py               # infer facet types + apply overrides
│   ├── images.py               # acquire (local/URL) + generate fallback cards
│   ├── atlas.py                # pack card images into atlas sheets (Pillow)
│   ├── bundle.py               # serialize data + atlases + viewer to output
│   ├── cli.py                  # `pview build data.csv ...` (CSV/Excel -> df -> build())
│   ├── assets/fonts/           # bundled TTF font for generated cards
│   └── viewer_assets/          # PREBUILT viewer (index.html, app.js, app.css) shipped in the wheel
└── viewer/                     # TS + PixiJS source (dev-only; not shipped). Built into src/pview/viewer_assets/.
    ├── package.json, vite.config.ts, src/...
```

- **End-user runtime dependencies:** Python, Pillow, pandas (+ `requests` or `httpx` for URL fetch; `openpyxl` for Excel in the CLI). The viewer is already compiled into `viewer_assets/`. **No Node needed to use pview** — only to develop the viewer.
- **Data flow:** `build(df)` → infer facets → for each row acquire-or-generate a card image → pack atlases → write bundle → return output path.

## The bundle format (the contract)

A folder bundle:

```
my_collection/
├── index.html              # the prebuilt viewer shell
├── app.js, app.css         # prebuilt viewer code
├── data.json               # collection metadata + per-item records + facet schema
└── atlas/
    ├── atlas_0.png ...      # packed card images (e.g. 2048x2048 sheets)
```

`data.json`:

```jsonc
{
  "version": 1,
  "title": "People",
  "tileSize": 256,
  "facets": [
    {"name": "age",    "type": "numeric",  "min": 0, "max": 99},
    {"name": "gender", "type": "category", "values": ["female", "male", "other"]},
    {"name": "joined", "type": "date",     "min": "2010-01-01", "max": "2026-06-17"},
    {"name": "name",   "type": "text"}
  ],
  "cardFields": ["name", "age"],   // fields drawn on generated fallback cards
  "atlases": [
    {"file": "atlas/atlas_0.png", "width": 2048, "height": 2048}
  ],
  "items": [
    {
      "id": 0,
      "values": {"name": "Ada", "age": 36, "gender": "female", "joined": "2011-04-01"},
      "atlas": 0,                  // index into atlases[]
      "rect": [0, 0, 256, 256]     // x, y, w, h within that sheet
    }
  ]
}
```

Key decision: **every card — real image or generated — is normalized to a fixed tile size (default 256×256) and packed into atlases.** The viewer treats all items uniformly as GPU sprites textured from atlas rects, and never needs the original image files.

Single-file mode: the same `index.html`, with `app.js`, `app.css`, and atlas PNGs base64-inlined (atlases referenced as data URIs; `data.json` inlined as a `<script>` payload).

## Python pipeline components

### `facets.py` — `infer_facets(df, overrides=None) -> list[Facet]`

- Inference rules:
  - numeric dtype → `numeric` (compute `min`/`max`).
  - datetime dtype → `date` (compute `min`/`max` as ISO strings).
  - bool, or object/string with low cardinality → `category` (collect sorted distinct `values`).
  - object/string with high cardinality (above a threshold, e.g. > 50 distinct or > 50% unique) → `text` (searchable, not checkbox-filterable).
- `overrides` is a dict like `{"zip": "category", "age": "numeric"}` forcing a column's type. An override naming a nonexistent column, or incompatible with the data, raises `ValueError`.
- The `name_col` is always available as a `text` facet (used for search and labels). The `image_col`, if given, is consumed for art and is **not** emitted as a facet.

### `images.py` — one row → one normalized RGBA tile

- If `image_col` has a usable value:
  - local path → open with Pillow.
  - `http(s)://` → download (timeout + one retry; cached on disk keyed by URL hash to make rebuilds fast). Decode.
  - Fit/crop to `tile_size` × `tile_size`.
- If missing/blank/failed → **generate a fallback card**: render the name (large, wrapped) plus each `card_fields` attribute as `label: value` lines, onto a `tile_size` tile, using the bundled TTF font and a deterministic background color seeded from the item id (varied but stable across rebuilds).
- Any image error degrades to a generated card and records a warning; a single bad image never aborts the build.

### `atlas.py` — `pack(tiles, tile_size, sheet_size=2048) -> (atlas_images, placements)`

- All tiles are the same size, so packing is a trivial grid/shelf packer. Fill fixed-size sheets (e.g. 2048×2048 = 64 tiles at 256px), spilling to additional sheets as needed.
- Returns each item's `(atlas_index, rect)` and the list of atlas `PIL.Image`s.

### `bundle.py` — `write_bundle(items, facets, atlases, out_dir, *, title, card_fields, tile_size, single_file=False)`

- Folder mode: copy `viewer_assets/`, write `data.json`, write atlas PNGs under `atlas/`.
- Single-file mode: base64-inline atlases + `app.js`/`app.css` + `data.json` into one `index.html`.

### `__init__.py` — public API

```python
build(
    df,
    *,
    name_col,
    image_col=None,
    card_fields=None,        # defaults to [name_col]
    facets=None,             # type overrides dict
    title=None,
    out_dir,
    single_file=False,
    tile_size=256,
) -> Path
```

### `cli.py`

```
pview build data.csv \
  --name-col name --image-col photo \
  --card-fields name,age \
  --title People \
  --out ./site [--single-file]
```

Reads CSV/Excel via pandas, maps flags to `build()`.

## The viewer (Phase 2 — high-level only)

Sketched here only to confirm the bundle format supports it; full design deferred to its own spec.

- **PixiJS** (WebGL) scene, one sprite per item, textured from atlas PNGs using each item's `rect` as a texture frame.
- **Layout engine** computes target x/y/scale per sprite for the active view — **grid** (sorted) or **histogram** (bucketed by a chosen facet into bars). A tween system animates every sprite from current → target on each view/filter/sort change (the signature fly-and-repack effect).
- **Filter sidebar** built from `facets`: checkboxes for `category`, range sliders for `numeric`/`date`, a **search** box over `text` fields. Filtered-out items animate out; the rest re-pack.
- **Zoom/pan** the canvas; click an item to open a **detail pane** with full `values` and its tile.

The approved bundle format supports all of this: sprites (atlas + rect), facet schema (sidebar), per-item `values` (search, histogram bucketing, detail pane).

## Error handling

- Bad/missing image → generated fallback card + warning; never abort.
- Unreachable URL / timeout → retry once, then generated card + warning.
- Bad facet override (missing column / incompatible type) → `ValueError` early (user config; worth failing on).
- Empty DataFrame or missing `name_col` → `ValueError` with a clear message.
- `build()` logs a summary: N items, M generated cards, K image failures, atlas count.

## Testing strategy

- **TDD throughout.** Unit tests:
  - facet inference for each dtype + overrides (including override error cases).
  - fallback-card generation is deterministic given a seed.
  - atlas packing: correct rects, correct spill to multiple sheets.
  - bundle writing: folder structure and single-file structure.
  - CLI arg mapping → `build()` kwargs.
- **Image acquisition** tested with local fixtures and a mocked HTTP layer (no live network in tests).
- **Golden test:** a small sample DataFrame → assert bundle folder structure and `data.json` schema validity.
- Viewer (Phase 2) gets its own test strategy in its spec.

## Open questions / deferred

- Exact high-cardinality threshold for `text` vs `category` — start with a sane default, make it tunable later.
- Histogram bucketing strategy for numeric/date facets — a Phase-2 concern.
- Whether to support additional input formats (Parquet, JSON) in the CLI — deferred until requested.
