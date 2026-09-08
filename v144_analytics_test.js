// v1.44 Google Analytics連携の回帰検査
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
  '計測URLを元URLの丸ごと転送ではなく安全なURLとして構成する');
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

// Execute the actual browser entry point. Never load gtag or send real analytics in tests.
const boot = href => {
  const saved = new Map();
  const scripts = [];
  const window = {
    location: new URL(href),
    localStorage: {
      getItem: key => saved.get(key) || null,
      setItem: (key, value) => saved.set(key, value),
    },
  };
  const document = {
    createElement: name => ({ tagName: name }),
    head: { appendChild: node => scripts.push(node) },
  };
  vm.runInNewContext(analytics, { window, document, URLSearchParams });
  const calls = () => Array.from(window.dataLayer || [], args => Array.from(args));
  return { window, scripts, calls, config: calls().find(args => args[0] === 'config')?.[2] };
};
const campaign = 'utm_source=youtube&utm_medium=paid_video&utm_campaign=short_trial_20260907&utm_content=qr_join_v3';
const ad = boot(`https://summonscode.jp/?${campaign}`);
ok(ad.config.page_location === `https://summonscode.jp/?${campaign}`,
  '現在のYouTube広告の4つのUTMを欠落なくGA4設定へ渡す');
ok(ad.config.page_path === '/' && ad.config.send_page_view === true,
  '広告URLでもページパスは変更せずページビューを送る');
ok(ad.calls().filter(args => args[0] === 'config').length === 1 && ad.scripts.length === 1,
  'GA4初期化とタグの読み込みを重複させない');
ok(ad.config.allow_google_signals === false && ad.config.allow_ad_personalization_signals === false,
  'UTM付きでも広告向け信号を無効のまま維持する');
for (const route of ['/', '/play', '/phone', '/cards', '/rules']) {
  const privateQuery = 'room=SECRET_ROOM&code=SECRET_CODE&player=SECRET_PLAYER&token=SECRET_TOKEN&name=SECRET_NAME&email=secret%40example.com&gclid=SECRET_CLICK&unknown=SECRET_OTHER';
  const mixed = boot(`https://summonscode.jp${route}?${privateQuery}&${campaign}#SECRET_HASH`);
  ok(mixed.config.page_location === `https://summonscode.jp${route}?${campaign}` &&
    mixed.config.page_path === route && !JSON.stringify(mixed.calls()).includes('SECRET'),
  `${route}: 参加情報・任意クエリ・ハッシュを除外しUTMだけ残す`);
  const plain = boot(`https://summonscode.jp${route}?${privateQuery}#SECRET_HASH`);
  ok(plain.config.page_location === `https://summonscode.jp${route}`,
    `${route}: UTMのないアクセスにはキャンペーンを捏造しない`);
}
const allKeys = new URLSearchParams({ utm_source: 'youtube', utm_medium: 'paid_video',
  utm_campaign: '日本語 キャンペーン', utm_id: 'trial-1', utm_content: 'qr_join_v3',
  utm_term: 'カードゲーム', utm_source_platform: 'youtube' });
const encoded = new URL(boot(`https://www.summonscode.jp/?${allKeys}`).config.page_location);
ok([...allKeys].every(([key, value]) => encoded.searchParams.get(key) === value) &&
  encoded.hostname === 'www.summonscode.jp', '標準UTM7項目と日本語・空白をwwwドメインでも維持する');
for (const invalid of ['utm_source=', 'utm_source=%20', 'utm_source=a&utm_source=b',
  'utm_source=%00youtube', 'utm_source=%0Ayoutube', 'utm_source=%FF',
  `utm_source=${'a'.repeat(101)}`]) {
  const result = boot(`https://summonscode.jp/?${invalid}&utm_medium=paid_video`);
  // Leading/trailing whitespace is normalized; embedded control characters are rejected.
  const expectedSource = invalid === 'utm_source=%0Ayoutube' ? 'youtube' : null;
  const query = new URL(result.config.page_location).searchParams;
  ok(query.get('utm_source') === expectedSource && query.get('utm_medium') === 'paid_video',
    `不正・空・重複・過長UTMを処理して他の項目を維持する: ${invalid.slice(0, 45)}`);
}
for (const host of ['localhost', '127.0.0.1', 'summonscode.jp.example.com', 'preview.example.com']) {
  const result = boot(`https://${host}/?${campaign}`);
  ok(!result.config && result.scripts.length === 0 &&
    result.window.SummonsAnalytics.track('game_start_cta_click') === false,
  `${host}: 本番外ではUTMがあっても送信しない`);
}
ok(ad.window.SummonsAnalytics.track('game_start_cta_click', { placement: 'hero', invalid: {} }) &&
  ad.calls().at(-1)[2].placement === 'hero' && !('invalid' in ad.calls().at(-1)[2]),
  '既存カスタムイベントとパラメータの制限を維持する');
ok(ad.window.SummonsAnalytics.trackOnce('test-match', 'match_completed') &&
  !ad.window.SummonsAnalytics.trackOnce('test-match', 'match_completed') &&
  ad.calls().filter(args => args[0] === 'event' && args[1] === 'match_completed').length === 1,
  '既存のイベント重複防止を維持する');

console.log(`V1.44 ANALYTICS ALL ${pass} CHECKS PASSED`);
