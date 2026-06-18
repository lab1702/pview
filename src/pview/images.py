from __future__ import annotations

import colorsys
import hashlib
from importlib import resources
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont, ImageOps


def _default_font_path() -> str:
    return str(resources.files("pview").joinpath("assets/fonts/DejaVuSans.ttf"))


def _bg_color(item_id: int) -> tuple[int, int, int]:
    hue = (item_id * 0.61803398875) % 1.0
    r, g, b = colorsys.hls_to_rgb(hue, 0.45, 0.55)
    return int(r * 255), int(g * 255), int(b * 255)


def generate_card(
    item_id: int,
    name: str,
    fields: list[tuple[str, str]],
    tile_size: int = 256,
    font_path: str | None = None,
) -> Image.Image:
    font_path = font_path or _default_font_path()
    img = Image.new("RGBA", (tile_size, tile_size), (*_bg_color(item_id), 255))
    draw = ImageDraw.Draw(img)

    name_font = ImageFont.truetype(font_path, max(12, tile_size // 9))
    body_font = ImageFont.truetype(font_path, max(9, tile_size // 16))
    margin = tile_size // 12

    draw.text((margin, margin), str(name), fill="white", font=name_font)
    y = margin + tile_size // 6
    for label, value in fields:
        draw.text((margin, y), f"{label}: {value}", fill="white", font=body_font)
        y += tile_size // 12
    return img


def _default_http_get(url: str) -> bytes:
    import httpx

    resp = httpx.get(url, timeout=10.0, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def _fetch_url(url: str, cache_dir: Path | None, http_get: Callable[[str], bytes]) -> bytes:
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        key = cache_dir / (hashlib.sha256(url.encode()).hexdigest() + ".bin")
        if key.exists():
            return key.read_bytes()
        data = http_get(url)
        key.write_bytes(data)
        return data
    return http_get(url)


def _normalize(img: Image.Image, tile_size: int) -> Image.Image:
    return ImageOps.fit(img.convert("RGBA"), (tile_size, tile_size))


def load_tile(
    value: str | None,
    *,
    item_id: int,
    name: str,
    fields: list[tuple[str, str]],
    tile_size: int = 256,
    font_path: str | None = None,
    cache_dir: Path | None = None,
    http_get: Callable[[str], bytes] | None = None,
) -> tuple[Image.Image, bool, str | None]:
    import io

    blank = value is None or (isinstance(value, str) and value.strip() == "")
    if not blank:
        http_get = http_get or _default_http_get
        try:
            if str(value).startswith(("http://", "https://")):
                raw = _fetch_url(str(value), cache_dir, http_get)
                img = Image.open(io.BytesIO(raw))
            else:
                img = Image.open(value)
            img.load()
            return _normalize(img, tile_size), False, None
        except Exception as exc:  # degrade to generated card
            card = generate_card(item_id, name, fields, tile_size, font_path)
            return card, True, str(exc)

    return generate_card(item_id, name, fields, tile_size, font_path), True, None
