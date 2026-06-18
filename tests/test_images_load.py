import io

from PIL import Image

from pview.images import load_tile


def _png_bytes(color=(10, 20, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="PNG")
    return buf.getvalue()


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
