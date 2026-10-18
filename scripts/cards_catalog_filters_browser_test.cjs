// Run against a local server: node scripts/cards_catalog_filters_browser_test.cjs [base URL]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.argv[2] || 'http://127.0.0.1:4370';
const output = path.resolve(__dirname, '../output/card-catalog-20261017-compact');
const selected = (group, value) => `[data-filter-group="${group}"] [data-filter-value="${value}"]`;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const catalog = await (await fetch(`${base}/api/catalog`)).json();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let debugPage;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    debugPage = page;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/cards`, { waitUntil: 'domcontentloaded' });
    await page.locator('.site-audio-gate [data-audio="off"]').click();
    const count = async expected => {
      await page.waitForFunction(value => document.querySelector('[data-result-count]').textContent === String(value), expected);
    };
    const reset = async () => {
      await page.locator('[type="reset"]').click();
      await count(catalog.cards.length);
    };
    const allRendered = async () => {
      for (let i = 0; i < 10; i++) {
        const before = await page.locator('[data-card-id]').count();
        await page.locator('[data-card-sentinel]').scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        if (await page.locator('[data-card-id]').count() === before) break;
      }
    };
    const assertForms = async evolved => {
      const actual = await page.locator('[data-card-id]').evaluateAll(hosts => hosts.map(host => ({
        id: host.dataset.cardId, name: host.querySelector('.catalog-card__caption b').textContent,
        evolved: host.querySelector('[data-evolution="evolution"]')?.getAttribute('aria-pressed') === 'true',
      })));
      for (const shown of actual) {
        const card = catalog.cards.find(item => item.id === shown.id);
        assert.equal(shown.evolved, evolved && !!card.evolution, card.id);
        assert.equal(shown.name, evolved && card.evolution ? card.evolution.name : card.name);
      }
    };
    await count(catalog.cards.length);
    assert.equal(await page.locator('.catalog-filter select').count(), 2);
    await page.locator(selected('element', 'fire')).click();
    await page.locator(selected('element', 'water')).click();
    const fireWater = catalog.cards.filter(card => ['fire', 'water'].includes(card.element));
    await count(fireWater.length);
    assert.equal(await page.locator(selected('element', 'fire')).getAttribute('aria-pressed'), 'true');
    await page.locator('[name="rarity"]').selectOption('N');
    await count(fireWater.filter(card => card.rarity === 'N').length);
    await page.locator('[name="rarity"]').selectOption('R');
    await count(fireWater.filter(card => card.rarity === 'R').length);
    await page.locator('[name="kind"]').selectOption('spell');
    await count(0);
    assert.equal(await page.locator('[data-catalog-state]').isVisible(), true);
    await page.locator('[name="kind"]').selectOption('creature');
    await count(fireWater.filter(card => card.rarity === 'R').length);
    await reset();
    assert.equal(await page.locator(selected('element', 'all')).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[name="kind"]').inputValue(), 'all');
    assert.equal(await page.locator('[name="rarity"]').inputValue(), 'all');

    // Bulk choices include cards loaded later and cards hidden by a filter.
    await page.locator(selected('element', 'fire')).click();
    await page.locator('[data-all-evolution="evolution"]').click();
    await assertForms(true);
    await reset();
    await allRendered();
    assert.equal(await page.locator('[data-card-id]').count(), catalog.cards.length);
    await assertForms(true);
    const card = catalog.cards.find(item => item.evolution);
    const host = page.locator(`[data-card-id="${card.id}"]`);
    await host.locator('[data-evolution="evolution"]').click();
    assert.equal(await host.locator('[data-evolution="base"]').getAttribute('aria-pressed'), 'true');
    await host.locator('[data-evolution="base"]').click();
    assert.equal(await host.locator('[data-evolution="evolution"]').getAttribute('aria-pressed'), 'true');
    await host.locator('[data-open-card]').click();
    await page.locator('[data-dialog-mode="evolution"]').click();
    assert.equal(await page.locator('[data-dialog-name]').textContent(), card.name);
    await page.locator('[data-dialog-mode="base"]').click();
    assert.equal(await page.locator('[data-dialog-name]').textContent(), card.evolution.name);
    assert.equal(new URL(page.url()).searchParams.get('evolved'), '1');
    await page.keyboard.press('Escape');
    assert.equal(await host.locator('[data-evolution="evolution"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await host.locator('[data-open-card]').evaluate(el => el === document.activeElement), true);

    await page.locator('[data-all-evolution="base"]').click();
    await assertForms(false);
    await page.locator('[name="query"]').fill(card.evolution.name);
    await count(catalog.cards.filter(item => `${item.name}${item.effect}${item.evolution?.name || ''}${item.evolution?.effect || ''}`.includes(card.evolution.name)).length);
    await host.locator('[data-evolution="base"]').click();
    assert.equal(await host.locator('[data-evolution="evolution"]').getAttribute('aria-pressed'), 'true');
    await host.locator('[data-evolution="evolution"]').click();
    assert.equal(await host.locator('[data-evolution="base"]').getAttribute('aria-pressed'), 'true');
    await reset();

    // Inspect colors, actual masks, layout, and touch controls across representative widths.
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.mouse.move(0, 0);
      await page.locator(selected('element', 'fire')).click();
      await page.locator(selected('element', 'water')).click();
      await page.locator('[data-filter-form]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        filterHeight: document.querySelector('[data-filter-form]').getBoundingClientRect().height,
        selectedShadow: getComputedStyle(document.querySelector('[data-filter-value="fire"]')).boxShadow,
        icons: [...document.querySelectorAll('.catalog-element')].map(el => ({ color: getComputedStyle(el).backgroundColor, mask: getComputedStyle(el).maskImage })),
        smallTargets: [...document.querySelectorAll('.catalog-filter button, .catalog-filter select, .catalog-evolution button')].filter(el => el.getBoundingClientRect().height < 44).length,
      }));
      assert.equal(layout.overflow, false, `horizontal overflow at ${size.width}`);
      assert.equal(layout.smallTargets, 0, `touch targets at ${size.width}`);
      assert.equal(layout.selectedShadow, 'none');
      assert.ok(layout.filterHeight < (size.width >= 1000 ? 150 : 340), `compact filters at ${size.width}: ${layout.filterHeight}`);
      console.log(`${size.width}px: filter height ${Math.round(layout.filterHeight)}px, no overflow.`);
      assert.equal(new Set(layout.icons.map(icon => icon.color)).size, 5);
      assert.ok(layout.icons.every(icon => icon.mask.includes('element-')));
      for (const icon of layout.icons) {
        const response = await fetch(JSON.parse(icon.mask.slice(4, -1)));
        assert.equal(response.ok, true, icon.mask);
        assert.ok((await response.text()).includes('<svg'), icon.mask);
      }
      if (size.width === 1440) await page.locator('[data-filter-form]').screenshot({ path: path.join(output, 'filters-desktop.png') });
      await page.screenshot({ path: path.join(output, `cards-${size.width}.png`), fullPage: size.width >= 1000 });
      await reset();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const firstCard = page.locator('[data-card-id]').first();
    await firstCard.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    const original = await firstCard.locator('.game-card').boundingBox();
    await firstCard.locator('[data-open-card]').hover();
    await page.waitForTimeout(450);
    const enlarged = await firstCard.locator('.game-card').boundingBox();
    assert.ok(enlarged.width > original.width * 1.39, 'card smoothly enlarges on hover');
    assert.ok(Math.abs(enlarged.y + enlarged.height - original.y - original.height) < 1, 'card bottom stays clear of its controls');
    assert.equal(await firstCard.evaluate(el => getComputedStyle(el).zIndex), '30');
    await page.screenshot({ path: path.join(output, 'cards-hover.png') });
    await page.mouse.move(0, 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator(selected('element', 'fire')).click();
    assert.equal(await page.locator('[data-card-grid]').evaluate(el => el.getAnimations().length), 0);
    await page.goto(`${base}/cards?card=${card.id}&evolved=1`);
    await page.locator('dialog[open]').waitFor();
    assert.equal(await page.locator('[data-dialog-name]').textContent(), card.evolution.name);
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await phone.goto(`${base}/cards#catalog`);
    await phone.locator('.site-audio-gate [data-audio="off"]').click();
    await phone.locator('[data-card-id]').first().waitFor();
    await phone.locator('[data-open-card]').first().hover();
    assert.equal(await phone.locator('.catalog-card .game-card').first().evaluate(el => getComputedStyle(el).transform), 'none', 'touch devices do not retain hover enlargement');
    await phone.locator('[data-filter-form]').scrollIntoViewIfNeeded();
    await phone.screenshot({ path: path.join(output, 'cards-phone-touch.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: multi-select attributes, dropdown/search combinations, reset, bulk/lazy forms, either-side toggle, modal/deep link/focus, compact layout, flat selection, hover scale and reduced motion.');
    console.log(`Screenshots: ${output}`);
  } catch (error) {
    console.log(await debugPage.evaluate(() => {
      const el = document.querySelector('[data-evolution="base"]');
      if (!el) return { url: location.href };
      const r = el.getBoundingClientRect();
      return { url: location.href, target: r.toJSON(), hits: document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2).slice(0, 6).map(item => item.className) };
    }));
    await debugPage.screenshot({ path: path.join(output, 'failure.png') });
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
