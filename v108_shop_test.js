// v1.08 regression: open storefront, no gems/treasures, Cresteria shield gain.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, CREATURES, SPELLS, SUPPORTS, MARKET_POOL, makeRoom, makeShopVisit, askMarket, handleChoose, onCreatureSummoned, publicState, points, TILES };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (v, n) => { if (!v) throw new Error('FAIL: ' + n); pass++; };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), `${n} (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);
eq(G.VERSION, '1.08', 'version');
eq(G.CREATURES.cresteria.fx, '【真珠】召喚時、支援「盾」1枚をデッキに加える', 'Cresteria text');

const p = { id:'p1', name:'P1', charId:'linnei', gold:1000, hand:['shield'], deck:[], discard:['weapon'], exile:[],
  battleWins:0, shrineVisits:0, pos:7, lap:1, seal:false };
const r = G.makeRoom();
r.phase = 'playing'; r.players = [p]; r.turn = 0; r.pending = {}; r.log = [];
G.askMarket(r, p);
eq(r.shopVisit.items.length, 8, 'five cards plus three fixed products');
eq(new Set(r.shopVisit.items.slice(0, 5).map(x => x.card)).size, 5, 'no duplicate random cards');
eq(r.shopVisit.items.slice(5).map(x => [x.slotId, x.price]), [['weapon',60],['shield',60],['remove',80]], 'fixed products and prices');
for (const item of r.shopVisit.items.slice(0, 5)) {
  const info = G.CREATURES[item.card] || G.SPELLS[item.card];
  ok(info && !/_f$/.test(item.card) && !G.SUPPORTS[item.card], 'random slot is a base market card');
  eq(item.price, {N:60,R:100,L:160}[info.rarity], 'rarity price');
}
const first = r.shopVisit.items[0], visitId = r.shopVisit.id;
const before = p.gold;
G.handleChoose(r, p.id, 'buy:' + first.slotId);
ok(first.sold && p.deck.includes(first.card), 'purchase sells slot and adds card to deck');
eq(p.gold, before - first.price, 'purchase charges displayed price');
G.handleChoose(r, p.id, 'buy:' + first.slotId);
eq(p.gold, before - first.price, 'sold slot cannot be purchased twice');
eq(r.shopVisit.id, visitId, 'same visit keeps shelf');

G.handleChoose(r, p.id, 'buy:remove');
eq(r.pending[p.id].type, 'forget', 'removal opens card picker');
G.handleChoose(r, p.id, 'fg:cancel');
ok(!r.shopVisit.items.find(x => x.slotId === 'remove').sold, 'cancel does not sell removal');
G.handleChoose(r, p.id, 'buy:remove');
const removePrice = r.shopVisit.items.find(x => x.slotId === 'remove').price;
const goldBeforeRemove = p.gold;
G.handleChoose(r, p.id, 'fh:0');
ok(r.shopVisit.items.find(x => x.slotId === 'remove').sold && p.exile.includes('shield'), 'confirmed removal exiles card');
eq(p.gold, goldBeforeRemove - removePrice, 'removal charges shelf price');

r.halfMarket = p.id; r.shopVisit = null; G.askMarket(r, p);
ok(r.shopVisit.half && r.shopVisit.items.every(x => x.price === Math.round(x.basePrice / 2)), 'Linnei halves all eight products');

const deckBefore = p.deck.filter(x => x === 'shield').length;
G.onCreatureSummoned(r, p, 'cresteria', 'summon', 1);
eq(p.deck.filter(x => x === 'shield').length, deckBefore + 1, 'Cresteria summon adds shield');
G.onCreatureSummoned(r, p, 'cresteria', 'battle', 1);
eq(p.deck.filter(x => x === 'shield').length, deckBefore + 1, 'Cresteria invasion does not add shield');

p.gems = 9; p.treasures = 4;
const pub = G.publicState(r, p.id).players[0];
ok(!('gems' in pub) && !('treasures' in pub), 'retired currencies are not public');
const basePoints = G.points(r, p); p.treasures = 99;
eq(G.points(r, p), basePoints, 'treasures do not affect assets');
console.log(`V1.08 SHOP ALL ${pass} CHECKS PASSED`);
