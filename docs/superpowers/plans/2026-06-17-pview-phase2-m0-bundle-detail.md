# pview Phase 2 — M0: Bundle Detail Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Phase-1 Python pipeline to store each item's original full-resolution image in the bundle under `detail/`, referenced per item, so the Phase-2 viewer can render crisp semantic zoom — and bump the bundle format to `version 2`.

**Architecture:** `load_tile` is refactored to return a small `LoadedImage` dataclass carrying the normalized tile *plus* the original source bytes and file extension. The `build` orchestrator collects those originals into a `details` map and passes it to `write_bundle`, which writes `detail/<id>.<ext>` (folder mode) or inlines a base64 data URI (single-file mode) and sets each item's new `detail` field. `version` becomes `2`.

**Tech Stack:** Python 3.11+, Pillow, pandas, pytest (unchanged from Phase 1).

## Global Constraints

- Bundle `version` becomes `2` (was `1`). The viewer treats a missing `detail` as `null`, so this is backward-compatible.
- Each item gains a `detail` field: a relative path `"detail/<id>.<ext>"` in folder mode, a `"data:<mime>;base64,..."` URI in single-file mode, or `null` for generated-card items (no source image).
- Detail originals are the **raw source bytes**, preserved byte-for-byte (no recompression).
- Generated-card items store no detail original (`detail: null`); the viewer re-renders their detail from `values` later.
- Single-file mode inlines detail originals as data URIs (self-contained; documented as best for small collections).
- TDD: failing test first → watch it fail → minimal implementation → watch it pass → commit.
- Run tests with `python -m pytest`. The suite must stay pristine (0 warnings); verify with `python -m pytest -q -W error::DeprecationWarning`.
- Do not use deprecated Pillow APIs (e.g. `Image.getdata()`).

---

## File Structure

| File | Change |
|------|--------|
| `src/pview/images.py` | `load_tile` returns `LoadedImage` (tile + original bytes + ext); add `_ext_for` + format map |
| `src/pview/__init__.py` | orchestrator consumes `LoadedImage`, collects `details`, passes to `write_bundle` |
| `src/pview/bundle.py` | `write_bundle` gains `details` param; writes/inlines detail; `version` → 2; sets `item["detail"]` |
| `tests/test_images_load.py` | rewritten to the `LoadedImage` API + original/ext assertions |
| `tests/test_bundle.py` | `version` → 2; new folder + single-file detail tests |
| `tests/test_build.py` | new end-to-end detail tests |

---

## Task 1: `load_tile` returns the original image (LoadedImage)

**Files:**
- Modify: `src/pview/images.py`
- Modify: `src/pview/__init__.py` (orchestrator unpacking only — keeps the suite green; detail wiring is Task 3)
- Test: `tests/test_images_load.py` (full rewrite)

**Interfaces:**
- Consumes: existing `generate_card`, `_fetch_url`, `_normalize`, `_default_http_get`.
- Produces:
  - `LoadedImage` dataclass: `tile: PIL.Image.Image`, `generated: bool`, `error: str | None`, `original: bytes | None = None`, `ext: str | None = None`.
  - `load_tile(value, *, item_id, name, fields, tile_size=256, font_path=None, cache_dir=None, http_get=None) -> LoadedImage`. `original`/`ext` are set only when a real source image loaded successfully; both `None` when a fallback card was generated.

- [ ] **Step 1: Write the failing tests** — replace the entire contents of `tests/test_images_load.py` with:

```python
import io

from PIL import Image

from pview.images import load_tile


def _png_bytes(color=(10, 20, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="PNG")
    return buf.getvalue()


def test_local_image_is_loaded_and_resized(tmp_path):
    p = tmp_path / "x.png"
    p.write_bytes(_png_bytes())
    r = load_tile(str(p), item_id=0, name="Ada", fields=[], tile_size=32)
    assert r.tile.size == (32, 32)
    assert r.tile.mode == "RGBA"
    assert r.generated is False
    assert r.error is None
    assert r.original == p.read_bytes()
    assert r.ext == ".png"


def test_missing_value_generates_card():
    r = load_tile(None, item_id=1, name="Ada", fields=[("age", "36")], tile_size=32)
    assert r.tile.size == (32, 32)
    assert r.generated is True
    assert r.error is None
    assert r.original is None
    assert r.ext is None


def test_bad_local_path_generates_card_with_error(tmp_path):
    r = load_tile(str(tmp_path / "nope.png"), item_id=2, name="Ada", fields=[], tile_size=32)
    assert r.generated is True
    assert r.error is not None
    assert r.tile.size == (32, 32) and r.tile.mode == "RGBA"
    assert r.original is None and r.ext is None


def test_url_is_fetched_via_injected_getter():
    calls = []

    def fake_get(url):
        calls.append(url)
        return _png_bytes((1, 2, 3))

    r = load_tile(
        "https://example.com/a.png", item_id=3, name="Ada", fields=[], tile_size=32, http_get=fake_get
    )
    assert calls == ["https://example.com/a.png"]
    assert r.generated is False
    assert r.error is None
    assert r.original == _png_bytes((1, 2, 3))
    assert r.ext == ".png"


def test_url_failure_generates_card_with_error():
    def boom(url):
        raise RuntimeError("network down")

    r = load_tile(
        "http://example.com/a.png", item_id=4, name="Ada", fields=[], tile_size=32, http_get=boom
    )
    assert r.generated is True
    assert "network down" in r.error
    assert r.tile.size == (32, 32) and r.tile.mode == "RGBA"


def test_url_retries_once_then_succeeds():
    calls = []

    def flaky(url):
        calls.append(url)
        if len(calls) == 1:
            raise RuntimeError("transient")
        return _png_bytes((4, 5, 6))

    r = load_tile(
        "https://example.com/a.png", item_id=9, name="Ada", fields=[], tile_size=32, http_get=flaky
    )
    assert len(calls) == 2
    assert r.generated is False
    assert r.error is None
    assert r.original == _png_bytes((4, 5, 6))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_images_load.py -v`
Expected: FAIL — `load_tile` currently returns a tuple, so attribute access like `r.tile` raises `AttributeError: 'tuple' object has no attribute 'tile'`.

- [ ] **Step 3: Implement `LoadedImage` and refactor `load_tile`** in `src/pview/images.py`.

Add `from dataclasses import dataclass` to the imports at the top (next to `import colorsys`). Then add this dataclass and helper just below the existing imports (above `_default_font_path`):

```python
_FORMAT_EXT = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "GIF": ".gif",
    "WEBP": ".webp",
    "BMP": ".bmp",
    "TIFF": ".tiff",
}


@dataclass
class LoadedImage:
    tile: Image.Image
    generated: bool
    error: str | None
    original: bytes | None = None
    ext: str | None = None


def _ext_for(img_format: str | None, local_path: str | None) -> str:
    if local_path:
        suffix = Path(local_path).suffix.lower()
        if suffix:
            return suffix
    return _FORMAT_EXT.get((img_format or "").upper(), ".png")
```

Then replace the entire existing `load_tile` function with:

```python
def load_tile(
    value: str | None,
    *,
    item_id: int,
    name: str,
    fields: list[tuple[str, str]],
    tile_size: int = 256,
    font_path: str | None = None,
    cache_dir: Path | None = None,
    http_get: Callable[[str], bytes] | None = None,
) -> LoadedImage:
    import io

    blank = value is None or (isinstance(value, str) and value.strip() == "")
    if not blank:
        http_get = http_get or _default_http_get
        try:
            sval = str(value)
            if sval.startswith(("http://", "https://")):
                raw = _fetch_url(sval, cache_dir, http_get)
                local_path = None
            else:
                raw = Path(sval).read_bytes()
                local_path = sval
            img = Image.open(io.BytesIO(raw))
            img.load()
            return LoadedImage(
                tile=_normalize(img, tile_size),
                generated=False,
                error=None,
                original=raw,
                ext=_ext_for(img.format, local_path),
            )
        except Exception as exc:  # degrade to generated card
            card = generate_card(item_id, name, fields, tile_size, font_path)
            return LoadedImage(tile=card, generated=True, error=str(exc))

    return LoadedImage(
        tile=generate_card(item_id, name, fields, tile_size, font_path),
        generated=True,
        error=None,
    )
```

- [ ] **Step 4: Update the orchestrator's unpacking** in `src/pview/__init__.py` so the existing suite stays green (detail collection comes in Task 3). Replace this block:

```python
        tile, generated, err = load_tile(
            img_value,
            item_id=pos,
            name=name,
            fields=fields,
            tile_size=tile_size,
            cache_dir=cache_path,
            http_get=http_get,
        )
        tiles.append(tile)
        if generated:
            n_generated += 1
        if err is not None:
            n_errors += 1
            logger.warning("item %d image failed: %s", pos, err)
```

with:

```python
        loaded = load_tile(
            img_value,
            item_id=pos,
            name=name,
            fields=fields,
            tile_size=tile_size,
            cache_dir=cache_path,
            http_get=http_get,
        )
        tiles.append(loaded.tile)
        if loaded.generated:
            n_generated += 1
        if loaded.error is not None:
            n_errors += 1
            logger.warning("item %d image failed: %s", pos, loaded.error)
```

- [ ] **Step 5: Run the full suite to verify it passes**

Run: `python -m pytest -v`
Expected: PASS — the rewritten image tests keep the same 6 test names, so the total stays 40.
Then: `python -m pytest -q -W error::DeprecationWarning`
Expected: 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/pview/images.py src/pview/__init__.py tests/test_images_load.py
git commit -m "feat: load_tile returns LoadedImage with original bytes + ext"
```

---

## Task 2: `write_bundle` writes detail originals + bumps version to 2

**Files:**
- Modify: `src/pview/bundle.py`
- Test: `tests/test_bundle.py`

**Interfaces:**
- Consumes: `Facet` (unchanged).
- Produces:
  - `write_bundle(out_dir, *, title, facets, items, atlas_images, card_fields, tile_size, single_file=False, details=None) -> Path`. `details: dict[int, tuple[bytes, str]] | None` maps an item id to `(original_bytes, ext)`. Defaults to `None` (treated as empty → every item's `detail` is `null`).
  - Folder mode: for an id in `details`, writes `detail/<id><ext>` and sets `item["detail"] = "detail/<id><ext>"`. Single-file mode: sets `item["detail"]` to a `data:<mime>;base64,...` URI. Items absent from `details` get `item["detail"] = None`.
  - `data.json` `version` is `2`.

- [ ] **Step 1: Write the failing tests** — append to `tests/test_bundle.py`:

```python
def test_folder_bundle_writes_detail_originals(tmp_path):
    args = _args(tmp_path)
    args["items"] = [
        {"id": 0, "values": {"name": "Ada"}, "atlas": 0, "rect": [0, 0, 64, 64]},
        {"id": 1, "values": {"name": "Bob"}, "atlas": 0, "rect": [0, 0, 64, 64]},
    ]
    args["details"] = {0: (b"\x89PNG-fake-bytes", ".png")}
    out = write_bundle(**args)
    data = json.loads((out / "data.json").read_text())
    assert data["version"] == 2
    assert (out / "detail" / "0.png").read_bytes() == b"\x89PNG-fake-bytes"
    assert data["items"][0]["detail"] == "detail/0.png"
    assert data["items"][1]["detail"] is None


def test_single_file_inlines_detail_as_data_uri(tmp_path):
    args = _args(tmp_path)
    args["single_file"] = True
    args["details"] = {0: (b"\x89PNG-fake-bytes", ".png")}
    out = write_bundle(**args)
    html = out.read_text()
    import re

    m = re.search(r"<script id='pview-data' type='application/json'>(.*?)</script>", html, re.S)
    data = json.loads(m.group(1))
    assert data["version"] == 2
    assert data["items"][0]["detail"].startswith("data:image/png;base64,")
```

Also update the existing version assertion: in `test_folder_bundle_structure`, change `assert data["version"] == 1` to `assert data["version"] == 2`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_bundle.py -v`
Expected: FAIL — `write_bundle` has no `details` parameter (`TypeError: unexpected keyword argument 'details'`) and `version` is still `1`.

- [ ] **Step 3: Implement the changes** in `src/pview/bundle.py`.

Add the extension→MIME map just below the existing imports (above `_viewer_dir`):

```python
_EXT_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
}
```

Change `_data_dict` so `"version"` is `2`:

```python
def _data_dict(title, facets, items, card_fields, tile_size, atlas_meta):
    return {
        "version": 2,
        "title": title,
        "tileSize": tile_size,
        "facets": [f.to_dict() for f in facets],
        "cardFields": card_fields,
        "atlases": atlas_meta,
        "items": items,
    }
```

Replace the `write_bundle` signature line:

```python
def write_bundle(
    out_dir,
    *,
    title: str,
    facets: list[Facet],
    items: list[dict],
    atlas_images: list[Image.Image],
    card_fields: list[str],
    tile_size: int,
    single_file: bool = False,
    details: dict[int, tuple[bytes, str]] | None = None,
) -> Path:
    viewer = _viewer_dir()
    details = details or {}
```

In the **single-file branch**, immediately after the `atlas_meta = [...]` list comprehension and before `data = _data_dict(...)`, insert:

```python
        for item in items:
            d = details.get(item["id"])
            if d is not None:
                raw, ext = d
                mime = _EXT_MIME.get(ext.lower(), "application/octet-stream")
                b64 = base64.b64encode(raw).decode()
                item["detail"] = f"data:{mime};base64,{b64}"
            else:
                item["detail"] = None
```

In the **folder branch**, after the atlas-writing loop and before `data = _data_dict(...)`, insert:

```python
    detail_dir = out / "detail"
    for item in items:
        d = details.get(item["id"])
        if d is not None:
            raw, ext = d
            detail_dir.mkdir(exist_ok=True)
            fname = f"detail/{item['id']}{ext}"
            (out / fname).write_bytes(raw)
            item["detail"] = fname
        else:
            item["detail"] = None
```

- [ ] **Step 4: Run the full suite to verify it passes**

Run: `python -m pytest -v`
Expected: PASS (existing tests with version 2 + the two new detail tests).
Then: `python -m pytest -q -W error::DeprecationWarning`
Expected: 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/pview/bundle.py tests/test_bundle.py
git commit -m "feat: write_bundle stores detail originals, bundle version 2"
```

---

## Task 3: orchestrator wires detail originals end-to-end

**Files:**
- Modify: `src/pview/__init__.py`
- Test: `tests/test_build.py`

**Interfaces:**
- Consumes: `LoadedImage` (Task 1 — `.original`, `.ext`), `write_bundle(..., details=...)` (Task 2).
- Produces: `build` / `build_with_summary` collect `{id: (original_bytes, ext)}` for items that loaded a real image and pass it to `write_bundle`, so emitted bundles carry `detail` references and `version 2`.

- [ ] **Step 1: Write the failing tests** — append to `tests/test_build.py`:

```python
def test_build_writes_detail_for_imaged_items(tmp_path):
    out = build(
        _df(tmp_path),
        name_col="name",
        image_col="photo",
        card_fields=["name", "age"],
        out_dir=tmp_path / "site",
    )
    data = json.loads((out / "data.json").read_text())
    assert data["version"] == 2
    # _df row 0 has a real PNG; rows 1 ("") and 2 ("missing.png") are generated
    assert data["items"][0]["detail"] == "detail/0.png"
    assert (out / "detail" / "0.png").exists()
    assert data["items"][1]["detail"] is None
    assert data["items"][2]["detail"] is None


def test_build_single_file_inlines_detail(tmp_path):
    out = build(
        _df(tmp_path),
        name_col="name",
        image_col="photo",
        out_dir=tmp_path / "site",
        single_file=True,
    )
    html = out.read_text()
    import re

    m = re.search(r"<script id='pview-data' type='application/json'>(.*?)</script>", html, re.S)
    data = json.loads(m.group(1))
    assert data["items"][0]["detail"].startswith("data:image/png;base64,")
    assert data["items"][1]["detail"] is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_build.py::test_build_writes_detail_for_imaged_items tests/test_build.py::test_build_single_file_inlines_detail -v`
Expected: FAIL — the orchestrator does not yet collect or pass `details`, so `data["items"][0]["detail"]` is `None` (and `detail/0.png` is absent).

- [ ] **Step 3: Implement the wiring** in `src/pview/__init__.py` inside `build_with_summary`.

Add a `details` dict alongside the existing accumulators. Change:

```python
    tiles = []
    items = []
    n_generated = 0
    n_errors = 0
```

to:

```python
    tiles = []
    items = []
    details: dict[int, tuple[bytes, str]] = {}
    n_generated = 0
    n_errors = 0
```

Immediately after the `if loaded.error is not None:` block (and before the `values = {...}` line), add:

```python
        if loaded.original is not None and loaded.ext is not None:
            details[pos] = (loaded.original, loaded.ext)
```

Then add `details=details` to the `write_bundle(...)` call:

```python
    out = write_bundle(
        out_dir,
        title=title,
        facets=facet_list,
        items=items,
        atlas_images=atlas_images,
        card_fields=card_fields,
        tile_size=tile_size,
        single_file=single_file,
        details=details,
    )
```

- [ ] **Step 4: Run the full suite to verify it passes**

Run: `python -m pytest -v`
Expected: PASS (all tasks' tests; the two new detail tests now green).
Then: `python -m pytest -q -W error::DeprecationWarning`
Expected: 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/pview/__init__.py tests/test_build.py
git commit -m "feat: build collects detail originals into version-2 bundles"
```

---

## Self-Review

**Spec coverage (M0 section of the Phase-2 spec → tasks):**
- Original full-res image written to `detail/<id>.<ext>` for imaged items → Task 2 (folder) + Task 3 (wiring). ✓
- `item["detail"]` set; `null` for generated items → Task 2 (sets per item) + Task 3 (end-to-end). ✓
- `version` bumps 1 → 2 → Task 2 (`_data_dict`). ✓
- Raw original bytes preserved (no recompression) → Task 1 (`original = raw` source bytes; written verbatim in Task 2). ✓
- Single-file inlines detail as data URI → Task 2 (single-file branch) + Task 3 (end-to-end). ✓
- Touches `images.py`, orchestrator, `bundle.py`, covered by pytest → Tasks 1–3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `LoadedImage.original: bytes|None` / `.ext: str|None` (Task 1) are consumed as `details[pos] = (loaded.original, loaded.ext)` (Task 3) and written as `(raw, ext)` in `write_bundle`'s `details: dict[int, tuple[bytes,str]]` (Task 2). `_ext_for` returns a dotted extension (e.g. `".png"`), matched by `_EXT_MIME` keys and used directly in the `detail/<id><ext>` filename. Names align across tasks.

**Note:** The viewer-side `parseBundle` accepting `version 2` and treating missing `detail` as `null` is part of milestone M1, not M0 — out of scope here.
