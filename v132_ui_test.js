const fs = require('fs');

const server = fs.readFileSync('server.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const phone = fs.readFileSync('public/phone.html', 'utf8');
const board = fs.readFileSync('public/board.html', 'utf8');

let checks = 0;
function ok(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  checks += 1;
  console.log(`OK: ${label}`);
}

ok(Number((server.match(/const VERSION = '([0-9.]+)'/) || [])[1]) >= 1.32 &&
  Number.parseFloat(pkg.version) >= 1.32 && /board 1\.(?:3[2-9]|[4-9]\d)/.test(board), 'version is v1.32 or newer');
ok(/#roomPreset\s*\{[^}]*background:transparent;[^}]*border:0;[^}]*border-radius:0;/s.test(phone), 'QR room label has no frame');
ok(phone.includes('@keyframes phoneUltHero { 0%{opacity:0;transform:scale') && !phone.includes('@keyframes phoneUltHero { 0%{opacity:0;transform:translateX'), 'phone ultimate art does not slide horizontally');
ok(phone.includes('#phoneUltSlash { display:none; }') && phone.includes('@keyframes phoneUltFlash'), 'phone ultimate keeps flash and disables horizontal slash');
ok(/\.diceImgBtn::before\s*\{[^}]*border-radius:50%[^}]*animation:diceReadyGlow/s.test(phone), 'dice button has a pulsing outer glow ring');
ok(/\.diceImgBtn img\s*\{[^}]*filter:none;/s.test(phone), 'dice image itself keeps no shadow filter');
ok(board.includes("$('bCmpAtkHp').textContent = totalDurability('bAtkStats');") && board.includes("$('bCmpDefHp').textContent = totalDurability('bDefStats');"), 'battle center HP numbers use total durability');
ok(/const totalDurability = rootId => \{[\s\S]*Math\.max\(0, hp\)[\s\S]*Math\.max\(0, df\)/.test(board), 'battle total durability adds remaining HP and DF');

console.log(`V1.32 UI ALL ${checks} CHECKS PASSED`);
