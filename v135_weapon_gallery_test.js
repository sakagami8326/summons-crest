// v1.35 regression: Weapon terminology, phone art scale and unified card gallery filters.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, SPELLS, SUPPORTS };')(
  require, __dirname, process, { log: () => {}, error: console.error }, () => {});

let pass = 0;
const ok = (v, n) => { if (!v) throw new Error('FAIL: ' + n); pass++; };

ok(Number(G.VERSION) >= 1.35, 'version is v1.35 or newer');
const phone = fs.readFileSync(path.join(__dirname, 'public', 'phone.html'), 'utf8');
const board = fs.readFileSync(path.join(__dirname, 'public', 'board.html'), 'utf8');
const manual = fs.readFileSync(path.join(__dirname, 'docs', 'manual.md'), 'utf8');

ok(/--weapon-art-scale:\.88/.test(phone), 'phone weapon art scale is 88%');
ok(/\.supportCard \.suArt img\s*\{[^}]*var\(--weapon-art-scale\)[^}]*var\(--weapon-art-scale\)/s.test(phone), 'all normal phone weapon cards use shared scale');
ok(/\.weaponArtHost img\s*\{[^}]*var\(--weapon-art-scale\)[^}]*var\(--weapon-art-scale\)/s.test(phone), 'direct phone weapon art hosts use shared scale');
ok(/\.shopCompact\.support \.shopCompactArt img\s*\{[^}]*var\(--weapon-art-scale\)[^}]*translateY\(4%\)/s.test(phone), 'phone shop keeps lower scaled weapon art');
ok(!/--weapon-art-scale/.test(board), 'TV does not inherit phone weapon scaling');

for (const type of ['creature','spell','weapon'])
  ok(new RegExp(`data-gallery-type="${type}" checked`).test(phone), `${type} filter defaults ON`);
for (const elem of ['fire','wind','earth','water','neutral'])
  ok(new RegExp(`data-gallery-elem="${elem}" checked`).test(phone), `${elem} filter defaults ON`);
ok(/function galleryCardEntries\(/.test(phone), 'common gallery item generator exists');
ok(/galleryCreatureIds\(C\.CREATURES\)[\s\S]*galleryFilters\.elems\[elem\]/.test(phone), 'element filters apply to creatures');
ok(/types\.spell\)[^\n]*Object\.keys\(C\.SPELLS/.test(phone), 'spells use type filter only');
ok(/types\.weapon\)[^\n]*Object\.keys\(C\.SUPPORTS/.test(phone), 'weapons use type filter only');
const creatureAt = phone.indexOf("group:'クリーチャー'");
const spellAt = phone.indexOf("group:'スペル'");
const weaponAt = phone.indexOf("group:'ウェポン'");
ok(creatureAt >= 0 && creatureAt < spellAt && spellAt < weaponAt, 'gallery grouping is creature, spell, weapon');
ok(/条件に一致するカードがありません/.test(phone), 'empty filter result message exists');
ok(/if \(!cr \|\| !cr\.evo\) galleryDetailEvo = false/.test(phone), 'evolution mode clears outside evolving creatures');
ok(/galleryDetailEvo = galleryEvo && !!\(cr && cr\.evo\)/.test(phone), 'opening non-creatures is evolution-safe');
ok(/<span class="galBadge">スペル<\/span>/.test(phone), 'spell detail is implemented');
ok(/<span class="galBadge">ウェポン<\/span>/.test(phone), 'weapon detail is implemented');
ok(/spl\.exileAfterUse[^\n]+廃棄/.test(phone), 'spell detail shows exile attribute');
ok(/sup\.exileAfterUse[^\n]+廃棄/.test(phone), 'weapon detail shows exile attribute');

ok(G.SUPPORTS.jinx.fx.includes('ウェポン'), 'server exposes Weapon terminology');
ok(G.CREATURES.survey.fx.includes('ウェポンとして使える'), 'Support ability explains creature-as-Weapon');
ok(G.CREATURES.shuterio.fx.includes('ウェポンとして使える'), 'Shuterio keeps Support ability with new terminology');
ok(src.includes('ウェポンなしで挑む') && board.includes('ウェポンなし'), 'battle no-weapon wording is unified');
ok(/#contextBtn[^}]+white-space:normal[^}]+overflow-wrap:anywhere/.test(phone),
  'phone battle context button wraps long no-weapon wording inside its bounds');
ok(!phone.includes('支援カード') && !board.includes('支援カード'), 'active UI has no old category label');
ok(/v1\.35/.test(manual) && /スマホカード一覧/.test(manual), 'manual documents v1.35 gallery');

console.log(`V1.35 WEAPON GALLERY ALL ${pass} CHECKS PASSED`);
