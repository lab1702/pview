# pview example

A tiny, self-contained dataset for trying `pview`: **10 people**, **9 images**,
and one person with no image so you can see the **generated-card** fallback.

## Files

| File | What it is |
|------|------------|
| `people.csv` | 10 rows — `name`, `age`, `department`, `city`, `start_date`, `salary`, `photo`. The last row (Júlia Costa) has an empty `photo`. |
| `images/` | 9 images of random things, at deliberately mixed sizes/aspect ratios (wide `960×360`, tall `300×820`, large `1024×1024`, small `240×240`, …). |
| `make_assets.py` | Regenerates `images/` from scratch (no network, just Pillow). |

## Build it

From this directory:

```bash
pview build people.csv \
  --name-col name \
  --image-col photo \
  --card-fields name,department,city \
  --facet department=category --facet city=category \
  --title "pview demo — 10 people" \
  --out ./site
```

Expected output:

```
Built 10 items (1 generated, 0 image errors, 1 atlases) -> ./site
```

Add `--single-file` (and e.g. `--out ./people.html`) to get one portable
HTML file with all assets inlined.

## What it demonstrates

- **Scaling / cropping** — every source image, whatever its dimensions, is
  center-cropped and fit to a fixed square tile. Open `site/atlas/atlas_0.png`
  to see them side by side: the wide horizon loses its edges, the tall tower is
  trimmed top-and-bottom, the squares fit cleanly.
- **Generated cards** — the one row with a blank `photo` (Júlia Costa) becomes a
  text card: her name plus the `card-fields` (`department`, `city`) drawn on a
  deterministic, per-item background color. The same fallback kicks in for any
  missing or unreadable image, so a bad path never breaks a build.
- **Facet inference** — `age`/`salary` infer as numeric, `start_date` as date,
  and `department`/`city` are pinned to category via `--facet`.

> Phase 1 builds the bundle; the interactive viewer is Phase 2 (placeholder for
> now), so the clearest thing to inspect today is the atlas PNG above.

## Regenerate the images

```bash
python make_assets.py
```
