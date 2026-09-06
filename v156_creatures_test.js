// v1.56 regression: healing reward and owned-earth-land combat bonuses.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, MARKET_POOL, makeDeck, shopRandomPool, publicCardCatalog,' +
  ' makeRoom, startGame, chainCount, earthLandBattleBonus, recordHeal, resolveBattle, publicState, TILES, rooms };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
const count = (cards, id) => cards.filter(card => card === id).length;

function game() {
  const r = G.makeRoom();
  r.players = ['adel', 'nerasio'].map((charId, i) => ({ id:'p' + i, name:'P' + i, charId, confirmed:true }));
  G.startGame(r);
  r.players.forEach(p => { p.dir = 1; p.pos = 0; p.gold = 2000; });
  r.pending = {};
  return r;
}

eq(G.VERSION, '1.58', 'server version');
eq([G.CREATURES.wakatama.name, G.CREATURES.wakatama.evo, G.CREATURES.wakatama.elem,
  G.CREATURES.wakatama.rarity, G.CREATURES.wakatama.cost, G.CREATURES.wakatama.st,
  G.CREATURES.wakatama.hp, G.CREATURES.wakatama.evoSt, G.CREATURES.wakatama.evoHp],
  ['ワカタマ','ガマワカメ','water','R',100,15,45,35,65], 'Wakatama stats');
eq([G.CREATURES.emeri.name, G.CREATURES.emeri.evo, G.CREATURES.emeri.elem,
  G.CREATURES.emeri.rarity, G.CREATURES.emeri.cost, G.CREATURES.emeri.st,
  G.CREATURES.emeri.hp, G.CREATURES.emeri.evoSt, G.CREATURES.emeri.evoHp],
  ['エメリ','エスメラルダ','earth','R',120,20,50,40,70], 'Emeri stats');
eq([G.CREATURES.valk.name, G.CREATURES.valk.evo, G.CREATURES.valk.elem,
  G.CREATURES.valk.rarity, G.CREATURES.valk.cost, G.CREATURES.valk.st,
  G.CREATURES.valk.hp, G.CREATURES.valk.evoSt, G.CREATURES.valk.evoHp],
  ['ヴァルク','アヌビス・レガ','earth','R',120,30,40,50,60], 'Valk stats');
eq([G.CREATURES.wakatama_f.name, G.CREATURES.emeri_f.name, G.CREATURES.valk_f.name],
  ['ガマワカメ','エスメラルダ','アヌビス・レガ'], 'evolved entries');

const deck = G.makeDeck(), shop = G.shopRandomPool();
eq([G.MARKET_POOL.length, deck.length], [39,144], 'market and common deck totals');
for (const id of ['wakatama','emeri','valk']) {
  eq([count(deck,id), count(shop,id), count(deck,id + '_f')], [2,2,0], `${id} copy rules`);
}
eq(G.publicCardCatalog().counts, { total:73, creatures:44, evolutions:37, spells:24, weapons:5 }, 'catalog counts');

// Earth bonuses count owned land by its current effective element, never by the placed creature element.
{
  const r = game(), p = r.players[0];
  const earthTiles = G.TILES.map((t, i) => t.t === 'land' && t.e === 'earth' ? i : -1).filter(i => i >= 0);
  const otherTile = G.TILES.findIndex(t => t.t === 'land' && t.e !== 'earth');
  r.owners[earthTiles[0]] = { player:p.id, level:1, creature:'orphe' }; // water creature on earth counts
  r.owners[earthTiles[1]] = { player:p.id, level:1, creature:'gecko' };
  r.owners[otherTile] = { player:p.id, level:1, creature:'emeri' }; // earth creature off earth does not count
  eq(G.earthLandBattleBonus(r, p.id), { lands:2, counted:2, bonus:10 }, 'effective earth land ownership is authoritative');
  r.elemOv[earthTiles[1]] = 'fire';
  r.elemOv[otherTile] = 'earth';
  eq(G.earthLandBattleBonus(r, p.id), { lands:2, counted:2, bonus:10 }, 'attribute changes update count immediately');
  for (const i of earthTiles.slice(2, 7)) r.owners[i] = { player:p.id, level:1, creature:'orphe' };
  eq(G.earthLandBattleBonus(r, p.id).bonus, 25, 'earth bonus is capped at +25');
  G.rooms.delete(r.code);
}

function battleWith(atkCreature, defCreature, atkEarth, defEarth) {
  const r = game(), atk = r.players[0], def = r.players[1];
  const earthTiles = G.TILES.map((t, i) => t.t === 'land' && t.e === 'earth' ? i : -1).filter(i => i >= 0);
  const battleTile = earthTiles[0];
  r.owners[battleTile] = { player:def.id, level:1, creature:defCreature };
  for (const i of earthTiles.slice(1, 1 + atkEarth)) r.owners[i] = { player:atk.id, level:1, creature:'orphe' };
  for (const i of earthTiles.slice(1 + atkEarth, 1 + atkEarth + defEarth)) r.owners[i] = { player:def.id, level:1, creature:'orphe' };
  atk.hand.push(atkCreature);
  r.battle = { attacker:atk.id, defender:def.id, tile:battleTile, atkCreature,
    supports:{ [atk.id]:'none', [def.id]:'none' }, startedAt:Date.now() };
  G.resolveBattle(r);
  G.rooms.delete(r.code);
  return r.lastBattle;
}

{
  const b = battleWith('emeri', 'valk', 3, 2); // only one unclaimed earth land remains for defender, plus battle land
  eq([b.atkEarthLandCount, b.atkEarthAtBonus, b.st], [3,15,35], 'Emeri gains AT for attacker owned earth lands');
  eq([b.defEarthLandCount, b.defEarthDfBonus], [2,10], 'Valk gains DF for defender owned earth lands');
  ok(b.notes.some(n => n.includes('地脈駆動')) && b.notes.some(n => n.includes('守護ビット')), 'battle notes explain both bonuses');
}
{
  const b = battleWith('valk', 'emeri', 2, 2);
  eq([b.atkEarthDfBonus, b.atkDf], [10,10], 'Valk gains DF while attacking');
  eq([b.defEarthAtBonus, b.defSt], [15,35], 'Emeri gains AT for defender counterattack');
}

// Healing rewards aggregate actual healing and never stack across multiple providers.
{
  const r = game(), p = r.players[0];
  r.owners[5] = { player:p.id, level:3, creature:'wakatama_f' };
  r.owners[8] = { player:p.id, level:1, creature:'wakatama' };
  const before = p.gold;
  const event = G.recordHeal(r, p, 'test', [
    { tile:2, amount:10, creature:'orphe' }, { tile:3, amount:4, creature:'palecoral' },
    { tile:4, amount:0, creature:'mermaid' },
  ]);
  eq([p.gold - before, event.reward.gold, event.reward.targetCount, event.reward.sourceTile,
    event.reward.creature], [14,14,2,5,'wakatama_f'], 'actual healing aggregates into one non-stacking reward');
  const at = r.lastHeal.at;
  ok(!G.recordHeal(r, p, 'zero', [{ tile:2, amount:0, creature:'orphe' }]) && r.lastHeal.at === at,
    'zero actual healing creates no reward or event');
  eq(G.publicState(r, p.id).lastHeal.reward.gold, 14, 'public state exposes reward presentation data');
  G.rooms.delete(r.code);
}

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
for (const source of ['ult_adel','palecoral','castle','goagoa','serenade','mermaid','restore'])
  ok(new RegExp(`recordHeal\\(r, [^,]+, '${source}'`).test(server), `${source} uses centralized actual-heal accounting`);

for (const rel of ['public/assets/c_wakatama.png','public/assets/e_wakatama.png',
  'public/assets/c_emeri.png','public/assets/e_emeri.png','public/assets/c_valk.png','public/assets/e_valk.png']) {
  const data = fs.readFileSync(path.join(__dirname, rel));
  ok(data.slice(1,4).toString() === 'PNG' && data.readUInt32BE(16) === 300 && data.readUInt32BE(20) === 300,
    `${rel} is 300px PNG`);
  eq(data[25], 6, `${rel} preserves RGBA`);
}
for (const rel of ['public/assets/cards/c_wakatama.webp','public/assets/cards/e_wakatama.webp',
  'public/assets/cards/c_emeri.webp','public/assets/cards/e_emeri.webp',
  'public/assets/cards/c_valk.webp','public/assets/cards/e_valk.webp']) {
  const data = fs.readFileSync(path.join(__dirname, rel));
  ok(data.slice(0,4).toString() === 'RIFF' && data.slice(8,12).toString() === 'WEBP', `${rel} is WebP`);
}

const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
ok(board.includes('id="healRewardCutin"') && board.includes('function playHealReward') &&
  board.includes("presentationId('heal-reward'") && board.includes('回復した<strong>${reward.healed}HP</strong>分'),
  'TV queues a full-card healing reward presentation');
const cardsPage = fs.readFileSync(path.join(__dirname, 'public/site/cards.html'), 'utf8');
const rulesPage = fs.readFileSync(path.join(__dirname, 'public/site/rules.html'), 'utf8');
const manual = fs.readFileSync(path.join(__dirname, 'docs/manual.md'), 'utf8');
const spec = fs.readFileSync(path.join(__dirname, 'docs/spec_rules.md'), 'utf8');
ok(cardsPage.includes('data-total>73') && cardsPage.includes('data-evolutions>37'), 'cards page fallback counts updated');
ok(rulesPage.includes('土領地に水属性クリーチャーがいても1つ') && rulesPage.includes('回復と「恵みの水脈」'), 'public rules explain corrected mechanics');
ok(manual.includes('カード一覧(クリーチャー44種)') && manual.includes('v1.56 回復報酬・土領地連動クリーチャー'), 'manual updated');
ok(spec.includes('共通山札144枚') && spec.includes('配置クリーチャーの属性は参照しない'), 'spec updated');

console.log(`v1.56 creature tests passed: ${pass}`);
