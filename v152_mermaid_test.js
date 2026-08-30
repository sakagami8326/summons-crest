// v1.52 regression: Mermaid / Serenade victory healing.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, MARKET_POOL, makeDeck, makeRoom, startGame,' +
  ' resolveBattle, continuePostBattle, handleChoose, botChooseOption, serializeRoom, restoreRoom, rooms };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
const count = (cards, id) => cards.filter(card => card === id).length;
function game() {
  const r = G.makeRoom();
  r.players = ['redani', 'adel'].map((charId, i) => ({
    id: 'p' + i, name: 'P' + i, charId, confirmed: true,
  }));
  G.startGame(r);
  return r;
}
function battle(r, atkCreature, defCreature, defLevel = 1) {
  const atk = r.players[0], def = r.players[1];
  atk.hand = [atkCreature];
  r.owners[21] = { player: def.id, level: defLevel, creature: defCreature };
  r.battle = { tile: 21, attacker: atk.id, defender: def.id, atkCreature,
    supports: { [atk.id]: { kind: 'none' }, [def.id]: { kind: 'none' } }, startedAt: Date.now() };
  G.resolveBattle(r);
  return { atk, def };
}

ok(Number(G.VERSION) >= 1.52, 'server version is v1.52 or newer');
eq([G.CREATURES.mermaid.name, G.CREATURES.mermaid.evo, G.CREATURES.mermaid.elem,
  G.CREATURES.mermaid.rarity, G.CREATURES.mermaid.cost, G.CREATURES.mermaid.st,
  G.CREATURES.mermaid.hp, G.CREATURES.mermaid.evoSt, G.CREATURES.mermaid.evoHp],
  ['マーメイド', 'セレナーデ', 'water', 'R', 100, 30, 40, 45, 60], 'catalog stats');
eq([G.CREATURES.mermaid_f.name, G.CREATURES.mermaid_f.st, G.CREATURES.mermaid_f.hp],
  ['セレナーデ', 45, 60], 'evolved catalog entry');
eq([count(G.makeDeck(), 'mermaid'), count(G.makeDeck(), 'mermaid_f')], [2, 0],
  'market contains two base R cards and no evolved card');

for (const file of ['c_mermaid.png', 'e_mermaid.png']) {
  const data = fs.readFileSync(path.join(__dirname, 'public', 'assets', file));
  ok(data.slice(1, 4).toString() === 'PNG', `${file} is a PNG`);
  eq(data[25], 6, `${file} keeps RGBA transparency`);
}

// Invasion victory: the newly placed Mermaid may heal another wounded ally.
{
  const r = game();
  r.owners[22] = { player: r.players[0].id, level: 1, creature: 'orphe', dmg: 16 };
  const { atk } = battle(r, 'mermaid', 'gecko');
  eq([r.lastBattle.win, r.pending[atk.id].type], [true, 'mermaid_heal'],
    'attacking Mermaid victory opens one-target heal');
  ok(r.pending[atk.id].options.some(option => option.id === 'mh:22'), 'wounded ally is selectable');
  G.handleChoose(r, atk.id, 'mh:22');
  eq([r.owners[22].dmg, r.lastHeal.source, r.lastHeal.targets[0].amount], [6, 'mermaid', 10],
    'selected ally heals 10 without changing other lands');
  ok(r.pending[atk.id].type === 'draft', 'battle draft resumes after healing');
  G.rooms.delete(r.code);
}

// Defense victory: Mermaid survives, carries battle damage, and can heal itself.
{
  const r = game();
  const { def } = battle(r, 'gecko', 'mermaid');
  eq([r.lastBattle.win, r.pending[def.id].type, r.owners[21].dmg], [false, 'mermaid_heal', 30],
    'defending Mermaid victory opens heal after damage is recorded');
  ok(r.pending[def.id].options.some(option => option.id === 'mh:21'), 'Mermaid can target itself');
  G.handleChoose(r, def.id, 'mh:21');
  eq([r.owners[21].dmg, r.lastHeal.targets[0].amount], [20, 10], 'self healing reduces carried damage');
  ok(r.pending[def.id].type === 'draft', 'defender receives battle draft after healing');
  G.rooms.delete(r.code);
}

// Serenade victory automatically heals every wounded allied creature, capped by its damage.
{
  const r = game();
  r.owners[22] = { player: r.players[1].id, level: 1, creature: 'orphe', dmg: 15 };
  r.owners[24] = { player: r.players[1].id, level: 1, creature: 'cleo', dmg: 6 };
  const { def } = battle(r, 'magado', 'mermaid_f');
  eq([r.lastBattle.win, r.owners[21].dmg, r.owners[22].dmg, r.owners[24].dmg],
    [false, 35, 5, 0], 'Serenade heals itself and all wounded allies after defense victory');
  eq([r.lastHeal.source, r.lastHeal.targets.length], ['serenade', 3], 'all-target heal event is published');
  ok(r.pending[def.id].type === 'draft', 'Serenade does not open a target picker');
  G.rooms.delete(r.code);
}

// With no wounded ally, Mermaid skips an empty choice and proceeds directly.
{
  const r = game();
  const { atk } = battle(r, 'mermaid', 'gecko');
  ok(r.pending[atk.id].type === 'draft', 'no wounded target skips Mermaid prompt');
  ok(!r.lastHeal || r.lastHeal.source !== 'mermaid', 'no empty heal event is emitted');
  G.rooms.delete(r.code);
}

// BOT picks the most wounded valid ally.
{
  const r = game();
  const p = r.players[0];
  r.owners[21] = { player: p.id, level: 1, creature: 'mermaid', dmg: 4 };
  r.owners[22] = { player: p.id, level: 1, creature: 'orphe', dmg: 18 };
  const pend = { type: 'mermaid_heal', options: [
    { id: 'mh:21', tile: 21 }, { id: 'mh:22', tile: 22 },
  ] };
  eq(G.botChooseOption(r, p, pend), 'mh:22', 'BOT prioritizes the most wounded ally');
  G.rooms.delete(r.code);
}

// Pending recovery survives save/restore and the new card IDs validate in every zone.
{
  const r = game();
  const p = r.players[0];
  p.hand = ['mermaid'];
  r.owners[21] = { player: p.id, level: 1, creature: 'mermaid_f', dmg: 12 };
  r.battleAfter = { winner: p.id, attacker: p.id, defender: r.players[1].id, tile: 21,
    invasionWon: true, mermaidDone: true, recoveryDone: false };
  r.pending[p.id] = { type: 'mermaid_heal', prompt: '回復する味方を選べ',
    options: [{ id: 'mh:21', tile: 21, creature: 'mermaid_f' }] };
  const save = G.serializeRoom(r);
  G.rooms.delete(r.code);
  const restored = G.restoreRoom(save);
  ok(!restored.error, 'save containing Mermaid state restores');
  eq([restored.room.pending[p.id].type, restored.room.battleAfter.mermaidDone],
    ['mermaid_heal', true], 'pending heal continuation is preserved');
  G.rooms.delete(r.code);
}

const phone = fs.readFileSync(path.join(__dirname, 'public', 'phone.html'), 'utf8');
ok(phone.includes("mermaid_heal:'回復する味方を選べ'"), 'phone shows Mermaid action prompt');
ok(phone.includes("p.type === 'mermaid_heal'"), 'phone routes Mermaid target selection to the map');
const tileTargetsSource = phone.match(/function tileTargets\(p\) \{[\s\S]*?\n\}/)?.[0];
ok(tileTargetsSource, 'phone tile-target helper is present');
const phoneTileTargets = new Function(`${tileTargetsSource}; return tileTargets;`)();
eq(phoneTileTargets({ options: [{ id:'mh:7' }, { id:'pass' }] }),
  { 7:'mh:7' }, 'phone accepts Mermaid tile option IDs');

const manual = fs.readFileSync(path.join(__dirname, 'docs', 'manual.md'), 'utf8');
const rules = fs.readFileSync(path.join(__dirname, 'docs', 'spec_rules.md'), 'utf8');
ok(manual.includes('カード一覧(クリーチャー39種)') && manual.includes('マーメイド → セレナーデ'),
  'manual documents the 39th creature');
ok(rules.includes('v1.52 マーメイド／セレナーデ仕様'), 'rules document victory-heal timing');

console.log(`v1.52 Mermaid tests passed: ${pass}`);
