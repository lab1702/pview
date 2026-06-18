import json

from PIL import Image

from pview.facets import Facet
from pview.bundle import write_bundle


def _args(tmp_path):
    return dict(
        out_dir=tmp_path / "out",
        title="People",
        facets=[Facet("age", "numeric", min=1, max=2), Facet("name", "text")],
        items=[{"id": 0, "values": {"name": "Ada", "age": 1}, "atlas": 0, "rect": [0, 0, 64, 64]}],
        atlas_images=[Image.new("RGBA", (64, 64), (1, 2, 3, 255))],
        card_fields=["name", "age"],
        tile_size=64,
    )


def test_folder_bundle_structure(tmp_path):
    out = write_bundle(**_args(tmp_path))
    assert (out / "index.html").exists()
    assert (out / "app.js").exists()
    assert (out / "app.css").exists()
    assert (out / "atlas" / "atlas_0.png").exists()
    data = json.loads((out / "data.json").read_text())
    assert data["version"] == 2
    assert data["title"] == "People"
    assert data["tileSize"] == 64
    assert data["cardFields"] == ["name", "age"]
    assert data["facets"][0] == {"name": "age", "type": "numeric", "min": 1, "max": 2}
    assert data["atlases"] == [{"file": "atlas/atlas_0.png", "width": 64, "height": 64}]
    assert data["items"][0]["values"]["name"] == "Ada"


def test_single_file_bundle(tmp_path):
    args = _args(tmp_path)
    args["single_file"] = True
    out = write_bundle(**args)
    assert out.name == "index.html"
    html = out.read_text()
    assert "data:image/png;base64," in html
    assert "id='pview-data'" in html  # inlined data script present
    assert "id='app'" in html  # mount point present
    assert "</script></body>" in html  # the app.js script tag closes the body


def test_single_file_embeds_atlas_data_uri(tmp_path):
    import re

    args = _args(tmp_path)
    args["single_file"] = True
    out = write_bundle(**args)
    html = out.read_text()
    m = re.search(
        r"<script id='pview-data' type='application/json'>(.*?)</script>", html, re.S
    )
    assert m is not None
    data = json.loads(m.group(1))
    assert data["atlases"][0]["file"].startswith("data:image/png;base64,")


def test_folder_bundle_writes_detail_originals(tmp_path):
    args = _args(tmp_path)
    args["items"] = [
        {"id": 0, "values": {"name": "Ada"}, "atlas": 0, "rect": [0, 0, 64, 64]},
        {"id": 1, "values": {"name": "Bob"}, "atlas": 0, "rect": [0, 0, 64, 64]},
    ]
    args["details"] = {0: (b"\x89PNG-fake-bytes", ".png")}
    out = write_bundle(**args)
    data = json.loads((out / "data.json").read_text())
    assert data["version"] == 2
    assert (out / "detail" / "0.png").read_bytes() == b"\x89PNG-fake-bytes"
    assert data["items"][0]["detail"] == "detail/0.png"
    assert data["items"][1]["detail"] is None


def test_single_file_inlines_detail_as_data_uri(tmp_path):
    args = _args(tmp_path)
    args["single_file"] = True
    args["items"] = [
        {"id": 0, "values": {"name": "Ada"}, "atlas": 0, "rect": [0, 0, 64, 64]},
        {"id": 1, "values": {"name": "Bob"}, "atlas": 0, "rect": [0, 0, 64, 64]},
    ]
    args["details"] = {0: (b"\x89PNG-fake-bytes", ".png")}
    out = write_bundle(**args)
    html = out.read_text()
    import re

    m = re.search(r"<script id='pview-data' type='application/json'>(.*?)</script>", html, re.S)
    data = json.loads(m.group(1))
    assert data["version"] == 2
    assert data["items"][0]["detail"].startswith("data:image/png;base64,")
    assert data["items"][1]["detail"] is None


def test_escape_script_neutralizes_closing_tag():
    from pview.bundle import _escape_script

    out = _escape_script("var a = '</script><b>';")
    assert "</script" not in out
    assert "<\\/script" in out


def test_escape_style_neutralizes_closing_tag():
    from pview.bundle import _escape_style

    out = _escape_style("a{content:'</style>'}")
    assert "</style" not in out
    assert "<\\/style" in out
