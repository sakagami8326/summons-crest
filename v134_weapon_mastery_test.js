// v1.34 regression: Sword Gear / Ignis Knight weapon mastery and Redani deck.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, CHAR_DECKS, MARKET_POOL, makeDeck, makeRoom,' +
  ' startGame, resolveBattle, rooms };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
const count = (cards, id) => cards.filter(card => card === id).length;

function game() {
  const r = G.makeRoom();
  r.players = [
    { id: 'p0', name: 'Attacker', charId: 'redani', confirmed: true },
    { id: 'p1', name: 'Defender', charId: 'adel', confirmed: true }
  ];
  G.startGame(r);
  r.owners.fill(null);
  return r;
}

function battle({ attackerCreature = 'swordgear', attackerSupport = null,
  defenderCreature = 'palecoral', defenderSupport = null,
  attackerEvolved = false, defenderEvolved = false } = {}) {
  const r = game();
  const atk = r.players[0], def = r.players[1];
  atk.hand = [attackerCreature];
  def.hand = [];
  if (attackerSupport) atk.hand.push(attackerSupport);
  if (defenderSupport) def.hand.push(defenderSupport);
  r.owners[21] = { player: def.id, level: defenderEvolved ? 3 : 1, creature: defenderCreature };
  let moveFrom;
  if (attackerEvolved) {
    moveFrom = 1;
    r.owners[moveFrom] = { player: atk.id, level: 3, creature: attackerCreature };
  }
  r.battle = { tile: 21, attacker: atk.id, defender: def.id,
    atkCreature: attackerCreature, supports: {
      [atk.id]: attackerSupport ? { kind: 'support', cardId: attackerSupport } : { kind: 'none' },
      [def.id]: defenderSupport ? { kind: 'support', cardId: defenderSupport } : { kind: 'none' }
    }, startedAt: 1 };
  if (moveFrom !== undefined) r.battle.moveFrom = moveFrom;
  G.resolveBattle(r);
  const result = r.lastBattle;
  G.rooms.delete(r.code);
  return result;
}

ok(Number(G.VERSION) >= 1.34, 'server version is v1.34 or newer');
eq([G.CREATURES.swordgear.name, G.CREATURES.swordgear.evo,
  G.CREATURES.swordgear.elem, G.CREATURES.swordgear.rarity,
  G.CREATURES.swordgear.cost, G.CREATURES.swordgear.st,
  G.CREATURES.swordgear.hp, G.CREATURES.swordgear.evoSt,
  G.CREATURES.swordgear.evoHp],
  ['ソードギア', 'イグニスナイト', 'fire', 'R', 100, 40, 30, 40, 50],
  'Sword Gear catalog');
eq([count(G.makeDeck(), 'swordgear'), count(G.makeDeck(), 'swordgear_f')], [2, 0],
  'R market has two base copies and no evolved copies');
eq(G.CHAR_DECKS.redani,
  ['kamadoma','kamadoma','swordgear','gecko','gecko','cleo',
    'sp_gold','sp_insight','sp_bloodstained_blade','weapon','weapon','gweapon'],
  'Redani weapon starter deck');

for (const asset of ['public/assets/c_swordgear.png', 'public/assets/e_swordgear.png',
  'public/assets/cards/c_swordgear.webp', 'public/assets/cards/e_swordgear.webp']) {
  ok(fs.existsSync(path.join(__dirname, asset)), `asset exists: ${asset}`);
}

{
  const b = battle({ attackerSupport: 'weapon' });
  eq([b.st, b.atkPreAt, b.atkPostAt, b.atkWeaponMastery], [70, 40, 70, 10],
    'base attacker adds Sword AT+20 and mastery AT+10');
  ok(b.notes.some(note => note.includes('武装熟練')), 'attacker mastery is reported in battle notes');
}

{
  const b = battle({ attackerSupport: 'gweapon', attackerEvolved: true });
  eq([b.st, b.atkPreAt, b.atkPostAt, b.atkWeaponMastery], [100, 40, 100, 20],
    'evolved attacker adds Heavy Axe AT+40 and mastery AT+20');
}

{
  const b = battle({ attackerCreature: 'marlow', defenderCreature: 'swordgear',
    defenderSupport: 'weapon' });
  eq([b.defSt, b.defPreAt, b.defPostAt, b.defWeaponMastery], [70, 40, 70, 10],
    'base defender counterattack receives Sword mastery');
}

{
  const b = battle({ attackerCreature: 'marlow', defenderCreature: 'swordgear',
    defenderSupport: 'gweapon', defenderEvolved: true });
  eq([b.defSt, b.defPreAt, b.defPostAt, b.defWeaponMastery], [100, 40, 100, 20],
    'evolved defender counterattack receives Heavy Axe mastery');
}

{
  const b = battle({ attackerSupport: 'weapon', defenderSupport: 'jinx' });
  eq([b.st, b.atkPreAt, b.atkPostAt, b.atkWeaponMastery], [40, 40, 40, 0],
    'Disarm nullifies both weapon AT and mastery');
}

{
  const b = battle({ attackerSupport: 'shield' });
  eq([b.st, b.atkWeaponMastery], [40, 0], 'non-weapon support does not trigger mastery');
}

console.log(`V1.34 WEAPON MASTERY ALL ${pass} CHECKS PASSED`);
