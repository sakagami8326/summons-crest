// Regression for deliberate routing and marginal-value shopping. No live rooms.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'setInterval', 'setTimeout', source + '\nreturn {makeRoom,startGame,askRoll,askMarket,performMove,handleChoose,botChooseOption,botCashReserve,botPurchaseScore,botLandingScore,botTollRisk,botInventory,botWalkEndpoints,publicState,tollOf,rooms,MAPS,CREATURES,SPELLS,SUPPORTS,completeTurnTransition,resolveUltSequence};')
  (require, __dirname, () => {}, () => ({ unref() {} }));
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (v, label) => { assert.ok(v, label); checks++; };
function game(mapId = 'twin_gate_cavern', n = 2, fixture = true) {
  const r = G.makeRoom('normal', mapId);
  r.players = Array.from({ length:n }, (_, i) => ({ id:'p' + i, name:'BOT' + i, charId:['mio','adel','villa','redani'][i] }));
  G.startGame(r); r.boardSeen = true; r.pending = {};
  const p = r.players[r.turn];
  if (fixture) {
    p.charId = 'mio'; p.gold = 1000;
    p.hand = ['gaston','gaston','gecko','weapon']; p.deck = []; p.discard = [];
  }
  return { r, p, enemy:r.players.find(x => x.id !== p.id) };
}
function branch(g, steps = 2) {
  const { r, p } = g; r.pending = {}; p.pos = 24; p.previousTile = 23; p.gatesVisited = [22]; p.dir = 1;
  G.performMove(r, p, steps, { value:steps }, '進路検査');
  return r.pending[p.id];
}
function item(card, price, slotId = card) { return { card, price, slotId, kind:G.SUPPORTS[card] ? 'support' : 'card', sold:false }; }
function market(g, items) {
  const { r, p } = g;
  r.shopVisit = { id:'shop-test', player:p.id, items };
  G.askMarket(r, p);
  return r.pending[p.id];
}
function pick(g, pending) { return G.botChooseOption(g.r, g.p, pending); }

// The reported case: 100G cash, 500G toll versus a shrine on the outer route.
for (const cash of [0, 100, 300, 1000, 5000]) {
  const g = game(); g.p.gold = cash;
  g.r.owners[29] = { player:g.enemy.id, creature:'mist_jelly', level:4 };
  const pd = branch(g); equal(G.tollOf(g.r, 29), 500, 'reported toll');
  equal(pick(g, pd), 'route:25', 'avoid 500G central land at cash=' + cash);
}
{
  const g = game(); equal(pick(g, branch(g, 1)), 'route:28', 'safe equivalent routes still favor shortcut');
  g.r.owners[29] = { player:g.p.id, creature:'mist_jelly', level:4 };
  equal(pick(g, branch(g)), 'route:28', 'own high-level land is not a toll threat');
}
{
  const g = game(); g.r.owners[28] = { player:g.enemy.id, creature:'mist_jelly', level:4 };
  const pd = branch(g, 4);
  equal(pd.options.find(o => o.tile === 28).destinations[0].tile, 28, 'anchor changes actual destination');
  equal(pick(g, pd), 'route:25', 'avoid anchor before originally rolled destination');
  const high = G.botTollRisk(g.r, g.p, 28); g.r.owners[28].level = 1;
  ok(high > G.botTollRisk(g.r, g.p, 28), 'toll risk not capped');
}
{
  const g = game(); // shortage magnifies the same toll.
  g.r.owners[29] = { player:g.enemy.id, creature:'mist_jelly', level:4 };
  const rich = G.botTollRisk(g.r, g.p, 29); g.p.gold = 100;
  ok(G.botTollRisk(g.r, g.p, 29) > rich, 'liquidity matters');
  const pd = branch(g); pd.options[1].destinations = [{ tile:17, victory:true }];
  equal(pick(g, pd), 'route:28', 'confirmed winning castle outranks ordinary utility');
}
{
  const g = game('starting_corridor'); g.p.pos = 0; g.p.gold = 100;
  g.r.owners[1] = { player:g.enemy.id, creature:'mist_jelly', level:4 };
  equal(G.botWalkEndpoints(g.r, g.p, 1, 3), [1], 'legacy direction recognizes intervening anchor');
  g.r.dirPend = { steps:3 };
  equal(pick(g, { type:'direction', options:[{id:'dir:1'},{id:'dir:-1'}] }), 'dir:-1', 'legacy direction avoids expensive anchor');
}

// No speculative inventory, gifts, spells, or future income are added to the budget.
for (const cash of [0, 50, 100, 149, 190]) {
  const g = game(); g.p.gold = cash;
  equal(pick(g, market(g, [item('mist_jelly', 160), item('weapon', 80)])), 'done', 'low funds stop shopping at ' + cash);
}
{
  const g = game(); g.p.gold = 240; g.p.hand = ['mist_jelly'];
  equal(pick(g, market(g, [item('weapon', 80)])), 'done', 'keep summon cost plus cash buffer');
}
{
  const g = game(); g.p.pos = 26; g.p.previousTile = 27; g.p.dir = 1; g.p.gold = 550;
  g.r.owners[25] = { player:g.enemy.id, creature:'mist_jelly', level:4 };
  ok(G.botCashReserve(g.r, g.p) >= G.tollOf(g.r, 25) + 100, 'reserve upcoming unavoidable payment');
  equal(pick(g, market(g, [item('weapon', 80)])), 'done', 'nearby toll blocks optional purchase');
}
{
  const g = game(); branch(g); g.r.owners[28] = { player:g.enemy.id, creature:'mist_jelly', level:4 };
  ok(G.botCashReserve(g.r, g.p) < 500, 'avoidable threat does not lock entire wallet');
}
{
  const g = game(); g.p.hand = ['gaston']; g.p.gold = 600;
  equal(pick(g, market(g, [item('gaston', 100)])), 'buy:gaston', 'buy a needed same-element creature');
  g.p.hand = ['gaston']; g.p.deck = ['gaston_f'];
  equal(pick(g, market(g, [item('gaston', 100)])), 'done', 'evolution counts as same family');
  g.p.hand = ['gaston']; g.p.deck = []; g.p.discard = ['gaston'];
  equal(pick(g, market(g, [item('gaston', 100)])), 'done', 'discarded copies count too');
}
{
  const g = game(); g.p.hand = ['gaston','gaston','gecko','cleo','survey','palecoral','mermaid','weapon','shield','jinx'];
  equal(pick(g, market(g, [item('magado', 160), item('weapon', 80)])), 'done', 'adequate deck rejects weak addition and excess weapons');
  g.p.hand = ['gaston','gaston','gecko'];
  equal(pick(g, market(g, [item('weapon', 80)])), 'buy:weapon', 'missing weapon can be bought');
}
{
  const g = game(); g.p.hand = ['gaston']; const offer = item('gaston', 500);
  equal(pick(g, market(g, [offer])), 'done', 'negative net value never buys despite card strength');
  offer.price = 50;
  equal(pick(g, market(g, [offer])), 'buy:gaston', 'discount changes net value');
  equal(pick(g, market(g, [{slotId:'remove',kind:'remove',price:80,sold:false}])), 'done', 'do not buy unnecessary removal service');
}
{
  const g = game(); g.p.hand = ['gaston']; g.p.gold = 2000;
  equal(pick(g, market(g, [item('sp_bedrock_uplift', 100)])), 'done', 'no wounded land, no speculative restore');
  equal(pick(g, market(g, [item('sp_step', 100)])), 'done', 'no territory to move');
  g.r.owners[19] = { player:g.p.id, creature:'gaston', level:1, dmg:20 };
  equal(pick(g, market(g, [item('sp_bedrock_uplift', 100)])), 'buy:sp_bedrock_uplift', 'wounded territory makes recovery useful');
}
{
  const g = game(); g.p.hand = ['gaston']; g.p.gold = 400;
  const offers = [item('gaston', 100, 'a'), item('weapon', 80, 'b'), item('shield', 80, 'c')];
  let pd = market(g, offers), bought = 0;
  while (pick(g, pd) !== 'done' && bought < 10) {
    const id = pick(g, pd), offer = offers.find(x => 'buy:' + x.slotId === id), before = g.p.gold;
    const reserve = G.botCashReserve(g.r, g.p);
    G.handleChoose(g.r, g.p.id, id); bought++;
    equal(g.p.gold, before - offer.price, 'real purchase charges once');
    ok(g.p.gold >= reserve, 'real purchase preserves reserve');
    pd = g.r.pending[g.p.id];
  }
  ok(bought > 0 && bought <= 2, 'shopping remains useful and stops after at most two');
  equal(pick(g, pd), 'done', 'recomputed budget and inventory stop next purchase');
}
{
  const g = game(); g.p.gold = 3000; g.p.hand = ['gaston'];
  const offers = [item('gaston', 100, 'a'), item('weapon', 80, 'b'), item('shield', 80, 'c')];
  offers[0].sold = offers[1].sold = true;
  equal(pick(g, market(g, offers)), 'done', 'rich wallet does not bypass per-visit limit');
  // Opponent private cards are deliberately unreadable. Public terrain remains available.
  for (const k of ['hand','deck','discard']) {
    g.enemy[k+'Count'] = g.enemy[k].length; // Public counts remain available; card contents do not.
    Object.defineProperty(g.enemy, k, { get(){ throw Error('read opponent ' + k); }, configurable:true });
  }
  equal(pick(g, branch(g, 1)), 'route:28', 'routing uses no opponent hidden cards');
  offers.forEach(x => x.sold = false);
  ok(pick(g, market(g, offers)).startsWith('buy:'), 'shopping uses no opponent hidden cards');
}
// Deterministic end-to-end games include both maps. Count choices, not a forced route quota.
const originalRandom = Math.random;
try {
  for (const mapId of Object.keys(G.MAPS)) for (const seedBase of [159, 160, 161]) {
    let seed = seedBase; Math.random = () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const g = game(mapId, 4, false), r = g.r; G.askRoll(r, g.p);
    let actions = 0, buys = 0, routes = 0, outerEntries = 0;
    while (!r.winner && actions++ < 20000) {
      if (r.turnTransition) { G.completeTurnTransition(r, r.turnTransition.id, 'board'); continue; }
      if (r.ultSequence) { G.resolveUltSequence(r); continue; }
      const entry = Object.entries(r.pending).find(([,pd]) => pd.options?.length);
      ok(entry, 'pending exists'); const [id, pd] = entry, actor = r.players.find(p => p.id === id);
      const selected = G.botChooseOption(r, actor, pd);
      ok(pd.options.some(o => o.id === selected), 'BOT choice legal');
      if (pd.type === 'market' && selected.startsWith('buy:')) buys++;
      if (pd.type === 'route_choice') { routes++; if (actor.pos === 24 && selected === 'route:25' || actor.pos === 10 && selected === 'route:9') outerEntries++; }
      G.handleChoose(r, id, selected);
    }
    ok(r.winner, mapId + ' finishes');
    console.log(JSON.stringify({mapId,seed:seedBase,actions,buys,routes,outerEntries}));
  }
} finally { Math.random = originalRandom; G.rooms.clear(); }
console.log(`BOT STRATEGY: ${checks} checks passed`);
