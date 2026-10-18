"""Prepare the approved, untouched Hibami originals using the established asset pipeline."""
from pathlib import Path
from prepare_v163_assets import opened, contain, with_black_outline

REPO = Path(__file__).resolve().parents[1]
SOURCE = REPO / 'output/creature-concepts/fire-cobra-approved-20261018'
ASSETS = REPO / 'public/assets'

for prefix, original in [('c', 'base-original.png'), ('e', 'evolution-original.png')]:
    image = opened(SOURCE / original)
    contain(image, 1024, 48).save(ASSETS / 'cards' / f'{prefix}_hibami.webp',
                               'WEBP', quality=94, method=6, lossless=False)
    with_black_outline(contain(image, 300, 14)).save(ASSETS / f'{prefix}_hibami.png',
                                                 'PNG', optimize=True)
    print(f'{prefix}_hibami: 300px PNG + 1024px WebP (alpha preserved)')
