from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
HUD_SOURCE = Path(r"E:\クレストサーキット\プレイヤー\ネラシオ-HUD.png")
CUTIN_SOURCE = Path(r"C:\Users\gamig\.codex\generated_images\019ff1d3-e0f4-7633-a61b-7139f1707a96\exec-fed6e4da-cf0b-435f-98ff-fb3f64e862a4.png")


def contain(source: Image.Image, size: tuple[int, int], bottom: bool = True) -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    image = source.copy()
    image.thumbnail(size, Image.Resampling.LANCZOS)
    x = (size[0] - image.width) // 2
    y = size[1] - image.height if bottom else (size[1] - image.height) // 2
    canvas.alpha_composite(image, (x, y))
    return canvas


def face_crop(source: Image.Image) -> Image.Image:
    # HUD原画の顔周辺を正方形へ切り出し、既存の顔アイコン規格へ合わせる。
    w, h = source.size
    side = min(w, h)
    left = max(0, int(w * 0.16))
    top = 0
    crop = source.crop((left, top, min(w, left + side), min(h, top + side)))
    return contain(crop, (420, 420), bottom=False)


def main() -> None:
    if not HUD_SOURCE.exists():
        raise FileNotFoundError(HUD_SOURCE)
    if not CUTIN_SOURCE.exists():
        raise FileNotFoundError(CUTIN_SOURCE)

    hud = Image.open(HUD_SOURCE).convert("RGBA")
    cutin = Image.open(CUTIN_SOURCE).convert("RGB")

    # キャラ詳細用は縦長いっぱいに表示し、胸上アートが上半分だけ空かないよう中央トリミングする。
    ImageOps.fit(hud, (413, 620), method=Image.Resampling.LANCZOS,
                 centering=(0.5, 0.42)).save(ASSETS / "full_nerasio.png", optimize=True)
    # 専用のコマ原画が届くまで、HUDアートを正方形トークンへ安全に収める。
    contain(hud, (190, 190)).save(ASSETS / "p_nerasio.png", optimize=True)
    face_crop(hud).save(ASSETS / "f_nerasio.png", optimize=True)
    cutin.save(ASSETS / "ult_nerasio.webp", "WEBP", quality=94, method=6)
    cutin.save(ASSETS / "summoner-still-nerasio.webp", "WEBP", quality=92, method=6)


if __name__ == "__main__":
    main()
