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


def _truncate(draw: "ImageDraw.ImageDraw", text: str, font, max_width: int) -> str:
    if draw.textlength(text, font=font) <= max_width:
        return text
    ellipsis = "…"
    while text and draw.textlength(text + ellipsis, font=font) > max_width:
        text = text[:-1]
    return text + ellipsis if text else ellipsis


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

    max_width = tile_size - 2 * margin
    line_height = tile_size // 12
    draw.text((margin, margin), _truncate(draw, str(name), name_font, max_width), fill="white", font=name_font)
    y = margin + tile_size // 6
    for label, value in fields:
        if y + line_height > tile_size - margin:
            break
        line = _truncate(draw, f"{label}: {value}", body_font, max_width)
        draw.text((margin, y), line, fill="white", font=body_font)
        y += line_height
    return img


def _default_http_get(url: str) -> bytes:
    import httpx

    resp = httpx.get(url, timeout=10.0, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def _get_with_retry(url: str, http_get: Callable[[str], bytes]) -> bytes:
    last_exc: Exception | None = None
    for _ in range(2):  # one initial attempt + one retry
        try:
            return http_get(url)
        except Exception as exc:  # noqa: BLE001 - retried, then re-raised
            last_exc = exc
    raise last_exc  # type: ignore[misc]


def _fetch_url(url: str, cache_dir: Path | None, http_get: Callable[[str], bytes]) -> bytes:
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        key = cache_dir / (hashlib.sha256(url.encode()).hexdigest() + ".bin")
        if key.exists():
            return key.read_bytes()
        data = _get_with_retry(url, http_get)
        key.write_bytes(data)
        return data
    return _get_with_retry(url, http_get)


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
