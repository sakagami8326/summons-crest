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

ok(/#hud \{[^}]*transform:scale\(1\.1\)/s.test(board) &&
  /@media \(max-width:1400px\), \(max-height:800px\)[\s\S]*?#hud \{[^}]*transform:scale\(1\)/.test(board),
  'TV HUD uses 110 percent normal size and 100 percent compact size');
ok(/Math\.floor\(innerWidth \* \.36\)/.test(board),
  'TV board safe-area cap accommodates the enlarged HUD at 1280px');
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
ok(!/battleSummoner\.def img[^}]*scaleX\(-1\)/s.test(board),
  'defender summoner keeps the source image direction');
ok(/#battle \.battleCreatureCard \.scCost \{ display:none; \}/.test(board), 'battle card costs are hidden only in battle');
ok(!/ウェポン・能力補正は公開後に反映/.test(board) && !/地形・ウェポン・能力補正は公開後に反映/.test(board),
  'battle placeholder modifier messages are removed');
ok(/transform:translateY\(-\.7vh\)/.test(board), 'shop creature stats are raised');

ok(/handHoldProgress \.2s \.1s/.test(phone) && /\}, 300\);/.test(phone),
  '300ms hand hold delays progress feedback so taps stay visually distinct');
ok(/startHandDrag\(\{ clientX:g\.x, clientY:g\.y \}\)/.test(phone), 'long press lifts the card without an extra movement');
ok(/#hand \.card \{[^}]*touch-action:none/s.test(phone) && /#hand \{[^}]*touch-action:none/s.test(phone),
  'hand cards keep pointer events instead of yielding to browser panning');
ok(!/document\.body\.appendChild\(g\.el\)/.test(phone) && /filter\(card => card !== g\.el\)/.test(phone),
  'dragged card stays in the hand so pointer capture is preserved');
ok(/Math\.abs\(dx\) > 14/.test(phone) && /Math\.abs\(dy\) > 14/.test(phone),
  'minor finger movement remains a tap');
ok(/handClickSuppressUntil/.test(phone) && /el\.onclick = e => \{[\s\S]*openCardZoom\(el\.dataset\.c\)/.test(phone),
  'native tap click opens details while drag and scroll releases suppress accidental clicks');
ok(/originalOrder:handDisplay\.slice\(\)/.test(phone) && /originalScroll:hand\.scrollLeft/.test(phone),
  'hand gesture snapshots order and scroll position before dragging');
ok(/function cancelHandGesture\(options = \{\}\)[\s\S]*handDisplay = g\.originalOrder\.slice\(\)[\s\S]*handListKey = ''/.test(phone) &&
  !/cancelHandGesture\(true\)/.test(phone), 'forced hand cancellation rolls back instead of committing a partial drop');
ok(/function finishHandDrop\(\)[\s\S]*saveHandOrder\(\)/.test(phone),
  'completed pointer drop remains the only path that saves the reordered hand');
ok(/handInteractionContextKey\(state\) !== handInteractionContextKey\(next\)/.test(phone) &&
  /pending && pending\.promptId/.test(phone) && /turnPlayer/.test(phone),
  'turn, pending, phase and hand context changes cancel an active gesture');
for (const overlay of ['deckOv','drawModal','mapOv','resultOv','shopDetail','galZoom','galleryOv','cardZoom',
  'charDetail','charSel','ultConfirm','actionOv','gateOv','draftOv','shopScene']) {
  ok(phone.includes(`openBlockingOverlay('${overlay}')`), `${overlay} cancels hand gestures before opening`);
}
ok(/openBlockingOverlay\(pov\)/.test(phone) && /openBlockingOverlay\(ov\)/.test(phone),
  'pick and deck selection overlays also use the common transition guard');
ok(/visibilitychange[\s\S]*document\.hidden\) cancelHandGesture/.test(phone) &&
  /addEventListener\('blur',[\s\S]*cancelHandGesture/.test(phone) &&
  /addEventListener\('pagehide',[\s\S]*cancelHandGesture/.test(phone) &&
  /fullscreenchange[\s\S]*cancelHandGesture/.test(phone),
  'browser lifecycle transitions clear held and dragged cards');
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
