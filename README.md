# pview

Turn a table of items and attributes into a self-contained, interactive
collection viewer — inspired by Microsoft's old PivotViewer.

Give `pview` a `pandas` DataFrame (or a CSV/Excel file) describing your items —
names, attributes, and an optional image per row. It infers each attribute's
type, draws a card for every item (using the supplied image, or generating one
from the item's text when no image is available), packs the cards into texture
atlases, and writes a self-contained bundle you can open in any browser.

> **Status — Phase 1.** The build pipeline (DataFrame → bundle) is complete and
> tested. The interactive viewer that renders the bundle — filterable facets, a
> sorted grid, the histogram view, search, detail pane, and animated transitions
> at 20k+ items — is **Phase 2** and currently ships as a placeholder. See
> [`docs/superpowers/specs`](docs/superpowers/specs) for the design.

## Install

```bash
pip install .
```

Runtime dependencies: `pandas`, `pillow`, `httpx` (and `openpyxl` for reading
`.xlsx` via the CLI). Requires Python 3.11+.

## Usage

### Python API

```python
import pandas as pd
from pview import build

df = pd.DataFrame({
    "name":   ["Ada", "Bob", "Cy"],
    "age":    [36, 41, 28],
    "gender": ["female", "male", "female"],
    "photo":  ["ada.png", "https://example.com/bob.jpg", ""],  # optional; blank -> generated card
})

out = build(
    df,
    name_col="name",
    image_col="photo",                  # omit to generate every card
    card_fields=["name", "age"],        # fields drawn on generated cards
    title="People",
    out_dir="./people_site",
)
print(out)  # ./people_site — open index.html
```

`build_with_summary(...)` returns `(path, BuildSummary)` with counts of items,
generated cards, image failures, and atlas sheets.

### Command line

```bash
pview build people.csv \
  --name-col name \
  --image-col photo \
  --card-fields name,age \
  --facet zip=category \
  --title People \
  --out ./people_site
```

Add `--single-file` to emit one portable `index.html` (assets base64-inlined)
instead of a folder — best for small collections.

## How it works

| Stage | What it does |
|-------|--------------|
| **Facet inference** | Classifies each column as `numeric`, `date`, `category`, or `text` (override with `facets=` / `--facet col=type`). |
| **Image acquisition** | Loads each item's image from a local path or `http(s)` URL (retried once); falls back to a generated card on missing/blank/failed images — a bad image never aborts a build. |
| **Card generation** | Renders the name plus selected attributes onto a tile with a deterministic, per-item background color. |
| **Atlas packing** | Normalizes every card to a fixed tile size and packs them into atlas sheets for efficient GPU rendering. |
| **Bundle** | Emits `data.json` (facet schema + per-item records + atlas placements), the atlas PNGs, and the viewer — as a folder or a single HTML file. |

## Development

```bash
pip install -e '.[dev,cli]'
python -m pytest
```

## License

[MIT](LICENSE)
