from PIL import Image

from pview.atlas import pack


def _tiles(n, size=64):
    return [Image.new("RGBA", (size, size), (i, i, i, 255)) for i in range(n)]


def test_single_sheet_placements():
    atlases, placements = pack(_tiles(4, 64), tile_size=64, sheet_size=128)
    # 128/64 = 2 per row => 4 per sheet
    assert len(atlases) == 1
    assert placements[0].atlas == 0
    assert placements[0].rect == (0, 0, 64, 64)
    assert placements[1].rect == (64, 0, 64, 64)
    assert placements[2].rect == (0, 64, 64, 64)
    assert placements[3].rect == (64, 64, 64, 64)


def test_spills_to_second_sheet():
    atlases, placements = pack(_tiles(5, 64), tile_size=64, sheet_size=128)
    assert len(atlases) == 2
    assert placements[4].atlas == 1
    assert placements[4].rect == (0, 0, 64, 64)


def test_atlas_dimensions_match_sheet_size():
    atlases, _ = pack(_tiles(1, 64), tile_size=64, sheet_size=128)
    assert atlases[0].size == (128, 128)


def test_empty_input():
    atlases, placements = pack([], tile_size=64, sheet_size=128)
    assert atlases == []
    assert placements == []
