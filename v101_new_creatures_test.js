// v1.01 regression: Bunnyhop line, Strauk and Samurai Saga.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, MARKET_POOL, spellDamage, onSpellCast,' +
  ' universalTerrain, onCreatureSummoned };')(
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

eq(G.VERSION, '1.01', 'version');

const bunny = G.CREATURES.bunnyhop;
eq([bunny.name, bunny.evo, bunny.elem, bunny.rarity, bunny.cost,
  bunny.st, bunny.hp, bunny.evoSt, bunny.evoHp],
  ['バニホップ', 'ロードバンプ', 'fire', 'N', 60, 10, 10, 40, 60],
  'Bunnyhop evolution line');
ok(bunny.fx.includes('スペル') && bunny.evoFx.includes('100G'), 'Bunnyhop effect texts');

const strauk = G.CREATURES.strauk;
eq([strauk.name, strauk.elem, strauk.rarity, strauk.cost, strauk.st, strauk.hp],
  ['ストラウク', null, 'N', 120, 10, 70], 'Strauk values');
const saga = G.CREATURES.samurai_saga;
eq([saga.name, saga.elem, saga.rarity, saga.cost, saga.st, saga.hp],
  ['サムライ・サガ', null, 'N', 120, 50, 50], 'Samurai Saga values');

eq([count(G.MARKET_POOL, 'bunnyhop'), count(G.MARKET_POOL, 'strauk'),
  count(G.MARKET_POOL, 'samurai_saga')], [1, 1, 1], 'market registrations');
ok(!G.MARKET_POOL.includes('bunnyhop_f'), 'evolved Bunnyhop is not in market');

const immuneRoom = {
  owners: [{ player: 'p1', creature: 'bunnyhop', dmg: 0 }],
  players: [{ id: 'p1', discard: [] }], log: [],
};
G.spellDamage(immuneRoom, 0, 20, '炎の渦', true);
eq(immuneRoom.owners[0].dmg, 0, 'Bunnyhop ignores spell-card damage');

const skillRoom = {
  owners: [{ player: 'p1', creature: 'bunnyhop', dmg: 0 }],
  players: [{ id: 'p1', discard: [] }], log: [],
};
G.spellDamage(skillRoom, 0, 5, '固有スキル', false);
eq(skillRoom.owners[0].dmg, 5, 'Bunnyhop does not ignore non-spell damage');

const rewardRoom = {
  owners: [
    { player: 'p1', creature: 'bunnyhop_f' },
    { player: 'p1', creature: 'bunnyhop_f' },
    { player: 'p2', creature: 'bunnyhop_f' },
  ], log: [],
};
const caster = { id: 'p1', name: 'P1', gold: 10 };
G.onSpellCast(rewardRoom, caster);
eq(caster.gold, 210, 'Roadbump reward stacks per owned copy');

ok(G.universalTerrain('cleo') && G.universalTerrain('strauk') &&
  G.universalTerrain('samurai_saga'), 'universal terrain creatures');
ok(!G.universalTerrain('bunnyhop'), 'ordinary creature does not gain universal terrain');

const summonRoom = { pending: {}, log: [] };
const summoned = G.onCreatureSummoned(summonRoom, { id: 'p1' }, 'samurai_saga', 'summon', 7);
ok(summoned, 'Samurai Saga opens terrain selection');
eq(summonRoom.pending.p1.type, 'samurai_elem', 'Samurai Saga pending type');
eq(summonRoom.pending.p1.options.map(x => x.id),
  ['se:fire', 'se:water', 'se:earth', 'se:wind', 'se:none'], 'terrain options');
eq([summonRoom.pending.p1.tile, summonRoom.pending.p1.after], [7, 'summon'], 'terrain pending context');

for (const file of ['c_bunnyhop.png', 'e_bunnyhop.png', 'c_strauk.png', 'c_samurai_saga.png']) {
  ok(fs.existsSync(path.join(__dirname, 'public', 'assets', file)), `${file} exists`);
}

console.log(`V1.01 ALL ${pass} CHECKS PASSED`);
