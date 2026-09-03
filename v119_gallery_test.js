// v1.19 regression: element-sorted phone creature gallery and navigable detail view.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES };')(
  require, __dirname, process, { log: () => {}, error: console.error }, () => {});

let pass = 0;
const ok = (v, n) => { if (!v) throw new Error('FAIL: ' + n); pass++; };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), `${n} (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);

ok(Number(G.VERSION) >= 1.19, 'version is v1.19 or newer');
const html = fs.readFileSync(path.join(__dirname, 'public', 'phone.html'), 'utf8');
for (const id of ['galZoomStage','galZoomCard','galZoomInfo','galPrev','galNext','galZoomClose','galZoomPosition'])
  ok(new RegExp(`id="${id}"`).test(html), `${id} exists`);
for (const fn of ['galleryCreatureIds','renderGalleryDetail','openGalleryDetail','moveGalleryDetail'])
  ok(new RegExp(`function ${fn}\\(`).test(html), `${fn} exists`);
ok(/const GALLERY_ELEM_ORDER = \{ fire:0, wind:1, earth:2, water:3 \}/.test(html), 'element order is fire, wind, earth, water, neutral fallback');
ok(/galleryDetailIndex \+ step \+ galleryIds\.length\) % galleryIds\.length/.test(html), 'previous and next navigation wraps');
ok(/const cr = state\.catalog\.CREATURES\[galleryIds\[galleryDetailIndex\]\];\s*if \(!cr \|\| !cr\.evo\) galleryDetailEvo = false/.test(html), 'non-evolving or non-creature card resets detail to base form');
ok(/galleryDetailEvo = galleryEvo && !!\(cr && cr\.evo\)/.test(html), 'detail safely inherits the gallery evolution toggle for creatures only');
ok(!/\$\('galZoom'\)\.onclick\s*=/.test(html), 'detail backdrop does not close the view');
ok(/body\.ingame \{ background:url\('\/assets\/ui\/phone-game-bg-v1\.png'\)/.test(html), 'phone game uses summoner-select background');
for (const [id, file] of Object.entries({ mapBtn:'phone-btn-land-v1', galleryBtn:'phone-btn-cards-v1',
  deckBtn:'phone-btn-deck-v1', fsBtn:'phone-btn-fullscreen-v1' })) {
  ok(new RegExp(`#${id}[^}]+${file}\\.webp`).test(html), `${id} uses generated square button`);
  ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'ui', `${file}.webp`)), `${file} asset exists`);
}
ok(/id="galleryBtn" aria-label="カード一覧">カード一覧</.test(html), 'gallery utility is renamed to card list');
ok(/id="ultBtn" aria-label="必殺技"[^>]*>必殺技</.test(html), 'ultimate uses unified button label');
ok(/o\.id !== 'roll' && o\.id !== 'ult'/.test(html), 'ultimate is removed from generic context actions');
ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'ui', 'phone-btn-ultimate-v2.webp')), 'generated square ultimate button asset exists');
ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'ui', 'phone-game-bg-v1.png')), 'phone background asset exists');
ok(/#hand \.card \{ filter:drop-shadow/.test(html), 'hand cards have background-separating shadow');
ok(/\.diceImgBtn img \{[^}]*filter:none/.test(html), 'dice image has no added shadow');
ok(/#diceBtn \{[^}]*box-shadow:none/.test(html), 'dice button wrapper has no shadow');
ok(/\.me \{[^}]*background:rgba\(13,24,43,\.9\)/.test(html), 'HUD background is sufficiently opaque');

const rank = { fire:0, wind:1, earth:2, water:3 };
const base = Object.entries(G.CREATURES).filter(([id]) => !id.endsWith('_f'));
const sorted = base.map(([id, c], order) => ({ id, elem:rank[c.elem] ?? 4, order }))
  .sort((a, b) => a.elem - b.elem || a.order - b.order);
eq(sorted.map(x => x.elem), [
  ...Array(9).fill(0), ...Array(10).fill(1), ...Array(10).fill(2), ...Array(10).fill(3), ...Array(5).fill(4)
], 'gallery contains fire 9, wind 10, earth 10, water 10, neutral 5');
for (let e = 0; e <= 4; e++) {
  const before = base.map(([id, c], order) => ({ id, elem:rank[c.elem] ?? 4, order })).filter(x => x.elem === e).map(x => x.id);
  const after = sorted.filter(x => x.elem === e).map(x => x.id);
  eq(after, before, `catalog order is stable inside element group ${e}`);
}
for (const [id, c] of base) {
  ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'cards', `c_${id}.webp`)), `${id} base art exists`);
  if (c.evo) ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'cards', `e_${id}.webp`)), `${id} evolved art exists`);
}

console.log(`V1.19 GALLERY ALL ${pass} CHECKS PASSED`);
