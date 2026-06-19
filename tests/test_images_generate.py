from pview.images import generate_card


def test_generate_card_is_correct_size_and_mode():
    img = generate_card(0, "Ada", [("age", "36")], tile_size=256)
    assert img.size == (256, 256)
    assert img.mode == "RGBA"


def test_generate_card_color_is_deterministic_per_id():
    a = generate_card(7, "Ada", [], tile_size=64)
    b = generate_card(7, "Ada", [], tile_size=64)
    assert a.tobytes() == b.tobytes()


def test_generate_card_background_is_fixed_regardless_of_id():
    # The card background no longer varies per id: two ids with identical content
    # produce identical cards, and the background is the fixed light blue.
    from pview.images import _CARD_BG

    a = generate_card(1, "Ada", [], tile_size=64)
    b = generate_card(2, "Ada", [], tile_size=64)
    assert a.tobytes() == b.tobytes()
    assert a.load()[0, 0] == (*_CARD_BG, 255)


def test_generate_card_handles_long_name_without_overflow():
    img = generate_card(0, "X" * 300, [], tile_size=128)
    assert img.size == (128, 128)
    assert img.mode == "RGBA"


def test_generate_card_handles_many_fields_without_error():
    fields = [(f"k{i}", f"v{i}") for i in range(60)]
    img = generate_card(1, "Ada", fields, tile_size=128)
    assert img.size == (128, 128)
    assert img.mode == "RGBA"
