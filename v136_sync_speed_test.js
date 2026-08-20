// v1.36 テレビ・スマホ同期保護 / BOT演出速度の回帰検査
const fs = require('fs');
const path = require('path');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
const phone = fs.readFileSync(path.join(__dirname, 'public/phone.html'), 'utf8');
const GT = require('./public/game_timing');

ok(/turnEpoch:\s*0, promptSeq:\s*0, stateRev:\s*0/.test(server), 'ルームに同期世代を持つ');
ok(/promptId:\s*`\$\{r\.turnEpoch \|\| 0\}-\$\{r\.promptSeq\}`/.test(server), '選択要求にpromptIdを付与');
ok(/b\.turnEpoch !== pend\.turnEpoch \|\| b\.promptId !== pend\.promptId/.test(server), '古い手番・要求を拒否');
ok(/processedActions/.test(server) && /actionId/.test(server), '重複操作を拒否');
ok(/next\.stateRev <= \(state\.stateRev \|\| 0\)/.test(board), 'テレビは古いstateを破棄');
ok(/next\.stateRev <= \(state\.stateRev \|\| 0\)/.test(phone), 'スマホは古いstateを破棄');
ok(/turnEpoch:p\.turnEpoch, promptId:p\.promptId, actionId/.test(phone), 'スマホが同期IDを送信');
ok(/set_presentation_speed/.test(server) && /b\.token !== r\.boardToken/.test(server), '速度設定はテレビ権限で保護');
ok(/id="optBotSpeed"/.test(board), 'テレビのオプションにBOT速度ボタン');
ok(GT.scaled(1600, 1) === 1600 && GT.scaled(1600, 2) === 800, '演出2倍は時間を半分にする');
ok(/presentationMs\(GAME_TIMING\.stepMs, hopState\.id\)/.test(board), 'BOT移動へ倍率を適用');
ok(/serverClockOffset/.test(phone), 'スマホはサーバー時刻へ補正');
ok(/turnReadyAt = Date\.now\(\) \+ presentationMs\(r, p\.id, 4300\)/.test(server), '手番交代演出中はサーバーが操作をロック');
ok(/テレビ演出中/.test(phone) && /p\.availableAt - promptServerNow/.test(phone), 'スマホも解禁時刻まで操作を表示しない');

console.log(`V1.36 SYNC/SPEED ALL ${pass} CHECKS PASSED`);
