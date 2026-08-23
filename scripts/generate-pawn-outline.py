"""Generate a cache-busted pawn asset with an outer alpha outline."""

from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "p_lia.png"
OUTPUT = ROOT / "public" / "assets" / "p_lia-outline-v1.png"


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    alpha = source.getchannel("A")
    expanded = alpha.filter(ImageFilter.MaxFilter(7))
    ring = ImageChops.subtract(expanded, alpha)
    ring = ImageEnhance.Contrast(ring).enhance(1.15)

    outline = Image.new("RGBA", source.size, (14, 8, 12, 0))
    outline.putalpha(ring)
    result = Image.alpha_composite(outline, source)
    result.save(OUTPUT, optimize=True)


if __name__ == "__main__":
    main()
