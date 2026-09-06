// Render the real, unoccupied Phaser board. No production rooms or artwork edits.
// NODE_PATH must contain Playwright and sharp; Chrome must be installed.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { createRequire } = require('module');
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval', source + '\nreturn {server,makeRoom,publicState,MAPS};')(createRequire(path.join(root, 'server.js')), root, process, console, () => {});
const out = path.join(root, 'output', 'map-previews');
const assets = path.join(root, 'public', 'assets', 'maps');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => G.server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
    const base = 'http://127.0.0.1:' + G.server.address().port;
    for (const map of Object.values(G.MAPS)) {
      const page = await browser.newPage({viewport:{width:1280, height:720}, deviceScaleFactor:1});
      // Capture-only page: keep the idle camera watchdog from restoring the HUD framing.
      await page.addInitScript(() => {window.setInterval=()=>0;});
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/play');
      await page.waitForFunction(() => PW.isReady());
      // Only the real board and its selected background enter the screenshot.
      await page.addStyleTag({content:'body > :not(#phaserHost){display:none!important} #phaserHost{left:0!important;top:0!important;right:0!important;bottom:0!important;transition:none!important}'});
      const st = G.publicState(G.makeRoom('normal', map.id));
      await page.evaluate(st => {state=st; syncSelectedMap(); PW.syncBoard(state);}, st);
      const facilities = map.tiles.filter(t => t.t !== 'land').length;
      const expected = map.tiles.length + facilities * 2; // Each building has a shadow.
      await page.waitForFunction(n => PW.debugCounts().boardObjs === n, expected);
      await page.evaluate(async background => {
        const img = new Image(); img.src = background; await img.decode();
        const scene = PW._debugScene();
        scene.game.scale.resize(1280,720);
        const bounds = scene.children.list.filter(o => o.type === 'Image').map(o => o.getBounds());
        const left = Math.min(...bounds.map(b=>b.left)), right = Math.max(...bounds.map(b=>b.right));
        const top = Math.min(...bounds.map(b=>b.top)), bottom = Math.max(...bounds.map(b=>b.bottom));
        const cam = scene.cameras.main;
        cam.setZoom(Math.min(1200/(right-left),640/(bottom-top)));
        cam.centerOn((left+right)/2,(top+bottom)/2);
      }, map.background);
      await page.waitForTimeout(250);
      const fits = await page.evaluate(() => PW._debugScene().children.list.filter(o=>o.type==='Image').every(o=>{
        const b=o.getBounds(), a=PW.worldToViewport(b.left,b.top), z=PW.worldToViewport(b.right,b.bottom);
        return a.x>=0 && a.y>=0 && z.x<=innerWidth && z.y<=innerHeight;
      }));
      assert.ok(fits, 'all tiles and buildings fit inside thumbnail');
      const png = await page.screenshot({path:path.join(out, map.id+'.png')});
      const filename = map.id.replaceAll('_','-')+'-preview-v2.webp';
      await sharp(png).resize(960,540).webp({quality:88}).toFile(path.join(assets, filename));
      assert.deepEqual(errors, [], 'no renderer errors');
      console.log(`${filename}: ${map.tiles.length} tiles, ${facilities} facilities`);
      await page.close();
    }
    const page = await browser.newPage({viewport:{width:1280,height:720}});
    await page.goto(base+'/play'); await page.locator('#titleCreate').click();
    await page.locator('.mapSelectCard img').evaluateAll(imgs => Promise.all(imgs.map(i=>i.decode())));
    for(const [width,height] of [[1280,720],[1920,1080],[667,375]]) {
      await page.setViewportSize({width,height});
      await page.screenshot({path:path.join(out,`selection-${width}.png`)});
      assert.equal(await page.locator('.mapSelectCard img').count(),2);
      await page.locator('#mapSelectCreate').scrollIntoViewIfNeeded();
      const button = await page.locator('#mapSelectCreate').boundingBox();
      assert.ok(button.y>=0 && button.y+button.height<=height,'create remains reachable by scrolling');
    }
  } finally {
    if(browser) await browser.close();
    G.server.closeAllConnections(); await new Promise(resolve=>G.server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
