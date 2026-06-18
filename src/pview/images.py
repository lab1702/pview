from __future__ import annotations

import colorsys
from importlib import resources

from PIL import Image, ImageDraw, ImageFont


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
