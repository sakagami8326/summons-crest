from pathlib import Path
from PIL import Image, ImageFilter


REPO = Path(__file__).resolve().parents[1]
SOURCE = Path(r"E:\クレストサーキット\クリーチャー")
ASSETS = REPO / "public" / "assets"
CARDS = ASSETS / "cards"

CREATURES = {
    "mist_jelly": (SOURCE / "ミストジェリー-水.png", SOURCE / "アビスアンカー-水.png"),
    "night_jelly": (SOURCE / "ナイトジェリー-水.png", SOURCE / "アビストール-水.png"),
}
MARK_SOURCE = SOURCE / "深淵標.png"


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


def save_card(source_path: Path, target_path: Path) -> None:
    contain(opened(source_path), 1024, 48).save(
        target_path, "WEBP", quality=94, method=6, lossless=False
    )


def save_board(source_path: Path, target_path: Path) -> None:
    board = contain(opened(source_path), 300, 14)
    with_black_outline(board).save(target_path, "PNG", optimize=True)


def main() -> None:
    CARDS.mkdir(parents=True, exist_ok=True)
    for card_id, (base, evolved) in CREATURES.items():
        save_card(base, CARDS / f"c_{card_id}.webp")
        save_card(evolved, CARDS / f"e_{card_id}.webp")
        save_board(base, ASSETS / f"c_{card_id}.png")
        save_board(evolved, ASSETS / f"e_{card_id}.png")
    contain(opened(MARK_SOURCE), 256, 10).save(
        ASSETS / "abyss-mark-v1.webp", "WEBP", quality=88, method=6, lossless=False
    )


if __name__ == "__main__":
    main()
