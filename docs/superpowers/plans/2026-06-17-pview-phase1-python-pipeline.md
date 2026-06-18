# pview Phase 1 — Python Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python build pipeline that turns a pandas DataFrame into a self-contained PivotViewer-style bundle (facet schema + atlas-packed card images + viewer assets).

**Architecture:** A pure-Python package (`pview`) with focused modules: facet inference, image acquisition/generation, atlas packing, bundle writing, a top-level `build()` orchestrator, and a CLI wrapper. The interactive viewer is Phase 2; this phase ships a minimal placeholder `viewer_assets/` so bundles are structurally complete and testable.

**Tech Stack:** Python 3.11+, pandas, Pillow, httpx, argparse, pytest. Packaged with a `pyproject.toml` (hatchling backend), `src/` layout.

## Global Constraints

- Python 3.11+ (`requires-python = ">=3.11"`).
- Runtime deps: `pandas`, `pillow`, `httpx`. CLI additionally uses `openpyxl` for `.xlsx`.
- `src/` layout: importable as `import pview`.
- Default tile size: **256**. Default atlas sheet size: **2048**.
- Every card (real or generated) is normalized to `tile_size × tile_size` RGBA and packed into atlases.
- Facet types are exactly: `"numeric"`, `"date"`, `"category"`, `"text"`.
- A single bad/missing image must never abort a build — it degrades to a generated card and records a warning.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- Run tests with `python -m pytest`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `pyproject.toml` | Package metadata, deps, build backend |
| `src/pview/__init__.py` | Public API: `build()` orchestrator + version |
| `src/pview/facets.py` | `Facet` dataclass + `infer_facets()` |
| `src/pview/images.py` | `generate_card()`, `load_tile()` (local/URL acquire + fallback) |
| `src/pview/atlas.py` | `pack()` — grid-pack tiles into sheets |
| `src/pview/bundle.py` | `write_bundle()` — folder + single-file output |
| `src/pview/cli.py` | `main()` — argparse → `build()` |
| `src/pview/assets/fonts/` | Bundled TTF for generated cards |
| `src/pview/viewer_assets/` | Placeholder `index.html`/`app.js`/`app.css` (Phase 2 replaces) |
| `tests/...` | Mirrors module layout |

---

## Task 1: Project scaffolding + facet inference

**Files:**
- Create: `pyproject.toml`
- Create: `src/pview/__init__.py`
- Create: `src/pview/facets.py`
- Test: `tests/test_facets.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Facet` dataclass with fields `name: str`, `type: str`, `min: float | str | None = None`, `max: float | str | None = None`, `values: list | None = None`, and method `to_dict() -> dict` (omits `None` fields).
  - `infer_facets(df: pandas.DataFrame, *, name_col: str, image_col: str | None = None, overrides: dict[str, str] | None = None, category_threshold: int = 50) -> list[Facet]`.

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "pview"
version = "0.1.0"
description = "PivotViewer-style interactive collection viewer for Python"
requires-python = ">=3.11"
dependencies = ["pandas", "pillow", "httpx"]

[project.optional-dependencies]
cli = ["openpyxl"]
dev = ["pytest"]

[project.scripts]
pview = "pview.cli:main"

[tool.hatch.build.targets.wheel]
packages = ["src/pview"]
```

- [ ] **Step 2: Create `src/pview/__init__.py` with version only (for now)**

```python
__version__ = "0.1.0"
```

- [ ] **Step 3: Write the failing test** in `tests/test_facets.py`

```python
import pandas as pd
from pview.facets import Facet, infer_facets


def _df():
    return pd.DataFrame(
        {
            "name": ["Ada", "Bob", "Cy"],
            "age": [36, 41, 28],
            "gender": ["female", "male", "female"],
            "joined": pd.to_datetime(["2011-04-01", "2015-06-15", "2020-01-02"]),
            "bio": ["aaa", "bbb", "ccc"],
            "photo": ["a.png", "b.png", "c.png"],
        }
    )


def test_numeric_facet_has_min_max():
    facets = {f.name: f for f in infer_facets(_df(), name_col="name", image_col="photo")}
    assert facets["age"].type == "numeric"
    assert facets["age"].min == 28
    assert facets["age"].max == 41


def test_category_facet_collects_sorted_values():
    facets = {f.name: f for f in infer_facets(_df(), name_col="name", image_col="photo")}
    assert facets["gender"].type == "category"
    assert facets["gender"].values == ["female", "male"]


def test_date_facet_has_iso_min_max():
    facets = {f.name: f for f in infer_facets(_df(), name_col="name", image_col="photo")}
    assert facets["joined"].type == "date"
    assert facets["joined"].min == "2011-04-01"
    assert facets["joined"].max == "2020-01-02"


def test_high_cardinality_text_facet():
    df = _df()
    df["bio"] = [f"unique text {i}" for i in range(3)]
    facets = {f.name: f for f in infer_facets(df, name_col="name", image_col="photo", category_threshold=2)}
    assert facets["bio"].type == "text"


def test_name_is_text_facet_and_image_excluded():
    facets = {f.name: f for f in infer_facets(_df(), name_col="name", image_col="photo")}
    assert facets["name"].type == "text"
    assert "photo" not in facets


def test_override_forces_category():
    df = _df()
    df["age"] = [1, 2, 3]
    facets = {f.name: f for f in infer_facets(df, name_col="name", image_col="photo", overrides={"age": "category"})}
    assert facets["age"].type == "category"
    assert facets["age"].values == ["1", "2", "3"]


def test_override_unknown_column_raises():
    import pytest
    with pytest.raises(ValueError):
        infer_facets(_df(), name_col="name", overrides={"nope": "category"})


def test_to_dict_omits_none_fields():
    f = Facet(name="x", type="text")
    assert f.to_dict() == {"name": "x", "type": "text"}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `python -m pytest tests/test_facets.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pview.facets'`

- [ ] **Step 5: Implement `src/pview/facets.py`**

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

VALID_TYPES = {"numeric", "date", "category", "text"}


@dataclass
class Facet:
    name: str
    type: str
    min: Any = None
    max: Any = None
    values: list | None = None

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"name": self.name, "type": self.type}
        if self.min is not None:
            d["min"] = self.min
        if self.max is not None:
            d["max"] = self.max
        if self.values is not None:
            d["values"] = self.values
        return d


def _build_facet(name: str, series: pd.Series, forced: str | None, category_threshold: int) -> Facet:
    if forced is not None:
        if forced not in VALID_TYPES:
            raise ValueError(f"Invalid facet type {forced!r} for column {name!r}")
        ftype = forced
    elif pd.api.types.is_datetime64_any_dtype(series):
        ftype = "date"
    elif pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
        ftype = "numeric"
    elif series.nunique(dropna=True) <= category_threshold:
        ftype = "category"
    else:
        ftype = "text"

    if ftype == "numeric":
        s = pd.to_numeric(series, errors="coerce").dropna()
        return Facet(name, "numeric", min=_num(s.min()), max=_num(s.max()))
    if ftype == "date":
        s = pd.to_datetime(series, errors="coerce").dropna()
        return Facet(name, "date", min=s.min().date().isoformat(), max=s.max().date().isoformat())
    if ftype == "category":
        vals = sorted(series.dropna().astype(str).unique().tolist())
        return Facet(name, "category", values=vals)
    return Facet(name, "text")


def _num(v: Any) -> float | int:
    f = float(v)
    return int(f) if f.is_integer() else f


def infer_facets(
    df: pd.DataFrame,
    *,
    name_col: str,
    image_col: str | None = None,
    overrides: dict[str, str] | None = None,
    category_threshold: int = 50,
) -> list[Facet]:
    overrides = overrides or {}
    for col in overrides:
        if col not in df.columns:
            raise ValueError(f"Override references unknown column {col!r}")

    facets: list[Facet] = []
    for col in df.columns:
        if col == image_col:
            continue
        if col == name_col and col not in overrides:
            facets.append(Facet(col, "text"))
            continue
        facets.append(_build_facet(col, df[col], overrides.get(col), category_threshold))
    return facets
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_facets.py -v`
Expected: PASS (8 passed)

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml src/pview/__init__.py src/pview/facets.py tests/test_facets.py
git commit -m "feat: project scaffolding + facet inference"
```

---

## Task 2: Fallback card generation

**Files:**
- Create: `src/pview/images.py`
- Create: `src/pview/assets/fonts/` (add a TTF — see Step 1)
- Test: `tests/test_images_generate.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `generate_card(item_id: int, name: str, fields: list[tuple[str, str]], tile_size: int = 256, font_path: str | None = None) -> PIL.Image.Image` — returns an RGBA image of exactly `tile_size × tile_size`. `fields` is a list of `(label, value)` pairs drawn below the name. Background color is deterministic from `item_id`.

- [ ] **Step 1: Add a bundled font**

Download a permissively-licensed TTF (DejaVuSans is bundled with Matplotlib/Pillow on most systems). Run:

```bash
mkdir -p src/pview/assets/fonts
python -c "import PIL; import os, shutil; \
src=os.path.join(os.path.dirname(PIL.__file__),'fonts','DejaVuSans.ttf'); \
shutil.copy(src,'src/pview/assets/fonts/DejaVuSans.ttf') if os.path.exists(src) else print('MISSING')"
```

If it prints `MISSING`, instead copy the system font:
`cp /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf src/pview/assets/fonts/DejaVuSans.ttf`

Verify: `ls -l src/pview/assets/fonts/DejaVuSans.ttf` shows a non-empty file.

- [ ] **Step 2: Write the failing test** in `tests/test_images_generate.py`

```python
from pview.images import generate_card


def test_generate_card_is_correct_size_and_mode():
    img = generate_card(0, "Ada", [("age", "36")], tile_size=256)
    assert img.size == (256, 256)
    assert img.mode == "RGBA"


def test_generate_card_color_is_deterministic_per_id():
    a = generate_card(7, "Ada", [], tile_size=64)
    b = generate_card(7, "Ada", [], tile_size=64)
    assert list(a.getdata()) == list(b.getdata())


def test_generate_card_different_ids_differ():
    a = generate_card(1, "Ada", [], tile_size=64)
    b = generate_card(2, "Ada", [], tile_size=64)
    assert list(a.getdata()) != list(b.getdata())
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_images_generate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pview.images'`

- [ ] **Step 4: Implement the generation part of `src/pview/images.py`**

```python
from __future__ import annotations

import colorsys
from importlib import resources

from PIL import Image, ImageDraw, ImageFont


def _default_font_path() -> str:
    return str(resources.files("pview").joinpath("assets/fonts/DejaVuSans.ttf"))


def _bg_color(item_id: int) -> tuple[int, int, int]:
    hue = (item_id * 0.61803398875) % 1.0
    r, g, b = colorsys.hls_to_rgb(hue, 0.45, 0.55)
    return int(r * 255), int(g * 255), int(b * 255)


def generate_card(
    item_id: int,
    name: str,
    fields: list[tuple[str, str]],
    tile_size: int = 256,
    font_path: str | None = None,
) -> Image.Image:
    font_path = font_path or _default_font_path()
    img = Image.new("RGBA", (tile_size, tile_size), (*_bg_color(item_id), 255))
    draw = ImageDraw.Draw(img)

    name_font = ImageFont.truetype(font_path, max(12, tile_size // 9))
    body_font = ImageFont.truetype(font_path, max(9, tile_size // 16))
    margin = tile_size // 12

    draw.text((margin, margin), str(name), fill="white", font=name_font)
    y = margin + tile_size // 6
    for label, value in fields:
        draw.text((margin, y), f"{label}: {value}", fill="white", font=body_font)
        y += tile_size // 12
    return img
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_images_generate.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
git add src/pview/images.py src/pview/assets/fonts/DejaVuSans.ttf tests/test_images_generate.py
git commit -m "feat: deterministic fallback card generation"
```

---

## Task 3: Image acquisition (local + URL) with fallback

**Files:**
- Modify: `src/pview/images.py`
- Test: `tests/test_images_load.py`

**Interfaces:**
- Consumes: `generate_card()` from Task 2.
- Produces:
  - `load_tile(value: str | None, *, item_id: int, name: str, fields: list[tuple[str, str]], tile_size: int = 256, font_path: str | None = None, cache_dir: pathlib.Path | None = None, http_get: Callable[[str], bytes] | None = None) -> tuple[PIL.Image.Image, bool, str | None]` — returns `(tile, was_generated, error)`. `tile` is always `tile_size × tile_size` RGBA. `was_generated` is `True` when the fallback card was used. `error` is a short message when acquisition failed (else `None`). `http_get` is injectable for testing; default fetches via httpx.

- [ ] **Step 1: Write the failing test** in `tests/test_images_load.py`

```python
import io
from pathlib import Path

from PIL import Image

from pview.images import load_tile


def _png_bytes(color=(10, 20, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="PNG")
    return buf.getvalue()


def test_local_image_is_loaded_and_resized(tmp_path):
    p = tmp_path / "x.png"
    p.write_bytes(_png_bytes())
    tile, generated, err = load_tile(str(p), item_id=0, name="Ada", fields=[], tile_size=32)
    assert tile.size == (32, 32)
    assert tile.mode == "RGBA"
    assert generated is False
    assert err is None


def test_missing_value_generates_card():
    tile, generated, err = load_tile(None, item_id=1, name="Ada", fields=[("age", "36")], tile_size=32)
    assert tile.size == (32, 32)
    assert generated is True
    assert err is None


def test_bad_local_path_generates_card_with_error(tmp_path):
    tile, generated, err = load_tile(str(tmp_path / "nope.png"), item_id=2, name="Ada", fields=[], tile_size=32)
    assert generated is True
    assert err is not None


def test_url_is_fetched_via_injected_getter():
    calls = []

    def fake_get(url):
        calls.append(url)
        return _png_bytes((1, 2, 3))

    tile, generated, err = load_tile(
        "https://example.com/a.png", item_id=3, name="Ada", fields=[], tile_size=32, http_get=fake_get
    )
    assert calls == ["https://example.com/a.png"]
    assert generated is False
    assert err is None


def test_url_failure_generates_card_with_error():
    def boom(url):
        raise RuntimeError("network down")

    tile, generated, err = load_tile(
        "http://example.com/a.png", item_id=4, name="Ada", fields=[], tile_size=32, http_get=boom
    )
    assert generated is True
    assert "network down" in err
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_images_load.py -v`
Expected: FAIL with `ImportError: cannot import name 'load_tile'`

- [ ] **Step 3: Add `load_tile` to `src/pview/images.py`**

Append these imports at the top (next to existing imports):

```python
import hashlib
from pathlib import Path
from typing import Callable

from PIL import ImageOps
```

Append the function:

```python
def _default_http_get(url: str) -> bytes:
    import httpx

    resp = httpx.get(url, timeout=10.0, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def _fetch_url(url: str, cache_dir: Path | None, http_get: Callable[[str], bytes]) -> bytes:
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        key = cache_dir / (hashlib.sha256(url.encode()).hexdigest() + ".bin")
        if key.exists():
            return key.read_bytes()
        data = http_get(url)
        key.write_bytes(data)
        return data
    return http_get(url)


def _normalize(img: Image.Image, tile_size: int) -> Image.Image:
    return ImageOps.fit(img.convert("RGBA"), (tile_size, tile_size))


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
) -> tuple[Image.Image, bool, str | None]:
    import io

    blank = value is None or (isinstance(value, str) and value.strip() == "")
    if not blank:
        http_get = http_get or _default_http_get
        try:
            if str(value).startswith(("http://", "https://")):
                raw = _fetch_url(str(value), cache_dir, http_get)
                img = Image.open(io.BytesIO(raw))
            else:
                img = Image.open(value)
            img.load()
            return _normalize(img, tile_size), False, None
        except Exception as exc:  # degrade to generated card
            card = generate_card(item_id, name, fields, tile_size, font_path)
            return card, True, str(exc)

    return generate_card(item_id, name, fields, tile_size, font_path), True, None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_images_load.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add src/pview/images.py tests/test_images_load.py
git commit -m "feat: image acquisition from local path and URL with fallback"
```

---

## Task 4: Atlas packing

**Files:**
- Create: `src/pview/atlas.py`
- Test: `tests/test_atlas.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pack(tiles: list[PIL.Image.Image], *, tile_size: int = 256, sheet_size: int = 2048) -> tuple[list[PIL.Image.Image], list[Placement]]` where `Placement` is a dataclass with `atlas: int` and `rect: tuple[int, int, int, int]` (x, y, w, h). Tiles fill each sheet left-to-right, top-to-bottom, spilling to new sheets.

- [ ] **Step 1: Write the failing test** in `tests/test_atlas.py`

```python
from PIL import Image

from pview.atlas import pack


def _tiles(n, size=64):
    return [Image.new("RGBA", (size, size), (i, i, i, 255)) for i in range(n)]


def test_single_sheet_placements():
    atlases, placements = pack(_tiles(4, 64), tile_size=64, sheet_size=128)
    # 128/64 = 2 per row => 4 per sheet
    assert len(atlases) == 1
    assert placements[0].atlas == 0
    assert placements[0].rect == (0, 0, 64, 64)
    assert placements[1].rect == (64, 0, 64, 64)
    assert placements[2].rect == (0, 64, 64, 64)
    assert placements[3].rect == (64, 64, 64, 64)


def test_spills_to_second_sheet():
    atlases, placements = pack(_tiles(5, 64), tile_size=64, sheet_size=128)
    assert len(atlases) == 2
    assert placements[4].atlas == 1
    assert placements[4].rect == (0, 0, 64, 64)


def test_atlas_dimensions_match_sheet_size():
    atlases, _ = pack(_tiles(1, 64), tile_size=64, sheet_size=128)
    assert atlases[0].size == (128, 128)


def test_empty_input():
    atlases, placements = pack([], tile_size=64, sheet_size=128)
    assert atlases == []
    assert placements == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_atlas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pview.atlas'`

- [ ] **Step 3: Implement `src/pview/atlas.py`**

```python
from __future__ import annotations

from dataclasses import dataclass

from PIL import Image


@dataclass
class Placement:
    atlas: int
    rect: tuple[int, int, int, int]


def pack(
    tiles: list[Image.Image],
    *,
    tile_size: int = 256,
    sheet_size: int = 2048,
) -> tuple[list[Image.Image], list[Placement]]:
    if not tiles:
        return [], []

    per_row = sheet_size // tile_size
    per_sheet = per_row * per_row
    if per_sheet < 1:
        raise ValueError("sheet_size must be >= tile_size")

    atlases: list[Image.Image] = []
    placements: list[Placement] = []

    for i, tile in enumerate(tiles):
        sheet_idx = i // per_sheet
        slot = i % per_sheet
        if slot == 0:
            atlases.append(Image.new("RGBA", (sheet_size, sheet_size), (0, 0, 0, 0)))
        x = (slot % per_row) * tile_size
        y = (slot // per_row) * tile_size
        atlases[sheet_idx].paste(tile, (x, y))
        placements.append(Placement(atlas=sheet_idx, rect=(x, y, tile_size, tile_size)))

    return atlases, placements
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_atlas.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add src/pview/atlas.py tests/test_atlas.py
git commit -m "feat: grid-based atlas packing"
```

---

## Task 5: Bundle writing (folder + single-file) with viewer placeholder

**Files:**
- Create: `src/pview/viewer_assets/index.html`
- Create: `src/pview/viewer_assets/app.js`
- Create: `src/pview/viewer_assets/app.css`
- Create: `src/pview/bundle.py`
- Test: `tests/test_bundle.py`

**Interfaces:**
- Consumes: `Facet` (Task 1, via `.to_dict()`), `Placement` (Task 4).
- Produces:
  - `write_bundle(out_dir, *, title, facets, items, atlas_images, card_fields, tile_size, single_file=False) -> pathlib.Path`.
    - `facets: list[Facet]`.
    - `items: list[dict]` — each `{"id": int, "values": dict, "atlas": int, "rect": [x,y,w,h]}`.
    - `atlas_images: list[PIL.Image.Image]`.
    - Folder mode returns the output directory containing `index.html`, `app.js`, `app.css`, `data.json`, `atlas/atlas_N.png`.
    - Single-file mode returns the path to a single `index.html` with assets inlined.

- [ ] **Step 1: Create the placeholder viewer assets**

`src/pview/viewer_assets/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>pview</title>
    <link rel="stylesheet" href="app.css" />
  </head>
  <body>
    <div id="app">pview placeholder viewer (Phase 2 replaces this)</div>
    <script src="data.json" type="application/json" id="pview-data"></script>
    <script src="app.js"></script>
  </body>
</html>
```

`src/pview/viewer_assets/app.js`:

```javascript
// Phase 2 PixiJS viewer goes here. Placeholder logs the collection size.
console.log("pview placeholder loaded");
```

`src/pview/viewer_assets/app.css`:

```css
#app { font-family: sans-serif; padding: 1rem; }
```

- [ ] **Step 2: Write the failing test** in `tests/test_bundle.py`

```python
import json

from PIL import Image

from pview.facets import Facet
from pview.bundle import write_bundle


def _args(tmp_path):
    return dict(
        out_dir=tmp_path / "out",
        title="People",
        facets=[Facet("age", "numeric", min=1, max=2), Facet("name", "text")],
        items=[{"id": 0, "values": {"name": "Ada", "age": 1}, "atlas": 0, "rect": [0, 0, 64, 64]}],
        atlas_images=[Image.new("RGBA", (64, 64), (1, 2, 3, 255))],
        card_fields=["name", "age"],
        tile_size=64,
    )


def test_folder_bundle_structure(tmp_path):
    out = write_bundle(**_args(tmp_path))
    assert (out / "index.html").exists()
    assert (out / "app.js").exists()
    assert (out / "app.css").exists()
    assert (out / "atlas" / "atlas_0.png").exists()
    data = json.loads((out / "data.json").read_text())
    assert data["version"] == 1
    assert data["title"] == "People"
    assert data["tileSize"] == 64
    assert data["cardFields"] == ["name", "age"]
    assert data["facets"][0] == {"name": "age", "type": "numeric", "min": 1, "max": 2}
    assert data["atlases"] == [{"file": "atlas/atlas_0.png", "width": 64, "height": 64}]
    assert data["items"][0]["values"]["name"] == "Ada"


def test_single_file_bundle(tmp_path):
    args = _args(tmp_path)
    args["single_file"] = True
    out = write_bundle(**args)
    assert out.name == "index.html"
    html = out.read_text()
    assert "data:image/png;base64," in html
    assert "pview placeholder loaded" in html  # app.js inlined
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_bundle.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pview.bundle'`

- [ ] **Step 4: Implement `src/pview/bundle.py`**

```python
from __future__ import annotations

import base64
import io
import json
import shutil
from importlib import resources
from pathlib import Path

from PIL import Image

from .facets import Facet


def _viewer_dir():
    return resources.files("pview").joinpath("viewer_assets")


def _data_dict(title, facets, items, card_fields, tile_size, atlas_meta):
    return {
        "version": 1,
        "title": title,
        "tileSize": tile_size,
        "facets": [f.to_dict() for f in facets],
        "cardFields": card_fields,
        "atlases": atlas_meta,
        "items": items,
    }


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


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
) -> Path:
    viewer = _viewer_dir()

    if single_file:
        atlas_uris = []
        for img in atlas_images:
            b64 = base64.b64encode(_png_bytes(img)).decode()
            atlas_uris.append(f"data:image/png;base64,{b64}")
        atlas_meta = [
            {"file": atlas_uris[i], "width": img.width, "height": img.height}
            for i, img in enumerate(atlas_images)
        ]
        data = _data_dict(title, facets, items, card_fields, tile_size, atlas_meta)
        app_js = viewer.joinpath("app.js").read_text()
        app_css = viewer.joinpath("app.css").read_text()
        html = (
            "<!doctype html><html><head><meta charset='utf-8'><title>"
            f"{title}</title><style>{app_css}</style></head><body>"
            "<div id='app'></div>"
            f"<script id='pview-data' type='application/json'>{json.dumps(data)}</script>"
            f"<script>{app_js}</script></body></html>"
        )
        out_path = Path(out_dir)
        if out_path.suffix != ".html":
            out_path.mkdir(parents=True, exist_ok=True)
            out_path = out_path / "index.html"
        else:
            out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html)
        return out_path

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for asset in ("index.html", "app.js", "app.css"):
        shutil.copyfile(viewer.joinpath(asset), out / asset)

    atlas_dir = out / "atlas"
    atlas_dir.mkdir(exist_ok=True)
    atlas_meta = []
    for i, img in enumerate(atlas_images):
        fname = f"atlas/atlas_{i}.png"
        img.save(out / fname)
        atlas_meta.append({"file": fname, "width": img.width, "height": img.height})

    data = _data_dict(title, facets, items, card_fields, tile_size, atlas_meta)
    (out / "data.json").write_text(json.dumps(data, indent=2))
    return out
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_bundle.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add src/pview/viewer_assets src/pview/bundle.py tests/test_bundle.py
git commit -m "feat: bundle writing (folder + single-file) with placeholder viewer"
```

---

## Task 6: `build()` orchestrator

**Files:**
- Modify: `src/pview/__init__.py`
- Test: `tests/test_build.py`

**Interfaces:**
- Consumes: `infer_facets` (Task 1), `load_tile` (Task 3), `pack` (Task 4), `write_bundle` (Task 5).
- Produces:
  - `build(df, *, name_col, out_dir, image_col=None, card_fields=None, facets=None, title=None, single_file=False, tile_size=256, cache_dir=None, http_get=None) -> pathlib.Path`.
  - `BuildSummary` dataclass: `n_items: int`, `n_generated: int`, `n_image_errors: int`, `n_atlases: int`, attached to the returned path? No — return the `Path`; expose the last summary via logging. For testability, `build()` returns `Path`; a separate `build_with_summary(...) -> tuple[Path, BuildSummary]` returns both.

- [ ] **Step 1: Write the failing test** in `tests/test_build.py`

```python
import io
import json

import pandas as pd
from PIL import Image

from pview import build, build_with_summary


def _png(tmp_path, name, color=(9, 9, 9)):
    p = tmp_path / name
    Image.new("RGB", (8, 8), color).save(p)
    return str(p)


def _df(tmp_path):
    return pd.DataFrame(
        {
            "name": ["Ada", "Bob", "Cy"],
            "age": [36, 41, 28],
            "gender": ["female", "male", "female"],
            "photo": [_png(tmp_path, "a.png"), "", "missing.png"],
        }
    )


def test_build_returns_folder_with_three_items(tmp_path):
    out = build(
        _df(tmp_path),
        name_col="name",
        image_col="photo",
        card_fields=["name", "age"],
        out_dir=tmp_path / "site",
    )
    data = json.loads((out / "data.json").read_text())
    assert len(data["items"]) == 3
    assert {f["name"] for f in data["facets"]} == {"name", "age", "gender"}
    assert data["cardFields"] == ["name", "age"]


def test_summary_counts_generated_and_errors(tmp_path):
    _, summary = build_with_summary(
        _df(tmp_path),
        name_col="name",
        image_col="photo",
        out_dir=tmp_path / "site",
    )
    assert summary.n_items == 3
    # "" -> generated (no error); "missing.png" -> generated (error)
    assert summary.n_generated == 2
    assert summary.n_image_errors == 1
    assert summary.n_atlases == 1


def test_build_without_image_col_generates_all(tmp_path):
    df = _df(tmp_path).drop(columns=["photo"])
    _, summary = build_with_summary(df, name_col="name", out_dir=tmp_path / "site")
    assert summary.n_generated == 3


def test_empty_df_raises(tmp_path):
    import pytest
    with pytest.raises(ValueError):
        build(pd.DataFrame({"name": []}), name_col="name", out_dir=tmp_path / "s")


def test_missing_name_col_raises(tmp_path):
    import pytest
    with pytest.raises(ValueError):
        build(_df(tmp_path), name_col="nope", out_dir=tmp_path / "s")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_build.py -v`
Expected: FAIL with `ImportError: cannot import name 'build'`

- [ ] **Step 3: Implement `build` in `src/pview/__init__.py`**

```python
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import pandas as pd

from .atlas import pack
from .bundle import write_bundle
from .facets import infer_facets
from .images import load_tile

__version__ = "0.1.0"

logger = logging.getLogger("pview")


@dataclass
class BuildSummary:
    n_items: int
    n_generated: int
    n_image_errors: int
    n_atlases: int


def _fmt(v) -> str:
    if pd.isna(v):
        return ""
    return str(v)


def build_with_summary(
    df: pd.DataFrame,
    *,
    name_col: str,
    out_dir,
    image_col: str | None = None,
    card_fields: list[str] | None = None,
    facets: dict[str, str] | None = None,
    title: str | None = None,
    single_file: bool = False,
    tile_size: int = 256,
    cache_dir=None,
    http_get: Callable[[str], bytes] | None = None,
) -> tuple[Path, BuildSummary]:
    if name_col not in df.columns:
        raise ValueError(f"name_col {name_col!r} not in DataFrame columns")
    if len(df) == 0:
        raise ValueError("DataFrame is empty")

    card_fields = card_fields or [name_col]
    title = title or name_col
    facet_list = infer_facets(df, name_col=name_col, image_col=image_col, overrides=facets)
    cache_path = Path(cache_dir) if cache_dir is not None else None

    tiles = []
    items = []
    n_generated = 0
    n_errors = 0

    for pos, (_, row) in enumerate(df.iterrows()):
        name = _fmt(row[name_col])
        fields = [(c, _fmt(row[c])) for c in card_fields if c in df.columns]
        img_value = None if image_col is None else row[image_col]
        if isinstance(img_value, float) and pd.isna(img_value):
            img_value = None
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

        values = {c: _coerce(row[c]) for c in df.columns if c != image_col}
        items.append({"id": pos, "values": values})

    atlas_images, placements = pack(tiles, tile_size=tile_size)
    for item, place in zip(items, placements):
        item["atlas"] = place.atlas
        item["rect"] = list(place.rect)

    out = write_bundle(
        out_dir,
        title=title,
        facets=facet_list,
        items=items,
        atlas_images=atlas_images,
        card_fields=card_fields,
        tile_size=tile_size,
        single_file=single_file,
    )
    summary = BuildSummary(len(df), n_generated, n_errors, len(atlas_images))
    logger.info(
        "pview build: %d items, %d generated, %d image errors, %d atlases",
        summary.n_items, summary.n_generated, summary.n_image_errors, summary.n_atlases,
    )
    return out, summary


def _coerce(v):
    if pd.isna(v):
        return None
    if isinstance(v, pd.Timestamp):
        return v.date().isoformat()
    if hasattr(v, "item"):
        return v.item()
    return v


def build(df: pd.DataFrame, **kwargs) -> Path:
    out, _ = build_with_summary(df, **kwargs)
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_build.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Run the full suite**

Run: `python -m pytest -v`
Expected: PASS (all tasks' tests green)

- [ ] **Step 6: Commit**

```bash
git add src/pview/__init__.py tests/test_build.py
git commit -m "feat: build() orchestrator with build summary"
```

---

## Task 7: CLI wrapper

**Files:**
- Create: `src/pview/cli.py`
- Test: `tests/test_cli.py`

**Interfaces:**
- Consumes: `build_with_summary` (Task 6).
- Produces:
  - `main(argv: list[str] | None = None) -> int`. Subcommand `build`. Reads `.csv` via `pandas.read_csv`, `.xlsx`/`.xls` via `pandas.read_excel`. Maps `--name-col`, `--image-col`, `--card-fields` (comma-separated), `--facet` (repeatable `col=type`), `--title`, `--out`, `--single-file`, `--tile-size`.

- [ ] **Step 1: Write the failing test** in `tests/test_cli.py`

```python
import json

import pandas as pd

from pview.cli import main


def _csv(tmp_path):
    p = tmp_path / "people.csv"
    pd.DataFrame({"name": ["Ada", "Bob"], "age": [36, 41], "gender": ["f", "m"]}).to_csv(p, index=False)
    return p


def test_cli_build_folder(tmp_path):
    out = tmp_path / "site"
    rc = main(
        [
            "build", str(_csv(tmp_path)),
            "--name-col", "name",
            "--card-fields", "name,age",
            "--out", str(out),
        ]
    )
    assert rc == 0
    data = json.loads((out / "data.json").read_text())
    assert len(data["items"]) == 2
    assert data["cardFields"] == ["name", "age"]


def test_cli_facet_override(tmp_path):
    out = tmp_path / "site"
    rc = main(
        [
            "build", str(_csv(tmp_path)),
            "--name-col", "name",
            "--facet", "age=category",
            "--out", str(out),
        ]
    )
    assert rc == 0
    data = json.loads((out / "data.json").read_text())
    age = next(f for f in data["facets"] if f["name"] == "age")
    assert age["type"] == "category"


def test_cli_missing_file_returns_error(tmp_path):
    rc = main(["build", str(tmp_path / "nope.csv"), "--name-col", "name", "--out", str(tmp_path / "o")])
    assert rc != 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_cli.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pview.cli'`

- [ ] **Step 3: Implement `src/pview/cli.py`**

```python
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from . import build_with_summary


def _read_table(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")
    if path.suffix.lower() in {".xlsx", ".xls"}:
        return pd.read_excel(path)
    return pd.read_csv(path)


def _parse_facets(pairs: list[str] | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for pair in pairs or []:
        if "=" not in pair:
            raise ValueError(f"--facet must be col=type, got {pair!r}")
        col, ftype = pair.split("=", 1)
        out[col] = ftype
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pview")
    sub = parser.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="Build a bundle from a CSV/Excel table")
    b.add_argument("input")
    b.add_argument("--name-col", required=True)
    b.add_argument("--image-col", default=None)
    b.add_argument("--card-fields", default=None, help="comma-separated")
    b.add_argument("--facet", action="append", default=[], help="col=type (repeatable)")
    b.add_argument("--title", default=None)
    b.add_argument("--out", required=True)
    b.add_argument("--single-file", action="store_true")
    b.add_argument("--tile-size", type=int, default=256)

    args = parser.parse_args(argv)

    try:
        df = _read_table(Path(args.input))
        card_fields = args.card_fields.split(",") if args.card_fields else None
        _, summary = build_with_summary(
            df,
            name_col=args.name_col,
            image_col=args.image_col,
            card_fields=card_fields,
            facets=_parse_facets(args.facet),
            title=args.title,
            out_dir=args.out,
            single_file=args.single_file,
            tile_size=args.tile_size,
        )
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(
        f"Built {summary.n_items} items "
        f"({summary.n_generated} generated, {summary.n_image_errors} image errors, "
        f"{summary.n_atlases} atlases) -> {args.out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_cli.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Run the full suite + verify the CLI entry point**

Run: `python -m pytest -v && python -m pview.cli --help 2>/dev/null || python -m pytest -q`
Then: `python -c "from pview.cli import main; print('ok')"`
Expected: tests PASS; prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add src/pview/cli.py tests/test_cli.py
git commit -m "feat: CLI wrapper for CSV/Excel input"
```

---

## Self-Review

**Spec coverage check (Phase 1 sections → tasks):**
- DataFrame core API → Task 6 (`build`). ✓
- CLI wrapper (CSV/Excel) → Task 7. ✓
- Auto-infer facets + overrides → Task 1. ✓
- Local + URL images → Task 3. ✓
- Generated fallback cards (name + subset) → Task 2 (`generate_card`), wired in Task 3/6. ✓
- Atlas packing → Task 4. ✓
- Bundle format (folder + single-file, `data.json` shape) → Task 5. ✓
- Error handling (bad image → card+warning; bad override / empty df / missing name_col → ValueError) → Tasks 1, 3, 6. ✓
- Build summary (N items, generated, failures, atlas count) → Task 6. ✓
- Testing strategy (unit + mocked HTTP + golden structure test) → all tasks; mocked HTTP in Task 3; golden structure in Tasks 5–7. ✓

**Type consistency:** `Facet.to_dict()` (Task 1) consumed in Task 5; `Placement.atlas`/`.rect` (Task 4) consumed in Task 6; `load_tile(...) -> (Image, bool, str|None)` (Task 3) consumed in Task 6; `build_with_summary` (Task 6) consumed in Task 7. Names align across tasks.

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Note:** The `tileSize` field and `atlases[]` metadata in `data.json` extend the spec's draft `data.json` with no contradictions — they make the bundle self-describing for the Phase 2 viewer.
