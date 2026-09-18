"""Import supplied Evol / Ascensia art using the existing creature asset format."""
from prepare_v161_assets import SOURCE, ASSETS, CARDS, opened, contain, with_black_outline

for prefix, filename in [('c', 'エヴォル-無.png'), ('e', 'アセンシア-無.png')]:
    source = opened(SOURCE / filename)
    contain(source, 1024, 48).save(CARDS / f'{prefix}_evol.webp', 'WEBP', quality=94, method=6)
    with_black_outline(contain(source, 300, 14)).save(ASSETS / f'{prefix}_evol.png', 'PNG', optimize=True)
