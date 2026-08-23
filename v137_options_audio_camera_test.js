// v1.37 オプション整理・音声OFF・演出カメラの回帰検査
const fs = require('fs');
const path = require('path');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };
const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
const world = fs.readFileSync(path.join(__dirname, 'public/board_world.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

ok(/const VERSION = '1\.(?:40|41|42)'/.test(server), 'v1.37修正を含むサーバーバージョンは1.40以降');
ok(!/id="opt(?:Render|Quality|Reduce)"/.test(board), '不要な3設定ボタンを撤去');
ok(!/sc_render|sc_render_fail|sc_quality|sc_reduce_fx/.test(board + world), '設定URL・localStorage経路を撤去');
ok(!/prefers-reduced-motion/.test(board), 'OSの演出軽減設定を使用しない');
ok(/const renderModeActive = 'phaser'/.test(board), 'テレビ描画はPhaser固定');
ok(/const quality = 'standard'/.test(world) && /const reduceFx = false/.test(world), 'Standard・通常演出固定');
ok(/id="renderError"/.test(board) && /onFail: showRenderError/.test(board), 'Phaser失敗時に再読み込み案内');

ok(/state\.presentationSpeed = speed/.test(board), 'BOT速度表示を通信前に更新');
ok(/btn\.disabled = true/.test(board) && /btn\.disabled = false/.test(board), 'BOT速度通信中ロック');
ok(/BOT演出速度を.*に変更しました/.test(board), 'BOT速度の完了表示');
ok(/state\.presentationSpeed = previous/.test(board), 'BOT速度失敗時ロールバック');

ok(/function setAudioMuted\(muted, resumeBgm\)/.test(board), '音声切替を共通関数へ統一');
ok(/audioList\(\)\.forEach\(stopAudio\)/.test(board), 'OFF時に全BGM・SEを停止して先頭へ戻す');
ok(/playSe\(seUltCutin\)/.test(board), '必殺技SEも共通再生経路を使用');
ok(/a\.muted = bgmMuted/.test(board), '無音初期化後もOFF状態を維持');
ok(/syncAudioButtons\(\)/.test(board), 'タイトルと対戦中の音声表示を同期');

ok(/function beginPresentationZoom/.test(board) && /cameraGeneration/.test(board), '世代付きカメラ所有権');
ok(/function endPresentationZoom/.test(board) && /cameraOwner\.token !== token/.test(board), '古い解除処理を拒否');
ok(/resetPresentationCamera\('sse-reconnect'\)/.test(board), 'SSE再接続時に全景へ戻す');
ok(/resetPresentationCamera\('phase-or-turn-change'\)/.test(board), 'フェーズ・手番変更時に全景へ戻す');
ok(/resetPresentationCamera\('presentation-error'\)/.test(board), '演出例外時に全景へ戻す');
ok(/!cameraOwner && \(zoomTile !== null \|\| !cameraState\.isFit\)/.test(board) &&
  /function resetCamera\(\)/.test(world), '所有者なしズームと実カメラずれの安全監視');
ok(!/setZoom\(target\)/.test(board), '停止マス詳細では再ズームしない');

console.log(`V1.37 OPTIONS/AUDIO/CAMERA ALL ${pass} CHECKS PASSED`);
