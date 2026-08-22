// v1.38 公式ホームページ・公開導線・操作UIの回帰検査
const fs = require('fs');
const path = require('path');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };
const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(__dirname, rel));
const html = read('public/site/index.html');
const css = read('public/site/homepage.css');
const conceptCss = read('public/site/concept-section.css');
const js = read('public/site/homepage.js');
const server = read('server.js');
const pkg = require('./package.json');

ok(/const VERSION = '1\.39'/.test(server) && pkg.version === '1.39.0', 'current version is unified at v1.39');
ok(/if \(p === '\/'\) return serveFile\(res, 'site\/index\.html'\)/.test(server), 'root serves official homepage');
ok(/if \(p === '\/play'\) return serveFile\(res, 'board\.html'\)/.test(server), 'play route serves TV game');
ok(/p === '\/board'[\s\S]*Location: '\/play'/.test(server), 'board compatibility route redirects to play');
ok(/p\.startsWith\('\/site\/'\)/.test(server), 'site static files are served');
ok(/webp: 'image\/webp'/.test(server) && /webm: 'video\/webm'/.test(server) && /woff2: 'font\/woff2'/.test(server) && /css: 'text\/css'/.test(server), 'web MIME types are explicit');

ok(/ボードゲーム\s*<em>×<\/em>\s*カードゲーム/.test(html), 'hero states board game x card game');
ok(/スマホをコントローラーにして遊ぶ/.test(html), 'hero explains smartphone controller');
ok(/BOARD GAME × DECK-BUILDING ROGUELIKE/.test(html), 'concept states deck-building roguelike');
ok(/相手の領地を侵略し、自分の領地を守り/.test(html), 'concept explains invasion and defense');
ok(/class="concept__tv-image"[^>]*gameplay-video-poster-v1\.png[^>]*プレイ中の盤面/.test(html), 'concept TV displays an in-game board screenshot');
ok(/concept__tv-stand[\s\S]*concept__caption concept__caption--tv/.test(html) && /\.concept__caption--tv\s*\{[^}]*top:\s*calc\(100%/.test(conceptCss), 'TV caption is anchored directly below the television');
ok(!/秘密の手札|隠された選択/.test(html), 'ambiguous secret-hand copy is absent');
ok(!/href="\/play"/.test(html), 'homepage does not link to the game before early access');
ok((html.match(/is-coming-soon/g) || []).length >= 5, 'all primary game CTAs show coming soon');

for (const id of ['concept','play-style','how-to-play','game-system','cards','summoners','early-access','news'])
  ok(new RegExp(`id="${id}"`).test(html), `section exists: ${id}`);

for (const file of ['heading-concept-a.png','heading-play-style.png','heading-how-to-play.png','heading-game-system.png',
  'heading-cards.png','heading-summoners.png','heading-early-access.png','heading-news.png','spark-star.svg','spark-star-cluster.svg'])
  ok(exists('public/assets/site/' + file), `site asset exists: ${file}`);

for (const weight of [400,600,700])
  ok(exists(`public/assets/site/fonts/shippori-mincho-${weight}.woff2`), `self-hosted Shippori Mincho ${weight}`);
ok(/shippori-mincho-400\.woff2/.test(read('public/site/design-system.css')), 'design system loads self-hosted font');

ok(/class="site-game-card\b/.test(html) && /bg-fire\.webp/.test(html) && /bg-water\.webp/.test(html) && /bg-earth\.webp/.test(html) && /bg-wind\.webp/.test(html), 'creature showcase uses all four in-game elemental card backgrounds');
ok(/<strong>100<\/strong><span>種類以上<small>※リリース時点<\/small>/.test(html), 'cards section announces more than 100 cards at release');
ok(!/data-card-tab=|data-card-panel=|panel-spell/.test(html), 'card showcase has no spell or weapon category tabs');
ok(/class="card-fan"/.test(html) && (html.match(/c_[a-z_]+\.webp/g) || []).length >= 9, 'creature showcase displays a layered card fan');
for (const name of ['サラマンダー','ダイテッカン','キング','ノーク・ゴーア','ディノガルド','コマオー','マッドミスト','ガレス・ゲイル','クレステッド'])
  ok(html.includes(`data-card-name="${name}"`), `requested showcase creature exists: ${name}`);
const showcaseOrder = [...html.matchAll(/<figure data-card-name="[^"]+"[^>]*>[\s\S]*?<img class="site-card-bg" src="\/assets\/cards\/bg-([a-z]+)\.webp"/g)].map(([, element]) => element);
ok(showcaseOrder.length === 9 && showcaseOrder.slice(0, 8).every((element, index) => index === 0 || element !== showcaseOrder[index - 1]), 'showcase interleaves elemental backgrounds instead of grouping attributes');
ok((html.match(/data-card-evolves/g) || []).length === 9 && /site-card-flipper/.test(html), 'all showcase cards have front and back faces');
ok(/order\.shift\(\)/.test(js) && /order\.push\(exiting\)/.test(js) && /is-recycling/.test(js) && /--slot', 5/.test(js), 'showcase recycles an exited left card offscreen to the right');
ok(/cloneNode\(true\)/.test(js) && /is-conveyor-clone/.test(js) && /incoming\.remove\(\)/.test(js), 'showcase uses an offscreen clone for seamless conveyor entry');
ok(!/focusDirection/.test(js), 'showcase does not reverse direction');
ok(/runEvolutionWave/.test(js) && /evolutionRunning/.test(js) && /carouselMoving/.test(js) && /await wait\(140\)/.test(js), 'evolution runs as a fast coordinated wave and pauses carousel motion');
ok(/setTimeout\(scheduleEvolutionWave, 16000\)/.test(js), 'evolution wave starts on the planned interval');
ok(!/site-card-elem|site-card-info/.test(html), 'showcase omits element icon and ivory effect panel');
ok(/\.site-card-flipper[^}]*aspect-ratio: 2 \/ 3/.test(css), 'showcase card ratio matches elemental background art');
ok(/\.site-card-art[^}]*filter: drop-shadow\(0 0 [^)]+rgb\(255 255 255/.test(css), 'showcase artwork has a soft white alpha-outline glow');
ok(!/\.site-card-art[^}]*box-shadow:/.test(css) && !/\.site-game-card[^}]*box-shadow:/.test(css), 'showcase card and artwork have no rectangular box shadow');
ok(!/\.card-panel img[^}]*(?:border|box-shadow):/.test(css), 'generic card panel styles do not add a border or shadow to showcase art');
ok(/\.news\s*\{[^}]*padding-bottom:\s*0/.test(css), 'news section removes the unexplained trailing gap');
ok(/\.final-cta\s*\{[^}]*min-height:\s*0[^}]*padding:\s*clamp\(3\.5rem, 6vw, 5rem\)/.test(css), 'final call to action no longer creates a large empty block below news');
ok(/\.final-cta > :not\(\.final-cta__ring\)/.test(css) && /\.final-cta__ring\s*\{[^}]*position:\s*absolute/.test(css), 'decorative final CTA ring stays out of document flow');
ok(!/\.card-fan \.is-featured[^}]*(?:top|width):/.test(css) && /--focus-boost/.test(css), 'featured card changes scale without snapping top or width');
ok(/\.site-card-flipper[^}]*transition: transform \.45s/.test(css), 'showcase flip duration is fast');
for (const id of ['gecko','kamadoma','kbaby','goagoa','bonerex','komao','toxy','garble','cleo']) {
  ok(exists(`public/assets/site/cards/c_${id}.webp`), `site-only normal art exists: ${id}`);
  ok(exists(`public/assets/site/cards/e_${id}.webp`), `site-only evolved art exists: ${id}`);
}
ok((html.match(/\/assets\/site\/cards\/[ce]_[a-z]+\.webp/g) || []).length === 18, 'showcase uses all site-only decontaminated images');
ok(/<video controls playsinline preload="metadata"[^>]+poster="\/assets\/site\/gameplay-video-poster-v1\.png"/.test(html), 'gameplay video uses user-initiated playback with a prepared poster');
ok(/gameplay-video-v1\.webm" type='video\/webm; codecs="vp9, opus"'/.test(html), 'gameplay video serves VP9 and Opus WebM');
ok(exists('public/assets/site/gameplay-video-v1.webm'), 'encoded gameplay WebM exists');
ok(exists('public/assets/site/gameplay-video-poster-v1.png'), 'gameplay video poster exists');
ok((html.match(/class="summoner-slide"/g) || []).length === 8, 'all eight summoners are present');
ok(/setInterval\(\(\) => show\(active \+ 1\), 5000\)/.test(js), 'summoner carousel advances every five seconds');
ok(/document\.hidden/.test(js) && /prefers-reduced-motion/.test(js), 'carousel pauses for hidden tab and reduced motion');
ok(/mouseenter/.test(js) && /focusin/.test(js) && /pointerdown/.test(js), 'carousel pauses for hover focus and touch');
ok(/\.summoner-slide\.is-active[\s\S]*brightness\(1\.06\)/.test(css) && /\.summoner-slide\.is-prev[\s\S]*opacity: \.58/.test(css), 'focused summoner is bright and surrounding slides are dark');
ok(/border: 1px dashed/.test(css + conceptCss) && /homepage-spin/.test(css), 'simple dashed circles rotate');
ok(/prefers-reduced-motion/.test(css) && /animation: none !important/.test(css), 'decorative motion respects reduced motion');

ok(/\.hero h1\s*\{[^}]*white-space:\s*nowrap/.test(css), 'hero headline stays on one line');
ok(/property="og:url" content="https:\/\/52-68-169-20\.sslip\.io\/"/.test(html), 'Open Graph URL is absolute');
ok(/property="og:image" content="https:\/\/52-68-169-20\.sslip\.io\/assets\/site\/og-summons-code-v1\.png"/.test(html), 'Open Graph image URL is absolute');
ok(/name="twitter:image" content="https:\/\/52-68-169-20\.sslip\.io\/assets\/site\/og-summons-code-v1\.png"/.test(html), 'Twitter image metadata uses the public image URL');
ok(/rel="canonical" href="https:\/\/52-68-169-20\.sslip\.io\/"/.test(html) && /name="description"/.test(html), 'canonical and description metadata are present');
ok(/class="skip-link"/.test(html) && /aria-live="polite"/.test(html), 'skip navigation and live carousel information are present');

console.log(`V1.38 HOMEPAGE ALL ${pass} CHECKS PASSED`);
