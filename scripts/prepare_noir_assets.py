"""Export approved art mechanically; leave every source untouched."""
from pathlib import Path
from PIL import Image, ImageFilter
import shutil
import json

REPO = Path(__file__).resolve().parents[1]
WORKSPACE = REPO.parent
SOURCE = WORKSPACE / 'output/imagegen/noir-evolved-creatures-20261004/approved'
ASSETS = REPO / 'public/assets'
PAIRS = {'inkcrow': ('inkcrow', 'yatabarukan'), 'joma': ('joma', 'jomagia'),
         'yomiga': ('yomiga', 'mothglyph'), 'kagetsuzuri': ('kagetsuzuri', 'tsuzuragant')}

def contain(image, size, margin):
    image = image.convert('RGBA')
    image = image.crop(image.getchannel('A').getbbox())
    image.thumbnail((size-margin*2, size-margin*2), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size))
    canvas.alpha_composite(image, ((size-image.width)//2, (size-image.height)//2))
    return canvas

def main():
    checks = []
    (ASSETS / 'cards').mkdir(exist_ok=True)
    for card, names in PAIRS.items():
        for prefix, name in zip(('c', 'e'), names):
            original = Image.open(SOURCE / f'{name}.png')
            high = contain(original, 1024, 48)
            high.save(ASSETS / f'cards/{prefix}_{card}.webp', 'WEBP', lossless=True, method=6)
            small = contain(original, 300, 14)
            outline = Image.new('RGBA', small.size, (0, 0, 0, 255))
            outline.putalpha(small.getchannel('A').filter(ImageFilter.MaxFilter(5)))
            outline.alpha_composite(small)
            outline.save(ASSETS / f'{prefix}_{card}.png', optimize=True)
            checks.append({'id': card, 'stage': prefix, 'source': str(SOURCE / f'{name}.png')})
    summoner = WORKSPACE / 'output/noir-assets-20260929/assets'
    for item in summoner.rglob('*'):
        if item.is_file():
            target = ASSETS / item.relative_to(summoner)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
    cutin = Image.open(WORKSPACE / 'output/imagegen/noir-ultimate-20261004/ult_noir-v1.png')
    cutin.save(ASSETS / 'ult_noir.webp', 'WEBP', quality=95, method=6)
    for card in PAIRS:
        for prefix in ('c', 'e'):
            for relative, size in ((f'{prefix}_{card}.png', 300), (f'cards/{prefix}_{card}.webp', 1024)):
                image = Image.open(ASSETS / relative)
                assert image.size == (size, size) and image.mode == 'RGBA', relative
                assert image.getchannel('A').getextrema() == (0, 255), relative
    report = WORKSPACE / 'output/imagegen/noir-evolved-creatures-20261004/game-export.json'
    report.write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: 8 creature PNGs, 8 lossless card WebPs, Noir summoner assets and cut-in.')

if __name__ == '__main__':
    main()
