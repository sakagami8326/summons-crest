// v1.00 regression: new creatures, Lia/Adele decks, support and ult effects.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, RULES, TILES, CREATURES, SPELLS, SUPPORTS, CHARS, ULTS,' +
  ' CHAR_DECKS, MARKET_POOL, makeDeck, makeRoom, startGame, handleChoose, askSupports,' +
  ' resolveBattle, beginTurn, effectiveSpellCost, onCreatureSummoned, chainCount, rooms };')(
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
function game(chars = ['lia', 'adel']) {
  const r = G.makeRoom();
  r.players = chars.map((charId, i) => ({ id: 'p' + i, name: 'P' + i, charId, confirmed: true }));
  G.startGame(r);
  return r;
}

ok(['1.00', '1.01'].includes(G.VERSION), 'version remains compatible with the v1.00 suite');

// Catalog and evolution values.
const rows = [
  ['grayble', 'grangalum', 'グランガルム', 'fire', 80, 40, 30, 65, 45],
  ['trooper', 'grigor', 'グリゴール', 'fire', 90, 25, 40, 45, 60],
  ['survey', 'zashack', 'ザシャック', 'water', 80, 35, 35, 55, 50],
  ['palecoral', 'coralgrave', 'コラルグレイヴ', 'water', 90, 20, 50, 40, 70],
];
for (const [id, evoId, evoName, elem, cost, st, hp, evoSt, evoHp] of rows) {
  const c = G.CREATURES[id];
  ok(!!c, `${id} exists`);
  eq([c.evo, c.elem, c.cost, c.st, c.hp, c.evoSt, c.evoHp],
    [evoName, elem, cost, st, hp, evoSt, evoHp], `${id} catalog values`);
  ok(c.rarity === 'N' && !!c.evoFx, `${id} rarity and evolved text`);
  ok(G.CREATURES[id + '_f'].name === evoName, `${evoId} evolved alias`);
}

// Starter decks.
const lia = G.CHAR_DECKS.lia, adel = G.CHAR_DECKS.adel;
ok(lia.length === 12 && adel.length === 12, 'Lia/Adele decks contain 12 cards');
eq(['grayble','trooper','gecko','sp_gold','sp_insight','sp_flame_vortex','weapon','jinx'].map(x => count(lia, x)),
  [3,2,1,1,1,1,2,1], 'Lia starter composition');
eq(['survey','palecoral','orphe','sp_gold','sp_insight','sp_abyssal_pearl','shield','jinx'].map(x => count(adel, x)),
  [3,2,1,1,1,1,2,1], 'Adele starter composition');
ok(!lia.includes('cleo') && !adel.includes('cleo'), 'Cleo is absent from both new decks');
ok(G.CHARS.adel.selectable !== false && !G.CHARS.adel.upcoming, 'Adele is fully selectable');

// Market contains only three copies of each base form.
const market = G.makeDeck();
for (const [id] of rows) {
  ok(count(market, id) === 3, `${id} has three market copies`);
  ok(count(market, id + '_f') === 0, `${id} evolved form is not in market`);
}

// Grigor cost reduction stacks and floors at zero.
{
  const r = game();
  const p = r.players.find(x => x.charId === 'lia');
  r.owners[1] = { player: p.id, level: 3, creature: 'trooper' };
  r.owners[2] = { player: p.id, level: 3, creature: 'trooper_f' };
  ok(G.effectiveSpellCost(r, p, 'sp_quake') === Math.max(0, G.SPELLS.sp_quake.cost - 40),
    'two Grigors reduce spell cost by 40');
  ok(G.effectiveSpellCost(r, p, 'sp_insight') === 0, 'spell cost never falls below zero');
  G.rooms.delete(r.code);
}

// Trooper creates and shuffles Flame Vortex only on summon/swap.
{
  const r = game();
  const p = r.players.find(x => x.charId === 'lia');
  p.deck = ['sp_gold'];
  G.onCreatureSummoned(r, p, 'trooper', 'summon');
  ok(count(p.deck, 'sp_flame_vortex') === 1 && p.deck.length === 2, 'Trooper summon adds Flame Vortex');
  G.onCreatureSummoned(r, p, 'trooper', 'swap');
  ok(count(p.deck, 'sp_flame_vortex') === 2, 'Trooper swap summon adds another Flame Vortex');
  G.onCreatureSummoned(r, p, 'trooper', 'invasion');
  ok(count(p.deck, 'sp_flame_vortex') === 2, 'invasion placement does not add Flame Vortex');
  G.rooms.delete(r.code);
}

// Survey creature support options and resolution.
{
  const r = game();
  const atk = r.players.find(x => x.charId === 'adel');
  const def = r.players.find(x => x.id !== atk.id);
  atk.gold = 300; def.gold = 300;
  atk.hand = ['survey', 'grayble']; def.hand = [];
  r.owners[21] = { player: def.id, level: 1, creature: 'palecoral' };
  r.battle = { tile: 21, attacker: atk.id, defender: def.id, atkCreature: 'survey', supports: {}, startedAt: 1 };
  G.askSupports(r);
  ok(r.pending[atk.id].options.some(o => o.id === 'sup:c:grayble'), 'Survey exposes creature support option');
  r.pending = {};
  r.battle.supports = {
    [atk.id]: { kind: 'creature', cardId: 'grayble' },
    [def.id]: { kind: 'none' },
  };
  G.resolveBattle(r);
  ok(atk.gold === 220, 'creature support pays printed summon cost');
  ok(atk.discard.includes('grayble') && !atk.hand.includes('grayble'), 'creature support goes to discard');
  ok(r.lastBattle.atkSupport.kind === 'creature' && r.lastBattle.atkSupport.st === 40 && r.lastBattle.atkSupport.hp === 30,
    'creature support reveals and adds printed AT/HP');
  G.rooms.delete(r.code);
}

// Grayble chase only uses damage carried into an invasion.
{
  const r = game();
  const atk = r.players.find(x => x.charId === 'lia');
  const def = r.players.find(x => x.id !== atk.id);
  atk.hand = ['grayble']; def.hand = [];
  r.owners[21] = { player: def.id, level: 1, creature: 'palecoral', dmg: 1 };
  r.battle = { tile: 21, attacker: atk.id, defender: def.id, atkCreature: 'grayble',
    supports: { [atk.id]: { kind: 'none' }, [def.id]: { kind: 'none' } }, startedAt: 2 };
  G.resolveBattle(r);
  ok(r.lastBattle.st === 50 && r.lastBattle.notes.some(n => n.includes('追撃')), 'Grayble gains AT+10 versus pre-injured defender');
  G.rooms.delete(r.code);
}

// Palecoral recovery at turn start with two owned water lands.
{
  const r = game(['adel', 'lia']);
  const p = r.players.find(x => x.charId === 'adel');
  r.turn = r.players.indexOf(p); r.pending = {};
  r.owners[21] = { player: p.id, level: 1, creature: 'palecoral', dmg: 15 };
  r.owners[22] = { player: p.id, level: 1, creature: 'survey' };
  G.beginTurn(r);
  ok(r.owners[21].dmg === 5, 'Palecoral heals 10 at two-water chain');
  G.rooms.delete(r.code);
}

// Lia: three unique Flame Vortex targets in one action.
{
  const r = game(['lia', 'adel']);
  const p = r.players.find(x => x.charId === 'lia');
  const enemy = r.players.find(x => x.id !== p.id);
  r.turn = r.players.indexOf(p); r.pending = {};
  [1, 2, 3].forEach(i => { r.owners[i] = { player: enemy.id, level: 1, creature: 'grayble' }; });
  r.pending[p.id] = { type: 'ult_lia', selected: [1, 2, 3], options: [{ id: 'lu:confirm' }] };
  G.handleChoose(r, p.id, 'lu:confirm');
  ok([1,2,3].every(i => r.tileFx[i].vortex && r.owners[i].dmg === 10),
    'Crimson Equation applies Vortex and 10 damage to three unique lands');
  ok(p.ultUsed && r.lastUlt.charId === 'lia', 'Lia ult is consumed once');
  G.rooms.delete(r.code);
}

// Adele: all friendly creatures heal and receive one-use defense ward.
{
  const r = game(['adel', 'lia']);
  const p = r.players.find(x => x.charId === 'adel');
  r.turn = r.players.indexOf(p); r.pending = {};
  r.owners[21] = { player: p.id, level: 1, creature: 'survey', dmg: 25 };
  r.owners[22] = { player: p.id, level: 1, creature: 'grayble', dmg: 0 };
  r.pending[p.id] = { type: 'roll', options: [{ id: 'ult' }] };
  G.handleChoose(r, p.id, 'ult');
  ok(r.owners[21].dmg === 5 && r.owners[22].dmg === 0, 'Crystal Edict heals every friendly attribute by up to 20');
  ok(r.owners[21].iceWard && r.owners[22].iceWard, 'Crystal Edict grants ward even at full HP');
  ok(p.ultUsed && r.lastUlt.charId === 'adel', 'Adele ult is consumed once');
  G.rooms.delete(r.code);
}

console.log(`V1.00 ALL ${pass} CHECKS PASSED`);
