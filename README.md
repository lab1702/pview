# pview

Turn a table of items and attributes into a self-contained, interactive
collection viewer — inspired by Microsoft's old PivotViewer.

Give `pview` a `pandas` DataFrame (or a CSV/Excel file) describing your items —
names, attributes, and an optional image per row. It infers each attribute's
type, draws a card for every item (using the supplied image, or generating one
from the item's text when no image is available), packs the cards into texture
atlases, and writes a self-contained bundle you can open in any browser.

The bundle ships with an interactive viewer baked in: open `index.html` and you
get filterable facets, a sorted grid, a histogram view, search, a detail pane,
and animated transitions that keep the whole collection centered and framed as
you filter and sort. See [`docs/superpowers/specs`](docs/superpowers/specs) for
the design.

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

## Example

[`example/`](example) is a ready-to-build dataset: 10 people, 9 images at mixed
sizes, and one person with no image. From that directory:

```bash
pview build people.csv \
  --name-col name \
  --image-col photo \
  --card-fields name,department,city \
  --facet department=category --facet city=category \
  --title "pview demo — 10 people" \
  --out ./site
# Built 10 items (1 generated, 0 image errors, 1 atlases) -> ./site
```

It shows the pieces working together: every image is scaled to fit a square tile
while keeping its aspect ratio (so the varied aspect ratios are letterboxed or
pillarboxed rather than cropped), the one blank `photo` becomes a generated text
card, and the columns infer as numeric/date/category facets. See
[`example/README.md`](example/README.md) for details.

## How it works

| Stage | What it does |
|-------|--------------|
| **Facet inference** | Classifies each column as `numeric`, `date`, `category`, or `text` (override with `facets=` / `--facet col=type`). |
| **Image acquisition** | Loads each item's image from a local path or `http(s)` URL (retried once), then scales it to fit a fixed square tile while preserving aspect ratio — uncovered margins use the item's background color; falls back to a generated card on missing/blank/failed images — a bad image never aborts a build. |
| **Card generation** | Renders the name plus selected attributes onto a tile with a deterministic, per-item background color (the same color used for image margins). |
| **Atlas packing** | Packs the fixed-size tiles into atlas sheets for efficient GPU rendering. |
| **Bundle** | Emits `data.json` (facet schema + per-item records + atlas placements), the atlas PNGs, and the viewer — as a folder or a single HTML file. |

## Development

```bash
pip install -e '.[dev,cli]'
python -m pytest
```

## License

[MIT](LICENSE)
