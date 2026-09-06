// v1.57 regression: adaptive phone card text, readable three-column lists and full-text detail.
const fs = require('fs');
const path = require('path');

const phone = fs.readFileSync(path.join(__dirname, 'public', 'phone.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const pkg = require('./package.json');
const css = (phone.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];

let source = serverSource.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  source + '\n;return { VERSION, CREATURES, SPELLS, SUPPORTS };')(
  require, __dirname, process, { log: () => {}, error: console.error }, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };

ok(G.VERSION === '1.59' && pkg.version === '1.59.0', 'release version is v1.59');
ok(/\.dkCard\s*\{[\s\S]*?width:calc\(\(100% - 2dvh\) \/ 3\)/.test(css),
  'deck and choice cards use container-based three columns');
ok(/\.gCard\s*\{[\s\S]*?width:calc\(\(100% - 3\.2dvh\) \/ 3\)/.test(css),
  'gallery cards use container-based three columns');
ok(!/\.dkCard\s*\{[\s\S]*?\/ 5 - 4px\)/.test(css) &&
  !/\.gCard\s*\{[\s\S]*?\/ 5 - 4px\)/.test(css), 'five-column card widths are removed');

for (const variable of ['--card-art-height', '--card-boundary-top', '--card-cost-top', '--card-info-top'])
  ok(css.includes(variable), `${variable} controls card geometry`);
ok(/\.face\.cardFit1[^}]*--card-info-top:65\.4%/.test(css) &&
  /\.face\.cardFit2[^}]*--card-info-top:60%/.test(css), 'two adaptive layout tiers expand the info area');
ok(/\.ccEffect p[^}]*font-size:clamp\(12px/.test(css) &&
  /\.spText[^}]*font-size:clamp\(12px/.test(css) &&
  /\.suText[^}]*font-size:clamp\(12px/.test(css), 'all card bodies retain a 12px minimum');

ok(/function cardTextOverflows\(face\)/.test(phone) &&
  /text\.scrollHeight > text\.clientHeight \+ 1/.test(phone) &&
  /textRect\.bottom > faceRect\.bottom/.test(phone), 'overflow uses rendered DOM dimensions');
ok(/dataset\.cardFit = 'base'/.test(phone) && /dataset\.cardFit = 'compact'/.test(phone) &&
  /dataset\.cardFit = 'expanded'/.test(phone) && /dataset\.textOverflow = 'true'/.test(phone),
  'card DOM exposes fit and overflow states');
ok(/cardTextOverflow[\s\S]*cardDetailHint/.test(css) &&
  (phone.match(/詳細で全文表示/g) || []).length >= 3, 'remaining overflow links to full detail');

ok(/id="cardZoomStage"/.test(phone) && /id="cardZoomDetail"/.test(phone) &&
  /#cardZoomDetail\s*\{[^}]*overflow-y:auto/.test(css), 'tap detail has a separate scrollable full-text pane');
ok(/function cardZoomDetailHTML\(c\)/.test(phone) &&
  /\$\('cardZoomDetail'\)\.innerHTML = cardZoomDetailHTML\(c\)/.test(phone), 'tap detail populates full card text');
ok(/\.galAbilityText\s*\{[^}]*font-size:max\(2\.65dvh,15px\)/.test(css), 'full detail keeps readable text');

ok(/revealT = setTimeout\(advanceReveal, 1800\)/.test(phone), 'direct draw remains 1.8 seconds');
ok(/onclick="pdChoose\('\$\{o\.id\}'\)"/.test(phone) &&
  /el\.onclick = \(\) => \{ choose\(el\.dataset\.o\)/.test(phone), 'draw and draft remain tap-to-select');
ok(/armLongPress\(el, \(\) => openCardZoom\(o\.card\)\)/.test(phone), 'pick draw retains long-press detail');
ok(/onclick="pickOvChoose\('\$\{e\.pickId\}'\)"/.test(phone), 'selection lists retain immediate card choice');

const baseCreatures = Object.entries(G.CREATURES).filter(([id]) => !id.endsWith('_f'));
const evolvedForms = baseCreatures.filter(([, card]) => card.evo).length;
ok(baseCreatures.length + evolvedForms === 81, 'all 81 creature forms are covered by the common card renderer');
ok(Object.keys(G.SPELLS).length === 24 && Object.keys(G.SUPPORTS).length === 5,
  'all 24 spells and 5 weapons are covered by the common card renderer');

const focusCards = ['beruf','beruf_f','samurai_saga','marlow','mist_jelly','mist_jelly_f','night_jelly_f'];
for (const id of focusCards) ok(G.CREATURES[id], `${id} remains in the overflow regression set`);
for (const id of ['sp_weaken','sp_step','sp_swap']) ok(G.SPELLS[id], `${id} remains in the overflow regression set`);

const manual = fs.readFileSync(path.join(__dirname, 'docs', 'manual.md'), 'utf8');
const spec = fs.readFileSync(path.join(__dirname, 'docs', 'spec_rules.md'), 'utf8');
ok(manual.includes('v1.57 スマホカードテキスト表示') && spec.includes('v1.57 スマホカード本文表示仕様'),
  'player manual and implementation rules document v1.57');

console.log(`v1.57 phone card text tests passed: ${pass}`);
