// v1.51 試合振り返りリザルト回帰検査
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
  src + `\n;return { VERSION, makeFixtureRoom, initMatchAnalytics, captureMatchFrame,
    markMatchCause, buildMatchResult, publicState, serializeRoom, validateSave, restoreRoom };`)(
  require, __dirname, process, { log:()=>{}, error:console.error }, ()=>{});

ok(Number(G.VERSION) >= 1.52, 'server release includes v1.51 match results');
ok(Number(pkg.version.replace(/\.0$/, '')) >= 1.52, 'package release includes v1.51 match results');

// 一つの侵略操作で生じる領地移動・Lv4・連鎖変化は一候補へ統合される。
const r = G.makeFixtureRoom();
G.initMatchAnalytics(r);
const actor = r.players[0], defender = r.players[1];
const tile = r.owners.findIndex(o => o && o.player === defender.id);
ok(tile >= 0, 'fixture has a defender land');
G.markMatchCause(r, 'invasion', { actor:actor.id, target:defender.id, tile });
r.owners[tile] = Object.assign({}, r.owners[tile], { player:actor.id, level:4 });
actor.gold += 500;
G.captureMatchFrame(r);
eq(r.matchAnalytics.candidates.length, 1, 'one operation creates one turning-point candidate');
const invasion = r.matchAnalytics.candidates[0];
ok(invasion.kind === 'invasion' && invasion.lands.length === 1,
  'the merged candidate retains invasion and land-change structure');
ok(invasion.chains.length >= 1, 'the same candidate retains chain changes');

// 300G未満は最終転換点から除外され、首位交代・侵略の重みを保持する。
G.markMatchCause(r, 'toll', { actor:actor.id, target:defender.id, amount:120 });
actor.gold += 120; defender.gold -= 120;
G.captureMatchFrame(r);
G.markMatchCause(r, 'castle', { actor:defender.id, amount:500 });
defender.gold += 500;
G.captureMatchFrame(r);
r.phase = 'ended'; r.winner = actor.id;
const result = G.buildMatchResult(r);
ok(result && result.rankings.length === 4, 'end result contains all final rankings');
ok(result.turningPoints.length >= 1 && result.turningPoints.length <= 3,
  'end result selects between one and three turning points');
ok(!result.turningPoints.some(tp => tp.kind === 'toll' && tp.baseImpact < 300),
  'sub-300G candidate is omitted');
ok(result.turningPoints.some(tp => tp.kind === 'invasion' && tp.lands.length === 1),
  'merged invasion survives final selection');
ok(result.turningPoints.every(tp => tp.title && tp.detail), 'turning points include display copy');

// 終了前には非公開、終了後は最終デッキを含む。
const live = G.makeFixtureRoom();
G.initMatchAnalytics(live);
ok(!Object.prototype.hasOwnProperty.call(G.publicState(live, null), 'matchResult') ||
   G.publicState(live, null).matchResult == null, 'match result is not exposed during a match');
const endedPublic = G.publicState(r, null);
ok(endedPublic.matchResult?.id === result.id && endedPublic.resultReview?.id === result.id,
  'ended public state exposes result and synchronized review id');
ok(result.rankings.every(p=>Array.isArray(p.finalDeck)), 'ended result includes final inventories');
ok(Math.abs((r.resultReview.unlockAt - result.endedAt) - 45000) < 30,
  'phone fallback unlock is scheduled for 45 seconds');

// 長期戦でも時系列と候補を上限内へ圧縮し、履歴を100KB以内に収める。
const long = G.makeFixtureRoom();
G.initMatchAnalytics(long);
for (let i=0;i<290;i++) {
  long.players[i % long.players.length].gold += 1 + (i % 3);
  G.captureMatchFrame(long);
}
ok(long.matchAnalytics.assetTimeline.length <= 240, 'asset timeline is capped at 240 frames');
ok(long.matchAnalytics.candidates.length <= 64, 'candidate history is capped at 64 events');
ok(long.matchAnalytics.candidates.every(c => long.matchAnalytics.assetTimeline.some(f => f.seq === c.seq)),
  'timeline compaction preserves every retained turning-point frame');
ok(Buffer.byteLength(JSON.stringify(long.matchAnalytics)) < 100 * 1024,
  'compressed analytics history stays below 100KB');

// セーブ形式番号を変えずに結果データを復元でき、欠落する旧セーブも受理する。
const save = G.serializeRoom(r);
ok(!G.validateSave(save), 'v1.51 result save validates');
const restored = G.restoreRoom(save).room;
ok(restored.matchResult?.id === result.id && restored.resultReview?.id === result.id,
  'match result and review state survive save restore');
const legacy = G.serializeRoom(r);
delete legacy.room.matchAnalytics; delete legacy.room.matchResult; delete legacy.room.resultReview;
ok(!G.validateSave(legacy), 'legacy save without optional result fields validates');
const restoredLegacy = G.restoreRoom(legacy).room;
ok(restoredLegacy.matchResult === null && restoredLegacy.resultReview === null,
  'legacy save falls back without synthetic history');

// Current result UI replaces the old graph while retaining stored historical analytics.
const review = read('public/result-review.js'),reviewCSS=read('public/result-review.css');
ok(board.includes('mountResultReview') && review.includes('rvStandingList'), 'TV mounts standings first');
ok(review.includes('最多バトル勝利') && review.includes('最多カード獲得') && review.includes('最多通行料'), 'TV shows three highlights');
ok(review.includes('finalDeck') && review.includes('review-game-card'), 'final deck reuses normal game cards');
ok(review.includes('prefers-reduced-motion: reduce'), 'reduced motion disables automatic highlight playback');
ok(board.includes('result_presentation_complete') && review.includes('onComplete()'), 'result completion remains synchronized');
ok(phone.includes('ハイライトが終わると'), 'phone waiting message follows highlights');

function checkInlineScripts(html, label) {
  let count = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!m[1].trim()) continue;
    new Function(m[1]); count++;
  }
  ok(count > 0, `${label} inline scripts compile`);
}
checkInlineScripts(board, 'TV');
checkInlineScripts(phone, 'phone');

console.log(`V1.51 MATCH RESULT ALL ${pass} CHECKS PASSED`);
