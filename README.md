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
you filter and sort. Items with no value for a facet are handled gracefully:
each numeric/date/category filter has a control to include or exclude them
(included by default), the histogram collects them in a trailing `null` bucket,
and they sort to the end. See [`docs/superpowers/specs`](docs/superpowers/specs)
for the design.

## Install

```bash
pip install .
```

Runtime dependencies: `pandas`, `pillow`, `httpx`, and `openpyxl` (for reading
`.xlsx` inputs). Requires Python 3.11+.

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
| **Facet inference** | Classifies each column as `numeric`, `date`, `category`, or `text` (override with `facets=` / `--facet col=type`). Missing values (and `±inf`) are dropped from numeric/date ranges and category value lists; a column with no usable values degrades to `text`. |
| **Image acquisition** | Loads each item's image from a local path or `http(s)` URL (guarded and size-capped — see [Security](#security); retried once), then scales it to fit a fixed square tile while preserving aspect ratio — uncovered margins use the item's background color; falls back to a generated card on missing/blank/failed/oversized images — a bad image never aborts a build. |
| **Card generation** | Renders the name plus selected attributes onto a tile with a deterministic, per-item background color (the same color used for image margins). |
| **Atlas packing** | Packs the fixed-size tiles into atlas sheets for efficient GPU rendering. |
| **Bundle** | Emits `data.json` (facet schema + per-item records + atlas placements), the atlas PNGs, and the viewer — as a folder or a single HTML file. |

## Security

`pview` turns input you provide into a static site. Two trust boundaries are
worth knowing about when the input table isn't entirely your own:

- **Local image paths are trusted input.** A non-URL value in the image column
  is read straight off the filesystem and embedded into the published bundle, so
  a value like `/etc/passwd` would be read and served. Run `pview` only on tables
  you trust; for untrusted input, restrict the image column to URLs or inject a
  custom `http_get`.
- **Remote image URLs are guarded.** The default fetcher allows only `http(s)`
  and refuses hosts that resolve to private, loopback, link-local, reserved, or
  cloud-metadata (`169.254.169.254`) addresses. Each connection is pinned to the
  validated IP, so a rebinding DNS server can't return a public address to the
  check and an internal one to the fetch (TOCTOU); redirects are followed
  manually and re-validated per hop.
- **Downloads and decoding are bounded.** Fetched responses are streamed with a
  64 MiB cap, and images whose declared dimensions exceed ~50 MP are rejected
  before decoding — a decompression bomb degrades to a generated card instead of
  exhausting memory.

Need to reach an internal host deliberately? Pass your own `http_get` to
`build(...)` to bypass the default guard. Single-file bundles inline the data as
JSON in a `<script type="application/json">` block (`</script>` and `<` are
neutralized), and the viewer renders record values as text nodes, not HTML.

## Development

```bash
pip install -e '.[dev]'
python -m pytest
```

## License

[MIT](LICENSE)
