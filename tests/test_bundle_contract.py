import json

import pandas as pd
from PIL import Image

from pview import build

TOP_KEYS = {"version", "title", "tileSize", "facets", "cardFields", "atlases", "items"}
ITEM_KEYS = {"id", "values", "atlas", "rect", "detail"}
FACET_TYPES = {"numeric", "date", "category", "text"}


def test_data_json_matches_viewer_bundle_contract(tmp_path):
    p = tmp_path / "a.png"
    Image.new("RGB", (16, 16), (1, 2, 3)).save(p)
    df = pd.DataFrame({"name": ["A", "B"], "age": [1, 2], "photo": [str(p), ""]})
    out = build(df, name_col="name", image_col="photo", out_dir=tmp_path / "site")
    data = json.loads((out / "data.json").read_text())

    assert set(data) == TOP_KEYS
    assert data["version"] == 2
    assert isinstance(data["atlases"], list)
    for atlas in data["atlases"]:
        assert set(atlas) == {"file", "width", "height"}
    for facet in data["facets"]:
        assert facet["type"] in FACET_TYPES
        assert "name" in facet
    for item in data["items"]:
        assert set(item) == ITEM_KEYS
        assert isinstance(item["id"], int)
        assert isinstance(item["atlas"], int)
        assert isinstance(item["rect"], list) and len(item["rect"]) == 4
        assert all(isinstance(n, int) for n in item["rect"])
        assert isinstance(item["values"], dict)
        assert item["detail"] is None or isinstance(item["detail"], str)
