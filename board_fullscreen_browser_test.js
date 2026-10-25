'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { G } = require('./battle_presentation_test');
const out = path.join(__dirname, 'output/board-fullscreen');
fs.mkdirSync(out, { recursive: true });

(async () => {
  let browser;
  try {
    await new Promise(resolve => G.server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + G.server.address().port;
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const r = G.makeFixtureRoom();
    r.code = 'FULLSCREEN'; r.pending = {}; r.turnTransition = null;
    G.rooms.set(r.code, r);
    await page.goto(base + '/play?guide=done');
    await page.evaluate(({ code, token }) => {
      $('titleOv').classList.remove('on');
      enterRoom(code, location.origin + '/phone?room=' + code, token);
    }, { code: r.code, token: r.boardToken });
    await page.waitForFunction(() => state?.catalog && PW.isReady());
    const button = page.locator('#boardFullscreenBtn');
    const checkLayout = async () => {
      assert(await button.isVisible());
      await page.screenshot({ path: path.join(out, 'latest.png') });
      assert(await page.locator('#utilityFooter').evaluate(e => {
        const box = e.getBoundingClientRect();
        return [...e.children].filter(c => c.getBoundingClientRect().width).every(c => {
          const b = c.getBoundingClientRect();
          return b.left >= box.left && b.right <= box.right && b.bottom <= innerHeight;
        });
      }), 'all footer controls fit: ' + JSON.stringify(await page.locator('#utilityFooter').evaluate(e => [e, ...e.children].map(c => ({ id: c.id, text: c.textContent, x: c.getBoundingClientRect().x, right: c.getBoundingClientRect().right })))));
      assert(await page.locator('#hud > :first-child').isVisible());
    };
    for (const [width, height] of [[1440, 900], [1920, 1080], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      await button.click();
      await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
      await page.waitForFunction(() => document.getElementById('boardFullscreenBtn').getAttribute('aria-pressed') === 'true');
      await checkLayout();
      await page.locator('#optBtn').click();
      assert(await page.locator('#soundPanel').isVisible(), 'settings remain usable in fullscreen');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('soundPanel').open);
      assert(await page.evaluate(() => !!document.fullscreenElement), 'dialog Escape closes only settings');
      await page.screenshot({ path: path.join(out, 'fullscreen-' + width + '.png') });
      await button.click();
      await page.waitForFunction(() => !document.fullscreenElement);
      assert.equal(await button.getAttribute('aria-pressed'), 'false');
      await checkLayout();
    }
    // Browser-driven exits (Esc/F11) must also update the button and camera.
    await button.click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => document.getElementById('boardFullscreenBtn').getAttribute('aria-pressed') === 'false');
    assert.equal(await button.innerText(), '全画面');
    // Rejected requests are recoverable on a subsequent user gesture.
    await page.route('**/board-fullscreen.js*', async route => {
      const body = fs.readFileSync(path.join(__dirname, 'public/board-fullscreen.js'), 'utf8');
      await route.fulfill({ contentType: 'application/javascript', body: 'window.realFullscreen = document.documentElement.requestFullscreen; window.rejectFullscreen = true; document.documentElement.requestFullscreen = async function(){ try { if(window.rejectFullscreen) throw new Error("denied"); return await window.realFullscreen.call(this); } catch(e){window.fullscreenError=e.message;throw e;} };\n' + body });
    });
    await page.goto(base + '/play?guide=done');
    await page.evaluate(({ code, token }) => {
      $('titleOv').classList.remove('on');
      enterRoom(code, location.origin + '/phone?room=' + code, token);
    }, { code: r.code, token: r.boardToken });
    await page.waitForFunction(() => state?.catalog && PW.isReady());
    await button.click();
    assert(await page.locator('#boardFullscreenStatus').isVisible());
    assert(await button.isEnabled());
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => { window.rejectFullscreen = false; });
    await page.waitForTimeout(1100);
    await button.click();
    await page.waitForFunction(() => !document.getElementById('boardFullscreenBtn').disabled);
    assert(await page.evaluate(() => !!document.fullscreenElement), await page.evaluate(() => window.fullscreenError));
    assert(await page.locator('#boardFullscreenStatus').isHidden());
    await button.click();
    const unsupported = await browser.newPage();
    await unsupported.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));
    await unsupported.goto(base + '/play?fixture=1&guide=done');
    await unsupported.waitForFunction(() => document.getElementById('boardFullscreenBtn').disabled);
    assert(await unsupported.locator('#boardFullscreenBtn').isDisabled());
    assert((await unsupported.locator('#boardFullscreenBtn').getAttribute('title')).includes('利用できません'));
    assert.deepEqual(errors, []);
    console.log('PASS board fullscreen: native enter/exit, external exit, 3 layouts, settings, failure retry and unsupported browser');
  } finally {
    await browser?.close();
    G.server.closeAllConnections(); G.server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
