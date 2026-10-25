'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { loadGame, lobby:makeLobby } = require('./mixed_bot_test');
const G=loadGame(setTimeout),lobby=(n,mode)=>makeLobby(n,mode,G);
const out = path.join(__dirname, 'output/mixed-bot'); fs.mkdirSync(out, { recursive: true });
(async () => {
  let browser;
  try {
    await new Promise(resolve => G.server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + G.server.address().port;
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
    const errors = [], page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    async function enter(r) {
      await page.goto(base + '/play?guide=done');
      await page.evaluate(({ code, token }) => { $('titleOv').classList.remove('on'); enterRoom(code, location.origin + '/phone?room=' + code, token); }, { code: r.code, token: r.boardToken });
      await page.waitForFunction(code => state?.code === code && state.phase === 'lobby', r.code);
    }
    async function join(r, name) {
      const res = await fetch(base + '/api/join', { method: 'POST', body: JSON.stringify({ room: r.code, name }) });
      assert.equal(res.status, 200); return res.json();
    }
    const dialog = page.locator('#botFillDialog');
    for (const [n, width, height] of [[2, 1440, 900], [3, 1024, 768]]) {
      const r = lobby(n); await page.setViewportSize({ width, height }); await enter(r);
      await page.locator('#startBtn').click();
      assert.equal(await page.locator('#botFillCopy').innerText(), `BOTを${4 - n}体追加すると、4人で遊べます。`);
      for (const action of ['botFillBack', 'botFillClose', 'Escape']) {
        if (action === 'Escape') await page.keyboard.press('Escape'); else await page.locator('#' + action).click();
        assert(!await dialog.isVisible()); assert.equal(r.phase, 'lobby'); assert.equal(r.players.length, n);
        await page.locator('#startBtn').click();
      }
      assert(await dialog.evaluate(e => { const b = e.getBoundingClientRect(); return b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; }));
      await page.screenshot({ path: path.join(out, 'confirm-' + n + '-humans.png') });
      await page.locator('#botFillYes').click();
      await page.waitForFunction(() => state?.phase === 'select');
      assert(!await dialog.isVisible()); assert.equal(r.players.filter(p => p.isBot).length, 4 - n);
      const used = new Set();
      for (const human of r.players.filter(p => !p.isBot)) {
        const pd = r.pending[human.id], option = pd.options.find(o => !used.has(o.id)); used.add(option.id);
        const response = await fetch(base + '/api/action', { method: 'POST', body: JSON.stringify({ room: r.code, type: 'choose', playerId: human.id, optionId: option.id, promptId: pd.promptId, turnEpoch: pd.turnEpoch, actionId: 'mixed-' + human.id }) });
        assert.equal(response.status, 200);
      }
      await page.waitForFunction(() => state.selectionReady);
      assert.equal(new Set(r.players.map(p => p.charId)).size, 4);
      await page.evaluate(() => { window.matchStartEvents = []; window.SummonsAnalytics = { trackOnce: (key, event, data) => window.matchStartEvents.push({ event, ...data }) }; });
      await page.locator('#selectionStartBtn').click();
      await page.waitForFunction(() => state.phase === 'playing');
      await page.waitForFunction(() => window.matchStartEvents.length > 0);
      const events = await page.evaluate(() => window.matchStartEvents);
      assert.equal(events.at(-1).event, 'match_started'); assert.equal(events.at(-1).bot_count, 4 - n);
      assert.equal(events.at(-1).match_type, 'multiplayer');
    }
    // Changes while the dialog is open stay live and never start a match implicitly.
    const changing = lobby(2); await enter(changing); await page.locator('#startBtn').click();
    await join(changing, '3人目'); await page.waitForFunction(() => document.getElementById('botFillCopy').textContent.includes('BOTを1体'));
    assert.equal(changing.phase, 'lobby');
    await join(changing, '4人目'); await page.waitForFunction(() => document.getElementById('botFillYes').hidden);
    assert.equal(await page.locator('#botFillNo').innerText(), 'キャラ選択へ');
    await page.locator('#botFillNo').click(); await page.waitForFunction(() => state.phase === 'select');
    assert.equal(changing.players.filter(p => p.isBot).length, 0);
    for (const n of [2, 3, 4]) {
      const r = lobby(n); await enter(r); await page.locator('#startBtn').click();
      if (n < 4) await page.locator('#botFillNo').click();
      await page.waitForFunction(() => state.phase === 'select'); assert.equal(r.players.length, n); assert(!r.botMode);
    }
    const single = lobby(1, 'bot'); await enter(single); await page.locator('#startBtn').click();
    await page.waitForFunction(() => state.phase === 'select'); assert(!await dialog.isVisible()); assert.equal(single.players.length, 4);
    // A rejected connection keeps the same choice available; repeated input sends only one request.
    const retry = lobby(2); await enter(retry); await page.locator('#startBtn').click();
    let release, requests = 0;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/action', async route => { requests++; await gate; await route.abort('failed'); });
    await page.locator('#botFillYes').click();
    await page.evaluate(() => { document.getElementById('botFillYes').click(); BoardBotFill.start(); });
    assert(await page.locator('#botFillNo').isDisabled()); assert(await page.locator('#botFillClose').isDisabled());
    await page.keyboard.press('Escape'); assert(await dialog.isVisible());
    release(); await page.waitForFunction(() => !document.getElementById('botFillError').hidden);
    assert.equal(requests, 1); assert.equal(retry.phase, 'lobby'); assert(await page.locator('#botFillYes').isEnabled());
    await page.unroute('**/api/action');
    await page.locator('#botFillYes').click(); await page.waitForFunction(() => state.phase === 'select');
    // Native fullscreen retains the dialog in the document's top layer.
    const full = lobby(2); await enter(full);
    await page.locator('#startBtn').evaluate(e => e.addEventListener('click', () => document.documentElement.requestFullscreen(), { once: true }));
    await page.locator('#startBtn').click(); await page.waitForFunction(() => !!document.fullscreenElement);
    assert(await dialog.isVisible()); await page.screenshot({ path: path.join(out, 'confirm-fullscreen.png') });
    await page.locator('#botFillNo').click(); await page.waitForFunction(() => state.phase === 'select');
    await page.evaluate(() => document.exitFullscreen());
    const phone = await browser.newPage({ viewport: { width: 844, height: 390 } });
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(base + '/phone?fixture=result&guide=done'); await phone.waitForSelector('.myResultCard');
    for (const [width, height] of [[844, 390], [667, 375]]) {
      await phone.setViewportSize({ width, height });
      assert.equal(await phone.locator('.myTurning').count(), 0); assert(!(await phone.locator('#resList').innerText()).includes('転換点'));
      assert(await phone.locator('.myResultStats').isVisible()); assert.equal(await phone.locator('.myResultBreak b').count(), 3);
      assert(await phone.locator('.myResultCard').evaluate(e => { const b = e.getBoundingClientRect(); return b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; }));
      await phone.screenshot({ path: path.join(out, 'phone-result-' + width + '.png') });
    }
    assert.deepEqual(errors, []);
    console.log('PASS actual board/phone: BOT fill, all-human/single modes, selection/start, cancel, live join, failure/retry/double input, fullscreen and phone result');
  } finally { await browser?.close(); for(const r of G.rooms.values()){G.clearBotTimer(r);G.clearSelectionDrawTimer(r);G.clearUltTimer(r);G.clearTurnTransitionTimer(r);clearTimeout(r.windSupplyTimer);}G.server.closeAllConnections(); G.server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
