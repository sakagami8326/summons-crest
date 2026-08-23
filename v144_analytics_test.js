// v1.44 Google Analytics連携の回帰検査
const fs = require('fs');
const path = require('path');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };
const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const analytics = read('public/analytics.js');
const server = read('server.js');
const pages = [
  read('public/site/index.html'),
  read('public/board.html'),
  read('public/phone.html'),
];

ok(/G-WTXTTTFSEF/.test(analytics), 'SUMMONS CODE専用のGA4測定IDを使用する');
ok(/summonscode\.jp/.test(analytics) && /www\.summonscode\.jp/.test(analytics),
  '公式ドメインだけで計測する');
ok(/page_location:\s*safeLocation/.test(analytics) &&
  /window\.location\.origin.*window\.location\.pathname/.test(analytics),
  '計測URLからクエリ文字列とハッシュを除外する');
ok(/page_path:\s*window\.location\.pathname/.test(analytics),
  'ページパスに参加情報を含めない');
ok(/allow_google_signals:\s*false/.test(analytics) &&
  /allow_ad_personalization_signals:\s*false/.test(analytics),
  '広告パーソナライズ向け信号を無効にする');
ok(pages.every(page => /<script src="\/analytics\.js"><\/script>/.test(page)),
  'ホーム・テレビ・スマホの全公開画面で共通タグを読み込む');
ok(/p === '\/analytics\.js'/.test(server), '共通タグを公開URLから配信する');

console.log(`V1.44 ANALYTICS ALL ${pass} CHECKS PASSED`);
