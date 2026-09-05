'use strict';

// Run with Playwright installed, or PLAYWRIGHT_MODULE pointing to its package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { createHash } = require('node:crypto');
const dataHash = createHash('sha256').update(fs.readFileSync(path.join(root, 'data/roommap3.json'))).digest('hex');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'snapshots/index.json'))).snapshots.find(item => item.dataSha256 === dataHash);
assert(snapshot, 'Build the snapshot archive before running browser checks.');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);

const server = http.createServer((req, res) => {
  if (!['/', '/index.html'].includes(new URL(req.url, 'http://localhost').pathname)) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const fixed = base + 'snapshots/' + snapshot.id + '/?room=kibble';
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 900 } });
    // Exercise both clipboard outcomes without changing the user's clipboard.
    await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => {
        if (window.rejectCopy) throw new Error('Clipboard denied');
        window.copiedMapLink = text;
      } }
    }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?room=k%69bble&source=test#keep');
    await page.waitForFunction(() => focus === 'kibble' && pendingCamera === null && layoutTicks >= 90);
    assert.equal(await page.locator('#i-lbl').textContent(), '#kibble');
    assert.equal(await page.locator('#info').isVisible(), true);
    assert.equal(await page.evaluate(() => spinning), false);
    await page.waitForFunction(() => window.__ready());
    assert.equal(await page.evaluate(() => focus), 'kibble');
    const projected = await page.evaluate(() => {
      const n = nodeById.get('kibble'); return Graph.graph2ScreenCoords(n.x, n.y, n.z);
    });
    assert(projected.x > 0 && projected.x < 1280 && projected.y > 0 && projected.y < 900);
    await page.locator('#share').click();
    assert.equal(await page.evaluate(() => window.copiedMapLink), fixed);
    assert.equal(await page.locator('#share-status').textContent(), 'コピーしました');
    await page.evaluate(() => { window.rejectCopy = true; });
    await page.locator('#share').click();
    assert.equal(await page.locator('#share-url').inputValue(), fixed);
    assert.equal(await page.locator('#share-url').isVisible(), true);
    console.log('PASS: direct selection, camera, clean sharing, clipboard fallback');

    const startHistory = await page.evaluate(() => history.length);
    await page.locator('#q').fill('events');
    await page.locator('#q').press('Enter');
    assert.equal(await page.evaluate(() => focus), 'events');
    assert.equal(new URL(page.url()).searchParams.get('source'), 'test');
    assert.equal(new URL(page.url()).hash, '#keep');
    assert.equal(await page.evaluate(() => history.length), startHistory);
    assert.equal(await page.locator('#share-url').isVisible(), false);
    await page.reload();
    await page.waitForFunction(() => focus === 'events' && pendingCamera === null);
    assert.equal(await page.locator('#i-lbl').textContent(), '#events');
    // Tiny/isolated room labels must be visible after selection, too.
    assert.equal(await page.evaluate(() => labelEls.has(nodeById.get('events'))), true);

    // Invoke the graph's registered handlers to exercise toggle/background paths.
    await page.evaluate(() => Graph.onNodeClick()(nodeById.get('events')));
    assert.equal(await page.evaluate(() => focus), null);
    assert.equal(await page.locator('#info').isVisible(), false);
    assert.equal(new URL(page.url()).searchParams.has('room'), false);
    await page.locator('#q').fill('kibble');
    await page.locator('#q').press('Enter');
    await page.evaluate(() => Graph.onBackgroundClick()());
    assert.equal(await page.locator('#info').isVisible(), false);
    assert.equal(await page.evaluate(() => focus), null);
    await page.evaluate(() => {
      history.pushState({}, '', '?room=kibble');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    assert.equal(await page.evaluate(() => focus), 'kibble');
    await page.goBack();
    await page.waitForFunction(() => focus === null);
    console.log('PASS: search, reload, toggle, clear, URL preservation, history restore');

    for (const [query, expected] of [
      ['?room=not-in-this-snapshot', 'missing'],
      ['?room=kibble&room=events', 'invalid'],
      ['?room=%ZZ', 'invalid'],
      ['?room=', null]
    ]) {
      await page.goto(base + query);
      await page.waitForFunction(() => typeof window.__ready === 'function');
      assert.equal(await page.evaluate(() => focus), null);
      assert.equal(await page.evaluate(() => notice?.kind || null), expected);
      assert.equal(await page.locator('#info').isVisible(), false);
    }
    await page.goto(base + '?room=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
    assert.equal(await page.locator('#notice img').count(), 0);
    assert((await page.locator('#notice').textContent()).includes('<img'));

    await page.goto(base + '?room=kibble');
    await page.evaluate(() => document.getElementById('graph').dispatchEvent(new Event('pointerdown')));
    await page.waitForFunction(() => layoutTicks >= 95);
    assert.equal(await page.evaluate(() => pendingCamera), null);
    assert.equal(await page.evaluate(() => focus), 'kibble');
    await page.evaluate(() => { window.__orbit(0.7); window.__focus('events'); });
    assert.equal(await page.evaluate(() => focus), 'events');
    assert.equal(new URL(page.url()).searchParams.get('room'), 'kibble');
    await page.evaluate(() => window.__focus(null));
    assert.equal(await page.locator('#info').isVisible(), false);
    console.log('PASS: invalid/missing links, user cancellation, capture hooks');

    await page.goto(base);
    await page.waitForFunction(() => window.__ready());
    assert.equal(await page.evaluate(() => spinning), true);
    assert.equal(await page.evaluate(() => focus), null);
    await page.goto(base + '?room=kibble');
    await page.waitForFunction(() => pendingCamera === null && layoutTicks >= 90);
    if (process.env.ROOMMAP_SCREENSHOTS) {
      fs.mkdirSync(process.env.ROOMMAP_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.ROOMMAP_SCREENSHOTS, 'roommap-kibble-desktop.png') });
    }
    const mobileContext = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 } });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(base + '?room=kibble');
    await mobile.waitForFunction(() => pendingCamera === null && layoutTicks >= 90);
    assert.equal(await mobile.locator('#share').textContent(), 'Copy fixed room link');
    const box = await mobile.locator('#share').boundingBox();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
    await mobile.locator('#lang').click();
    assert.equal(await mobile.locator('#share').textContent(), 'この時点の部屋リンクをコピー');
    assert.equal(await mobile.locator('#i-lbl').textContent(), '#kibble');
    if (process.env.ROOMMAP_SCREENSHOTS) {
      await mobile.screenshot({ path: path.join(process.env.ROOMMAP_SCREENSHOTS, 'roommap-kibble-mobile.png') });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: normal overview, desktop/mobile, Japanese/English, no page errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
