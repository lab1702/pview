import io

from PIL import Image

from pview.images import load_tile


def _png_bytes(color=(10, 20, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="PNG")
    return buf.getvalue()


def test_ext_for_prefers_suffix_then_format_then_default():
    from pview.images import _ext_for

    assert _ext_for("PNG", "/a/b/photo.JPG") == ".jpg"   # path suffix wins, lowercased
    assert _ext_for("JPEG", None) == ".jpg"              # decoded format used when no path
    assert _ext_for(None, None) == ".png"                # last-resort default (both unknown)


def test_local_image_is_loaded_and_resized(tmp_path):
    p = tmp_path / "x.png"
    p.write_bytes(_png_bytes())
    r = load_tile(str(p), item_id=0, name="Ada", fields=[], tile_size=32)
    assert r.tile.size == (32, 32)
    assert r.tile.mode == "RGBA"
    assert r.generated is False
    assert r.error is None
    assert r.original == p.read_bytes()
    assert r.ext == ".png"


def _solid_png(w, h, color):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


def test_non_square_image_is_contained_and_letterboxed_with_card_bg(tmp_path):
    # A wide image scaled to fit a square should keep its aspect ratio and be
    # centered, with the uncovered margins filled by the single fixed card bg
    # color used for cards that have no image.
    from pview.images import _CARD_BG

    p = tmp_path / "wide.png"
    p.write_bytes(_solid_png(16, 8, (200, 30, 40)))  # 2:1 aspect
    r = load_tile(str(p), item_id=5, name="Ada", fields=[], tile_size=32)
    assert r.tile.size == (32, 32)
    px = r.tile.load()
    # 16x8 contained into 32x32 -> 32x16, centered vertically: rows 8..23 image.
    assert px[16, 16] == (200, 30, 40, 255)        # center is the image
    assert px[16, 0] == (*_CARD_BG, 255)           # top margin is the card bg
    assert px[16, 31] == (*_CARD_BG, 255)          # bottom margin is the card bg


def test_all_cards_share_one_fixed_light_blue_background(tmp_path):
    # The card background is a single fixed light blue, identical for every item
    # id, on both no-image cards and the margins of letterboxed images.
    from pview.images import CARD_BG_HEX, _CARD_BG, bg_hex

    assert CARD_BG_HEX == "#7da0c4"
    assert bg_hex() == "#7da0c4"

    # No-image cards: a corner pixel is the fixed bg, regardless of id.
    a = load_tile(None, item_id=1, name="A", fields=[], tile_size=32).tile.load()
    b = load_tile(None, item_id=999, name="B", fields=[], tile_size=32).tile.load()
    assert a[0, 0] == (*_CARD_BG, 255)
    assert b[0, 0] == (*_CARD_BG, 255)

    # Letterbox margins of two different ids match each other and the fixed bg.
    p = tmp_path / "wide.png"
    p.write_bytes(_solid_png(16, 8, (200, 30, 40)))
    m1 = load_tile(str(p), item_id=1, name="A", fields=[], tile_size=32).tile.load()
    m2 = load_tile(str(p), item_id=2, name="B", fields=[], tile_size=32).tile.load()
    assert m1[16, 0] == m2[16, 0] == (*_CARD_BG, 255)


def test_missing_value_generates_card():
    r = load_tile(None, item_id=1, name="Ada", fields=[("age", "36")], tile_size=32)
    assert r.tile.size == (32, 32)
    assert r.generated is True
    assert r.error is None
    assert r.original is None
    assert r.ext is None


def test_bad_local_path_generates_card_with_error(tmp_path):
    r = load_tile(str(tmp_path / "nope.png"), item_id=2, name="Ada", fields=[], tile_size=32)
    assert r.generated is True
    assert r.error is not None
    assert r.tile.size == (32, 32) and r.tile.mode == "RGBA"
    assert r.original is None and r.ext is None


def test_oversized_image_degrades_to_card(tmp_path, monkeypatch):
    # A declared size over the pixel cap must be rejected before decode and fall
    # back to a generated card rather than expanding into memory.
    import pview.images as images

    monkeypatch.setattr(images, "_MAX_IMAGE_PIXELS", 4)  # an 8x8 png (64px) exceeds this
    p = tmp_path / "x.png"
    p.write_bytes(_png_bytes())
    r = load_tile(str(p), item_id=0, name="Ada", fields=[], tile_size=32)
    assert r.generated is True
    assert r.error is not None and "pixel limit" in r.error
    assert r.tile.size == (32, 32) and r.tile.mode == "RGBA"


def test_url_is_fetched_via_injected_getter():
    calls = []

    def fake_get(url):
        calls.append(url)
        return _png_bytes((1, 2, 3))

    r = load_tile(
        "https://example.com/a.png", item_id=3, name="Ada", fields=[], tile_size=32, http_get=fake_get
    )
    assert calls == ["https://example.com/a.png"]
    assert r.generated is False
    assert r.error is None
    assert r.original == _png_bytes((1, 2, 3))
    assert r.ext == ".png"


def test_url_failure_generates_card_with_error():
    def boom(url):
        raise RuntimeError("network down")

    r = load_tile(
        "http://example.com/a.png", item_id=4, name="Ada", fields=[], tile_size=32, http_get=boom
    )
    assert r.generated is True
    assert "network down" in r.error
    assert r.tile.size == (32, 32) and r.tile.mode == "RGBA"


def test_is_safe_url_rejects_internal_and_non_http():
    from pview.images import _is_safe_url

    # public IP literals (no DNS needed) are allowed
    assert _is_safe_url("http://8.8.8.8/img.png") is True
    assert _is_safe_url("https://1.1.1.1/img.png") is True
    # cloud metadata, loopback, private, link-local -> blocked
    assert _is_safe_url("http://169.254.169.254/latest/meta-data/") is False
    assert _is_safe_url("http://127.0.0.1/x") is False
    assert _is_safe_url("http://[::1]/x") is False
    assert _is_safe_url("http://10.1.2.3/x") is False
    assert _is_safe_url("http://192.168.0.5/x") is False
    # non-http(s) schemes -> blocked
    assert _is_safe_url("ftp://8.8.8.8/x") is False
    assert _is_safe_url("file:///etc/passwd") is False


def test_default_http_get_refuses_internal_url():
    import pytest

    from pview.images import _default_http_get

    with pytest.raises(ValueError, match="unsafe or non-public"):
        _default_http_get("http://169.254.169.254/latest/meta-data/")


def test_public_ip_or_raise_rejects_host_with_any_internal_ip(monkeypatch):
    # A host resolving to BOTH a public and an internal address must be rejected
    # wholesale, not connected to the public one.
    import socket as _socket

    import pytest

    import pview.images as images

    def fake_gai(host, port, *a, **k):
        return [
            (_socket.AF_INET, _socket.SOCK_STREAM, 6, "", ("93.184.216.34", port or 80)),
            (_socket.AF_INET, _socket.SOCK_STREAM, 6, "", ("127.0.0.1", port or 80)),
        ]

    monkeypatch.setattr(images.socket, "getaddrinfo", fake_gai)
    with pytest.raises(ValueError, match="unsafe or non-public"):
        images._public_ip_or_raise("http://mixed.example.com/x.png")


def test_default_http_get_pins_validated_ip_against_dns_rebinding(monkeypatch):
    # The host resolves PUBLIC during validation, then REBINDS to loopback for
    # the fetch. The connection must target the validated public IP, never the
    # rebound internal one.
    import socket as _socket

    import httpcore
    import pytest

    import pview.images as images

    results = iter(
        [
            [(_socket.AF_INET, _socket.SOCK_STREAM, 6, "", ("93.184.216.34", 80))],  # validation
            [(_socket.AF_INET, _socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))],  # rebind
        ]
    )

    def fake_gai(host, port, *a, **k):
        try:
            return next(results)
        except StopIteration:  # any further lookups also rebound
            return [(_socket.AF_INET, _socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]

    monkeypatch.setattr(images.socket, "getaddrinfo", fake_gai)

    captured = {}

    def fake_connect(self, host, port, **kwargs):
        captured["host"] = host
        raise RuntimeError("stop before real connect")

    monkeypatch.setattr(httpcore.SyncBackend, "connect_tcp", fake_connect)

    with pytest.raises(Exception):
        images._default_http_get("http://rebind.example.com/a.png")

    assert captured["host"] == "93.184.216.34"  # pinned to the validated IP, not 127.0.0.1


def test_url_retries_once_then_succeeds():
    calls = []

    def flaky(url):
        calls.append(url)
        if len(calls) == 1:
            raise RuntimeError("transient")
        return _png_bytes((4, 5, 6))

    r = load_tile(
        "https://example.com/a.png", item_id=9, name="Ada", fields=[], tile_size=32, http_get=flaky
    )
    assert len(calls) == 2
    assert r.generated is False
    assert r.error is None
    assert r.original == _png_bytes((4, 5, 6))
