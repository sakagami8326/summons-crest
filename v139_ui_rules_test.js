// v1.39 現在手番・領地戦闘情報・周回報酬・手札整理・必殺技確認の回帰検査
const fs = require('fs');
const path = require('path');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(actual === expected,
  `${name} (actual=${actual} expected=${expected})`);
const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const serverText = read('server.js');
const board = read('public/board.html');
const world = read('public/board_world.js');
const phone = read('public/phone.html');
const pkg = require('./package.json');

let src = serverText.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + `\n;return { VERSION, RULES, TILES, CREATURES, CREATURE_EFFECT_CONTEXT,
    terrainBreakdown, creatureEffectUi, castleLapBonus, ultimateStatus };`)(
  require, __dirname, process, console, () => {});

ok(Number(G.VERSION) >= 1.40 && Number(pkg.version.replace(/\.0$/, '')) >= 1.40,
  'v1.39 features remain covered by the current release');
ok(/\/ board 1\.(?:40|41)/.test(board), 'TV build label is v1.40 or newer');
eq(G.RULES.castleBonusPerLap, 100, 'castle bonus unit is 100G per completed lap');
eq(G.castleLapBonus(1), 100, 'first completed lap gives 100G');
eq(G.castleLapBonus(2), 200, 'second completed lap gives 200G');
eq(G.castleLapBonus(3), 300, 'third completed lap gives 300G');
ok(/if \(p\.seal\) \{ bonus \+= castleLapBonus\(completedLaps\)/.test(serverText),
  'castle lap bonus is gated by the seal');
ok(/completedLaps, bonusPerLap: RULES\.castleBonusPerLap/.test(serverText),
  'castle result exposes lap count and unit value');

const tile = G.TILES.findIndex(t => t.t === 'land');
const p1 = { id:'p1', name:'攻撃側', hand:[], deck:[], discard:[], exile:[], ultUsed:false };
const p2 = { id:'p2', name:'防衛側', hand:[], deck:[], discard:[], exile:[], ultUsed:false };
const room = {
  phase:'playing', players:[p1, p2], turn:0, pending:{},
  owners:Array(G.TILES.length).fill(null), elemOv:{}, tileFx:{}, battle:null,
};
room.elemOv[tile] = 'earth';
room.owners[tile] = { player:'p2', level:2, creature:'nome', dmg:0 };
let terrain = G.terrainBreakdown(room, tile);
eq(terrain.affinity, 'match', 'matching land and creature are detected');
eq(terrain.baseBonus, 20, 'level gauge contributes Lv x 10 DF');
eq(terrain.abilityBonus, 10, 'Nome adds its explicit terrain ability');
eq(terrain.appliedBonus, 30, 'terrain breakdown exposes final applied DF');
eq(G.creatureEffectUi(room, 'nome', tile, 'defender').state, 'active',
  'Nome effect is active on matching land');

room.elemOv[tile] = 'fire';
terrain = G.terrainBreakdown(room, tile);
eq(terrain.affinity, 'mismatch', 'mismatching land and creature are detected');
eq(terrain.appliedBonus, 0, 'mismatching land gives no terrain DF');
eq(G.creatureEffectUi(room, 'nome', tile, 'defender').state, 'inactive',
  'Nome effect is visibly inactive off earth land');

room.owners[tile].creature = 'cleo';
terrain = G.terrainBreakdown(room, tile);
eq(terrain.affinity, 'universal', 'universal affinity is identified');
eq(terrain.appliedBonus, 20, 'universal affinity receives level DF');

room.owners[tile].creature = 'nome';
room.elemOv[tile] = 'earth';
terrain = G.terrainBreakdown(room, tile, 'garble');
eq(terrain.potentialBonus, 30, 'pre-nullification terrain value remains visible');
eq(terrain.appliedBonus, 0, 'Garble nullifies the applied terrain value');
eq(terrain.nullifiedBy, 'garble', 'terrain breakdown names its nullifier');

const effectCards = Object.entries(G.CREATURES)
  .filter(([, c]) => c.fx || c.evoFx)
  .map(([id]) => id.replace(/_f$/, ''));
const missingEffects = effectCards.filter(id => !Object.prototype.hasOwnProperty.call(G.CREATURE_EFFECT_CONTEXT, id));
ok(missingEffects.length === 0, `all implemented creature effects have an explicit UI classification: ${missingEffects.join(', ')}`);
ok(/default: return conditional\('条件成立時'\)/.test(serverText),
  'unrecognized battle conditions fail open as conditional');
ok(/terrainBreakdown: owner \? terrainBreakdown/.test(serverText) && /effectStates: owner \? battleEffectStates/.test(serverText),
  'battle preview exposes terrain and effect states without support identities');
ok(/landCombat: r\.owners\.map/.test(serverText), 'enemy-land display receives per-land combat UI data');

room.pending.p1 = { type:'roll', options:[{ id:'ult' }] };
eq(G.ultimateStatus(room, p1).canActivate, true, 'ultimate can activate in its existing valid window');
eq(G.ultimateStatus(room, p2).reasonCode, 'not_turn', 'off-turn ultimate returns an explicit reason');
room.turn = 1;
p2.ultUsed = true;
eq(G.ultimateStatus(room, p2).reasonCode, 'used', 'used ultimate returns an explicit reason');

ok(/makeTurnAura/.test(world) && /'TURN'/.test(world) && /it\.active/.test(world),
  'Phaser pawn has a current-turn aura and marker');
ok(/--board-safe-left/.test(board) && /--board-safe-top/.test(board) && /--board-safe-right/.test(board) &&
  /hudRect\.right/.test(board) && /utilityRect\.right/.test(board) && /const safeRight = showHud \? 8 : 0/.test(board) && /PW\.resize/.test(board),
  'board safe area follows only the left information rail and refreshes Phaser');
ok(/rank \* 103/.test(board) && /transform:scale\(1\.1\)/.test(board) &&
  /@media \(max-width:1400px\), \(max-height:800px\)[\s\S]*?transform:scale\(1\)/.test(board) &&
  /logs\.slice\(-4\)/.test(board) && /id="leftUtility"/.test(board),
  'compact TV layout puts the latest four log entries and controls in the bottom-left rail');
ok(/#optMenu \{[^}]*left:calc\(100% \+ 10px\); bottom:0/s.test(board),
  'options menu grows upward beside the left rail instead of covering the HUD');
ok(!/id="turnPortrait"/.test(board) && !/id="tpBubble"/.test(board) && /id="turnCutin"/.test(board),
  'static turn portrait and bubble are removed while transient turn cut-ins remain');
ok(/id="bLandLevelPips"/.test(board) && /class="landBonusBlock"/.test(board) && /effectStateLabel/.test(board),
  'battle screen has the land core, level gauge, bonus value, and effect states');
ok(/state\.landCombat/.test(board) && /領地BONUS/.test(board),
  'enemy-land panel presents affinity and the actual territory bonus');

ok(/sc_hand_order:\$\{room\}:\$\{pid\}/.test(phone), 'hand order is local to room and player');
ok(/300\)\s*;/.test(phone) && /onpointerdown/.test(phone) && /handPlaceholder/.test(phone),
  '300ms long press starts full-card drag with an insertion placeholder');
ok(/hr\.left \+ 48[\s\S]*scrollLeft -= 14/.test(phone) && /hr\.right - 48[\s\S]*scrollLeft \+= 14/.test(phone),
  'hand drag supports edge auto-scroll');
ok(/openCardZoom/.test(phone) && /cardZoomAction/.test(phone),
  'short tap opens details and actions remain inside the card modal');
ok(/const us = m\.ultimateStatus/.test(phone) && /ultActivate'\)\.disabled = !us\.canActivate/.test(phone),
  'ultimate details always open while only activation is disabled');
ok(/reasonCode/.test(serverText) && /他プレイヤーの手番/.test(serverText) && /ダイス選択時に使用できます/.test(serverText),
  'server supplies stable ultimate unavailability reasons');

function checkInlineScripts(html, label) {
  let count = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!m[1].trim()) continue;
    new Function(m[1]);
    count++;
  }
  ok(count > 0, `${label} inline scripts compile`);
}
checkInlineScripts(board, 'TV');
checkInlineScripts(phone, 'phone');

console.log(`V1.39 UI/RULES ALL ${pass} CHECKS PASSED`);
