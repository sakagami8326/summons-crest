// v1.33 regression: support names, art, rare supply routes, shop and compatibility.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, SUPPORTS, RANDOM_SUPPORT_POOL, RANDOM_SUPPORT_COPIES, CHAR_DECKS, CREATURES, makeDeck, makeRoom, makeShopVisit, shopRandomPool, shopRandomItem, askMarket, handleChoose };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (v, n) => { if (!v) throw new Error('FAIL: ' + n); pass++; };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), `${n} (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);

ok(Number(G.VERSION) >= 1.33, 'version is v1.33 or newer');
const expected = {
  weapon: ['ソード',20,0,60], shield: ['シールド',0,20,60],
  gweapon: ['ヘビーアックス',40,0,120], gshield: ['ビッグシールド',0,40,120],
  jinx: ['ディスアーム',0,0,100],
};
for (const [id, values] of Object.entries(expected)) {
  const s = G.SUPPORTS[id];
  eq([s.name,s.st,s.hp,s.cost], values, `${id} display data`);
  ok(s.exileAfterUse, `${id} is exiled after use`);
}
ok(G.SUPPORTS.jinx.jinx, 'Disarm keeps support-nullification effect');
eq(G.SUPPORTS.jinx.fx, '相手の支援を無効化', 'Disarm exposes its effect text to every card surface');

const deck = G.makeDeck();
eq(deck.filter(x => x === 'gweapon').length, 2, 'common deck has two Heavy Axes');
eq(deck.filter(x => x === 'gshield').length, 2, 'common deck has two Big Shields');
eq(G.RANDOM_SUPPORT_POOL, ['gweapon','gshield'], 'only rare supports enter random supply');
eq(G.RANDOM_SUPPORT_COPIES, 2, 'rare support weight is two');
const weighted = G.shopRandomPool();
eq(weighted.filter(x => x === 'gweapon').length, 2, 'Heavy Axe shop weight');
eq(weighted.filter(x => x === 'gshield').length, 2, 'Big Shield shop weight');
eq(G.CHAR_DECKS.redani.filter(x => x === 'gweapon').length, 1, 'Redani starter has one Heavy Axe');
for (const [charId, cards] of Object.entries(G.CHAR_DECKS)) {
  if (charId !== 'redani') ok(!cards.includes('gweapon'), `${charId} starter excludes Heavy Axe`);
  ok(!cards.includes('gshield'), `${charId} starter excludes Big Shield`);
}
eq(G.CREATURES.kamadoma.fx, '【武具錬成】配置時、ソード1枚を手札に加える', 'Kamadoma generates Sword only');
ok(G.CREATURES.fugorm.fx.includes('ソード'), 'Fugorm generates Sword only');
ok(G.CREATURES.cresteria.fx.includes('シールド'), 'Cresteria generates Shield only');

const full = n => n;
eq(G.shopRandomItem('gweapon', 0, full),
  {slotId:'card0',kind:'support',card:'gweapon',basePrice:120,price:120,sold:false}, 'Heavy Axe random shelf item');
eq(G.shopRandomItem('gshield', 1, full),
  {slotId:'card1',kind:'support',card:'gshield',basePrice:120,price:120,sold:false}, 'Big Shield random shelf item');

const p = { id:'p1', name:'P1', charId:'redani', gold:500, hand:[], deck:[], discard:[], exile:[],
  battleWins:0, shrineVisits:0, pos:7, lap:1, seal:false };
const r = G.makeRoom();
r.phase = 'playing'; r.players = [p]; r.turn = 0; r.pending = {}; r.log = [];
G.makeShopVisit(r, p);
eq(r.shopVisit.items.slice(5).map(x => x.card || x.kind), ['weapon','shield','jinx','remove'], 'fixed shelf remains Sword, Shield, Disarm, removal');
r.shopVisit.items[0] = G.shopRandomItem('gweapon', 0, full);
G.askMarket(r, p);
G.handleChoose(r, p.id, 'buy:card0');
ok(p.deck.includes('gweapon') && r.shopVisit.items[0].sold, 'rare support purchase adds the original ID to deck');
eq(p.gold, 380, 'rare support purchase charges 120G');

const phone = fs.readFileSync('public/phone.html', 'utf8');
const board = fs.readFileSync('public/board.html', 'utf8');
const art = {
  weapon:'support-sword-v1.webp', shield:'support-shield-v2.webp',
  gweapon:'support-heavy-axe-v1.webp', gshield:'support-big-shield-v1.webp', jinx:'support-disarm-v1.webp',
};
for (const [id, file] of Object.entries(art)) {
  ok(fs.existsSync(path.join('public','assets','cards',file)), `${id} WebP exists`);
  ok(phone.includes(`${id}: '/assets/cards/${file}'`), `${id} phone art mapping`);
  ok(board.includes(`${id}:'${file}'`), `${id} board art mapping`);
}
ok(!/support-(?:weapon|shield)-v1\.webp|support-jinx-v2\.webp/.test(phone + board), 'active UI no longer references legacy art');
ok(/\.shopCompact\.support \.shopCompactArt\s*\{[^}]*top:15%/.test(phone), 'phone shop lowers support art within its safe area');
ok(/\.shopCompact\.support \.shopCompactArt img\s*\{[^}]*width:100%;[^}]*height:100%;[^}]*object-fit:contain/s.test(phone), 'phone shop uses shared 2:3 support safe area');
ok(/\.tvShopArt\.support\s*\{[^}]*top:12%/.test(board), 'TV shop lowers support art within its safe area');
ok(/\.tvShopArt\.support img\s*\{[^}]*width:100% !important;[^}]*height:100% !important;[^}]*object-fit:contain/s.test(board), 'TV shop uses shared support safe area');

console.log(`V1.33 SUPPORT REFRESH ALL ${pass} CHECKS PASSED`);
