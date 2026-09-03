from pathlib import Path
from PIL import Image, ImageFilter


REPO = Path(__file__).resolve().parents[1]
SOURCE = Path(r"E:\クレストサーキット\クリーチャー")
ASSETS = REPO / "public" / "assets"
CARDS = ASSETS / "cards"

CREATURES = {
    "wakatama": (SOURCE / "ワカタマ-水.png", SOURCE / "ガマワカメ-水.png"),
    "emeri": (SOURCE / "エメリ-土.png", SOURCE / "エスメラルダ-土.png"),
    "valk": (SOURCE / "ヴァルク-土.png", SOURCE / "アヌビス・レガ-土.png"),
}


def opened(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def contain(source: Image.Image, size: int, margin: int) -> Image.Image:
    box = source.getbbox()
    cropped = source.crop(box) if box else source
    limit = size - margin * 2
    scale = min(limit / cropped.width, limit / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def with_black_outline(source: Image.Image, radius: int = 5) -> Image.Image:
    alpha = source.getchannel("A")
    expanded = alpha.filter(ImageFilter.MaxFilter(radius * 2 + 1))
    outline = Image.new("RGBA", source.size, (0, 0, 0, 255))
    outline.putalpha(expanded)
    outline.alpha_composite(source)
    return outline


def main() -> None:
    CARDS.mkdir(parents=True, exist_ok=True)
    for card_id, (base, evolved) in CREATURES.items():
        contain(opened(base), 1024, 48).save(
            CARDS / f"c_{card_id}.webp", "WEBP", quality=94, method=6, lossless=False
        )
        contain(opened(evolved), 1024, 48).save(
            CARDS / f"e_{card_id}.webp", "WEBP", quality=94, method=6, lossless=False
        )
        with_black_outline(contain(opened(base), 300, 14)).save(
            ASSETS / f"c_{card_id}.png", "PNG", optimize=True
        )
        with_black_outline(contain(opened(evolved), 300, 14)).save(
            ASSETS / f"e_{card_id}.png", "PNG", optimize=True
        )


if __name__ == "__main__":
    main()
