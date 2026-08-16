// v1.28 regression: Toxy/Mad Mist, Kamadoma/Daitekkan and DF-only Soul Eater.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, SUPPORTS, CHAR_DECKS, MARKET_POOL,' +
  ' makeDeck, makeRoom, startGame, handleChoose, onCreatureSummoned, resolveBattle,' +
  ' exileCard, resumeAfterExileEffects, publicState, serializeRoom, restoreRoom, rooms };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
const count = (cards, id) => cards.filter(card => card === id).length;
function game(chars = ['redani', 'villa', 'adel']) {
  const r = G.makeRoom();
  r.players = chars.map((charId, i) => ({ id: 'p' + i, name: 'P' + i, charId, confirmed: true }));
  G.startGame(r);
  return r;
}

eq(G.VERSION, '1.28', 'server version');
eq([G.CREATURES.toxy.name, G.CREATURES.toxy.evo, G.CREATURES.toxy.elem,
  G.CREATURES.toxy.rarity, G.CREATURES.toxy.cost, G.CREATURES.toxy.st,
  G.CREATURES.toxy.hp, G.CREATURES.toxy.evoSt, G.CREATURES.toxy.evoHp],
  ['トキシー', 'マッドミスト', 'wind', 'R', 120, 30, 40, 30, 50], 'Toxy catalog');
eq([G.CREATURES.kamadoma.name, G.CREATURES.kamadoma.evo, G.CREATURES.kamadoma.elem,
  G.CREATURES.kamadoma.rarity, G.CREATURES.kamadoma.cost, G.CREATURES.kamadoma.st,
  G.CREATURES.kamadoma.hp, G.CREATURES.kamadoma.evoSt, G.CREATURES.kamadoma.evoHp],
  ['カマドーマ', 'ダイテッカン', 'fire', 'N', 60, 20, 40, 30, 60], 'Kamadoma catalog');
const market = G.makeDeck();
eq([count(market, 'toxy'), count(market, 'kamadoma')], [2, 3], 'market copies are R2/N3');
eq(G.CHAR_DECKS.redani, ['gecko','gecko','gecko','kamadoma','kamadoma','cleo',
  'sp_gold','sp_insight','sp_bloodstained_blade','weapon','weapon','jinx'], 'Redani approved starter deck');

// Every Toxy/Mad Mist placed when exile occurs creates an independent target choice.
{
  const r = game(), owner = r.players[0], a = r.players[1], b = r.players[2];
  owner.hand = []; owner.exile = [];
  a.hand = ['shield']; a.discard = []; b.hand = ['weapon']; b.discard = [];
  r.owners[1] = { player: owner.id, level: 1, creature: 'toxy' };
  r.owners[2] = { player: owner.id, level: 3, creature: 'toxy_f' };
  G.exileCard(r, owner, 'jinx', 'test');
  G.resumeAfterExileEffects(r, { type: 'roll', player: owner.id });
  eq([r.pending[owner.id].type, r.effectQueue.length], ['toxy_target', 1], 'first chain target pending');
  G.handleChoose(r, owner.id, 'tx:' + a.id);
  eq([a.hand.length, a.discard[0], r.pending[owner.id].type], [0, 'shield', 'toxy_target'],
    'first target loses one random card to normal discard');
  G.handleChoose(r, owner.id, 'tx:' + b.id);
  eq([b.hand.length, b.discard[0], owner.exile], [0, 'weapon', ['jinx']],
    'second placed copy resolves without re-exiling the discarded card');
  ok(r.pending[owner.id].type === 'roll', 'chain returns to the saved continuation');
  G.rooms.delete(r.code);
}

// No target means the chain safely skips and resumes.
{
  const r = game(['redani','villa']), owner = r.players[0], enemy = r.players[1];
  owner.exile = []; enemy.hand = [];
  r.owners[1] = { player: owner.id, level: 1, creature: 'toxy' };
  G.exileCard(r, owner, 'weapon', 'test');
  G.resumeAfterExileEffects(r, { type: 'roll', player: owner.id });
  ok(r.pending[owner.id].type === 'roll' && !r.effectQueue.length, 'no-target chain is skipped');
  G.rooms.delete(r.code);
}

// Weapon forging applies only to placement reasons and is retained after evolution.
{
  const r = game(['redani','villa']), p = r.players[0];
  p.hand = [];
  eq(G.onCreatureSummoned(r, p, 'kamadoma', 'summon', 1), false, 'base placement does not pause');
  eq(G.onCreatureSummoned(r, p, 'kamadoma_f', 'swap', 1), false, 'evolved placement does not pause');
  G.onCreatureSummoned(r, p, 'kamadoma', 'move', 2);
  eq(p.hand, ['weapon', 'weapon'], 'summon/swap forge weapons but simple movement does not');
  G.rooms.delete(r.code);
}

// Soul Eater changes DF only on both sides and keeps explicit compatibility payload fields.
{
  const r = game(['villa','adel']), atk = r.players[0], def = r.players[1];
  atk.exile = ['weapon','shield']; atk.hand = ['alter']; def.exile = [];
  r.owners[21] = { player: def.id, level: 1, creature: 'palecoral' };
  r.battle = { tile: 21, attacker: atk.id, defender: def.id, atkCreature: 'alter',
    supports: { [atk.id]: {kind:'none'}, [def.id]: {kind:'none'} }, startedAt: 1 };
  G.resolveBattle(r);
  eq([r.lastBattle.st, r.lastBattle.atkDf, r.lastBattle.atkSoulDfBonus], [30,10,10],
    'attacking Soul Eater adds only DF');
  G.rooms.delete(r.code);
}
{
  const r = game(['villa','adel']), atk = r.players[0], def = r.players[1];
  atk.exile = []; atk.hand = ['marlow']; def.exile = ['weapon','shield','jinx'];
  r.owners[21] = { player: def.id, level: 1, creature: 'alter' };
  r.battle = { tile: 21, attacker: atk.id, defender: def.id, atkCreature: 'marlow',
    supports: { [atk.id]: {kind:'none'}, [def.id]: {kind:'none'} }, startedAt: 2 };
  G.resolveBattle(r);
  eq([r.lastBattle.defSt, r.lastBattle.df, r.lastBattle.defSoulDfBonus], [30,15,15],
    'defending Soul Eater adds only DF');
  G.rooms.delete(r.code);
}

// Battle support exile is delayed until battle resolution and precedes the battle draft.
{
  const r = game(['redani','adel']), atk = r.players[0], def = r.players[1];
  atk.hand = ['marlow','weapon']; atk.exile = []; def.hand = ['shield']; def.discard = [];
  r.owners[1] = { player: atk.id, level: 1, creature: 'toxy' };
  r.owners[21] = { player: def.id, level: 1, creature: 'gecko' };
  r.battle = { tile: 21, attacker: atk.id, defender: def.id, atkCreature: 'marlow',
    supports: { [atk.id]: {kind:'support',cardId:'weapon'}, [def.id]: {kind:'none'} }, startedAt: 3 };
  G.resolveBattle(r);
  ok(atk.exile.includes('weapon'), 'battle support is exiled');
  ok(r.pending[atk.id].type === 'toxy_target' && r.battleAfter, 'chain waits until battle has ended and precedes draft');
  G.handleChoose(r, atk.id, 'tx:' + def.id);
  ok(r.pending[atk.id].type === 'draft', 'battle draft starts after the chain resolves');
  G.rooms.delete(r.code);
}

// An evolved surviving winner can recover exactly one support, privately, before the draft.
{
  const r = game(['redani','adel']), atk = r.players[0], def = r.players[1];
  atk.hand = ['marlow']; def.exile = ['weapon','weapon','sp_quake','shield'];
  def.hand = Array(7).fill('marlow');
  r.owners[21] = { player: def.id, level: 1, creature: 'kamadoma_f' };
  r.battle = { tile: 21, attacker: atk.id, defender: def.id, atkCreature: 'marlow',
    supports: { [atk.id]: {kind:'none'}, [def.id]: {kind:'none'} }, startedAt: 4 };
  G.resolveBattle(r);
  ok(r.pending[def.id].type === 'daitekkan_recover', 'Daitekkan recovery precedes the battle draft');
  ok(G.publicState(r, atk.id).pending[def.id].options.length === 0, 'recovery card candidates stay private');
  G.handleChoose(r, def.id, 'dr:1');
  ok(def.hand.length === 8 && def.hand.includes('weapon') && count(def.exile, 'weapon') === 1,
    'selected duplicate support returns even above the hand limit');
  ok(r.pending[def.id].type === 'draft', 'draft resumes after recovery');
  G.rooms.delete(r.code);
}

// The new saved pipeline fields survive serialization.
{
  const r = game(['redani','villa']);
  r.effectQueue = [{ type:'toxy', owner:r.players[0].id, card:'weapon', source:'test', battle:false, order:1 }];
  r.effectResume = { type:'roll', player:r.players[0].id };
  r.battleAfter = { winner:r.players[0].id, attacker:r.players[0].id, defender:r.players[1].id,
    tile:21, invasionWon:true, recoveryDone:false };
  const saved = G.serializeRoom(r);
  ok(saved.room.effectQueue.length === 1 && saved.room.effectResume && saved.room.battleAfter,
    'effect queue and post-battle continuation are persisted');
  G.rooms.delete(r.code);
}

for (const file of ['c_toxy.png','e_toxy.png','c_kamadoma.png','e_kamadoma.png']) {
  const full = path.join(__dirname, 'public', 'assets', file);
  ok(fs.existsSync(full), `board art exists: ${file}`);
  const png = fs.readFileSync(full);
  ok(png.subarray(1,4).toString('ascii') === 'PNG' && png[25] === 6, `board art is transparent PNG: ${file}`);
}
for (const file of ['c_toxy.webp','e_toxy.webp','c_kamadoma.webp','e_kamadoma.webp'])
  ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'cards', file)), `card art exists: ${file}`);

const phone = fs.readFileSync(path.join(__dirname, 'public', 'phone.html'), 'utf8');
const board = fs.readFileSync(path.join(__dirname, 'public', 'board.html'), 'utf8');
ok(phone.includes("p.type === 'toxy_target'") && phone.includes("p.type === 'daitekkan_recover'"),
  'phone routes both new pending types');
ok(board.includes('魂喰らい') && board.includes('DF+'), 'TV battle detail describes DF-only Soul Eater');

console.log(`V1.28 EXILE CHAIN ALL ${pass} CHECKS PASSED`);
