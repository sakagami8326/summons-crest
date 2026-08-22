// v1.40 テレビ・スマホUI、通行料、風向転換の回帰検査
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
  src + `\n;return { VERSION, TILES, SPELLS, askRoll, handleChoose, migrateLegacyWindShiftPlayer };`)(
  require, __dirname, process, console, () => {});

ok(G.VERSION === '1.40' && pkg.version === '1.40.0', 'version is unified at v1.40');
ok(/\/ board 1\.40/.test(board), 'TV build label is v1.40');

ok(/transform:scale\(1\)/.test(board) && /transform:scale\(\.9\)/.test(board),
  'TV HUD uses full size and 90 percent compact size');
ok(/id="logExpandBtn"[^>]*aria-expanded="false"/.test(board) && /state\.log|state && state\.log/.test(board) &&
  /logExpanded \? logs : logs\.slice\(-4\)/.test(board), 'TV log expands from four entries');
ok(/const hudBottom = showHud/.test(board) && /Math\.floor\(innerHeight - 14 - hudBottom/.test(board) &&
  /ticker\.scrollTop = ticker\.scrollHeight/.test(board),
  'expanded log is bounded below HUD and follows latest history');
ok(/visualTurnId === p\.id/.test(board) && /visualTurnId = tp0\.id;\s*renderPawns\(\); renderHUD\(\);/.test(board),
  'TURN marker changes with the presented turn');
ok(/Math\.max\(90, it\.w \* 1\.55\)/.test(world) && /bottom:calc\(100% \+ 32px\)/.test(board),
  'Phaser and DOM TURN labels are raised');

ok(/JSON\.stringify\(st\.tolls \|\| \[\]\)/.test(world) &&
  /JSON\.stringify\(state\.tolls \|\| \[\]\)/.test(board), 'toll values invalidate both board caches');
ok(/const toll = Number\(state\.tolls && state\.tolls\[i\]\) \|\| 0/.test(board),
  'tile details use the authoritative toll array');
ok(!/o\.level \* chain\(o\.player, t\.e\) \* 30/.test(board), 'client-side toll formula is removed');

ok(/class="landBonusBlock"/.test(board) && !/class="landShield"/.test(board),
  'battle terrain bonus uses a large block instead of a shield');
ok(/id="bAtkSummoner"/.test(board) && /id="bDefSummoner"/.test(board) && /renderBattleSummoners/.test(board),
  'battle screen renders attacker and defender summoners');
ok(/#battle \.battleCreatureCard \.scCost \{ display:none; \}/.test(board), 'battle card costs are hidden only in battle');
ok(!/ウェポン・能力補正は公開後に反映/.test(board) && !/地形・ウェポン・能力補正は公開後に反映/.test(board),
  'battle placeholder modifier messages are removed');
ok(/transform:translateY\(-\.7vh\)/.test(board), 'shop creature stats are raised');

ok(/handHoldProgress \.3s/.test(phone) && /\}, 300\);/.test(phone), '300ms hand hold has visible progress');
ok(/startHandDrag\(\{ clientX:g\.x, clientY:g\.y \}\)/.test(phone), 'long press lifts the card without an extra movement');
ok(/cardActionCost/.test(phone) && /Number\(opt\.cost\)/.test(phone), 'card action separates actual cost from action text');
ok(/const res = await choose\(optionId\)/.test(phone) && !/showCardActionConfirm/.test(phone),
  'card detail action submits directly without a second confirmation');

eq(G.SPELLS.sp_wind_shift.desc, '現在の進行方向を反転し、以降もその方向へ進む',
  'wind shift public description is permanent');
const p = { id:'p1', name:'テスト', charId:'redani', gold:100, dir:0, spellCast:false,
  hand:['sp_wind_shift'], discard:[], exile:[], deck:[], resolving:[], ultUsed:true, bankrupt:false };
const room = { phase:'playing', players:[p], turn:0, pending:{}, owners:Array(G.TILES.length).fill(null),
  elemOv:{}, tileFx:{}, curses:{}, barrier:{}, titles:{}, log:[], atSeq:0, turnEpoch:1,
  promptSeq:0, turnReadyAt:0, lastEvent:null };
G.askRoll(room, p);
ok(!room.pending[p.id].options.some(o => o.id === 'sp:sp_wind_shift'),
  'wind shift is unavailable before initial direction selection');
p.dir = 1;
G.askRoll(room, p);
const firstOpt = room.pending[p.id].options.find(o => o.id === 'sp:sp_wind_shift');
eq(firstOpt.cost, 30, 'spell option exposes its actual cost');
G.handleChoose(room, p.id, firstOpt.id);
eq(p.dir, -1, 'first wind shift permanently reverses direction');
ok(!Object.prototype.hasOwnProperty.call(p, 'windShift'), 'temporary windShift state is not created');
p.spellCast = false;
p.hand.push('sp_wind_shift');
G.askRoll(room, p);
G.handleChoose(room, p.id, 'sp:sp_wind_shift');
eq(p.dir, 1, 'a later wind shift reverses the persistent direction again');

const legacy = { dir:-1, windShift:true };
ok(G.migrateLegacyWindShiftPlayer(legacy), 'legacy wind shift state is detected');
eq(legacy.dir, 1, 'legacy temporary state is converted into persistent direction');
ok(!('windShift' in legacy), 'legacy temporary field is removed');
const legacyUndecided = { dir:0, windShift:true };
G.migrateLegacyWindShiftPlayer(legacyUndecided);
eq(legacyUndecided.windShiftLegacyPending, true, 'undecided legacy direction defers one reversal');

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

console.log(`V1.40 UI/FLOW ALL ${pass} CHECKS PASSED`);
