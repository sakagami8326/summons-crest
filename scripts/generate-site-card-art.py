"""Generate site-only creature art with alpha-edge color decontamination."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "cards"
OUTPUT = ROOT / "public" / "assets" / "site" / "cards"
CARD_IDS = (
    "gecko",
    "kamadoma",
    "kbaby",
    "goagoa",
    "bonerex",
    "komao",
    "toxy",
    "garble",
    "cleo",
)


def decontaminate(source: Path, destination: Path) -> None:
    rgba = np.asarray(Image.open(source).convert("RGBA"), dtype=np.uint8).copy()
    alpha = rgba[:, :, 3]
    eroded = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MinFilter(9)), dtype=np.uint8)
    rgba[:, :, 3] = np.where(eroded >= 128, 255, 0).astype(np.uint8)
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(destination, "WEBP", lossless=True, method=6)


def main() -> None:
    for card_id in CARD_IDS:
        for prefix in ("c", "e"):
            filename = f"{prefix}_{card_id}.webp"
            decontaminate(SOURCE / filename, OUTPUT / filename)
            print(f"generated {OUTPUT / filename}")


if __name__ == "__main__":
    main()
