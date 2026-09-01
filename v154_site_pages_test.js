// v1.54 public card catalog, official rules, and homepage performance regression test.
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

let pass = 0;
const ok = (condition, name) => {
  if (!condition) throw new Error('FAIL: ' + name);
  pass++;
};
const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(__dirname, rel));
const serverSource = read('server.js');
const home = read('public/site/index.html');
const homeCss = read('public/site/homepage.css');
const homeJs = read('public/site/homepage.js');
const cardsHtml = read('public/site/cards.html');
const cardsCss = read('public/site/cards.css');
const cardsJs = read('public/site/cards.js');
const rulesHtml = read('public/site/rules.html');
const rulesCss = read('public/site/rules.css');
const rulesJs = read('public/site/rules.js');
const designCss = read('public/site/design-system.css');

ok(/const VERSION = '1\.54'/.test(serverSource) && require('./package.json').version === '1.54.0', 'release is v1.54');
ok(/if \(p === '\/cards'\).*site\/cards\.html/.test(serverSource), '/cards is a formal route');
ok(/if \(p === '\/rules'\).*site\/rules\.html/.test(serverSource), '/rules is a formal route');
ok(/p === '\/api\/catalog' && req\.method === 'GET'/.test(serverSource), 'read-only catalog endpoint exists');
ok(!/\/api\/catalog[\s\S]{0,100}POST/.test(serverSource), 'catalog is not exposed as a write endpoint');

for (const source of [homeJs, cardsJs, rulesJs, read('public/site/site-pages.js')]) {
  let parses = true;
  try { new Function(source); } catch (error) { parses = false; }
  ok(parses, 'public page script parses');
}

for (const route of ['/cards', '/rules']) {
  ok(home.includes(`href="${route}"`), `homepage links to ${route}`);
  ok(cardsHtml.includes(`href="${route}"`) && rulesHtml.includes(`href="${route}"`), `subpage navigation links to ${route}`);
}
ok(/card-showcase__archive[\s\S]*href="\/cards"/.test(home), 'home card showcase links to the archive');
ok(/grid-template-columns:\s*repeat\(5/.test(cardsCss) && /max-width:\s*36rem[\s\S]*repeat\(2/.test(cardsCss), 'card grid uses five desktop and two mobile columns');
ok(/\.game-card__name\s*\{[^}]*var\(--sc-font-display\)/.test(cardsCss), 'card names use the bold Mincho display font');
ok(/\.game-card__stat img\s*\{[^}]*width:\s*clamp\([^;]+;[^}]*height:\s*clamp\(/s.test(cardsCss), 'AT and HP icons use explicit equal dimensions');
ok(/\.catalog-card__details\s*\{[^}]*grid-template-columns/.test(cardsCss), 'evolution controls use the below-card details row');
ok(!/\.catalog-card__evolution\s*\{[^}]*position:\s*absolute/.test(cardsCss), 'evolution controls do not overlap card names');
ok(/BATCH_SIZE = 20/.test(cardsJs) && /IntersectionObserver/.test(cardsJs), 'catalog renders in lazy batches');
ok(/data-evolution="base"/.test(cardsJs) && /data-evolution="evolution"/.test(cardsJs), 'evolution stays inside one card frame');
ok(/showModal\(\)/.test(cardsJs) && /event\.target === dialog/.test(cardsJs) && /addEventListener\('cancel'/.test(cardsJs), 'card modal supports open, backdrop close, and Escape');
ok(/searchParams\.get\('card'\)/.test(cardsJs) && /searchParams\.get\('evolved'\)/.test(cardsJs), 'cards can be deep-linked from rules');
ok(/loading="lazy" decoding="async"/.test(cardsJs), 'catalog images use lazy async decoding');

const ruleIds = ['overview','setup','victory','turn','board','cards-rule','battle','facilities','territory','titles','save','summoners-rule','faq'];
for (const id of ruleIds) ok(rulesHtml.includes(`id="${id}"`), `official rules include ${id}`);
ok(/data-rules-search/.test(rulesHtml) && /filterRules/.test(rulesJs), 'official rules are searchable');
ok(/position:\s*sticky/.test(rulesCss) && /@media \(max-width: 52rem\)[\s\S]*position:\s*static/.test(rulesCss), 'rules TOC is sticky on desktop and collapsible on mobile');
ok(/matchMedia\('\(max-width: 52rem\)'\)[\s\S]*removeAttribute\('open'\)/.test(rulesJs), 'mobile rules TOC starts collapsed');
for (const copy of ['総資産8,000G以上','地価 × 25%','土地Lv×10','完了周回数×100G','総資産＋500G','150G','80G'])
  ok(rulesHtml.includes(copy), `official rules include current value: ${copy}`);
ok(!/pending|optionId|CREATURES|SPELLS|SUPPORTS|server\.js/.test(rulesHtml), 'public rules do not expose internal identifiers');

for (const weight of [400, 600, 700]) {
  const oldPath = `public/assets/site/fonts/shippori-mincho-${weight}.woff2`;
  const subsetPath = `public/assets/site/fonts/shippori-mincho-${weight}-site-v154.woff2`;
  ok(exists(subsetPath), `font subset ${weight} exists`);
  ok(fs.statSync(path.join(__dirname, subsetPath)).size < fs.statSync(path.join(__dirname, oldPath)).size * 0.2, `font subset ${weight} is materially smaller`);
  ok(designCss.includes(path.basename(subsetPath)), `design system loads subset ${weight}`);
}
for (const asset of [
  'summoner-bg-v154-1280.webp','summoner-bg-v154-1920.webp',
  'how-step-qr-redani-v154-768.webp','how-step-qr-redani-v154-1280.webp',
  'how-step-summoner-v154-768.webp','how-step-summoner-v154-1200.webp',
]) ok(exists(`public/assets/site/${asset}`), `optimized asset exists: ${asset}`);
ok(/image-set\([^)]*summoner-bg-v154-1280\.webp/.test(homeCss), 'hero uses responsive WebP background');
ok(/<picture>[\s\S]*how-step-qr-redani-v154-768\.webp/.test(home), 'how-to images use responsive WebP sources');
ok(/content-visibility:\s*auto/.test(homeCss) && /contain-intrinsic-size/.test(homeCss), 'below-fold sections reserve layout while skipping initial rendering');
ok(/showcaseVisible/.test(homeJs) && /carouselVisible/.test(homeJs), 'offscreen card and summoner animation work is paused');
ok(!/card-fan figure[^}]*will-change/.test(homeCss), 'card conveyor has no permanent will-change allocation');
ok(/background-attachment:\s*scroll/.test(homeCss), 'mobile fixed background is simplified');
ok(/youtube-nocookie\.com[\s\S]*replaceChildren\(frame\)/.test(homeJs), 'YouTube remains click-to-load');

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(error => error ? reject(error) : resolve(port));
  });
});
const waitFor = async (url, attempts = 60) => {
  for (let i = 0; i < attempts; i++) {
    try { if ((await fetch(url)).ok) return; } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server startup timeout');
};

(async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(`${base}/api/catalog`);
    const catalogResponse = await fetch(`${base}/api/catalog`);
    const catalog = await catalogResponse.json();
    ok(catalog.version === '1.54', 'catalog identifies current release');
    ok(catalog.counts.total === 68 && catalog.cards.length === 68, 'catalog contains all 68 base card types');
    ok(catalog.counts.creatures === 39 && catalog.counts.spells === 24 && catalog.counts.weapons === 5, 'catalog category counts are 39/24/5');
    ok(catalog.counts.evolutions === 32, 'catalog contains all 32 evolution pairs');
    ok(new Set(catalog.cards.map(card => card.id)).size === 68, 'catalog IDs are unique');
    ok(catalog.cards.every(card => ['id','kind','name','element','rarity','cost','at','hp','effect','imageId','artPath','evolution'].every(key => key in card)), 'catalog exposes the complete public card shape');
    ok(catalog.cards.every(card => !['hand','deck','owner','player','supports'].some(key => key in card)), 'catalog excludes game-private state');
    ok(catalog.cards.filter(card => card.kind === 'creature').every(card => card.artPath && exists(`public${card.artPath}`)), 'all creature art references resolve');
    ok(catalog.cards.filter(card => card.evolution).every(card => card.evolution.id.endsWith('_f') && card.evolution.artPath && exists(`public${card.evolution.artPath}`)), 'all evolution relationships and art references resolve');
    ok(catalog.cards.filter(card => card.kind !== 'creature').every(card => card.artPath && exists(`public${card.artPath}`)), 'all spell and weapon art references resolve');
    ok(/^public, max-age=300/.test(catalogResponse.headers.get('cache-control') || ''), 'catalog uses a short public cache');

    for (const route of ['/cards', '/rules']) {
      const response = await fetch(base + route);
      ok(response.ok && /text\/html/.test(response.headers.get('content-type') || ''), `${route} responds with HTML`);
      ok(response.headers.get('cache-control') === 'no-cache' && response.headers.get('etag'), `${route} checks for updates with ETag`);
      const etag = response.headers.get('etag');
      const conditional = await fetch(base + route, { headers: { 'If-None-Match': etag } });
      ok(conditional.status === 304, `${route} returns 304 for a matching ETag`);
    }
    const font = await fetch(`${base}/assets/site/fonts/shippori-mincho-400-site-v154.woff2`);
    ok(/max-age=31536000/.test(font.headers.get('cache-control') || '') && /immutable/.test(font.headers.get('cache-control') || ''), 'versioned fonts use immutable long-term caching');
    const code = await fetch(`${base}/site/cards.js`);
    ok(/max-age=300/.test(code.headers.get('cache-control') || '') && code.headers.get('etag'), 'page JavaScript uses short cache with ETag');
  } finally {
    child.kill();
  }
  if (stderr) throw new Error('unexpected server stderr: ' + stderr);
  console.log(`V1.54 SITE PAGES ALL ${pass} CHECKS PASSED`);
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
