"""Generate a small real pview bundle into viewer/fixtures/ for dev."""
import os
import sys

import pandas as pd
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "src"))

from pview import build  # noqa: E402

OUT = os.path.join(HERE, "..", "fixtures")


def main() -> None:
    src_imgs = os.path.join(OUT, "_src")
    os.makedirs(src_imgs, exist_ok=True)
    rows = []
    for i in range(12):
        photo = ""
        if i % 3 == 0:
            p = os.path.join(src_imgs, f"{i}.png")
            Image.new("RGB", (200, 200), ((i * 40) % 255, 80, 160)).save(p)
            photo = p
        rows.append(
            {"name": f"Item {i}", "group": ["A", "B", "C"][i % 3], "rank": i, "photo": photo}
        )
    df = pd.DataFrame(rows)
    build(
        df,
        name_col="name",
        image_col="photo",
        card_fields=["name", "group", "rank"],
        title="Fixture",
        out_dir=OUT,
    )
    print(f"wrote fixture bundle to {OUT}")


if __name__ == "__main__":
    main()
