// v1.25 regression: Villa move presentation, Soul Eater visibility and phone UI refinements.
const fs = require('fs');
const path = require('path');

const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
const phone = fs.readFileSync(path.join(__dirname, 'public/phone.html'), 'utf8');
const pkg = require('./package.json');
let source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
source = source.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  source + '\n;return { VERSION, makeRoom, startGame, performMove, handleChoose, resolveBattle, rooms };')(
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
function game(chars = ['villa', 'adel']) {
  const r = G.makeRoom();
  r.players = chars.map((charId, i) => ({ id:'p' + i, name:'P' + i, charId, confirmed:true }));
  G.startGame(r);
  return r;
}

eq([G.VERSION, pkg.version], ['1.25', '1.25.0'], 'version is unified at v1.25');
ok(/board 1\.25/.test(board), 'board version tag is v1.25');

// Villa movement gets a dedicated event instead of entering the dice renderer.
{
  const r = game(), p = r.players[0];
  p.dir = 1; p.pos = 1; p.exile = ['weapon','shield']; r.pending = {};
  G.performMove(r, p, 2,
    { value:2, ultimate:true, villaUlt:true, presentation:'villa_move', moveSteps:2 }, 'Villa move');
  eq([r.lastDice.presentation, r.lastDice.moveSteps, !!r.lastDice.suppressPresentation],
    ['villa_move', 2, false], 'Villa move publishes dedicated presentation metadata');
  G.rooms.delete(r.code);
}
{
  const r = game(), p = r.players[0];
  p.dir = 0; p.pos = 1; p.exile = ['weapon']; r.pending = {};
  G.performMove(r, p, 1,
    { value:1, ultimate:true, villaUlt:true, presentation:'villa_move', moveSteps:1 }, 'Villa move');
  ok(r.lastDice.suppressPresentation === true && r.pending[p.id].type === 'direction',
    'Villa presentation is suppressed while direction is undecided');
  G.handleChoose(r, p.id, 'dir:1');
  ok(r.lastDice.presentation === 'villa_move' && !r.lastDice.suppressPresentation,
    'Villa presentation starts after direction selection');
  G.rooms.delete(r.code);
}
ok(/function showVillaMove\(steps\)/.test(board) &&
   /presentation === 'villa_move'\) showVillaMove/.test(board),
  'TV routes Villa movement to the dedicated animation');
ok(/廃棄札.*枚/.test(board) && /マス進む/.test(board),
  'Villa animation explains exile count and movement distance');

// Battle payload freezes the exile count used by Soul Eater for replay-safe UI.
{
  const r = game(), atk = r.players[0], def = r.players[1];
  atk.exile = ['weapon','shield']; atk.hand = ['alter']; def.exile = [];
  r.owners[21] = { player:def.id, level:1, creature:'palecoral' };
  r.battle = { tile:21, attacker:atk.id, defender:def.id, atkCreature:'alter',
    supports:{ [atk.id]:{kind:'none'}, [def.id]:{kind:'none'} }, startedAt:1 };
  G.resolveBattle(r);
  eq([r.lastBattle.atkExileCount, r.lastBattle.defExileCount,
      r.lastBattle.atkSoulBonus, r.lastBattle.defSoulBonus],
    [2,0,10,0], 'battle payload contains exile counts and Soul Eater bonuses');
  G.rooms.delete(r.code);
}
ok(/class="bdSoul"/.test(board) && /class="tiSoul"/.test(board),
  'Soul Eater exile count appears in battle and tile details');

// Recovery selection and starter-deck browsing use the common detail overlay.
ok(/\.dkCard\.picked/.test(phone) && /selected:picked\.has\(/.test(phone),
  'Villa recovery selection has a persistent selected-card treatment');
ok(/function openStarterDeckDetail\(charId,\s*cid\)/.test(phone) &&
   phone.includes("onclick=\"openStarterDeckDetail('${charId}','${c}')\""),
  'starter-deck cards open the common detail overlay');
ok(/else if \(spl\)/.test(phone) && /else if \(sup\)/.test(phone),
  'common detail navigation supports spells and support cards');

// Phone shop is denser, larger, and keeps exile badges out of the compact shelf.
const compact = phone.match(/function shopCompactHTML\(item, visit\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
ok(/height:min\(41\.5dvh/.test(phone) && /gap:\.16dvh \.08vw/.test(phone),
  'phone shop cards are enlarged with tighter spacing');
ok(!/shopCompactExile/.test(compact), 'phone shop shelf omits exile badges');
ok(/#shopGold\s*\{[^}]*bottom:1\.2dvh/.test(phone), 'shop gold is anchored at bottom-left');

// Summoner selection crops upper bodies and TV pawn shadows sit closer to the pawn.
ok(/const CHAR_SELECT_FOCUS\s*=/.test(phone) && /--cs-scale/.test(phone),
  'phone summoner portraits use per-character upper-body focus settings');
ok(/\.scPawnWrap::after\s*\{[^}]*bottom:-\.35vh/.test(board),
  'TV summoner pawn shadow is moved upward');

console.log(`V1.25 UI ALL ${pass} CHECKS PASSED`);
