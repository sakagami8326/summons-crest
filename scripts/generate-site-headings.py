from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "site"
FONT = Path(r"C:\Windows\Fonts\georgiab.ttf")
WIDTH, HEIGHT = 1800, 360
COLOR = (241, 232, 208, 255)
TRACKING = 12
HEADINGS = {
    "heading-play-style.png": "PLAY STYLE",
    "heading-how-to-play.png": "HOW TO PLAY",
    "heading-game-system.png": "GAME SYSTEM",
    "heading-cards.png": "CARDS",
    "heading-summoners.png": "SUMMONERS",
    "heading-early-access.png": "EARLY ACCESS",
    "heading-news.png": "NEWS",
}


def tracked_width(draw, text, font):
    widths = [draw.textlength(char, font=font) for char in text]
    return sum(widths) + TRACKING * max(0, len(text) - 1), widths


def render(name, text):
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    size = 245
    while size > 80:
        font = ImageFont.truetype(str(FONT), size)
        total, widths = tracked_width(draw, text, font)
        if total <= WIDTH - 120:
            break
        size -= 4
    bbox = draw.textbbox((0, 0), text, font=font)
    y = (HEIGHT - (bbox[3] - bbox[1])) / 2 - bbox[1]
    x = (WIDTH - total) / 2
    for char, char_width in zip(text, widths):
        draw.text((x, y), char, font=font, fill=COLOR)
        x += char_width + TRACKING
    image.save(OUT / name, optimize=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for filename, heading in HEADINGS.items():
        render(filename, heading)
    print(f"generated {len(HEADINGS)} heading assets in {OUT}")
