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

const serverVersion = server.match(/const VERSION = '([0-9.]+)'/);
ok(serverVersion && Number(serverVersion[1]) >= 1.40 && Number(pkg.version.replace(/\.0$/, '')) >= 1.40,
  'v1.38 homepage remains covered by the current release');
ok(/if \(p === '\/'\) return serveFile\(res, 'site\/index\.html'\)/.test(server), 'root serves official homepage');
ok(/if \(p === '\/play'\) return serveFile\(res, 'board\.html'\)/.test(server), 'play route serves TV game');
ok(/p === '\/board'[\s\S]*Location: '\/play'/.test(server), 'board compatibility route redirects to play');
ok(/p\.startsWith\('\/site\/'\)/.test(server), 'site static files are served');
ok(/webp: 'image\/webp'/.test(server) && /webm: 'video\/webm'/.test(server) && /woff2: 'font\/woff2'/.test(server) && /css: 'text\/css'/.test(server), 'web MIME types are explicit');

ok(/ボードゲーム\s*<em>×<\/em>\s*カードゲーム/.test(html), 'hero states board game x card game');
ok(/スマホをコントローラーにして遊ぶ/.test(html), 'hero explains smartphone controller');
ok(/BOT戦なら1人でもプレイ/.test(html) && /<dt>PLAYERS<\/dt><dd>1〜4人<small>1人プレイはBOT戦<\/small>/.test(html), 'homepage clearly supports solo BOT play alongside multiplayer');
ok(/BOARD GAME × DECK-BUILDING ROGUELIKE/.test(html), 'concept states deck-building roguelike');
ok(/相手の領地を侵略し、自分の領地を守り/.test(html), 'concept explains invasion and defense');
ok(/class="concept__tv-image"[^>]*gameplay-video-poster-v1\.png[^>]*プレイ中の盤面/.test(html), 'concept TV displays an in-game board screenshot');
ok(/concept__tv-stand[\s\S]*concept__caption concept__caption--tv/.test(html) && /\.concept__caption--tv\s*\{[^}]*top:\s*calc\(100%/.test(conceptCss), 'TV caption is anchored directly below the television');
ok(!/秘密の手札|隠された選択/.test(html), 'ambiguous secret-hand copy is absent');
ok((html.match(/href="\/play"/g) || []).length >= 5, 'all primary game CTAs link to the TV game');
ok(!/COMING SOON|is-coming-soon|ゲームは2026年8月31日公開予定/.test(html), 'early access launch removes coming-soon states');

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
ok((html.match(/class="card-element card-element--/g) || []).length === 4, 'cards section displays all four element marks');
ok(/@media\s*\(max-width:\s*36rem\)[\s\S]*\.card-showcase__elements\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*7\.1rem\)/.test(css), 'mobile cards section keeps the four attributes in a two-column grid');
ok(/@media\s*\(max-width:\s*36rem\)[\s\S]*\.card-showcase__lead\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*width:\s*100%/.test(css) && /\.card-showcase__lead p\s*\{[^}]*width:\s*100%[^}]*text-align:\s*center/.test(css), 'mobile attribute explanation is horizontally centered');
for (const label of ['火属性','水属性','土属性','風属性'])
  ok(html.includes(`<small>${label}</small>`), `cards section shows the localized element label: ${label}`);
for (const element of ['fire','water','earth','wind'])
  ok(new RegExp(`card-element--${element}`).test(html), `cards section labels ${element} element`);
for (const file of ['element-fire.svg','element-water-v2.svg','element-earth.svg','element-wind.svg'])
  ok(exists('public/assets/' + file) && css.includes(`/assets/${file}`), `cards section uses element logo asset: ${file}`);
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
ok(/data-youtube-player data-video-id="0PIknCtXU44"[\s\S]*gameplay-youtube-poster-v1\.webp/.test(html), 'gameplay section uses the requested YouTube video with a local poster');
ok(!/<iframe|<video|gameplay-video-v1\.webm/.test(html), 'homepage does not load YouTube or the old WebM before user interaction');
ok(/youtube-nocookie\.com\/embed\/\$\{videoId\}\?autoplay=1/.test(js) && /replaceChildren\(frame\)/.test(js), 'privacy-enhanced YouTube iframe is created only after playback is requested');
ok(exists('public/assets/site/gameplay-youtube-poster-v1.webp') && fs.statSync(path.join(__dirname, 'public/assets/site/gameplay-youtube-poster-v1.webp')).size < 150000, 'local YouTube poster is present and lightweight');
ok(!exists('public/assets/site/gameplay-video-v1.webm'), 'obsolete 9.8MB gameplay WebM is removed');
ok((html.match(/class="summoner-slide"/g) || []).length === 8, 'all eight summoners are present');
ok(/setInterval\(\(\) => show\(active \+ 1\), 5000\)/.test(js), 'summoner carousel advances every five seconds');
ok(/document\.hidden/.test(js) && /prefers-reduced-motion/.test(js), 'carousel pauses for hidden tab and reduced motion');
ok(/mouseenter/.test(js) && /focusin/.test(js) && /pointerdown/.test(js), 'carousel pauses for hover focus and touch');
ok(/\.summoner-slide\.is-active[\s\S]*brightness\(1\.06\)/.test(css) && /\.summoner-slide\.is-prev[\s\S]*opacity: \.58/.test(css), 'focused summoner is bright and surrounding slides are dark');
ok(/border: 1px dashed/.test(css + conceptCss) && /homepage-spin/.test(css), 'simple dashed circles rotate');
ok(/prefers-reduced-motion/.test(css) && /animation: none !important/.test(css), 'decorative motion respects reduced motion');

ok(/\.hero h1\s*\{[^}]*white-space:\s*nowrap/.test(css), 'hero headline stays on one line');
ok(/property="og:url" content="https:\/\/summonscode\.jp\/"/.test(html), 'Open Graph URL uses the official domain');
ok(/property="og:image" content="https:\/\/summonscode\.jp\/assets\/site\/og-summons-code-v1\.png"/.test(html), 'Open Graph image URL uses the official domain');
ok(/name="twitter:image" content="https:\/\/summonscode\.jp\/assets\/site\/og-summons-code-v1\.png"/.test(html), 'Twitter image metadata uses the official domain');
ok(/rel="canonical" href="https:\/\/summonscode\.jp\/"/.test(html) && /name="description"/.test(html), 'canonical uses the official domain and description metadata is present');
ok(/class="skip-link"/.test(html) && /aria-live="polite"/.test(html), 'skip navigation and live carousel information are present');
ok(/SUMMONS CODEは個人開発ゲームです。/.test(html), 'footer identifies SUMMONS CODE as an independently developed game');
ok(/<dt>SAVE DATA<\/dt><dd>テレビ側のブラウザに保存<small>PCへ書き出して保管可能<\/small>/.test(html), 'save data description includes PC export');
ok(/href="https:\/\/x\.com\/gamitestman"/.test(html) && /site-footer__social/.test(html) && /<svg/.test(html),
  'footer links to the developer X account with an icon');
ok(/最新情報はこちら/.test(html) && /href="https:\/\/www\.youtube\.com\/@SUMMONSCODE"/.test(html),
  'footer links to the official YouTube channel below the latest-news heading');
ok(/site-footer__social--youtube[\s\S]*<rect[^>]+rx="4\.2"[\s\S]*youtube-play/.test(html) && /site-footer__social--youtube\s*\{[^}]*color:\s*#ff0033[^}]*background:\s*#f5f2e9/.test(css),
  'YouTube link uses the official red play mark inside a white circular button');
ok(/site-header__socials[\s\S]*site-social-link--x[\s\S]*site-social-link--youtube[\s\S]*site-header__play/.test(html),
  'desktop header shows X and YouTube links before the game status');
ok(/site-nav__socials[\s\S]*https:\/\/x\.com\/gamitestman[\s\S]*https:\/\/www\.youtube\.com\/@SUMMONSCODE/.test(html),
  'hamburger navigation contains X and YouTube links');
ok(/\.site-header__socials\s*\{[^}]*display:\s*flex/.test(css) && /@media\s*\(max-width:\s*52rem\)[\s\S]*\.site-header__socials\s*\{[^}]*display:\s*none[\s\S]*\.site-nav__socials\s*\{[^}]*display:\s*flex/.test(css),
  'desktop social links switch to the hamburger menu on mobile');
ok(/site-footer__follow[\s\S]*site-footer__socials[\s\S]*<\/div>[\s\S]*<nav aria-label="フッターメニュー"/.test(html),
  'centered social links appear above the footer navigation');
ok(/\.site-footer\s*\{[^}]*justify-items:\s*center[^}]*text-align:\s*center/.test(css) && /\.site-footer__socials\s*\{[^}]*justify-content:\s*center/.test(css),
  'footer and social icons are horizontally centered');
ok(/\.sc-game-launcher\.is-raised\s*\{[^}]*opacity:\s*0[^}]*pointer-events:\s*none/.test(css),
  'fixed game launcher retreats without covering the footer navigation');

console.log(`V1.38 HOMEPAGE ALL ${pass} CHECKS PASSED`);
