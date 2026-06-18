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

    def __post_init__(self):
        if self.type not in VALID_TYPES:
            raise ValueError(f"Invalid facet type {self.type!r}")

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
        # No usable values (empty column, or a forced type the data can't satisfy)
        # would yield NaN bounds, which serialize to invalid JSON and break the
        # viewer on load. Degrade to a plain text facet instead.
        if s.empty:
            return Facet(name, "text")
        return Facet(name, "numeric", min=_num(s.min()), max=_num(s.max()))
    if ftype == "date":
        s = pd.to_datetime(series, errors="coerce").dropna()
        if s.empty:
            return Facet(name, "text")
        return Facet(name, "date", min=s.min().date().isoformat(), max=s.max().date().isoformat())
    if ftype == "category":
        vals = sorted(series.dropna().astype(str).unique().tolist())
        if not vals:
            return Facet(name, "text")
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
