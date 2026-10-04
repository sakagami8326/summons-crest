// v1.28 regression: Toxy/Mad Mist, Kamadoma/Daitekkan and DF-only Soul Eater.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, SUPPORTS, CHAR_DECKS, MARKET_POOL,' +
  ' makeDeck, makeRoom, startGame, handleChoose, onCreatureSummoned, resolveBattle,' +
  ' exileCard, resumeAfterExileEffects, creatureEffectUi, publicState, serializeRoom, restoreRoom, rooms };')(
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

ok(Number(G.VERSION) >= 1.28, 'server version is v1.28 or newer');
eq([G.CREATURES.toxy.name, G.CREATURES.toxy.evo, G.CREATURES.toxy.elem,
  G.CREATURES.toxy.rarity, G.CREATURES.toxy.cost, G.CREATURES.toxy.st,
  G.CREATURES.toxy.hp, G.CREATURES.toxy.evoSt, G.CREATURES.toxy.evoHp],
  ['トキシー', 'マッドミスト', 'wind', 'R', 120, 30, 40, 30, 50], 'Toxy catalog');
eq([G.CREATURES.kamadoma.name, G.CREATURES.kamadoma.evo, G.CREATURES.kamadoma.elem,
  G.CREATURES.kamadoma.rarity, G.CREATURES.kamadoma.cost, G.CREATURES.kamadoma.st,
  G.CREATURES.kamadoma.hp, G.CREATURES.kamadoma.evoSt, G.CREATURES.kamadoma.evoHp],
  ['カマドーマ', 'ダイテッカン', 'fire', 'N', 60, 20, 40, 30, 60], 'Kamadoma catalog');
eq(G.CREATURES.kamadoma.evoFx, '【再鋳造】戦闘勝利時、廃棄のウェポン1枚を回収', 'evolution replaces forging with recovery');
eq(G.CREATURES.kamadoma_f.fx, G.CREATURES.kamadoma.evoFx, 'generated evolved card displays only recovery');
const market = G.makeDeck();
eq([count(market, 'toxy'), count(market, 'kamadoma')], [2, 3], 'market copies are R2/N3');
eq(G.CHAR_DECKS.redani, ['kamadoma','kamadoma','swordgear','gecko','gecko','cleo',
  'sp_gold','sp_insight','sp_bloodstained_blade','weapon','weapon','gweapon'], 'Redani weapon starter deck');

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
  eq([r.toxyNotices[0].player,r.toxyNotices[0].target,r.toxyNotices[0].creature,
    r.toxyNotices[0].count,r.toxyNotices[0].beforeCount,r.toxyNotices[0].afterCount],
    [owner.id,a.id,'toxy',1,1,0], 'discard notice records actor, target and actual count change');
  G.handleChoose(r, owner.id, 'tx:' + b.id);
  eq([b.hand.length, b.discard[0], owner.exile], [0, 'weapon', ['jinx']],
    'second placed copy resolves without re-exiling the discarded card');
  ok(r.pending[owner.id].type === 'roll', 'chain returns to the saved continuation');
  eq(r.toxyNotices.map(e=>e.creature),['toxy','toxy_f'],'both chained notices retain source evolution');
  ok(r.toxyNotices[1].at>r.toxyNotices[0].at,'chain notice stamps are unique and ordered');
  for(const viewer of [null,owner.id,a.id]){
    const notices=G.publicState(r,viewer).toxyNotices;
    eq(notices,r.toxyNotices,'same public count-only notice for each viewer');
    ok(notices.every(e=>!('card' in e)&&!('cards' in e)),'notice never exposes card identities');
  }
  eq(G.serializeRoom(r).room.toxyNotices,r.toxyNotices,'notices survive saves');
  G.handleChoose(r,owner.id,'tx:'+a.id);
  eq(r.toxyNotices.length,2,'stale choice does not duplicate a notice');
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
  eq(r.toxyNotices,[],'no notice when no card was discarded');
  G.rooms.delete(r.code);
}

// Weapon forging applies only to unevolved placement; evolution replaces the ability.
{
  const r = game(['redani','villa']), p = r.players[0];
  p.hand = [];
  eq(G.onCreatureSummoned(r, p, 'kamadoma', 'summon', 1), false, 'base placement does not pause');
  eq(G.onCreatureSummoned(r, p, 'kamadoma_f', 'swap', 1), false, 'evolved placement does not pause');
  G.onCreatureSummoned(r, p, 'kamadoma', 'move', 2);
  eq(p.hand, ['weapon'], 'only unevolved placement forges a weapon');
  eq(r.kamadomaNotices.map(e=>[e.creature,e.reason,e.count]),
    [['kamadoma','summon',1]],'evolved placement and simple moves produce no Sword notice');
  const notices=JSON.stringify(r.kamadomaNotices);
  r.lastGain={player:p.id,n:1,cards:['sp_quake'],reason:'draft',at:999};
  require('assert/strict').deepEqual(G.publicState(r,null).kamadomaNotices,JSON.parse(notices),'subsequent private gain cannot erase Sword notice');
  ok(!G.publicState(r,null).lastGain.cards,'private reward identities remain hidden');
  eq(G.serializeRoom(r).room.kamadomaNotices,r.kamadomaNotices,'Sword notices are saved');
  G.rooms.delete(r.code);
}

for (const reason of ['summon', 'swap', 'battle', 'frontline']) {
  for (const [creature, level, expected] of [['kamadoma',1,1], ['kamadoma_f',1,0], ['kamadoma',3,0], ['kamadoma',4,0]]) {
    const r = game(['redani','adel']), p = r.players[0];
    p.hand = [];
    r.owners[21] = { player:p.id, creature, level };
    G.onCreatureSummoned(r,p,creature,reason,21);
    eq(count(p.hand,'weapon'),expected,`${reason}: ${creature} Lv${level} grants only its current ability`);
    eq(r.kamadomaNotices.length,expected,`${reason}: Sword notice matches actual acquisition`);
    G.rooms.delete(r.code);
  }
}

// Actual invasion resolution, rather than calling the placement hook directly.
for(const cid of ['kamadoma','kamadoma_f']){
  for(const wins of [true,false]){
    const r=game(['redani','adel']),atk=r.players[0],def=r.players[1];
    atk.hand=[cid];atk.exile=[];def.hand=[];def.exile=[];
    r.owners[21]={player:def.id,level:1,creature:wins?'gecko':'nome_f',dmg:wins?29:0};
    r.elemOv[21]='water';
    r.battle={tile:21,attacker:atk.id,defender:def.id,atkCreature:cid,
      supports:{[atk.id]:{kind:'none'},[def.id]:{kind:'none'}},startedAt:1};
    G.resolveBattle(r);
    eq(r.owners[21].player,wins?atk.id:def.id,`${cid} invasion outcome`);
    const forges = wins && cid === 'kamadoma';
    eq(count(atk.hand,'weapon'),forges?1:0,`${cid} invasion forges only before evolution and on victory`);
    if(forges)eq(r.lastGain.reason,'kamadoma','sword reward comes from Kamadoma placement');
    eq(r.kamadomaNotices.length,forges?1:0,'only actual unevolved victory produces board reward notice');
    if(forges)eq([r.kamadomaNotices[0].creature,r.kamadomaNotices[0].reason],[cid,'battle'],'battle source recorded');
    eq(G.creatureEffectUi(r,cid,21,'attacker','battle',{win:wins,atkSurvived:true}).state,
      cid==='kamadoma_f' && wins?'active':'inactive','battle effect presentation matches evolved victory');
    G.rooms.delete(r.code);
  }
}

// A winning evolved invader recovers an existing weapon without creating a Sword.
// The land level also evolves a base card placed on the conquered territory.
for (const [cid, level] of [['kamadoma_f',1], ['kamadoma',3]]) {
  const r=game(['redani','adel']), atk=r.players[0], def=r.players[1];
  atk.hand=[cid]; atk.exile=['gshield']; def.hand=[]; def.exile=[];
  r.owners[21]={player:def.id,level,creature:'gecko',dmg:(level>=3?G.CREATURES.gecko.evoHp:G.CREATURES.gecko.hp)-1};
  r.elemOv[21]='water';
  r.battle={tile:21,attacker:atk.id,defender:def.id,atkCreature:cid,
    supports:{[atk.id]:{kind:'none'},[def.id]:{kind:'none'}},startedAt:1};
  G.resolveBattle(r);
  eq(r.owners[21].player,atk.id,`${cid} conquers Lv${level}`);
  eq(count(atk.hand,'weapon'),0,'evolved invasion does not forge a Sword');
  eq(r.kamadomaNotices.length,0,'evolved invasion has no Sword acquisition notice');
  eq(r.pending[atk.id].type,'daitekkan_recover','recovery is offered to the evolved winning invader');
  G.handleChoose(r,atk.id,r.pending[atk.id].options[0].id);
  eq(atk.hand,['gshield'],'exactly the selected exiled weapon returns');
  eq(atk.exile,[],'recovery moves rather than duplicates the weapon');
  eq(r.pending[atk.id].type,'draft','battle draft follows recovery');
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
  ok(r.pending[def.id].prompt.includes('再鋳造'), 'recovery uses the approved ability name');
  eq(G.creatureEffectUi(r,'kamadoma_f',21,'defender','battle',{win:false,atkSurvived:true}).state,
    'active','defending Daitekkan shows its victory recovery as active');
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
