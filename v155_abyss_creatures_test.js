// v1.55 regression: Abyss Anchor movement and Abyss Mark toll effects.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, MARKET_POOL, makeDeck, shopRandomPool, publicCardCatalog,' +
  ' makeRoom, makeFixtureRoom, startGame, performMove, onCreatureSummoned, handleChoose, tollOf, activeAbyssMarks,' +
  ' reconcileAbyssMarks, abyssMarkBonusFor, publicState, botChooseOption, serializeRoom, restoreRoom, rooms, TILES };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
const count = (cards, id) => cards.filter(card => card === id).length;
function game() {
  const r = G.makeRoom();
  r.players = ['redani', 'adel'].map((charId, i) => ({ id:'p' + i, name:'P' + i, charId, confirmed:true }));
  G.startGame(r);
  r.players.forEach(p => { p.dir = 1; p.pos = 0; p.gold = 2000; });
  r.pending = {};
  return r;
}

eq(G.VERSION, '1.57', 'current server version');
eq([G.CREATURES.mist_jelly.name, G.CREATURES.mist_jelly.evo, G.CREATURES.mist_jelly.elem,
  G.CREATURES.mist_jelly.rarity, G.CREATURES.mist_jelly.cost, G.CREATURES.mist_jelly.st,
  G.CREATURES.mist_jelly.hp, G.CREATURES.mist_jelly.evoSt, G.CREATURES.mist_jelly.evoHp],
  ['ミストジェリー','アビスアンカー','water','L',130,20,40,40,60], 'Mist Jelly stats');
eq([G.CREATURES.night_jelly.name, G.CREATURES.night_jelly.evo, G.CREATURES.night_jelly.elem,
  G.CREATURES.night_jelly.rarity, G.CREATURES.night_jelly.cost, G.CREATURES.night_jelly.st,
  G.CREATURES.night_jelly.hp, G.CREATURES.night_jelly.evoSt, G.CREATURES.night_jelly.evoHp],
  ['ナイトジェリー','アビストール','water','R',100,25,45,45,65], 'Night Jelly stats');
eq([G.CREATURES.mist_jelly_f.name, G.CREATURES.night_jelly_f.name], ['アビスアンカー','アビストール'],
  'evolved entries');
const deck = G.makeDeck(), shop = G.shopRandomPool();
eq([G.MARKET_POOL.length, deck.length], [39,144], 'current market and common deck totals');
eq([count(deck,'mist_jelly'), count(deck,'night_jelly'), count(deck,'mist_jelly_f'), count(deck,'night_jelly_f')],
  [2,2,0,0], 'common deck copy counts');
eq([count(shop,'mist_jelly'), count(shop,'night_jelly')], [2,2], 'shop weights share copy settings');
eq(G.publicCardCatalog().counts, { total:73, creatures:44, evolutions:37, spells:24, weapons:5 }, 'current catalog counts');
eq(G.publicState(G.makeFixtureRoom(), null).abyssMarks[0],
  { tile:3, sourceTile:5, player:'fx0', bonus:200 }, 'visual fixture includes a Lv4 Abyss Mark');

// Remaining movement stops at the first enemy anchor and records actual steps.
{
  const r = game(), p = r.players[0], enemy = r.players[1];
  r.owners[2] = { player:enemy.id, level:1, creature:'mist_jelly' };
  r.owners[4] = { player:enemy.id, level:1, creature:'mist_jelly_f' };
  G.performMove(r, p, 6, { value:6 }, '6を出した');
  eq([p.pos, r.lastDice.resolvedSteps, r.lastDice.forcedStop.tile, r.lastDice.forcedStop.remainingSteps],
    [2,2,2,4], 'first enemy anchor forces stop with actual steps');
  ok(r.pending[p.id].type === 'tile' && r.pending[p.id].availableAt === r.lastDice.forcedStop.availableAt,
    'normal enemy-land action waits for anchor presentation');
  G.rooms.delete(r.code);
}

// Exact destination and own anchors do not trigger.
{
  const r = game(), p = r.players[0], enemy = r.players[1];
  r.owners[2] = { player:enemy.id, level:1, creature:'mist_jelly' };
  G.performMove(r, p, 2, { value:2 }, '2を出した');
  ok(!r.lastDice.forcedStop && r.lastDice.resolvedSteps === 2, 'anchor at final destination is normal landing');
  r.pending = {}; p.pos = 0; r.owners[2].player = p.id;
  G.performMove(r, p, 3, { value:3 }, '3を出した');
  ok(p.pos === 3 && !r.lastDice.forcedStop, 'own anchor is ignored');
  G.rooms.delete(r.code);
}

// A stop after passing the castle includes the castle presentation before unlocking the landing action.
{
  const r = game(), p = r.players[0], enemy = r.players[1];
  p.pos = G.TILES.length - 2;
  const anchorTile = 2;
  r.owners[anchorTile] = { player:enemy.id, level:1, creature:'mist_jelly' };
  G.performMove(r, p, 5, { value:5 }, '5を出した');
  ok(r.lastDice.castle && r.lastDice.forcedStop && p.pos === anchorTile,
    'anchor can stop movement after a castle pass');
  ok(r.pending[p.id].availableAt === r.lastDice.forcedStop.availableAt &&
      r.lastDice.forcedStop.availableAt > r.lastDice.castle.availableAt,
    'post-castle anchor action waits for castle and remaining movement presentation');
  G.rooms.delete(r.code);
}

// Placement opens a mandatory own-land picker and creates a public mark.
{
  const r = game(), p = r.players[0];
  r.owners[1] = { player:p.id, level:1, creature:'night_jelly' };
  r.owners[2] = { player:p.id, level:2, creature:'orphe' };
  ok(G.onCreatureSummoned(r, p, 'night_jelly', 'swap', 1), 'Night Jelly pauses placement');
  ok(r.pending[p.id].type === 'abyss_mark' && r.pending[p.id].options.some(o => o.id === 'am:2'),
    'abyss mark offers own unmarked land');
  const baseToll = G.tollOf(r, 2);
  G.handleChoose(r, p.id, 'am:2');
  eq([r.owners[1].abyssMarkTarget, G.activeAbyssMarks(r)[0].bonus, G.tollOf(r, 2) - baseToll],
    [2,100,100], 'base mark adds 100 after percentage toll');
  eq(G.publicState(r, p.id).abyssMarks[0], { tile:2, sourceTile:1, player:p.id, bonus:100 },
    'public state exposes only active mark data');

  r.owners[1].level = 3;
  eq([1,2,3,4].map(level => { r.owners[2].level = level; return G.activeAbyssMarks(r)[0].bonus; }),
    [100,100,150,200], 'evolved source follows target level with minimum 100');

  r.owners[3] = { player:p.id, level:1, creature:'night_jelly' };
  G.onCreatureSummoned(r, p, 'night_jelly', 'swap', 3);
  ok(!r.pending[p.id].options.some(o => o.id === 'am:2'), 'already marked land is excluded');

  r.owners[2].player = r.players[1].id;
  G.reconcileAbyssMarks(r);
  ok(!('abyssMarkTarget' in r.owners[1]) && G.activeAbyssMarks(r).length === 0,
    'losing target land permanently clears mark');
  G.rooms.delete(r.code);
}

// BOT prioritizes the land with the highest resulting toll.
{
  const r = game(), p = r.players[0];
  r.owners[1] = { player:p.id, level:1, creature:'night_jelly_f' };
  r.owners[2] = { player:p.id, level:1, creature:'orphe' };
  r.owners[3] = { player:p.id, level:4, creature:'gecko' };
  const pend = { type:'abyss_mark', sourceTile:1, options:[{id:'am:2',tile:2},{id:'am:3',tile:3}] };
  eq(G.botChooseOption(r, p, pend), 'am:3', 'BOT chooses highest effective toll');
  r.pending[p.id] = { ...pend, after:'swap' };
  G.handleChoose(r, p.id, G.botChooseOption(r, p, r.pending[p.id]));
  eq(r.owners[1].abyssMarkTarget, 3, 'BOT resolves mandatory mark pending without stalling');
  G.rooms.delete(r.code);
}

// Moving the source creature keeps the mark linked to that creature.
{
  const r = game(), p = r.players[0];
  r.owners[1] = { player:p.id, level:2, creature:'night_jelly', dmg:7, abyssMarkTarget:3 };
  r.owners[2] = { player:p.id, level:1, creature:'gecko', dmg:2 };
  r.owners[3] = { player:p.id, level:2, creature:'orphe' };
  p.hand.push('sp_move'); p.gold = 1000;
  p.moveA = 1;
  r.pending[p.id] = { type:'move_b', moveA:1, options:[{id:'mb:2',tile:2}] };
  G.handleChoose(r, p.id, 'mb:2');
  eq([r.owners[2].creature, r.owners[2].dmg, r.owners[2].abyssMarkTarget,
      G.activeAbyssMarks(r)[0].sourceTile], ['night_jelly',7,3,2],
    'source swap preserves damage and mark ownership');
  G.rooms.delete(r.code);
}

// Save validation and restoration preserve valid mark ownership.
{
  const r = game(), p = r.players[0];
  r.owners[1] = { player:p.id, level:3, creature:'night_jelly', abyssMarkTarget:2 };
  r.owners[2] = { player:p.id, level:2, creature:'orphe' };
  r.pending[p.id] = { type:'abyss_mark', prompt:'選択', sourceTile:1, after:'swap', options:[{id:'am:2',tile:2}] };
  const save = G.serializeRoom(r);
  G.rooms.delete(r.code);
  const restored = G.restoreRoom(save);
  ok(!restored.error, 'save with mark and pending restores');
  eq([restored.room.owners[1].abyssMarkTarget, restored.room.pending[p.id].type], [2,'abyss_mark'],
    'mark target and mandatory pending survive restore');
  G.rooms.delete(r.code);
}

for (const rel of ['public/assets/c_mist_jelly.png','public/assets/e_mist_jelly.png',
  'public/assets/c_night_jelly.png','public/assets/e_night_jelly.png']) {
  const data = fs.readFileSync(path.join(__dirname, rel));
  ok(data.slice(1,4).toString() === 'PNG' && data.readUInt32BE(16) === 300 && data.readUInt32BE(20) === 300,
    `${rel} is 300px PNG`);
  eq(data[25], 6, `${rel} preserves RGBA`);
}
for (const rel of ['public/assets/cards/c_mist_jelly.webp','public/assets/cards/e_mist_jelly.webp',
  'public/assets/cards/c_night_jelly.webp','public/assets/cards/e_night_jelly.webp','public/assets/abyss-mark-v1.webp']) {
  const data = fs.readFileSync(path.join(__dirname, rel));
  ok(data.slice(0,4).toString() === 'RIFF' && data.slice(8,12).toString() === 'WEBP', `${rel} is WebP`);
}

const phone = fs.readFileSync(path.join(__dirname, 'public/phone.html'), 'utf8');
const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
const world = fs.readFileSync(path.join(__dirname, 'public/board_world.js'), 'utf8');
ok(phone.includes("abyss_mark:'深淵標を置く領地を選べ'") && /\|am\)/.test(phone), 'phone routes am tile targets');
ok(phone.includes('mmAbyssMark(i)') && phone.includes('深淵標 +${abyss.bonus}G'), 'phone map and detail show marks');
ok(board.includes('function buildAbyssMarkBadges') && board.includes('y:Math.max(34, y - lift - 108)') &&
  board.includes('深淵の錨 ─ 強制停止'), 'TV DOM keeps marks in bounds and draws anchor event');
ok(world.includes('pwImg_abyss_mark') && world.includes('makeAbyssMark'), 'Phaser draws the same mark asset');
const manual = fs.readFileSync(path.join(__dirname, 'docs/manual.md'), 'utf8');
const rules = fs.readFileSync(path.join(__dirname, 'docs/spec_rules.md'), 'utf8');
ok(manual.includes('カード一覧(クリーチャー44種)') && manual.includes('v1.55 深淵系水クリーチャー'), 'manual keeps v1.55 coverage');
ok(rules.includes('共通山札144枚') && rules.includes('v1.55 深淵系水クリーチャー仕様'), 'spec keeps v1.55 coverage');

console.log(`v1.55 abyss creature tests passed: ${pass}`);
