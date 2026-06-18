"""Generate the demo images for the pview example.

Run from this directory:  python make_assets.py

Produces 9 images of "random things" at deliberately different sizes and
aspect ratios (wide, tall, square, large, tiny) so the example shows how
pview normalizes every tile to a square via a center-crop+fit. The people in
``people.csv`` reference these by relative path; one person has a blank image
cell, which pview renders as a generated text card instead.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

IMAGES = Path(__file__).parent / "images"


def _grid(draw: ImageDraw.ImageDraw, w: int, h: int, step: int, color) -> None:
    for x in range(0, w, step):
        draw.line([(x, 0), (x, h)], fill=color, width=1)
    for y in range(0, h, step):
        draw.line([(0, y), (w, y)], fill=color, width=1)


def horizon(w: int, h: int) -> Image.Image:
    """Wide landscape gradient with a sun — a panorama, so the crop is obvious."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / h
        px_row = (int(40 + 160 * t), int(120 + 80 * t), int(220 - 120 * t))
        for x in range(w):
            px[x, y] = px_row
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.7, h * 0.15, w * 0.7 + h * 0.4, h * 0.15 + h * 0.4], fill=(255, 230, 120))
    return img


def skyscraper(w: int, h: int) -> Image.Image:
    """Tall portrait — a striped tower, so the vertical crop is visible."""
    img = Image.new("RGB", (w, h), (24, 28, 48))
    d = ImageDraw.Draw(img)
    for y in range(0, h, max(8, h // 40)):
        d.rectangle([w * 0.25, y, w * 0.75, y + h // 80 + 2], fill=(250, 210, 90))
    d.rectangle([w * 0.2, 0, w * 0.8, h], outline=(180, 190, 220), width=4)
    return img


def target(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), (245, 245, 245))
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h / 2
    rings = min(w, h) // 2
    for i, r in enumerate(range(rings, 0, -rings // 6 or 1)):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(220, 60, 60) if i % 2 else (250, 250, 250))
    return img


def checker(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), (255, 255, 255))
    d = ImageDraw.Draw(img)
    s = max(8, min(w, h) // 8)
    for j, y in enumerate(range(0, h, s)):
        for i, x in enumerate(range(0, w, s)):
            if (i + j) % 2 == 0:
                d.rectangle([x, y, x + s, y + s], fill=(40, 40, 40))
    return img


def waves(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), (10, 30, 60))
    d = ImageDraw.Draw(img)
    for k in range(0, h, 6):
        pts = [(x, k + int(18 * math.sin(x / 22.0 + k / 30.0))) for x in range(0, w, 4)]
        d.line(pts, fill=(80, 200, 255), width=2)
    return img


def confetti(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), (250, 250, 250))
    d = ImageDraw.Draw(img)
    palette = [(231, 76, 60), (46, 204, 113), (52, 152, 219), (241, 196, 15), (155, 89, 182)]
    # deterministic pseudo-scatter, no RNG needed
    for i in range(140):
        x = (i * 73) % w
        y = (i * 137) % h
        r = 4 + (i % 5) * 3
        d.ellipse([x, y, x + r, y + r], fill=palette[i % len(palette)])
    return img


def blueprint(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), (18, 52, 110))
    d = ImageDraw.Draw(img)
    _grid(d, w, h, max(12, w // 16), (70, 110, 180))
    d.rectangle([w * 0.2, h * 0.25, w * 0.8, h * 0.75], outline=(220, 235, 255), width=3)
    d.line([(w * 0.2, h * 0.5), (w * 0.8, h * 0.5)], fill=(220, 235, 255), width=2)
    return img


def sunburst(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), (20, 20, 30))
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h / 2
    for deg in range(0, 360, 12):
        a = math.radians(deg)
        d.line([(cx, cy), (cx + math.cos(a) * w, cy + math.sin(a) * h)],
               fill=(255, 170, 60) if (deg // 12) % 2 else (255, 90, 40), width=3)
    d.ellipse([cx - w * 0.1, cy - w * 0.1, cx + w * 0.1, cy + w * 0.1], fill=(255, 240, 200))
    return img


def leaf(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), (235, 245, 235))
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.15, h * 0.1, w * 0.85, h * 0.9], fill=(60, 150, 70))
    d.line([(w * 0.5, h * 0.15), (w * 0.5, h * 0.85)], fill=(30, 90, 40), width=max(2, w // 60))
    for t in range(2, 9):
        y = h * (0.15 + t * 0.08)
        d.line([(w * 0.5, y), (w * (0.5 + 0.18), y - h * 0.04)], fill=(30, 90, 40), width=2)
        d.line([(w * 0.5, y), (w * (0.5 - 0.18), y - h * 0.04)], fill=(30, 90, 40), width=2)
    return img


# (filename, factory, (width, height)) — sizes vary on purpose.
SPECS = [
    ("01-horizon.png", horizon, (960, 360)),      # very wide
    ("02-skyscraper.png", skyscraper, (300, 820)),  # very tall
    ("03-target.png", target, (240, 240)),          # tiny square
    ("04-checker.jpg", checker, (700, 500)),        # landscape, JPEG
    ("05-waves.png", waves, (640, 400)),
    ("06-confetti.png", confetti, (1024, 1024)),    # large square
    ("07-blueprint.png", blueprint, (500, 700)),    # portrait
    ("08-sunburst.jpg", sunburst, (512, 512)),
    ("09-leaf.png", leaf, (420, 600)),
]


def main() -> None:
    IMAGES.mkdir(parents=True, exist_ok=True)
    for fname, factory, (w, h) in SPECS:
        img = factory(w, h)
        path = IMAGES / fname
        if path.suffix.lower() in {".jpg", ".jpeg"}:
            img.convert("RGB").save(path, quality=88)
        else:
            img.save(path)
        print(f"wrote {path.relative_to(IMAGES.parent)}  ({w}x{h})")


if __name__ == "__main__":
    main()
