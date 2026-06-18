from pview.images import generate_card


def test_generate_card_is_correct_size_and_mode():
    img = generate_card(0, "Ada", [("age", "36")], tile_size=256)
    assert img.size == (256, 256)
    assert img.mode == "RGBA"


def test_generate_card_color_is_deterministic_per_id():
    a = generate_card(7, "Ada", [], tile_size=64)
    b = generate_card(7, "Ada", [], tile_size=64)
    assert list(a.getdata()) == list(b.getdata())


def test_generate_card_different_ids_differ():
    a = generate_card(1, "Ada", [], tile_size=64)
    b = generate_card(2, "Ada", [], tile_size=64)
    assert list(a.getdata()) != list(b.getdata())
