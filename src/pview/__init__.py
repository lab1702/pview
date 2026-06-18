from __future__ import annotations

import datetime
import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import pandas as pd

from .atlas import pack
from .bundle import write_bundle
from .facets import infer_facets
from .images import bg_hex, load_tile

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
    # Duplicate headers make row[col] return a Series, which blows up downstream
    # (_coerce's `pd.isna(v)` raises on an array). Fail early with a clear message
    # instead. CSV/Excel readers de-dupe automatically; this guards the build(df)
    # API, where a caller can pass a frame with repeated column names.
    dupes = df.columns[df.columns.duplicated()].unique().tolist()
    if dupes:
        raise ValueError(f"Duplicate column names are not supported: {dupes}")

    card_fields = card_fields or [name_col]
    title = title or name_col
    facet_list = infer_facets(df, name_col=name_col, image_col=image_col, overrides=facets)
    cache_path = Path(cache_dir) if cache_dir is not None else None

    tiles = []
    items = []
    details: dict[int, tuple[bytes, str]] = {}
    n_generated = 0
    n_errors = 0

    for pos, (_, row) in enumerate(df.iterrows()):
        name = _fmt(row[name_col])
        fields = [(c, _fmt(row[c])) for c in card_fields if c in df.columns]
        img_value = None if image_col is None else row[image_col]
        if img_value is not None:
            try:
                if pd.isna(img_value):
                    img_value = None
            except (TypeError, ValueError):
                pass
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

        if loaded.original is not None and loaded.ext is not None:
            details[pos] = (loaded.original, loaded.ext)

        values = {c: _coerce(row[c]) for c in df.columns if c != image_col}
        # bg_hex(pos) is the same per-item color baked into the tile by
        # load_tile; emitting it lets the viewer reuse it without reimplementing
        # the palette (single source of truth in images.py).
        items.append({"id": pos, "values": values, "color": bg_hex(pos)})

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
        details=details,
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
        v = v.item()
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


def build(df: pd.DataFrame, **kwargs) -> Path:
    out, _ = build_with_summary(df, **kwargs)
    return out
