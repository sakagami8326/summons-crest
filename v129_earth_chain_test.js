// v1.29 regression: Komao/Shishigalm earth conversion and earth-chain DF.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, CHAR_DECKS, MARKET_POOL, TILES,' +
  ' makeDeck, makeRoom, startGame, onCreatureSummoned, resolveBattle, tileElem, chainCount, rooms };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
const count = (cards, id) => cards.filter(card => card === id).length;
function game(chars = ['redani', 'adel']) {
  const r = G.makeRoom();
  r.players = chars.map((charId, i) => ({ id: 'p' + i, name: 'P' + i, charId, confirmed: true }));
  G.startGame(r);
  return r;
}

ok(Number(G.VERSION) >= 1.29, 'server version is v1.29 or newer');
eq([G.CREATURES.komao.name, G.CREATURES.komao.evo, G.CREATURES.komao.elem,
  G.CREATURES.komao.rarity, G.CREATURES.komao.cost, G.CREATURES.komao.st,
  G.CREATURES.komao.hp, G.CREATURES.komao.evoSt, G.CREATURES.komao.evoHp],
  ['コマオー', 'シシガルム', 'earth', 'N', 70, 30, 30, 30, 50], 'Komao catalog');

const market = G.makeDeck();
eq([count(market, 'komao'), count(market, 'komao_f')], [3, 0], 'N market has three base copies only');
eq(G.CHAR_DECKS.nerasio,
  ['komao','komao','nome','nome','fugorm','cleo','sp_gold','sp_insight',
    'sp_earth_mother_stone','shield','shield','jinx'],
  'Nerasio provisional earth-chain starter deck');

// Placement forces the current land attribute to earth for every placement route.
{
  const r = game(), p = r.players[0];
  r.elemOv[1] = 'water';
  eq(G.tileElem(r, 1), 'water', 'fixture starts from an overridden non-earth land');
  eq(G.onCreatureSummoned(r, p, 'komao', 'summon', 1), false, 'summon conversion does not pause');
  eq(G.tileElem(r, 1), 'earth', 'normal summon forces earth');

  eq(G.onCreatureSummoned(r, p, 'komao_f', 'swap', 2), false, 'evolved swap conversion does not pause');
  eq(G.tileElem(r, 2), 'earth', 'replacement placement forces earth');

  r.elemOv[14] = 'wind';
  G.onCreatureSummoned(r, p, 'komao', 'battle', 14);
  eq([G.tileElem(r, 14), Object.hasOwn(r.elemOv, 14)], ['earth', false],
    'invasion placement clears a non-earth override from a native earth land');

  G.onCreatureSummoned(r, p, 'komao', 'move', 3);
  eq(G.tileElem(r, 3), 'fire', 'simple movement does not trigger placement conversion');
  G.rooms.delete(r.code);
}

// Evolved defender counts its own earth land: one land is +5, two lands are +10.
{
  const r = game(), atk = r.players[0], def = r.players[1];
  atk.hand = ['marlow'];
  r.owners[16] = { player: def.id, level: 1, creature: 'komao_f' };
  r.battle = { tile: 16, attacker: atk.id, defender: def.id, atkCreature: 'marlow',
    supports: { [atk.id]: {kind:'none'}, [def.id]: {kind:'none'} }, startedAt: 1 };
  G.resolveBattle(r);
  eq([r.lastBattle.defEarthChainBonus, r.lastBattle.df], [5, 15],
    'one earth land grants evolved defender DF+5 in addition to terrain');
  G.rooms.delete(r.code);
}
{
  const r = game(), atk = r.players[0], def = r.players[1];
  atk.hand = ['marlow'];
  r.owners[16] = { player: def.id, level: 1, creature: 'komao_f' };
  r.owners[17] = { player: def.id, level: 1, creature: 'nome' };
  r.battle = { tile: 16, attacker: atk.id, defender: def.id, atkCreature: 'marlow',
    supports: { [atk.id]: {kind:'none'}, [def.id]: {kind:'none'} }, startedAt: 2 };
  G.resolveBattle(r);
  eq([G.chainCount(r, def.id, 'earth'), r.lastBattle.defEarthChainBonus, r.lastBattle.df], [2, 10, 20],
    'two earth lands grant evolved defender DF+10');
  G.rooms.delete(r.code);
}

// A moved evolved attacker receives the same chain-derived DF.
{
  const r = game(), atk = r.players[0], def = r.players[1];
  r.owners[14] = { player: atk.id, level: 3, creature: 'komao_f' };
  r.owners[21] = { player: def.id, level: 1, creature: 'palecoral' };
  r.battle = { tile: 21, attacker: atk.id, defender: def.id, atkCreature: 'komao_f', moveFrom: 14,
    supports: { [atk.id]: {kind:'none'}, [def.id]: {kind:'none'} }, startedAt: 3 };
  G.resolveBattle(r);
  eq([r.lastBattle.atkEarthChainBonus, r.lastBattle.atkDf], [5, 5],
    'evolved attacker receives earth-chain DF');
  G.rooms.delete(r.code);
}

for (const file of ['c_komao.png','e_komao.png']) {
  const data = fs.readFileSync(path.join(__dirname, 'public', 'assets', file));
  ok(data.subarray(1, 4).toString() === 'PNG' && data[25] === 6, file + ' is a transparent PNG');
}
for (const file of ['c_komao.webp','e_komao.webp'])
  ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'cards', file)), file + ' exists');

console.log(`V1.29 EARTH CHAIN ALL ${pass} CHECKS PASSED`);
