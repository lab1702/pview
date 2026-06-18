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
    # centered, with the uncovered margins filled by the same per-item bg color
    # used for cards that have no image.
    from pview.images import _bg_color

    p = tmp_path / "wide.png"
    p.write_bytes(_solid_png(16, 8, (200, 30, 40)))  # 2:1 aspect
    r = load_tile(str(p), item_id=5, name="Ada", fields=[], tile_size=32)
    assert r.tile.size == (32, 32)
    px = r.tile.load()
    # 16x8 contained into 32x32 -> 32x16, centered vertically: rows 8..23 image.
    assert px[16, 16] == (200, 30, 40, 255)        # center is the image
    assert px[16, 0] == (*_bg_color(5), 255)       # top margin is the card bg
    assert px[16, 31] == (*_bg_color(5), 255)      # bottom margin is the card bg


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
