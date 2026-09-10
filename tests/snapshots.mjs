import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildRoommap } from '../src/build-roommap3.mjs';
import { snapshotIdentity } from '../src/snapshots.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempParent = path.resolve(os.tmpdir());
const root = fs.mkdtempSync(path.join(tempParent, 'roommap-snapshots-test-'));
let browser, server;
try {
  fs.mkdirSync(path.join(root, 'data'));
  fs.mkdirSync(path.join(root, 'vendor'));
  const fixture = JSON.parse(fs.readFileSync(path.join(repository, 'data/roommap3.json'), 'utf8'));
  delete fixture.observation;
  const source = JSON.stringify(fixture);
  const mapFile = path.join(root, 'data/roommap3.json');
  fs.writeFileSync(mapFile, source);
  fs.copyFileSync(path.join(repository, 'vendor/3d-force-graph.min.js'), path.join(root, 'vendor/3d-force-graph.min.js'));
  const first = buildRoommap(root);
  assert.equal(first.observation, null);
  assert(first.id.startsWith('undated-'));
  const firstDir = path.join(root, 'snapshots', first.id);
  const preserved = Object.fromEntries(fs.readdirSync(firstDir).map(name => [name, fs.readFileSync(path.join(firstDir, name))]));
  assert(preserved['roommap3.json'].equals(Buffer.from(source)));

  const newer = JSON.parse(source);
  newer.observation = { startedAt: '2026-09-06T01:00:00.000Z', completedAt: '2026-09-06T01:05:00.000Z' };
  newer.rooms = newer.rooms.filter(room => room.name !== 'kibble');
  newer.rooms.find(room => room.name === 'events').topic = '<img src=x onerror="window.__injected=1">';
  newer.links = newer.links.filter(link => link.source !== 'kibble' && link.target !== 'kibble');
  newer.counts.rooms = newer.rooms.length;
  newer.counts.links = newer.links.length;
  fs.writeFileSync(mapFile, JSON.stringify(newer));
  const second = buildRoommap(root);
  assert.notEqual(second.id, first.id);
  assert(second.id.startsWith('20260906T010500000Z-'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'roommap.data.json'))).rooms.some(room => room.name === 'kibble'), false);
  assert.equal(JSON.parse(preserved['roommap.data.json']).rooms.some(room => room.name === 'kibble'), true);
  for (const [name, bytes] of Object.entries(preserved)) assert(bytes.equals(fs.readFileSync(path.join(firstDir, name))));
  const sameTime = structuredClone(newer);
  sameTime.rooms[0].agents += 1;
  assert.notEqual(snapshotIdentity(JSON.stringify(sameTime)).id, second.id);
  assert.throws(() => snapshotIdentity(JSON.stringify({ observation: { startedAt: 'bad', completedAt: 'bad' } })), /timestamps/);
  assert.throws(() => snapshotIdentity(JSON.stringify({ observation: { startedAt: newer.observation.completedAt, completedAt: newer.observation.startedAt } })), /reversed/);

  // A renderer upgrade must only change the latest page, never an existing archive.
  const secondDir = path.join(root, 'snapshots', second.id);
  const secondHtml = fs.readFileSync(path.join(secondDir, 'index.html'));
  fs.appendFileSync(path.join(root, 'vendor/3d-force-graph.min.js'), '\n/* renderer revision fixture */\n');
  buildRoommap(root);
  assert(secondHtml.equals(fs.readFileSync(path.join(secondDir, 'index.html'))));
  assert(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('renderer revision fixture'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'snapshots/index.json'))).snapshots.length, 2);
  console.log('PASS: old data/renderer preserved, removed room retained in archive, same-time uniqueness, observation validation, idempotent builds');

  if (process.argv.includes('--browser')) {
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
    server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const target = path.resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
      if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', target.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/json');
      res.end(fs.readFileSync(target));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; } } }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '?room=kibble');
    assert((await page.locator('#notice').textContent()).includes('ありません'));
    assert((await page.locator('#observation').textContent()).includes(newer.observation.completedAt));
    const fixed = base + 'snapshots/' + first.id + '/?room=kibble';
    await page.goto(fixed);
    await page.waitForFunction(() => focus === 'kibble' && pendingCamera === null);
    assert.equal(await page.locator('#i-lbl').textContent(), '#kibble');
    assert((await page.locator('#observation').textContent()).includes('観測日時不明'));
    await page.locator('#share').click();
    assert.equal(await page.evaluate(() => window.copied), fixed);
    assert.equal(await page.locator('#fixed-link').getAttribute('href'), fixed);
    assert.equal(await page.locator('#latest-link').getAttribute('href'), base + '?room=kibble');
    const oldJSON = await context.request.get(base + 'snapshots/' + first.id + '/roommap.data.json');
    assert((await oldJSON.json()).rooms.some(room => room.name === 'kibble'));
    await page.reload();
    assert.equal(await page.locator('#i-lbl').textContent(), '#kibble');
    await page.locator('#latest-link').click();
    assert((await page.locator('#notice').textContent()).includes('ありません'));
    await page.goBack();
    assert.equal(await page.locator('#i-lbl').textContent(), '#kibble');
    await page.locator('#archives-link').click();
    assert.equal(await page.locator('li a').count(), 2);
    await page.locator('li a').last().click();
    await page.waitForFunction(() => typeof window.__ready === 'function');
    assert.equal(await page.evaluate(() => SNAPSHOT.id), first.id);
    await page.goto(base + 'snapshots/' + second.id + '/?room=events');
    await page.waitForFunction(() => focus === 'events' && pendingCamera === null);
    assert.equal(await page.locator('#i-meta img').count(), 0);
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForFunction(() => focus === 'events' && pendingCamera === null);
    const point = await page.evaluate(() => { const n = nodeById.get('events'); return Graph.graph2ScreenCoords(n.x, n.y, n.z); });
    assert(point.x > 0 && point.x < 390 && point.y > 0 && point.y < 844);
    await page.locator('#lang').click();
    assert((await page.locator('#observation').textContent()).includes('Observed (UTC)'));
    for (const id of ['#latest-link', '#share']) {
      const box = await page.locator(id).boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
    }
    if (process.env.ROOMMAP_SCREENSHOTS) {
      fs.mkdirSync(process.env.ROOMMAP_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.ROOMMAP_SCREENSHOTS, 'roommap-snapshot-mobile.png') });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(fixed);
      await page.waitForFunction(() => focus === 'kibble' && pendingCamera === null);
      await page.screenshot({ path: path.join(process.env.ROOMMAP_SCREENSHOTS, 'roommap-snapshot-desktop.png') });
    }
    const missing = await context.request.get(base + 'snapshots/unknown/?room=kibble');
    assert.equal(missing.status(), 404);
    assert.deepEqual(errors, []);
    console.log('PASS: old room opens after update, reload, fixed copy, latest navigation, archive list, archive JSON, mobile, missing archive 404');
  }

  // Exercise the real refresh entry point with a failed fetch, without network access.
  const fixtureSource = path.join(root, 'src');
  fs.mkdirSync(fixtureSource);
  for (const name of ['build-roommap3.mjs', 'build-aidata.mjs', 'snapshots.mjs', 'update-roommap.mjs']) {
    fs.copyFileSync(path.join(repository, 'src', name), path.join(fixtureSource, name));
  }
  const inputBeforeFailure = fs.readFileSync(mapFile);
  for (const failure of ['process.exit(1)', 'console.log("invalid JSON")']) {
    fs.writeFileSync(path.join(fixtureSource, 'fetch-rooms3.mjs'), failure);
    assert.throws(() => execFileSync(process.execPath, [path.join(fixtureSource, 'update-roommap.mjs')], { stdio: 'pipe', windowsHide: true }));
    assert(inputBeforeFailure.equals(fs.readFileSync(mapFile)));
  }
  console.log('PASS: failed/malformed fetch preserves previous input through actual update command');

  const latestBeforeCorruption = fs.readFileSync(path.join(root, 'index.html'));
  fs.appendFileSync(path.join(firstDir, 'roommap.data.json'), 'corruption fixture');
  assert.throws(() => buildRoommap(root), /integrity check failed/);
  assert(latestBeforeCorruption.equals(fs.readFileSync(path.join(root, 'index.html'))));
  console.log('PASS: damaged archive stops build without replacing latest page');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (path.dirname(path.resolve(root)) === tempParent && path.basename(root).startsWith('roommap-snapshots-test-')) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
