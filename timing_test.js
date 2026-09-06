// timing_test.js ─ 移動演出タイミングの共有検証(v0.66 / plan_phaser_board §7.2)
// 盤面とスマホはgame_timing.jsの共有定数を前提に同期している。
// 直書き定数の再発(片側だけの改変)と、定数ファイル自体の破損を検出する。
const fs = require('fs');
const path = require('path');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };

// 1) game_timing.jsが読み込め、必要なキーがすべて正の数であること
const src = fs.readFileSync(path.join(__dirname, 'public/game_timing.js'), 'utf8');
const GT = new Function(src + ';return GAME_TIMING;')();
const KEYS = ['moveStartDelay', 'moveStartDelayMulti', 'stepMs', 'otherStartDelay',
  'castleResume', 'castleZoom', 'castleBreakdown', 'arriveBuf', 'arriveBufCastle', 'castleDraftLead', 'moveWaitMax'];
for (const k of KEYS)
  ok(typeof GT[k] === 'number' && isFinite(GT[k]) && GT[k] > 0, `game_timing: ${k}が正の数`);
ok(GT.moveStartDelayMulti > GT.moveStartDelay, 'game_timing: 複数ダイスの初動 > 単独');

// 2) 盤面・スマホの両方が共有定数を参照していること(読み込みタグ+参照)
const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
const phone = fs.readFileSync(path.join(__dirname, 'public/phone.html'), 'utf8');
for (const [name, html] of [['board', board], ['phone', phone]]) {
  ok(html.includes('src="/game_timing.js"'), `${name}: game_timing.jsを読み込んでいる`);
  ok(/GAME_TIMING[.;]/.test(html), `${name}: GAME_TIMING定数を参照している`);
}
ok(fs.readFileSync(path.join(__dirname, 'public/board_world.js'), 'utf8').includes('GAME_TIMING.'),
  'board_world: GAME_TIMING定数を参照している');

// 3) 移動タイミングの直書きが再発していないこと(移動文脈のパターンで検査)
for (const [name, html] of [['board', board], ['phone', phone]]) {
  ok(!/\?\s*2900\s*:\s*1900/.test(html), `${name}: 初動の三項直書き(2900:1900)がない`);
}
ok(!/setTimeout\(hopStep,\s*\d/.test(board), 'board: hopStepの遅延に数値直書きがない');
ok(!/\*\s*250\s*\+/.test(phone), 'phone: 1歩250msの直書き(*250+)がない');

// 4) スマホの到着時刻計算が共有定数で構成されていること(式の構成要素を検査)
const arrive = phone.match(/doneAt = ld\.at \+ init \+ steps \* scale\(GT\.stepMs\) \+ scale\(GT\.arriveBuf\)/);
ok(!!arrive, 'phone: 通常到着の式が共有定数で構成されている');
ok(/castleAt \+ scale\(GT\.castleResume\) \+ remaining \* scale\(GT\.stepMs\) \+ scale\(GT\.arriveBufCastle\)/.test(phone),
  'phone: 城経由の到着式が共有定数で構成されている');
ok(/castleStep \|\| steps\) \* scale\(GT\.stepMs\) \+ scale\(GT\.castleDraftLead\)/.test(phone),
  'phone: 城ドラフト表示の式が共有定数で構成されている');

// 5) 盤面のホップ進行が共有定数で構成されていること
ok(/scheduleHop\(presentationMs\(GAME_TIMING\.stepMs, hopState\.id\)\)/.test(board), 'board: 1歩の間隔が共有定数+速度倍率');
ok(/if\(hopState===active\)hopStep\(\)/.test(board), 'board: 古い区間のタイマーは新しい移動を進めない');
ok(/GAME_TIMING\.moveStartDelayMulti : GAME_TIMING\.moveStartDelay/.test(board), 'board: 初動が共有定数');
ok(/presentationMs\(GAME_TIMING\.castleResume, hopState\.id\)/.test(board), 'board: 城再開が共有定数+速度倍率');
ok(GT.scaled(1000, 1) === 1000 && GT.scaled(1000, 2) === 500, 'game_timing: 通常/2倍の倍率');

console.log(`TIMING ALL ${pass} CHECKS PASSED`);
