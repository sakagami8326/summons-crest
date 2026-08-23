// v1.42 戦闘遷移・TURN START・称号HUD・操作案内の回帰検査
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
  src + `\n;return { VERSION, makeFixtureRoom, publicState, publicBattle, startBattle, updateTitles };`)(
  require, __dirname, process, console, () => {});

eq(G.VERSION, '1.42', 'server release is v1.42');
eq(pkg.version, '1.42.0', 'package release is v1.42.0');

// 前回結果が残っていても新しい戦闘は独立したキーで公開される。
const battleRoom = G.makeFixtureRoom();
battleRoom.lastBattle = { at:1, attacker:'old-a', defender:'old-d' };
const battleTile = battleRoom.owners.findIndex(o => o && o.player !== battleRoom.players[0].id);
G.startBattle(battleRoom, battleRoom.players[0], battleTile);
const battlePreview = G.publicBattle(battleRoom);
ok(battlePreview && battlePreview.key === battleRoom.battle.startedAt,
  'battle preview exposes the current battle key immediately');
ok(battlePreview.phase === 'pick_attacker' && battlePreview.defCreature,
  'battle preview exposes the waiting phase and public defender data');
ok(/r\.lastBattle = \{ battleKey: b\.startedAt \|\| null/.test(serverText),
  'resolved battle carries its originating battle key');
ok(/previewResultMatches[\s\S]*state\.lastBattle\.battleKey[\s\S]*state\.battlePreview\.key/.test(board) &&
   /state\.battlePreview && \(!previewResultMatches/.test(board),
  'TV only lets a result from the same battle suppress its preview');
ok(/侵略するクリーチャーを選択中/.test(board) && /ウェポン選択中/.test(board),
  'battle waiting screen describes both selection phases');

// 称号は最多者へ移り、同数では現保持者から動かない。
const titleRoom = G.makeFixtureRoom();
titleRoom.log = [];
titleRoom.titles = { conqueror:null, pilgrim:null };
titleRoom.players.forEach((p, i) => {
  p.battleWins = [3, 5, 5, 0][i];
  p.shrineVisits = [4, 6, 6, 1][i];
});
G.updateTitles(titleRoom);
eq(titleRoom.titles.conqueror, titleRoom.players[1].id,
  'first player-order maximum receives conqueror when unclaimed');
eq(titleRoom.titles.pilgrim, titleRoom.players[1].id,
  'first player-order maximum receives pilgrim when unclaimed');
G.updateTitles(titleRoom);
eq(titleRoom.titles.conqueror, titleRoom.players[1].id, 'a tie does not steal conqueror');
titleRoom.players[2].battleWins = 6;
titleRoom.players[2].shrineVisits = 7;
G.updateTitles(titleRoom);
eq(titleRoom.titles.conqueror, titleRoom.players[2].id, 'a strictly higher battle record steals conqueror');
eq(titleRoom.titles.pilgrim, titleRoom.players[2].id, 'a strictly higher shrine record steals pilgrim');
ok(titleRoom.log.some(line => /総資産\+500G/.test(line)) && !titleRoom.log.some(line => /\+2点/.test(line)),
  'title acquisition log reports the actual asset bonus');
ok(/id = 'titleBonusPanel'/.test(board) && /覇者ボーナス/.test(board) && /大巡礼者ボーナス/.test(board) &&
   /最多記録を更新すると称号を奪取/.test(board),
  'TV renders the two-column title bonus panel and takeover rule');
ok(/#titleBonusPanel \{[^}]*grid-template-columns:repeat\(2/s.test(board) &&
   /innerHeight - 14 - hudBottom/.test(board),
  'title panel uses two columns and log space is measured below the HUD');

// TURN STARTはepoch単位で1回だけ登録し、開始ワイプから直接再生しない。
const entryBody = (board.match(/function playGameEntryTransition\(\) \{([\s\S]*?)\n\}/) || [,''])[1];
ok(entryBody && !/showTelop\('turn'/.test(entryBody) && /armTurnStart\(\)/.test(entryBody),
  'game entry arms the shared turn presentation without directly restarting the telop');
ok(/key:`\$\{Number\(state\.turnEpoch\) \|\| 0\}:\$\{pl\.id\}`/.test(board) &&
   /firedTurnKey/.test(board) && /turnWasSeen/.test(board),
  'turn presentation identity uses epoch and player with reconnect memory');
ok(/let telopGeneration = 0, finishActiveTelop = null/.test(board) &&
   /addEventListener\('animationend', onEnd\)/.test(board),
  'telop completion is generation-owned and animation driven');

// スマホ右上はpending種別から短い命令形を生成する。
const taskMatch = phone.match(/function taskPrompt\(p\) \{([\s\S]*?)\n\}\nfunction waitingTaskPrompt/);
ok(taskMatch, 'phone task prompt mapper exists');
const taskPrompt = new Function(`return function taskPrompt(p) {${taskMatch[1]}\n}`)();
eq(taskPrompt({ type:'roll', options:[] }), 'サイコロを振れ', 'roll prompt is imperative');
eq(taskPrompt({ type:'tile', options:[{ id:'summon:gecko' }] }), 'クリーチャーを配置せよ',
  'empty-land prompt tells the player to place a creature');
eq(taskPrompt({ type:'pick_creature', options:[] }), '侵略するクリーチャーを選べ',
  'battle attacker prompt is imperative');
eq(taskPrompt({ type:'support', options:[] }), 'ウェポンを選べ', 'support prompt is imperative');
ok(!/\$\{tileElem\(r/.test(serverText) && !/\$\{TILES\[[^\]]+\]\.e/.test(serverText),
  'server-facing prompts and logs do not interpolate raw element ids');
ok(!/\$\('msg'\)\.innerHTML = iconize\(p\.prompt\)/.test(phone) &&
   !/\$\('msg'\)\.textContent = p \? p\.prompt/.test(phone),
  'phone status does not reuse descriptive server prompts');

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

console.log(`V1.42 BATTLE/TITLE/PROMPT ALL ${pass} CHECKS PASSED`);
