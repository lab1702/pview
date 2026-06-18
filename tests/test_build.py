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


def test_coerce_serializes_datetimes_to_iso():
    import datetime
    import numpy as np
    from pview import _coerce

    assert _coerce(datetime.date(2020, 1, 1)) == "2020-01-01"
    assert _coerce(datetime.datetime(2020, 1, 1, 12, 30)) == "2020-01-01T12:30:00"
    # numpy.datetime64 -> .item() -> datetime.date (day resolution)
    assert _coerce(np.datetime64("2020-01-01")) == "2020-01-01"


def test_nullable_na_image_generates_card_without_error(tmp_path):
    import pandas as pd
    df = pd.DataFrame(
        {"name": ["A", "B"], "photo": pd.array([pd.NA, pd.NA], dtype="string")}
    )
    _, summary = build_with_summary(df, name_col="name", image_col="photo", out_dir=tmp_path / "s")
    assert summary.n_generated == 2
    assert summary.n_image_errors == 0


def test_coerce_non_finite_floats_become_none():
    from pview import _coerce

    assert _coerce(float("inf")) is None
    assert _coerce(float("-inf")) is None
