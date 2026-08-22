// v1.27 regression: wide TV HUD with dedicated summoner busts.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const board = fs.readFileSync(path.join(root, 'public', 'board.html'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'public', 'phone.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let pass = 0;
function ok(value, message) {
  if (!value) throw new Error(message);
  pass++;
}

ok(Number((server.match(/const VERSION = '([\d.]+)'/) || [])[1]) >= 1.27, 'server version is v1.27 or newer');
ok(Number(pkg.version.replace(/\.0$/, '')) >= 1.27, 'package version is v1.27 or newer');
ok(Number((board.match(/board ([\d.]+)/) || [])[1]) >= 1.27, 'board version tag is v1.27 or newer');
ok(/#hud \{ top:24px !important; left:18px !important; width:400px !important;[\s\S]*?transform:scale\(\.82\)/.test(board), 'HUD uses the compact safe-area layout');
ok(/\.plate \{[^}]*overflow:hidden/s.test(board), 'HUD clips artwork to the plate');
ok(/\.hudPortrait \{[^}]*left:0; bottom:0; width:124px; height:96px/s.test(board), 'HUD portrait stays inside the compact plate');
ok(/\.hudBust \{[^}]*inset:0;[^}]*object-fit:contain;[^}]*object-position:center bottom;[^}]*translateY\(2px\);[^}]*filter:drop-shadow\(0 3px 6px rgba\(0,0,0,\.7\)\)/s.test(board), 'HUD uses dedicated bust art with only a dark grounding shadow');
ok(!/\.hudBust \{[^}]*rgba\(255,255,255/s.test(board), 'HUD busts do not add a white outline');
ok(!/\.hudBust-(?:redani|linnei|grease|mio|lia|adel|villa|nerasio)[^}]*transform/.test(board), 'All supplied 1.2:1 HUD compositions use the shared alignment without legacy offsets');
ok(!/--bust-scale/.test(board), 'HUD does not enlarge full-body art with CSS');
ok(/src="\/assets\/hud_\$\{p\.charId\}\.png\?v=1275"/.test(board), 'HUD selects the versioned summoner bust dynamically');
ok(/this\.src='\/assets\/f_\$\{p\.charId\}\.png'/.test(board), 'HUD retains a face-art fallback');
ok(/margin-left:107px !important/.test(board) && /margin-left:114px !important/.test(board), 'HUD text clears the compact portrait area');
ok(/@media \(max-width:1400px\), \(max-height:800px\)/.test(board) && /transform:scale\(\.74\)/.test(board), 'HUD has a compact-TV fallback');
ok(/src="\/assets\/hud_\$\{id\}\.png\?v=1276"/.test(phone), 'phone summoner shelf uses the same dedicated HUD art');
ok(/\.csCard \.csVisual \{[^}]*inset:0 0 30%[^}]*overflow:hidden/s.test(phone), 'phone summoner art is clipped to a dedicated visual area');
ok(/\.csCard \.csInfo \{[^}]*height:30%[^}]*background:/s.test(phone), 'phone summoner name and strategy use a separate opaque information area');
ok(/\.csCard \.csArt \{[^}]*object-fit:contain;[^}]*object-position:center bottom/s.test(phone), 'phone summoner HUD art keeps its complete 1.2:1 composition');
ok(!/CHAR_SELECT_FOCUS/.test(phone) && !/--cs-scale/.test(phone), 'phone summoner shelf has no legacy per-character crop offsets');

for (const id of ['redani', 'linnei', 'grease', 'mio', 'lia', 'adel', 'villa', 'nerasio']) {
  const file = path.join(root, 'public', 'assets', `hud_${id}.png`);
  ok(fs.existsSync(file), `HUD art exists: ${id}`);
  const png = fs.readFileSync(file);
  ok(png.subarray(1, 4).toString('ascii') === 'PNG', `HUD art is PNG: ${id}`);
  ok(png[25] === 4 || png[25] === 6, `HUD art has alpha: ${id}`);
  ok(png.readUInt32BE(16) === 1374 && png.readUInt32BE(20) === 1145, `HUD art uses the shared 1.2:1 canvas: ${id}`);
}

console.log(`V1.27 TV HUD ALL ${pass} CHECKS PASSED`);
