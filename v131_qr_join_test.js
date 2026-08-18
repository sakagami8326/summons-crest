// v1.31 regression: room-specific QR links and QR-first phone entry.
const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
const phoneFile = path.join(__dirname, 'public', 'phone.html');
const boardFile = path.join(__dirname, 'public', 'board.html');
let source = fs.readFileSync(serverFile, 'utf8');
const phone = fs.readFileSync(phoneFile, 'utf8');
const board = fs.readFileSync(boardFile, 'utf8');
const pkg = require('./package.json');

let stripped = source.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval', 'setTimeout',
  'clearTimeout', stripped + '\n;return { VERSION, phoneUrlForRoom };')(
  require, __dirname, process, { log:()=>{}, error:console.error }, ()=>0, ()=>0, ()=>{});

let pass = 0;
function ok(value, name) {
  if (!value) throw new Error('FAIL: ' + name);
  pass++;
}
function eq(actual, expected, name) {
  ok(JSON.stringify(actual) === JSON.stringify(expected),
    `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
}

ok(Number(G.VERSION) >= 1.31 && Number(pkg.version.replace(/\.0$/, '')) >= 1.31,
  'version is unified at v1.31 or newer');
ok(Number((board.match(/board ([\d.]+)/) || [])[1]) >= 1.31,
  'board version tag is v1.31 or newer');

const previousPublicUrl = process.env.PUBLIC_URL;
process.env.PUBLIC_URL = 'https://52-68-169-20.sslip.io/';
eq(G.phoneUrlForRoom('abCd'), 'https://52-68-169-20.sslip.io/phone?room=ABCD',
  'room URL uses the canonical phone route, uppercase room and no double slash');
ok(G.phoneUrlForRoom('ABCD').length <= 53,
  'current production room URL fits the dependency-free version 3 QR encoder');
if (previousPublicUrl === undefined) delete process.env.PUBLIC_URL;
else process.env.PUBLIC_URL = previousPublicUrl;

ok((source.match(/phoneUrl:\s*phoneUrlForRoom\(/g) || []).length === 3,
  'create, restore and room-info responses all use the shared room URL helper');
ok(!/phoneUrl:\s*`\$\{base\}\/phone`/.test(source),
  'generic phone URLs are no longer returned by room APIs');

ok(/QRを読み取り、名前を入力して参加/.test(board) &&
   /直接開く場合はルームコードを入力/.test(board),
  'TV lobby explains QR-first and manual fallback entry');
ok(/QR\.svg\(phoneUrl, 5\)/.test(board) && /QR\.svg\(phoneUrlG, 4\)/.test(board),
  'lobby and options QR codes both consume the server-provided room URL');
ok(/class="bigcode" id="bigcode"/.test(board), 'manual four-character code remains on TV');

ok(/id="roomPreset"[^>]*role="status"/.test(phone) &&
   /#join\.qr-room #codeIn\s*\{\s*display:none/.test(phone),
  'QR mode replaces the editable room input with a visible room label');
ok(/ROOM_CODE_PATTERN = \/\^\[ABCDEFGHJKMNPQRSTUVWXYZ23456789\]\{4\}\$\//.test(phone),
  'QR room parameter uses the server room alphabet and exact length');
ok(/params\.has\('room'\)/.test(phone) &&
   /fetch\('\/api\/room\?code=' \+ encodeURIComponent\(candidate\)\)/.test(phone),
  'phone detects and validates an explicit QR room before joining');
ok(/presetRoom \|\| \$\('codeIn'\)\.value\.trim\(\)\.toUpperCase\(\)/.test(phone),
  'join request uses the QR room when present and manual input otherwise');
ok(/String\(sess\.room \|\| ''\)\.toUpperCase\(\) === candidate/.test(phone) &&
   /if \(!sess\) return;\s*if \(!await resumeSavedSession\(sess\)\)/.test(phone),
  'only a matching QR session auto-resumes while direct access keeps legacy resume');
ok(/QRコードのルーム情報が正しくありません/.test(phone) &&
   /このルームは見つかりません/.test(phone) && /showManualRoom/.test(phone),
  'malformed and missing QR rooms fall back to manual entry with an error');
ok(/id="joinFsBtn"/.test(phone) && /id="nameIn"/.test(phone) && /id="joinBtn"/.test(phone),
  'fullscreen, name and explicit join controls remain available');

console.log(`V1.31 QR JOIN ALL ${pass} CHECKS PASSED`);
