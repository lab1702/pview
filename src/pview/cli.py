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
