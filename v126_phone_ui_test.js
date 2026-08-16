// v1.26 regression: phone lobby waiting screen, shop visibility and acquisition reveal queue.
const fs = require('fs');
const path = require('path');

const phone = fs.readFileSync(path.join(__dirname, 'public/phone.html'), 'utf8');
const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
const pkg = require('./package.json');
let source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
source = source.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  source + '\n;return { VERSION, makeRoom, startGame, gainToDeck, publicState, rooms };')(
  require, __dirname, process, { log:()=>{}, error:console.error }, ()=>0);

let pass = 0;
function ok(value, name) {
  if (!value) throw new Error('FAIL: ' + name);
  pass++;
}
function eq(actual, expected, name) {
  ok(JSON.stringify(actual) === JSON.stringify(expected),
    `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
}

ok(Number(G.VERSION) >= 1.27 && Number(pkg.version.replace(/\.0$/, '')) >= 1.27,
  'version is unified at v1.27 or newer');
ok(Number((board.match(/board ([\d.]+)/) || [])[1]) >= 1.27, 'board version tag is v1.27 or newer');

// Lobby and entry controls.
ok(/id="lobbyWait"[\s\S]*ゲームの開始を待っています。[\s\S]*class="lwMagic"/.test(phone),
  'lobby has a dedicated waiting screen and magic-circle loader');
ok(/state\.phase === 'lobby'[\s\S]*lobbyWait[\s\S]*classList\.toggle\('on', lobbyWaiting\)/.test(phone) &&
   /body\.lobby-wait #hdr/.test(phone), 'lobby state hides the regular HUD and hand');
ok(/width:clamp\(40px,9\.5dvh,66px\)/.test(phone) && /height:clamp\(40px,9\.5dvh,66px\)/.test(phone),
  'join fullscreen button uses the reduced size');
ok(/\$\('diceDock'\)\.innerHTML = '';[\s\S]*\$\('msg'\)\.textContent = p \? p\.prompt/.test(phone) &&
   /otherSupport \? '相手の支援カードを待っています…'/.test(phone),
  'idle guidance is routed to msg instead of diceDock');

// Shop visibility and support-art safe areas.
ok(!/\.shopProduct\.unaffordable\s*\{[^}]*filter:/.test(phone),
  'insufficient funds do not dim the entire product card');
ok(/unaffordable \.shopCompactBg,.shopProduct\.unaffordable \.shopCompactArt/.test(phone) &&
   /shopFunds[^}]*color:#ffb3aa/.test(phone) && /G不足/.test(phone),
  'insufficient funds lightly dim art and show a shortage label');
ok(/support-weapon[^}]*width:48%[^}]*height:74%/.test(phone) &&
   /support-shield[^}]*width:60%[^}]*height:70%/.test(phone) &&
   /support-jinx[^}]*width:58%[^}]*height:68%/.test(phone),
  'weapon, shield and jinx use their shelf-only safe areas');
ok(/shopCompactShade[^}]*rgba\(4,9,20,\.42\)[^}]*rgba\(4,9,20,\.62\)/.test(phone),
  'normal shelf cards use a weak localized gradient');

// One-at-a-time shared reveal queue.
ok(/#drawCard\s*\{[^}]*height:86dvh/.test(phone) &&
   /revealQueue = \[\], revealCurrent = null/.test(phone), 'reveal card matches detail-screen scale and uses a queue');
ok(/function enqueueCardReveal\(cards, reason = 'gain'\)/.test(phone) &&
   /setTimeout\(advanceReveal, 1800\)/.test(phone) &&
   /document\.getElementById\('drawModal'\)\.onclick = advanceReveal/.test(phone),
  'reveal queue auto-advances in 1.8 seconds and supports tap advance');
ok(/enqueueCardReveal\(nowArr, 'draw'\)/.test(phone) &&
   /enqueueCardReveal\(state\.lastGain\.cards, state\.lastGain\.reason\)/.test(phone),
  'draws and all lastGain events share the reveal queue');
ok(/reason === 'ult_villa'\) return '廃棄から回収'/.test(phone) &&
   /reason === 'market'\) \$\('shopDetail'\)\.classList\.remove\('on'\)/.test(phone),
  'Villa recovery and market purchase have the expected reveal behavior');

// Owner-only acquisition data.
{
  const r = G.makeRoom();
  r.players = [
    { id:'p0', name:'P0', charId:'redani', confirmed:true },
    { id:'p1', name:'P1', charId:'adel', confirmed:true }
  ];
  G.startGame(r);
  const p = r.players[0];
  const rival = r.players.find(x => x.id !== p.id);
  G.gainToDeck(r, p, ['weapon','shield'], 'test_gain');
  const own = G.publicState(r, p.id).lastGain;
  const other = G.publicState(r, rival.id).lastGain;
  const tv = G.publicState(r, null).lastGain;
  eq([own.n, own.reason, own.cards], [2, 'test_gain', ['weapon','shield']],
    'owner receives card ids and reason');
  ok(!Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(other)), 'cards') &&
     !Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(tv)), 'cards'),
    'other players and TV do not receive acquisition card ids');
  G.rooms.delete(r.code);
}

console.log(`V1.26 PHONE UI ALL ${pass} CHECKS PASSED`);
