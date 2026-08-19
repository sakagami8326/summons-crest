#!/usr/bin/env python3
# make_outline.py ─ SUMMONS CODE アート加工ツール(再作成版)
# 使い方: python3 make_outline.py 入力.png 出力.png --width 12 --color auto
# 処理: 白背景の透過(必要時) → トリム → 元解像度で縁取り → width300へリサイズ
import argparse, collections
from PIL import Image, ImageFilter

def remove_white_bg(im, tol=235):
    """外周から連結した白背景のみ透過(目・牙など内部の白は保持)"""
    w, h = im.size
    px = im.load()
    def near_white(p): return p[3] > 0 and p[0] >= tol and p[1] >= tol and p[2] >= tol
    seen = bytearray(w * h)
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + \
            [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]: continue
        seen[i] = 1
        p = px[x, y]
        if not near_white(p): continue
        px[x, y] = (p[0], p[1], p[2], 0)
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    return im

def auto_color(im):
    """被写体の平均色を強く暗くして縁取り色に"""
    im2 = im.resize((min(200, im.width), min(200, im.height)))
    rs = gs = bs = n = 0
    for p in im2.getdata():
        if p[3] > 200:
            rs += p[0]; gs += p[1]; bs += p[2]; n += 1
    if not n: return (20, 20, 24)
    k = 0.28
    return (max(8, int(rs / n * k)), max(8, int(gs / n * k)), max(8, int(bs / n * k)))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--width', type=int, default=12, help='縁取り太さ(元解像度px)')
    ap.add_argument('--color', default='auto', help="auto または R,G,B")
    ap.add_argument('--out-width', type=int, default=300, help='出力の横幅')
    a = ap.parse_args()

    im = Image.open(a.src).convert('RGBA')
    # 四隅が不透明白なら背景除去
    w, h = im.size
    if any(im.getpixel(p)[3] > 0 and sum(im.getpixel(p)[:3]) > 720
           for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]):
        im = remove_white_bg(im)

    im = im.crop(im.getchannel('A').getbbox())  # トリム

    col = auto_color(im) if a.color == 'auto' else tuple(int(x) for x in a.color.split(','))
    # 縁取り: αマスクをMaxFilterで膨張 → 縁色レイヤーの上に元絵を合成
    pad = a.width + 4
    big = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    big.paste(im, (pad, pad))
    alpha = big.getchannel('A')
    k = a.width * 2 + 1
    dil = alpha.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.GaussianBlur(1.2))
    outline = Image.new('RGBA', big.size, col + (0,))
    outline.putalpha(dil)
    out = Image.alpha_composite(outline, big)
    out = out.crop(out.getchannel('A').getbbox())

    ow = a.out_width
    out = out.resize((ow, round(out.height * ow / out.width)), Image.LANCZOS)
    out.save(a.dst)
    print(f'{a.dst}: {out.size[0]}x{out.size[1]} outline={col} w={a.width}')

if __name__ == '__main__':
    main()
