from pathlib import Path
from PIL import Image


ROOT = Path(r"E:\クレストサーキット")
REPO = ROOT / "repo" / "summons-crest"
ASSETS = REPO / "public" / "assets"
CARDS = ASSETS / "cards"

CREATURES = {
    "grayble": (ROOT / "クリーチャー" / "グレイブル-火.png", ROOT / "クリーチャー" / "グランガルム-火.png"),
    "trooper": (ROOT / "クリーチャー" / "トルーパー-火.png", ROOT / "クリーチャー" / "グリゴール-火.png"),
    "survey": (ROOT / "クリーチャー" / "サーベイ-水.png", ROOT / "クリーチャー" / "ザシャック-水.png"),
    "palecoral": (ROOT / "クリーチャー" / "パレコラル-水.png", ROOT / "クリーチャー" / "コラルグレイヴ-水.png"),
}


def opened(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def contain_on_canvas(source: Image.Image, size: int, margin: int) -> Image.Image:
    box = source.getbbox()
    cropped = source.crop(box) if box else source
    limit = size - margin * 2
    ratio = min(limit / cropped.width, limit / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * ratio)), max(1, round(cropped.height * ratio))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def save_card(source_path: Path, target_path: Path) -> None:
    image = contain_on_canvas(opened(source_path), 1024, 60)
    image.save(target_path, "WEBP", quality=94, method=6, lossless=False)


def save_board(source_path: Path, target_path: Path) -> None:
    image = contain_on_canvas(opened(source_path), 300, 10)
    image.save(target_path, "PNG", optimize=True)


def save_pawn(source_path: Path, target_path: Path) -> None:
    image = contain_on_canvas(opened(source_path), 512, 12)
    image.save(target_path, "WEBP", quality=94, method=6, lossless=False)


def main() -> None:
    CARDS.mkdir(parents=True, exist_ok=True)
    for card_id, (base, evolved) in CREATURES.items():
        save_card(base, CARDS / f"c_{card_id}.webp")
        save_card(evolved, CARDS / f"e_{card_id}.webp")
        save_board(base, ASSETS / f"c_{card_id}.png")
        save_board(evolved, ASSETS / f"e_{card_id}.png")
    save_pawn(ROOT / "プレイヤー" / "アーデル-コマ.png", ASSETS / "pawn_adel.webp")


if __name__ == "__main__":
    main()
