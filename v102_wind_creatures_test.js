// v1.02 regression: Marlow and Shuterio -> Aero Shuterio.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, MARKET_POOL, makeDeck, TILES, marlowSources,' +
  ' marlowDests, moveMarlow, creatureSupportEnabled, askUpgrade, handleChoose };')(
  require, __dirname, process, console, () => {});

let pass = 0;
function ok(value, name) {
  if (!value) throw new Error('FAIL: ' + name);
  pass++;
}
function eq(actual, expected, name) {
  ok(JSON.stringify(actual) === JSON.stringify(expected),
    `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
}
function count(list, id) { return list.filter(x => x === id).length; }

ok(Number(G.VERSION) >= 1.02, 'version is v1.02 or newer');
const marlow = G.CREATURES.marlow;
eq([marlow.name, marlow.elem, marlow.rarity, marlow.cost, marlow.st, marlow.hp],
  ['マーロー', 'wind', 'R', 50, 30, 30], 'Marlow values');
const shuterio = G.CREATURES.shuterio;
eq([shuterio.name, shuterio.evo, shuterio.elem, shuterio.rarity, shuterio.cost,
  shuterio.st, shuterio.hp, shuterio.evoSt, shuterio.evoHp],
  ['シュテリオ', 'エアロシュティレ', 'wind', 'R', 70, 30, 30, 40, 50],
  'Shuterio evolution line');

const deck = G.makeDeck();
eq([count(deck, 'marlow'), count(deck, 'shuterio'), count(deck, 'shuterio_f')],
  [3, 2, 0], 'market copy counts');
eq(count(deck, 'magado'), 2, 'ordinary R copy count remains two');

const wind = [], nonWind = [];
G.TILES.forEach((t, i) => {
  if (t.t !== 'land') return;
  (t.e === 'wind' ? wind : nonWind).push(i);
});
const p = { id: 'p1', name: 'P1', gold: 0, charId: 'redani', battleWins: 0,
  shrineVisits: 0, treasures: 0, hand: [], discard: [], deck: [], exile: [] };
const room = { owners: G.TILES.map(() => null), elemOv: {}, pending: {}, log: [],
  players: [p], titles: { conqueror: null, pilgrim: null }, turn: 0, round: 1 };
const source = wind[0], naturalDest = wind[1], changedToWind = nonWind[0], changedAway = wind[2];
room.owners[source] = { player: p.id, level: 3, creature: 'marlow', dmg: 17,
  shade: 2, customState: { kept: true } };
room.elemOv[changedToWind] = 'wind';
room.elemOv[changedAway] = 'fire';

eq(G.marlowSources(room, p), [source], 'any owned Marlow is a move source');
const dests = G.marlowDests(room);
ok(dests.includes(naturalDest), 'vacant natural wind land is eligible');
ok(dests.includes(changedToWind), 'land changed to wind is eligible');
ok(!dests.includes(changedAway), 'wind land changed away is ineligible');
ok(!dests.includes(source), 'occupied source is ineligible');

G.askUpgrade(room, p, '自領地');
eq(room.pending[p.id].type, 'upgrade', 'upgrade pending remains available without gold');
ok(room.pending[p.id].options.some(o => o.id === 'marlow:move'),
  'Marlow move appears alongside upgrade choices');
p.gold = 10000;
G.askUpgrade(room, p, '城');
ok(!room.pending[p.id] || !room.pending[p.id].options.some(o => o.id === 'marlow:move'),
  'Marlow move does not trigger at castle upgrade');
p.gold = 0;
G.askUpgrade(room, p, '自領地');
G.handleChoose(room, p.id, 'marlow:move');
eq(room.pending[p.id].type, 'marlow_src', 'Marlow source selection pending');
G.handleChoose(room, p.id, 'ms:' + source);
eq(room.pending[p.id].type, 'marlow_dest', 'Marlow destination selection pending');
ok(room.pending[p.id].options.some(o => o.id === 'md:' + changedToWind),
  'effective wind destination appears in pending');

const before = room.owners[source];
ok(G.moveMarlow(room, p, source, changedToWind), 'Marlow move succeeds');
ok(room.owners[source] === null, 'source land is abandoned');
ok(room.owners[changedToWind] === before, 'entire placement object is transferred');
eq([room.owners[changedToWind].level, room.owners[changedToWind].dmg,
  room.owners[changedToWind].shade, room.owners[changedToWind].customState.kept],
  [3, 17, 2, true], 'level, damage and creature state are preserved');
ok(room.log.some(x => x.includes('【風渡り】') && x.includes('Lv3')), 'TV log records move and level');

ok(G.creatureSupportEnabled('survey') && G.creatureSupportEnabled('survey_f'),
  'Survey line keeps creature support');
ok(G.creatureSupportEnabled('shuterio') && G.creatureSupportEnabled('shuterio_f'),
  'Shuterio line enables creature support');
ok(!G.creatureSupportEnabled('marlow'), 'unrelated creature has no creature support');

for (const file of ['c_marlow.png', 'c_shuterio.png', 'e_shuterio.png']) {
  ok(fs.existsSync(path.join(__dirname, 'public', 'assets', file)), `${file} exists`);
}
for (const file of ['c_marlow.webp', 'c_shuterio.webp', 'e_shuterio.webp']) {
  const full = path.join(__dirname, 'public', 'assets', 'cards', file);
  ok(fs.existsSync(full) && fs.statSync(full).size > 0, `card art ${file} exists`);
}
const phone = fs.readFileSync(path.join(__dirname, 'public', 'phone.html'), 'utf8');
ok(phone.includes("'marlow_src'") && phone.includes("'marlow_dest'"),
  'phone UI routes both Marlow pending types to the map selector');

console.log(`V1.02 ALL ${pass} CHECKS PASSED`);
