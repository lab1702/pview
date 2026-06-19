from __future__ import annotations

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


# Card background. A single fixed light blue fills both generated (no-image)
# cards and the letterbox/pillarbox margins around non-square images, so every
# card sits on one consistent field. The hex form is written into the bundle
# (see bg_hex) so the viewer's detail card reuses the exact color baked into the
# atlas tile rather than recomputing it (single source of truth lives here).
CARD_BG_HEX = "#7da0c4"
_CARD_BG = (0x7D, 0xA0, 0xC4)


def _text_color(bg: tuple[int, int, int]) -> str:
    # Black or white card text, whichever reads better on the background. Uses the
    # WCAG relative-luminance formula so the choice stays legible if _CARD_BG ever
    # changes to a paler or darker shade.
    r, g, b = (c / 255 for c in bg)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return "#1a2332" if lum > 0.55 else "white"


def bg_hex() -> str:
    """The fixed card background as a ``#rrggbb`` string. Written into the bundle so
    the viewer's detail card reuses the exact color baked into the atlas tile."""
    return CARD_BG_HEX


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
    img = Image.new("RGBA", (tile_size, tile_size), (*_CARD_BG, 255))
    draw = ImageDraw.Draw(img)
    text_color = _text_color(_CARD_BG)

    name_font = ImageFont.truetype(font_path, max(12, tile_size // 9))
    body_font = ImageFont.truetype(font_path, max(9, tile_size // 16))
    margin = tile_size // 12

    max_width = tile_size - 2 * margin
    line_height = tile_size // 12
    draw.text((margin, margin), _truncate(draw, str(name), name_font, max_width), fill=text_color, font=name_font)
    y = margin + tile_size // 6
    for label, value in fields:
        if y + line_height > tile_size - margin:
            break
        line = _truncate(draw, f"{label}: {value}", body_font, max_width)
        draw.text((margin, y), line, fill=text_color, font=body_font)
        y += line_height
    return img


_MAX_REDIRECTS = 5

# Hardening against decompression bombs and oversized downloads. The pixel cap is
# checked against the declared header dimensions *before* decoding (so a tiny file
# claiming a huge canvas never gets expanded into memory); the byte cap bounds the
# raw download. Both failures degrade to a generated card rather than crashing.
_MAX_IMAGE_PIXELS = 50_000_000  # ~50 MP
_MAX_FETCH_BYTES = 64 * 1024 * 1024  # 64 MiB


def _public_ip_or_raise(url: str) -> str:
    # SSRF guard for the *default* fetcher: only http(s), and only hosts that
    # resolve entirely to public addresses. This blocks build inputs that point
    # at cloud metadata (169.254.169.254), localhost, or private ranges. Callers
    # that genuinely need internal hosts can inject their own ``http_get``.
    #
    # Returns the validated IP to connect to (rather than just a bool) so the
    # caller can pin the connection to that exact address. Resolving here and
    # connecting somewhere that re-resolves would leave a DNS-rebinding/TOCTOU
    # hole: a host could answer public to this check and private to the fetch.
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"refusing to fetch unsafe or non-public URL: {url!r}")
    host = parsed.hostname
    if not host:
        raise ValueError(f"refusing to fetch unsafe or non-public URL: {url!r}")
    try:
        infos = socket.getaddrinfo(host, parsed.port, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError, ValueError):
        raise ValueError(f"refusing to fetch unsafe or non-public URL: {url!r}")
    if not infos:
        raise ValueError(f"refusing to fetch unsafe or non-public URL: {url!r}")
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
            raise ValueError(f"refusing to fetch unsafe or non-public URL: {url!r}")
    # Every resolved address is public; pin the connection to the first.
    return infos[0][4][0]


def _is_safe_url(url: str) -> bool:
    try:
        _public_ip_or_raise(url)
        return True
    except ValueError:
        return False


def _pinned_transport(ip: str):
    # An httpx transport whose every TCP connection goes to ``ip`` regardless of
    # the request host. We resolve+validate the host once (_public_ip_or_raise)
    # and connect to that exact address, so a rebinding DNS server can't return a
    # public IP to the SSRF check and a private one to the actual connection.
    # TLS SNI and certificate verification still use the original hostname — only
    # the socket's destination address is overridden.
    import httpcore
    import httpx

    class _PinnedBackend(httpcore.SyncBackend):
        def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
            return super().connect_tcp(
                ip, port, timeout=timeout, local_address=local_address, socket_options=socket_options
            )

    transport = httpx.HTTPTransport()
    transport._pool._network_backend = _PinnedBackend()
    return transport


def _default_http_get(url: str) -> bytes:
    import httpx

    # Follow redirects manually so every hop is re-validated against the SSRF
    # guard — an allowed public URL must not be able to bounce us to an internal
    # one — and re-resolved+pinned so each connection lands on the address we
    # actually validated.
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        ip = _public_ip_or_raise(current)
        with httpx.Client(
            timeout=10.0, follow_redirects=False, transport=_pinned_transport(ip)
        ) as client:
            with client.stream("GET", current) as resp:
                if resp.is_redirect:
                    location = resp.headers.get("location")
                    if not location:
                        break
                    current = str(resp.url.join(location))
                    continue
                resp.raise_for_status()
                # Stream with a hard cap so a hostile endpoint can't exhaust
                # memory/disk with an unbounded (or chunked, never-ending) body.
                chunks: list[bytes] = []
                total = 0
                for chunk in resp.iter_bytes():
                    total += len(chunk)
                    if total > _MAX_FETCH_BYTES:
                        raise ValueError(
                            f"image exceeds {_MAX_FETCH_BYTES}-byte limit: {current!r}"
                        )
                    chunks.append(chunk)
                return b"".join(chunks)
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


def _normalize(img: Image.Image, tile_size: int) -> Image.Image:
    # Scale to fit the square while preserving aspect ratio (letterbox/pillarbox)
    # rather than cropping. Uncovered margins use the same fixed background as
    # cards with no image, so image and generated cards sit on a consistent field.
    fitted = ImageOps.contain(img.convert("RGBA"), (tile_size, tile_size))
    tile = Image.new("RGBA", (tile_size, tile_size), (*_CARD_BG, 255))
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
    """Resolve an image column value to a tile.

    Security note: a non-URL ``value`` is treated as a local filesystem path and
    read directly, and its bytes are embedded into the published bundle. The CSV
    is therefore trusted input — a value like ``/etc/passwd`` would be read and
    served. Run pview only on CSVs you trust; for untrusted input, inject an
    ``http_get`` and confine image columns to URLs. Remote URLs go through the
    SSRF guard (``_public_ip_or_raise``); local paths do not.
    """
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
            # Reject decompression bombs on the declared size, before decoding.
            if img.width * img.height > _MAX_IMAGE_PIXELS:
                raise ValueError(
                    f"image {img.width}x{img.height} exceeds {_MAX_IMAGE_PIXELS}-pixel limit"
                )
            img.load()
            return LoadedImage(
                tile=_normalize(img, tile_size),
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
