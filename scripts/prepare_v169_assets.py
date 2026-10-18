"""Prepare approved Suminoko art, retaining originals and transparency."""
from pathlib import Path
from prepare_v163_assets import opened, contain, with_black_outline

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/creature-concepts/charcoal-tree-approved-20261018'
for prefix, name in [('c', 'base-original.png'), ('e', 'evolution-original.png')]:
    image = opened(SOURCE / name)
    contain(image, 1024, 48).save(ROOT / f'public/assets/cards/{prefix}_suminoko.webp', 'WEBP', quality=94, method=6)
    with_black_outline(contain(image, 300, 14)).save(ROOT / f'public/assets/{prefix}_suminoko.png', 'PNG', optimize=True)
    print(f'{prefix}_suminoko: 300px PNG + 1024px WebP, alpha preserved')
