// v1.06 regression: castle bonus breakdown, presentation gate and replacement audio.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, castleLandBonus };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(actual === expected,
  `${name} (actual=${actual} expected=${expected})`);

ok(Number(G.VERSION) >= 1.06, 'version is v1.06 or newer');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
const phone = fs.readFileSync(path.join(__dirname, 'public/phone.html'), 'utf8');
ok(server.includes("return startDraft(r, p, 'tile', availableAt)"), 'castle draft has presentation gate');
ok(server.includes("error: '城の帰還演出中です'"), 'early HTTP selection is rejected');
ok(server.includes('healed.push({ tile: i, creature:'), 'healing details retain before/after data');
ok(board.includes('id="castleBreakdown"') && board.includes('領地総価値'), 'TV has detailed castle panel');
ok(board.indexOf('setZoom(0)') < board.indexOf('playSe(seCastleBonus)'), 'castle zoom precedes sound');
ok(board.includes('刻印がありません') && board.includes('ドラフトなし'), 'no-seal presentation exists');
ok(phone.includes('p.availableAt || ld.castle.availableAt'), 'phone waits for draft availability');

const supplied = 'E:\\クレストサーキット\\sounds\\城通過.mp3';
const installed = path.join(__dirname, 'public/assets/se_castle_bonus.mp3');
ok(fs.existsSync(installed) && fs.statSync(installed).size > 0, 'castle sound is installed');
if (fs.existsSync(supplied))
  ok(fs.readFileSync(installed).equals(fs.readFileSync(supplied)), 'installed sound exactly matches supplied MP3');

console.log(`V1.06 CASTLE ALL ${pass} CHECKS PASSED`);
