const fs = require('fs');

const board = fs.readFileSync('public/board.html', 'utf8');
const phone = fs.readFileSync('public/phone.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const pkg = require('./package.json');

for (const asset of [
  'summons-code.svg',
  'summons-code-blue.svg',
  'summons-code-gold.svg',
  'summons-code-white.svg',
]) {
  if (!fs.existsSync(`public/assets/${asset}`)) {
    throw new Error(`ブランドロゴ検査: ${asset} がない`);
  }
}

if (!board.includes('<title>SUMMONS CODE — 盤面</title>') ||
    !phone.includes('<title>SUMMONS CODE — 手元</title>')) {
  throw new Error('ブランド名検査: ブラウザタイトルがSUMMONS CODEではない');
}

if (!board.includes('/assets/summons-code-blue.svg') ||
    !board.includes('/assets/summons-code-gold.svg') ||
    !phone.includes('/assets/summons-code-gold.svg')) {
  throw new Error('ブランドロゴ検査: 画面ごとのロゴ参照が不正');
}

if (board.includes('/assets/logo.png') || phone.includes('/assets/logo.png')) {
  throw new Error('ブランドロゴ検査: 旧ロゴ参照が残っている');
}

const serverVersion = Number((server.match(/const VERSION = '([0-9.]+)'/) || [])[1]);
const packageVersion = Number(pkg.version.split('.').slice(0, 2).join('.'));
if (serverVersion < 1.21 || packageVersion < 1.21) {
  throw new Error('バージョン検査: SUMMONS CODEへの変更前のバージョンへ戻っている');
}

console.log('SUMMONS CODEブランド変更検査: OK');
