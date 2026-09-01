"""Build the self-hosted Shippori Mincho subsets used by the public site."""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "public" / "site"
FONT_DIR = ROOT / "public" / "assets" / "site" / "fonts"


def source_text() -> str:
    paths = [ROOT / "server.js"]
    paths.extend(
        path
        for path in SITE.rglob("*")
        if path.is_file() and path.suffix.lower() in {".html", ".css", ".js", ".json"}
    )
    text = "".join(path.read_text(encoding="utf-8") for path in paths)
    # Keep common punctuation and numerals even if future copy changes slightly.
    text += " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    text += "、。・：；？！ー〜（）［］【】『』「」〈〉《》＋－×÷％／…"
    return "".join(sorted(set(text)))


def build(weight: int, text: str) -> None:
    source = FONT_DIR / f"shippori-mincho-{weight}.woff2"
    output = FONT_DIR / f"shippori-mincho-{weight}-site-v154.woff2"
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    font = TTFont(source)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(output)
    print(f"{output.relative_to(ROOT)}: {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    glyphs = source_text()
    for font_weight in (400, 600, 700):
        build(font_weight, glyphs)
