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


def test_cli_malformed_facet_returns_error(tmp_path):
    rc = main(
        [
            "build", str(_csv(tmp_path)),
            "--name-col", "name",
            "--facet", "age",          # missing '=type'
            "--out", str(tmp_path / "o"),
        ]
    )
    assert rc != 0
