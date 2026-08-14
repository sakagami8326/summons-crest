// v1.24 regression: Villa, exile tactics, Gaust/Alter and Fatal Reward.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, SPELLS, SUPPORTS, CHARS, ULTS, CHAR_DECKS, MARKET_POOL,' +
  ' makeDeck, makeRoom, startGame, startSelect, handleChoose, onCreatureSummoned, resolveBattle,' +
  ' startVillaRecovery, publicState, validateSave, serializeRoom, rooms };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (v, name) => { if (!v) throw new Error('FAIL: ' + name); pass++; };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${name} (actual=${JSON.stringify(a)} expected=${JSON.stringify(b)})`);
const count = (a, id) => a.filter(x => x === id).length;
function game(chars = ['villa', 'adel']) {
  const r = G.makeRoom();
  r.players = chars.map((charId, i) => ({ id:'p' + i, name:'P' + i, charId, confirmed:true }));
  G.startGame(r);
  return r;
}

ok(Number(G.VERSION) >= 1.24, 'version is v1.24 or newer');
eq([G.CREATURES.gaust.name, G.CREATURES.gaust.evo, G.CREATURES.gaust.elem,
  G.CREATURES.gaust.rarity, G.CREATURES.gaust.cost, G.CREATURES.gaust.st,
  G.CREATURES.gaust.hp, G.CREATURES.gaust.evoSt, G.CREATURES.gaust.evoHp],
  ['ガウスト','マスターガウスト','wind','N',70,30,30,40,50], 'Gaust catalog values');
eq([G.CREATURES.alter.name, G.CREATURES.alter.evo, G.CREATURES.alter.elem,
  G.CREATURES.alter.rarity, G.CREATURES.alter.cost, G.CREATURES.alter.st,
  G.CREATURES.alter.hp, G.CREATURES.alter.evoSt, G.CREATURES.alter.evoHp],
  ['オルター','オルボロス','wind','R',70,30,40,40,50], 'Alter catalog values');
eq([G.SPELLS.sp_fatal_reward.name, G.SPELLS.sp_fatal_reward.rarity,
  G.SPELLS.sp_fatal_reward.cost, !!G.SPELLS.sp_fatal_reward.exileAfterUse],
  ['フェイタルリワード','N',80,false], 'Fatal Reward values and reusable rule');
const market = G.makeDeck();
eq([count(market,'gaust'),count(market,'alter'),count(market,'sp_fatal_reward')], [3,2,3],
  'market copies are N3/R2/N3');

ok(G.CHARS.villa.selectable !== false && !G.CHARS.villa.upcoming, 'Villa is selectable');
eq(G.CHAR_DECKS.villa, ['gaust','gaust','alter','alter','marlow','cleo','sp_gold','sp_insight',
  'sp_fatal_reward','shield','weapon','jinx'], 'Villa starter deck has the approved 12 cards');
ok(G.ULTS.villa.name === '墓守の協奏曲' && G.ULTS.villa.desc.includes('最大3枚'),
  'Villa ultimate name and description');
{
  const r = G.makeRoom(); r.players = [{id:'p1',name:'甲'},{id:'p2',name:'乙'}]; G.startSelect(r);
  ok(r.pending.p1.options.some(o => o.id === 'villa'), 'Villa appears in human selection');
  G.rooms.delete(r.code);
}

for (const id of ['sp_quake','sp_ward','sp_volcanic_core','sp_abyssal_pearl',
  'sp_earth_mother_stone','sp_sky_crystal'])
  ok(G.SPELLS[id].exileAfterUse === true, `${id} is marked as exile-on-use`);
for (const id of ['weapon','gweapon','shield','gshield','jinx'])
  ok(G.SUPPORTS[id].exileAfterUse === true, `${id} is marked as exile-on-use`);

// Gaust draws, then forces exactly one card into exile.
{
  const r = game(), p = r.players[0];
  p.hand = ['weapon']; p.deck = ['shield']; p.discard = []; p.exile = []; r.pending = {};
  ok(G.onCreatureSummoned(r, p, 'gaust', 'summon', 1), 'Gaust starts mandatory exile selection');
  eq([p.hand.length, p.deck.length, r.pending[p.id].type], [2,0,'gaust_exile'], 'Gaust draw and pending');
  G.handleChoose(r, p.id, 'gx:0');
  ok(p.exile.includes('weapon') && !p.hand.includes('weapon'), 'Gaust exiles selected hand card');
  G.rooms.delete(r.code);
}

// Fatal Reward stays in the resolving zone, draws once, exiles the chosen card, then goes to discard.
{
  const r = game(), p = r.players[0];
  p.gold = 200; p.hand = ['sp_fatal_reward','weapon']; p.deck = ['shield'];
  p.discard = []; p.exile = []; p.resolving = []; p.spellCast = false;
  r.pending = { [p.id]: { type:'roll', options:[{id:'sp:sp_fatal_reward'}] } };
  G.handleChoose(r, p.id, 'sp:sp_fatal_reward');
  eq([p.gold, p.spellCast, r.pending[p.id].type, p.resolving[0]],
    [120,true,'fatal_exile','sp_fatal_reward'], 'Fatal Reward cost, spell use and resolving zone');
  ok(p.hand.includes('shield') && !p.hand.includes('sp_fatal_reward'), 'Fatal Reward draws without drawing itself');
  G.handleChoose(r, p.id, 'fe:0');
  ok(p.exile.includes('weapon') && p.discard.includes('sp_fatal_reward') && p.resolving.length === 0,
    'chosen card is exiled while Fatal Reward returns to discard');
  G.rooms.delete(r.code);
}

// Soul Eater reads the owner's exile count for both invasion and defense.
{
  const r = game(), atk = r.players[0], def = r.players[1];
  atk.exile = ['weapon','shield']; atk.hand = ['alter']; def.exile = [];
  r.owners[21] = { player:def.id, level:1, creature:'palecoral' };
  r.battle = { tile:21, attacker:atk.id, defender:def.id, atkCreature:'alter',
    supports:{ [atk.id]:{kind:'none'}, [def.id]:{kind:'none'} }, startedAt:1 };
  G.resolveBattle(r);
  eq([r.lastBattle.st, r.lastBattle.atkDf], [40,10], 'Soul Eater adds AT and DF while attacking');
  ok(r.lastBattle.notes.some(n => n.includes('魂喰らい') && n.includes('廃棄2枚')), 'attack bonus is logged');
  G.rooms.delete(r.code);
}
{
  const r = game(), atk = r.players[0], def = r.players[1];
  atk.exile = []; atk.hand = ['marlow']; def.exile = ['weapon','shield','sp_quake'];
  r.owners[21] = { player:def.id, level:1, creature:'alter' };
  r.battle = { tile:21, attacker:atk.id, defender:def.id, atkCreature:'marlow',
    supports:{ [atk.id]:{kind:'none'}, [def.id]:{kind:'none'} }, startedAt:2 };
  G.resolveBattle(r);
  eq([r.lastBattle.defSt, r.lastBattle.df], [45,15], 'Soul Eater adds AT and DF while defending');
  G.rooms.delete(r.code);
}

// Villa recovery supports duplicate cards, 0-3 choices, and hides private options from other viewers.
{
  const r = game(), p = r.players[0], other = r.players[1];
  p.exile = ['weapon','weapon','sp_quake','shield']; p.hand = []; p.pos = 0; r.pending = {};
  G.startVillaRecovery(r, p);
  const hidden = G.publicState(r, other.id).pending[p.id];
  ok(hidden.type === 'ult_villa_recover' && hidden.options.length === 0, 'Villa recovery candidates stay private');
  G.handleChoose(r, p.id, 'vr:0');
  G.handleChoose(r, p.id, 'vr:1');
  G.handleChoose(r, p.id, 'vr:confirm');
  eq([count(p.hand,'weapon'),count(p.exile,'weapon')], [2,0], 'duplicate exile cards are recovered individually');
  G.rooms.delete(r.code);
}

for (const file of ['c_gaust.png','e_gaust.png','c_alter.png','e_alter.png'])
  ok(fs.existsSync(path.join(__dirname,'public','assets',file)), `${file} exists`);
for (const file of ['c_gaust.webp','e_gaust.webp','c_alter.webp','e_alter.webp','spell-fatal-reward-art-v1.webp'])
  ok(fs.existsSync(path.join(__dirname,'public','assets','cards',file)), `${file} exists`);
const phone = fs.readFileSync(path.join(__dirname,'public','phone.html'),'utf8');
const board = fs.readFileSync(path.join(__dirname,'public','board.html'),'utf8');
ok(phone.includes("p.type === 'gaust_exile'") && phone.includes("p.type === 'ult_villa_recover'"),
  'phone routes the new private card-selection pending types');
ok(phone.includes('cardExileTag') && phone.includes('spell-fatal-reward-art-v1.webp'),
  'phone shows exile badges and Fatal Reward art');
ok(board.includes('spell-fatal-reward-art-v1.webp') && board.includes('supportExileTag'),
  'TV shows Fatal Reward art and support exile badges');

console.log(`V1.24 VILLA/EXILE ALL ${pass} CHECKS PASSED`);
