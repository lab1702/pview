from __future__ import annotations

import colorsys
import hashlib
import ipaddress
import socket
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFont, ImageOps


_FORMAT_EXT = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "GIF": ".gif",
    "WEBP": ".webp",
    "BMP": ".bmp",
    "TIFF": ".tiff",
}


@dataclass
class LoadedImage:
    tile: Image.Image
    generated: bool
    error: str | None
    original: bytes | None = None
    ext: str | None = None


def _ext_for(img_format: str | None, local_path: str | None) -> str:
    # Prefer the source filename's suffix; else map the decoded PIL format.
    # ".png" is a deliberate last-resort default when neither is known (rare:
    # a successfully decoded image almost always reports img.format). Stored
    # detail files/URIs are content-sniffed by browsers, so a mismatched
    # extension here renders correctly regardless.
    if local_path:
        suffix = Path(local_path).suffix.lower()
        if suffix:
            return suffix
    return _FORMAT_EXT.get((img_format or "").upper(), ".png")


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


_MAX_REDIRECTS = 5


def _is_safe_url(url: str) -> bool:
    # SSRF guard for the *default* fetcher: only http(s), and only hosts that
    # resolve entirely to public addresses. This blocks build inputs that point
    # at cloud metadata (169.254.169.254), localhost, or private ranges. Callers
    # that genuinely need internal hosts can inject their own ``http_get``.
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, parsed.port, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError, ValueError):
        return False
    if not infos:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False
    return True


def _default_http_get(url: str) -> bytes:
    import httpx

    # Follow redirects manually so every hop is re-validated against the SSRF
    # guard — an allowed public URL must not be able to bounce us to an
    # internal one.
    current = url
    with httpx.Client(timeout=10.0, follow_redirects=False) as client:
        for _ in range(_MAX_REDIRECTS + 1):
            if not _is_safe_url(current):
                raise ValueError(f"refusing to fetch unsafe or non-public URL: {current!r}")
            resp = client.get(current)
            if resp.is_redirect:
                location = resp.headers.get("location")
                if not location:
                    break
                current = str(resp.url.join(location))
                continue
            resp.raise_for_status()
            return resp.content
    raise ValueError(f"too many redirects fetching {url!r}")


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


def _normalize(img: Image.Image, tile_size: int, item_id: int) -> Image.Image:
    # Scale to fit the square while preserving aspect ratio (letterbox/pillarbox)
    # rather than cropping. Uncovered margins use the same per-item background as
    # cards with no image, so image and generated cards sit on a consistent field.
    fitted = ImageOps.contain(img.convert("RGBA"), (tile_size, tile_size))
    tile = Image.new("RGBA", (tile_size, tile_size), (*_bg_color(item_id), 255))
    offset = ((tile_size - fitted.width) // 2, (tile_size - fitted.height) // 2)
    tile.paste(fitted, offset, fitted)
    return tile


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
) -> LoadedImage:
    import io

    blank = value is None or (isinstance(value, str) and value.strip() == "")
    if not blank:
        http_get = http_get or _default_http_get
        try:
            sval = str(value)
            if sval.startswith(("http://", "https://")):
                raw = _fetch_url(sval, cache_dir, http_get)
                local_path = None
            else:
                raw = Path(sval).read_bytes()
                local_path = sval
            img = Image.open(io.BytesIO(raw))
            img.load()
            return LoadedImage(
                tile=_normalize(img, tile_size, item_id),
                generated=False,
                error=None,
                original=raw,
                ext=_ext_for(img.format, local_path),
            )
        except Exception as exc:  # degrade to generated card
            card = generate_card(item_id, name, fields, tile_size, font_path)
            return LoadedImage(tile=card, generated=True, error=str(exc))

    return LoadedImage(
        tile=generate_card(item_id, name, fields, tile_size, font_path),
        generated=True,
        error=None,
    )
