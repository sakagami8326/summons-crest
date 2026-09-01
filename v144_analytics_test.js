// v1.44 Google Analytics連携の回帰検査
const fs = require('fs');
const path = require('path');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };
const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const analytics = read('public/analytics.js');
const server = read('server.js');
const homepage = read('public/site/homepage.js');
const board = read('public/board.html');
const phone = read('public/phone.html');
const site = read('public/site/index.html');
const pages = [
  site,
  board,
  phone,
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
ok(/window\.SummonsAnalytics\s*=\s*Object\.freeze\(\{ track, trackOnce \}\)/.test(analytics) &&
  /sc_analytics_once_v1/.test(analytics), '共通イベント送信と重複防止を提供する');
ok((site.match(/data-game-cta="[^"]+"/g) || []).length === 6 &&
  /game_start_cta_click/.test(homepage), '6か所のゲーム開始CTAクリックを計測する');
ok(/room_created/.test(board) && /room_mode/.test(board), 'ルーム作成成功をモード付きで計測する');
ok(/bot_match_started/.test(board) && /match_started/.test(board),
  'BOT戦と通常対戦の開始成功を別イベントで計測する');
ok(/phone_joined/.test(phone) && /join_method/.test(phone), 'スマホ参加成功を参加方法付きで計測する');
ok(/match_completed/.test(board) && /match-completed:/.test(board), '対戦終了を試合単位で一度だけ計測する');
ok(/feedback_submit_success/.test(homepage) && /feedback_category/.test(homepage),
  'フィードバック送信成功をカテゴリ付きで計測する');
ok(!/room_code\s*:|player_id\s*:|player_name\s*:|feedback_message\s*:/.test(analytics + homepage + board + phone),
  'GA4イベントへルームコード・プレイヤーID・名前・本文を渡さない');

console.log(`V1.44 ANALYTICS ALL ${pass} CHECKS PASSED`);
