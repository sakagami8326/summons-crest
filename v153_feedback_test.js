// v1.53 feedback form, API, and Google Apps Script contract regression test.
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

let pass = 0;
const ok = (condition, name) => {
  if (!condition) throw new Error('FAIL: ' + name);
  pass++;
};
const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const html = read('public/site/index.html');
const css = read('public/site/homepage.css');
const client = read('public/site/homepage.js');
const serverSource = read('server.js');
const appsScript = read('deploy/google-apps-script/feedback-webhook.gs');

ok(/const VERSION = '1\.59'/.test(serverSource) && require('./package.json').version === '1.59.0', 'v1.53 feedback remains covered by v1.59');
ok(/<section class="page-section feedback" id="feedback"/.test(html), 'feedback section exists');
ok(html.indexOf('id="news"') < html.indexOf('id="feedback"') && html.indexOf('id="feedback"') < html.indexOf('class="final-cta"'), 'feedback sits between NEWS and final CTA');
ok(html.indexOf('id="top"') < html.indexOf('id="news"') && html.indexOf('id="news"') < html.indexOf('id="concept"'), 'NEWS sits directly after the hero and before CONCEPT');
ok(/フィードバックを送れるようになりました/.test(html) && /href="#feedback"[^>]*><span>意見を送る/.test(html), 'NEWS announces that feedback is available and links to the form');
ok(/class="news__wordmark"[^>]*>NEWS<\/p>[\s\S]*<h2 id="news-title">更新情報<\/h2>/.test(html) && /\.news__wordmark\s*\{[^}]*text-align:\s*left/.test(css), 'NEWS and its Japanese heading share the same left alignment');
ok(!/FEEDBACK OPEN|EARLY ACCESS START/.test(html), 'article eyebrow labels are removed');
ok(/\.news-entry\s*\{[^}]*min-height:\s*10\.5rem[^}]*padding:\s*clamp\(1\.35rem, 2\.2vw, 2rem\)/.test(css), 'NEWS articles use compact vertical dimensions');
ok(/\.news \.section-shell\s*\{[^}]*grid-template-columns:\s*minmax\(16rem, \.68fr\) minmax\(0, 1\.32fr\)/.test(css), 'desktop NEWS uses a heading column and an article column');
ok(/\.news-list\s*\{[^}]*display:\s*grid[^}]*gap:/.test(css) && /\.news-entry\s*\{[^}]*grid-template-columns:\s*7rem minmax\(0, 1fr\)/.test(css), 'NEWS articles stack vertically with compact internal columns');
ok(/@media \(max-width: 52rem\)[\s\S]*\.news \.section-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/.test(css), 'NEWS returns to one column on smaller screens');
ok((html.match(/name="category" value="(?:improvement|bug|impression|other)"/g) || []).length === 4, 'four fixed radio categories are present');
ok(/name="message"[^>]*maxlength="1200"[^>]*required/.test(html), 'message is required and capped at 1200 characters');
ok(/name="website"[^>]*tabindex="-1"[^>]*autocomplete="off"/.test(html), 'honeypot stays outside normal interaction');
ok(/data-feedback-count>0 \/ 1,200/.test(html) && /使用端末や発生した場面/.test(html), 'counter and bug-report guidance are visible');
ok(/あなたの声を、<br><span>次のアップデートへ。<\/span>/.test(html), 'feedback headline uses the intended two-line break');
ok(/ご意見ありがとうございます/.test(html) && /data-feedback-complete hidden tabindex="-1"/.test(html), 'accessible completion panel exists');
ok((html.match(/href="#feedback"/g) || []).length >= 2, 'header and footer link to feedback');
ok(/\.feedback-form__category-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/.test(css), 'categories use a two-column grid');
ok(/@media \(max-width: 36rem\)[\s\S]*\.feedback-form__category-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/.test(css), 'mobile preserves the two-by-two category grid');
ok(/\.feedback__shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*width:\s*min\(62rem/.test(css), 'feedback heading and form use one centered column');
ok(/\.feedback__heading h2 span\s*\{[^}]*white-space:\s*normal/.test(css), 'feedback headline may wrap instead of overlapping the form');
ok(/\.feedback-form textarea\s*\{[^}]*background:\s*#f2ead8/.test(css) && /\.feedback-submit\s*\{/.test(css), 'ivory input and dedicated gold submit treatment exist');
ok(/fetch\('\/api\/feedback'/.test(client) && /submit\.disabled = true/.test(client), 'client posts to API and locks during submission');
ok(/launcherRetreatZones[\s\S]*#news, #feedback, \.final-cta, \.site-footer[\s\S]*visibleZones\.size > 0/.test(client), 'fixed game launcher retreats throughout NEWS, feedback, and closing sections');
ok(/feedbackForm\.hidden = true[\s\S]*complete\.hidden = false/.test(client), 'success alone swaps to completion panel');
ok(/入力内容はそのまま/.test(client) && /finally[\s\S]*submit\.disabled = false/.test(client), 'failure preserves input and unlocks retry');
ok(/FEEDBACK_WEBHOOK_URL/.test(serverSource) && /FEEDBACK_WEBHOOK_TOKEN/.test(serverSource), 'webhook configuration remains server-side');
ok(/FEEDBACK_WINDOW_MS = 10 \* 60 \* 1000/.test(serverSource) && /FEEDBACK_LIMIT = 3/.test(serverSource), 'API limits each IP to three requests per ten minutes');
ok(/AbortSignal\.timeout\(8000\)/.test(serverSource), 'Google forwarding has a bounded timeout');
ok(/LockService\.getScriptLock/.test(appsScript) && /tryLock\(5000\)/.test(appsScript), 'Apps Script serializes writes');
ok(/createTextFinder\(sendId\)\.matchEntireCell\(true\)/.test(appsScript), 'Apps Script deduplicates submission IDs');
ok(/\^\[=\+\\-@\]/.test(appsScript) && /safeSheetText_\(message\)/.test(appsScript), 'Apps Script neutralizes formula-like content');
ok(!/remoteAddress|x-forwarded-for|headers/i.test(appsScript), 'Apps Script does not receive or store request identity');

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(error => error ? reject(error) : resolve(port));
  });
});
const waitFor = async (url, attempts = 50) => {
  for (let i = 0; i < attempts; i++) {
    try { if ((await fetch(url)).ok) return; } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server startup timeout');
};

(async () => {
  const webhookPort = await freePort();
  const appPort = await freePort();
  const received = [];
  let upstreamOk = true;
  const webhook = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      received.push(JSON.parse(raw || '{}'));
      res.writeHead(upstreamOk ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: upstreamOk }));
    });
  });
  await new Promise((resolve, reject) => webhook.listen(webhookPort, '127.0.0.1', error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(appPort),
      FEEDBACK_WEBHOOK_URL: `http://127.0.0.1:${webhookPort}/feedback`,
      FEEDBACK_WEBHOOK_TOKEN: 'test-only-shared-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childErrors = '';
  child.stderr.on('data', chunk => { childErrors += chunk; });
  const post = async (body, ip = '198.51.100.10') => {
    const response = await fetch(`http://127.0.0.1:${appPort}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    await waitFor(`http://127.0.0.1:${appPort}/api/fixture`);
    let result = await post({ category: 'bug', message: 'bot', website: 'https://spam.example' });
    ok(result.status === 200 && result.body.ok === true && received.length === 0, 'honeypot is accepted silently without forwarding');

    result = await post({ category: 'invalid', message: 'test' });
    ok(result.status === 400 && received.length === 0, 'invalid category is rejected before forwarding');
    result = await post({ category: 'bug', message: 'x'.repeat(1201) });
    ok(result.status === 400 && received.length === 0, 'oversized message is rejected before forwarding');

    result = await post({ category: 'improvement', message: '=SUM(A1:A2)' });
    ok(result.status === 200 && result.body.ok === true, 'valid feedback succeeds');
    ok(received[0].message === "'=SUM(A1:A2)", 'formula-like message is neutralized before Google');
    ok(received[0].token === 'test-only-shared-token' && received[0].version === '1.59' && received[0].sendId, 'server adds token, current version, and submission ID');
    ok(!('ip' in received[0]) && !('headers' in received[0]), 'forwarded record contains no IP or headers');
    await post({ category: 'impression', message: '楽しかったです' });
    await post({ category: 'other', message: 'その他の意見' });
    result = await post({ category: 'bug', message: 'fourth' });
    ok(result.status === 429 && received.length === 3, 'fourth request within ten minutes is rate-limited');

    upstreamOk = false;
    result = await post({ category: 'bug', message: 'upstream failure' }, '203.0.113.22');
    ok(result.status === 503 && /もう一度/.test(result.body.error), 'upstream failure returns retryable 503');
  } finally {
    child.kill();
    await new Promise(resolve => webhook.close(resolve));
  }
  if (childErrors && !/\[feedback\] delivery failed: feedback_upstream_500/.test(childErrors))
    throw new Error('unexpected server stderr: ' + childErrors);
  console.log(`V1.53 FEEDBACK ALL ${pass} CHECKS PASSED`);
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
