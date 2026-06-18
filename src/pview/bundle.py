from __future__ import annotations

import base64
import html as html_lib
import io
import json
import re
import shutil
from importlib import resources
from pathlib import Path

from PIL import Image

from .facets import Facet


def _escape_script(js: str) -> str:
    # Prevent a minified bundle's `</script>` substring from closing the inline
    # <script> tag early. `<\/script` is identical at runtime (in a JS string/
    # regex `<\/` decodes to `</`; it cannot occur as JS syntax elsewhere).
    return re.sub(r"</script", r"<\\/script", js, flags=re.IGNORECASE)


def _escape_style(css: str) -> str:
    return re.sub(r"</style", r"<\\/style", css, flags=re.IGNORECASE)


_EXT_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
}


def _viewer_dir():
    return resources.files("pview").joinpath("viewer_assets")


def _data_dict(title, facets, items, card_fields, tile_size, atlas_meta):
    return {
        "version": 2,
        "title": title,
        "tileSize": tile_size,
        "facets": [f.to_dict() for f in facets],
        "cardFields": card_fields,
        "atlases": atlas_meta,
        "items": items,
    }


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def write_bundle(
    out_dir,
    *,
    title: str,
    facets: list[Facet],
    items: list[dict],
    atlas_images: list[Image.Image],
    card_fields: list[str],
    tile_size: int,
    single_file: bool = False,
    details: dict[int, tuple[bytes, str]] | None = None,
) -> Path:
    viewer = _viewer_dir()
    details = details or {}

    if single_file:
        atlas_uris = []
        for img in atlas_images:
            b64 = base64.b64encode(_png_bytes(img)).decode()
            atlas_uris.append(f"data:image/png;base64,{b64}")
        atlas_meta = [
            {"file": atlas_uris[i], "width": img.width, "height": img.height}
            for i, img in enumerate(atlas_images)
        ]
        for item in items:
            d = details.get(item["id"])
            if d is not None:
                raw, ext = d
                mime = _EXT_MIME.get(ext.lower(), "application/octet-stream")
                b64 = base64.b64encode(raw).decode()
                item["detail"] = f"data:{mime};base64,{b64}"
            else:
                item["detail"] = None
        data = _data_dict(title, facets, items, card_fields, tile_size, atlas_meta)
        app_js = _escape_script(viewer.joinpath("app.js").read_text())
        app_css = _escape_style(viewer.joinpath("app.css").read_text())
        payload = json.dumps(data).replace("<", "\\u003c")
        html = (
            "<!doctype html><html><head><meta charset='utf-8'><title>"
            f"{html_lib.escape(title)}</title><style>{app_css}</style></head><body>"
            "<div id='app'>pview placeholder viewer (Phase 2 replaces this)</div>"
            f"<script id='pview-data' type='application/json'>{payload}</script>"
            f"<script>{app_js}</script></body></html>"
        )
        out_path = Path(out_dir)
        if out_path.suffix != ".html":
            out_path.mkdir(parents=True, exist_ok=True)
            out_path = out_path / "index.html"
        else:
            out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html)
        return out_path

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for asset in ("index.html", "app.js", "app.css"):
        shutil.copyfile(viewer.joinpath(asset), out / asset)

    atlas_dir = out / "atlas"
    atlas_dir.mkdir(exist_ok=True)
    atlas_meta = []
    for i, img in enumerate(atlas_images):
        fname = f"atlas/atlas_{i}.png"
        img.save(out / fname)
        atlas_meta.append({"file": fname, "width": img.width, "height": img.height})

    detail_dir = out / "detail"
    for item in items:
        d = details.get(item["id"])
        if d is not None:
            raw, ext = d
            detail_dir.mkdir(exist_ok=True)
            fname = f"detail/{item['id']}{ext}"
            (out / fname).write_bytes(raw)
            item["detail"] = fname
        else:
            item["detail"] = None

    data = _data_dict(title, facets, items, card_fields, tile_size, atlas_meta)
    (out / "data.json").write_text(json.dumps(data, indent=2))
    return out
