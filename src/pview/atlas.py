from __future__ import annotations

from dataclasses import dataclass

from PIL import Image


@dataclass
class Placement:
    atlas: int
    rect: tuple[int, int, int, int]


def pack(
    tiles: list[Image.Image],
    *,
    tile_size: int = 256,
    sheet_size: int = 2048,
) -> tuple[list[Image.Image], list[Placement]]:
    if not tiles:
        return [], []

    per_row = sheet_size // tile_size
    per_sheet = per_row * per_row
    if per_sheet < 1:
        raise ValueError("sheet_size must be >= tile_size")

    atlases: list[Image.Image] = []
    placements: list[Placement] = []

    for i, tile in enumerate(tiles):
        sheet_idx = i // per_sheet
        slot = i % per_sheet
        if slot == 0:
            atlases.append(Image.new("RGBA", (sheet_size, sheet_size), (0, 0, 0, 0)))
        x = (slot % per_row) * tile_size
        y = (slot // per_row) * tile_size
        atlases[sheet_idx].paste(tile, (x, y))
        placements.append(Placement(atlas=sheet_idx, rect=(x, y, tile_size, tile_size)))

    return atlases, placements
