// v1.41 演出同期・テレビ／スマホUIの回帰検査
const fs = require('fs');
const path = require('path');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(actual === expected,
  `${name} (actual=${actual} expected=${expected})`);
const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const serverText = read('server.js');
const board = read('public/board.html');
const phone = read('public/phone.html');
const pkg = require('./package.json');

let src = serverText.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + `\n;return { VERSION, makeFixtureRoom, endTurn, completeTurnTransition, publicState, serializeRoom };`)(
  require, __dirname, process, console, () => {});

eq(G.VERSION, '1.41', 'server release is v1.41');
eq(pkg.version, '1.41.0', 'package release is v1.41.0');

// サーバーがテレビの完了通知まで手番を固定し、通知を冪等に処理する。
const room = G.makeFixtureRoom();
room.boardSeen = true;
room.turn = 0;
room.pending = { [room.players[0].id]: { type:'roll', prompt:'test', options:[] } };
const beforeTurn = room.turn;
const beforePlayer = room.players[beforeTurn].id;
G.endTurn(room);
eq(room.turn, beforeTurn, 'endTurn keeps the current player while presentation is pending');
ok(room.turnTransition && room.turnTransition.fromPlayer === beforePlayer,
  'turn transition records the outgoing player');
eq(room.turnTransition.deadline - room.turnTransition.startedAt, 20000,
  'turn transition watchdog is twenty seconds');
const transitionId = room.turnTransition.id;
ok(!G.completeTurnTransition(room, 'stale-transition', 'board'),
  'stale presentation completion is rejected');
eq(room.turn, beforeTurn, 'stale completion does not advance the turn');
ok(G.completeTurnTransition(room, transitionId, 'board'),
  'matching presentation completion is accepted');
eq(room.turn, 1, 'matching completion advances exactly one turn');
ok(!room.turnTransition, 'accepted completion clears the transition');
ok(!G.completeTurnTransition(room, transitionId, 'board'),
  'duplicate completion is idempotently ignored');
eq(room.turn, 1, 'duplicate completion cannot advance twice');

const publicRoom = G.makeFixtureRoom();
publicRoom.boardSeen = true;
G.endTurn(publicRoom);
const publicTransition = G.publicState(publicRoom, null).turnTransition;
ok(publicTransition && publicTransition.id && publicTransition.fromPlayer &&
  publicTransition.startedAt && publicTransition.deadline,
  'public state exposes only the presentation transition contract');
const save = G.serializeRoom(publicRoom);
ok(save.room.turnTransition && !('turnTransitionTimer' in save.room) && !('boardSeen' in save.room),
  'save keeps transition data but excludes runtime timer and board presence');
G.completeTurnTransition(publicRoom, publicRoom.turnTransition.id, 'board');

ok(/b\.type === 'presentation_complete'[\s\S]*b\.token !== r\.boardToken[\s\S]*b\.transitionId !== r\.turnTransition\.id/s.test(serverText),
  'presentation completion requires the board token and current transition id');
ok(/if \(!r\.botMode \|\| r\.phase !== 'playing' \|\| r\.winner \|\| r\.turnTransition\) return/.test(serverText),
  'BOT decisions remain stopped during presentation transition');
ok(/if \(!r\.boardSeen\) return advanceTurnNow\(r\)/.test(serverText),
  'headless rooms retain synchronous progression until a TV has connected');

// テレビは大演出を直列化し、カメラを閉じてから完了通知する。
ok(/function queueMajorPresentation\([\s\S]*majorPresentationQueue\.sort\(\(a, b\) => a\.at - b\.at\)/.test(board),
  'major presentations use an ordered common queue');
ok(/function waitForPresentationLane\([\s\S]*animBusy[\s\S]*bq\.length[\s\S]*cameraOwner[\s\S]*await new Promise/.test(board) &&
  /const item = majorPresentationQueue\.shift\(\);\s*await waitForPresentationLane\(\)/.test(board),
  'major presentations wait for movement, banners and close-ups already in the presentation lane');
ok(/queueMajorPresentation\(ult\.at, 'ultimate'/.test(board) &&
  /queueMajorPresentation\(battle\.at, 'battle'/.test(board),
  'ultimate and battle presentations both enter the common queue');
ok(/function boardPresentationIdle\([\s\S]*majorPresentationRunning[\s\S]*animBusy[\s\S]*cameraOwner[\s\S]*duelPlaying/.test(board),
  'completion waits for queues, banners, camera and full-screen presentations');
ok(/type:'presentation_complete'[\s\S]*transitionId:tr\.id/.test(board),
  'TV sends the matching presentation transition id');
ok(/function tileCloseup\([\s\S]*return new Promise/.test(board) &&
  /const closeupDone = tileCloseup\([\s\S]*await closeupDone/.test(board),
  'battle close-up is awaitable before presentation completion');
ok(/cameraOwner = \{ token, owner, startedAt:Date\.now\(\) \}/.test(board) &&
  /cameraOwner && Date\.now\(\) - cameraOwner\.startedAt > 12000/.test(board),
  'camera generation ownership has an orphan watchdog');
ok(/resize[\s\S]*resetPresentationCamera\('resize'\)/.test(board) &&
  /fullscreenchange[\s\S]*resetPresentationCamera\('fullscreen-change'\)/.test(board),
  'resize and fullscreen changes reset presentation camera state');

// 戦闘召喚士とショップのレスポンシブ配置。
ok(!/\.battleSummoner::after/.test(board), 'battle summoner dark pseudo background is removed');
ok(/\.battleSummoner \{[^}]*bottom:0[^}]*height:clamp\(274px,39vh,420px\)/s.test(board) &&
  /\.battleSummoner img \{[^}]*bottom:0[^}]*height:100%/s.test(board),
  'battle summoners stay wholly inside the enlarged container');
ok(/\.tvShopCard \.tsInfo \{[^}]*inset:70% 0 0[^}]*grid-template-rows:clamp\(28px,15cqw,32px\)/s.test(board),
  'shop information begins at seventy percent with a dedicated stats row');
ok(/\.tvShopCard \.tsStats \{[^}]*clamp\(14px,10\.5cqw,22px\)/s.test(board) &&
  /\.tvShopCard \.tsFx \{[^}]*-webkit-line-clamp:3/s.test(board),
  'shop stats are reduced and effects are confined to three lines');
ok(/\.tvShopPrice \{[^}]*min-height:38px[^}]*font-size:clamp\(17px,2\.4vh,24px\)/s.test(board) &&
  /class="tvShopPriceLabel">購入</.test(board),
  'external purchase price is visually larger and explicitly labelled');

// スマホは本人の手札・フェーズ以外のSSEではドラッグDOMを維持する。
const contextMatch = phone.match(/function handInteractionContextKey\(s\) \{([\s\S]*?)\n\}/);
ok(contextMatch, 'hand interaction context function exists');
const context = contextMatch[1];
ok(/s\.phase/.test(context) && /handInventoryKey/.test(context),
  'hand drag context tracks local phase and hand inventory');
ok(!/turnPlayer|turnEpoch|pending|stateRev|log/.test(context),
  'other-player turn and ordinary revision updates do not cancel hand drag');
ok(/if \(serverKey !== handServerKey && handGesture\) cancelHandGesture\(\{ rerender:false \}\)[\s\S]*if \(handGesture\) return/.test(phone),
  'unchanged local hand preserves the dragged DOM and pointer capture');
ok(/\.gateBtns\.single \{[^}]*grid-template-columns:minmax\(280px,min\(56vw,560px\)\)[^}]*justify-content:center/s.test(phone) &&
  /classList\.toggle\('single', actionButtonCount === 1\)/.test(phone),
  'single character-reselect action is centered');

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

console.log(`V1.41 PRESENTATION/UI ALL ${pass} CHECKS PASSED`);
