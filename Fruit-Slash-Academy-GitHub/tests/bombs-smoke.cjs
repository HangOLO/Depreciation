// Optional browser verification: node tests/bombs-smoke.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium, launchOptions } = require('./browser-runtime.cjs');
const root = path.resolve(__dirname, '..');
const reports = [], errors = [], external = [];
let activeBrowser;
const ok = name => { reports.push(name); console.log('PASS:', name); };
const reportPath = path.join(root, 'tests/bombs-results.json');
function writeReport(failure) {
  fs.writeFileSync(reportPath, JSON.stringify({
    passed: reports.length, checks: reports, errors,
    externalRequests: external, ...(failure ? { failure: String(failure) } : {})
  }, null, 2));
}

(async () => {
  const browser = await chromium.launch(launchOptions); activeBrowser = browser;
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, deviceScaleFactor: 2 });
  // Sound is disabled so random audio noise cannot perturb this repeatable seed.
  await context.addInitScript(() => {
    let seed = 7013;
    Math.random = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    localStorage.setItem('fruit-slash-academy-v1', JSON.stringify({ settings: { duration: 20, sound: false } }));
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.clock.install({ time: new Date('2026-10-13T04:00:00Z') });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.clock.pauseAt(new Date('2026-10-13T04:00:01Z'));
  const snapshot = () => page.evaluate(() => FruitSlash.snapshot());
  const advance = ms => page.clock.runFor(ms);
  const bounds = await page.locator('#gameCanvas').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect(); return { width: rect.width, height: rect.height };
  });
  async function pointer(event, point, id = 1, type = 'mouse') {
    await page.evaluate(({ event, point, id, type }) => {
      const canvas = document.getElementById('gameCanvas'), rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent(event, {
        bubbles: true, pointerId: id, pointerType: type,
        buttons: event === 'pointerup' ? 0 : 1, button: 0,
        clientX: rect.left + point.x, clientY: rect.top + point.y, isPrimary: true
      }));
    }, { event, point, id, type });
  }
  async function stroke(points, id = 1, type = 'mouse') {
    await pointer('pointerdown', points[0], id, type);
    for (const point of points.slice(1)) await pointer('pointermove', point, id, type);
    await pointer('pointerup', points.at(-1), id, type);
  }
  function segmentDistance(object, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((object.x - a.x) * dx + (object.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(object.x - a.x - t * dx, object.y - a.y - t * dy);
  }
  function cutPoints(object) {
    return [{ x: object.x - object.r * 1.25, y: object.y }, { x: object.x + object.r * 1.25, y: object.y }];
  }
  function inside(object) {
    return object.x - object.r * 1.4 > 4 && object.x + object.r * 1.4 < bounds.width - 4 &&
      object.y - object.r * 1.4 > 4 && object.y + object.r * 1.4 < bounds.height - 4;
  }
  function safeBomb(state) {
    return state.bombs.find(bomb => {
      if (!inside(bomb)) return false;
      const points = cutPoints(bomb);
      return !state.fruits.some(fruit => segmentDistance(fruit, ...points) < fruit.r * 1.5 + 6) &&
        !state.bombs.some(other => other.id !== bomb.id && segmentDistance(other, ...points) < other.r * 1.5 + 6);
    });
  }
  function safeFruit(state) {
    return state.fruits.find(fruit => {
      if (!inside(fruit)) return false;
      const points = cutPoints(fruit);
      return !state.bombs.some(bomb => segmentDistance(bomb, ...points) < bomb.r * 1.5 + 6);
    });
  }
  async function findBomb() {
    for (let step = 0; step < 90; step++) {
      const state = await snapshot();
      assert.ok(state.bombCount <= 2, 'At most two bombs may be on screen');
      const bomb = safeBomb(state);
      if (bomb) return { state, bomb };
      assert.ok(state.elapsed < 18, 'The test must find a bomb before the round ends');
      await advance(80);
    }
    assert.fail('No isolated visible bomb appeared under the deterministic seed');
  }

  await page.locator('button[data-mode="free"]').click();
  // Canvas dimensions are only final once the play screen is visible.
  Object.assign(bounds, await page.locator('#gameCanvas').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect(); return { width: rect.width, height: rect.height };
  }));
  await advance(3050);
  assert.equal((await snapshot()).bombCount, 0);
  await advance(2300);
  assert.ok((await snapshot()).elapsed < 2.5);
  assert.equal((await snapshot()).bombCount, 0);
  ok('Bombs wait until the opening 2.5-second practice period has elapsed');

  // Build a positive score with individual short strokes, avoiding all bomb bodies.
  for (let step = 0; (await snapshot()).score < 70 && step < 100; step++) {
    const state = await snapshot(), fruit = safeFruit(state);
    assert.ok(state.bombCount <= 2);
    if (fruit) await stroke(cutPoints(fruit), 2);
    else await advance(70);
  }
  assert.ok((await snapshot()).score >= 70, 'Collect fruit before checking the exact bomb penalty');
  let scene = await findBomb();
  assert.ok(scene.state.bombCount > 0);
  assert.ok(scene.state.bombCount <= 2);
  await page.screenshot({ path: path.join(root, 'tests/bombs-play.png') });
  ok('Free play spawns visible bombs and caps the active bombs at two');

  await stroke([{ x: scene.bomb.x, y: scene.bomb.y }], 3);
  let state = await snapshot();
  assert.equal(state.score, scene.state.score);
  assert.equal(state.bombHits, 0);
  assert.ok(state.bombs.some(bomb => bomb.id === scene.bomb.id));
  ok('A click on a bomb does not count as a slice or explode it');

  await page.locator('#pauseBtn').click();
  const frozenBombs = await snapshot();
  await advance(4000);
  state = await snapshot();
  assert.equal(state.elapsed, frozenBombs.elapsed);
  assert.deepEqual(state.bombs, frozenBombs.bombs);
  assert.equal(state.stun, frozenBombs.stun);
  await page.locator('#resumeBtn').click();
  await advance(120);
  assert.ok((await snapshot()).elapsed > frozenBombs.elapsed);
  ok('Pause freezes bomb positions and the round timer, then resume continues them');

  scene = await findBomb();
  const points = cutPoints(scene.bomb), beforeHit = scene.state;
  await pointer('pointerdown', points[0], 4, 'pen');
  await pointer('pointermove', points[1], 4, 'pen');
  state = await snapshot();
  assert.equal(state.bombHits, 1);
  assert.equal(state.score, Math.max(0, beforeHit.score - 50));
  assert.equal(state.bombCount, beforeHit.bombCount - 1);
  assert.ok(!state.bombs.some(bomb => bomb.id === scene.bomb.id));
  assert.equal(state.halves, beforeHit.halves);
  assert.ok(state.particles > beforeHit.particles);
  assert.ok(state.stun > 0 && state.stun <= 0.65);
  const afterHitScore = state.score;
  // Repeat contact within the same gesture, then try fruit during and after the stun.
  await pointer('pointermove', points[0], 4, 'pen');
  let fruit = safeFruit(await snapshot());
  assert.ok(fruit, 'A visible fruit should be available for the blocked stroke');
  for (const point of cutPoints(fruit)) await pointer('pointermove', point, 4, 'pen');
  assert.equal((await snapshot()).score, afterHitScore);
  assert.equal((await snapshot()).bombHits, 1);
  await advance(750);
  assert.equal((await snapshot()).stun, 0);
  fruit = safeFruit(await snapshot());
  assert.ok(fruit, 'A visible fruit should remain after the brief stun');
  for (const point of cutPoints(fruit)) await pointer('pointermove', point, 4, 'pen');
  assert.equal((await snapshot()).score, afterHitScore);
  assert.equal((await snapshot()).bombHits, 1);
  await pointer('pointerup', cutPoints(fruit)[1], 4, 'pen');
  ok('One bomb hit deducts exactly 50 once, creates an explosion, and never creates fruit halves');
  ok('A bomb blocks the rest of its stroke, including after the stun expires');

  // A second penalty must clamp the score to zero rather than making it negative.
  assert.ok((await snapshot()).score < 50);
  scene = await findBomb();
  await stroke(cutPoints(scene.bomb), 5, 'touch');
  state = await snapshot();
  assert.equal(state.bombHits, 2);
  assert.equal(state.score, 0);
  assert.ok(state.stun > 0);
  fruit = safeFruit(state);
  assert.ok(fruit, 'A visible fruit should be available to test fresh input during stun');
  const stunnedHalves = state.halves, stunnedCombo = state.maxCombo;
  await stroke(cutPoints(fruit), 6, 'mouse');
  state = await snapshot();
  assert.equal(state.score, 0);
  assert.equal(state.halves, stunnedHalves);
  assert.equal(state.maxCombo, stunnedCombo);
  assert.equal(state.bombHits, 2);
  ok('Bomb penalties stop at zero and new pointer gestures are rejected during the stun');

  await page.locator('#pauseBtn').click();
  const frozenStun = await snapshot();
  await advance(3000);
  state = await snapshot();
  assert.equal(state.elapsed, frozenStun.elapsed);
  assert.equal(state.stun, frozenStun.stun);
  assert.deepEqual(state.bombs, frozenStun.bombs);
  await page.locator('#resumeBtn').click();
  await advance(750);
  state = await snapshot();
  assert.equal(state.stun, 0);
  assert.ok(state.elapsed > frozenStun.elapsed);
  fruit = safeFruit(state);
  assert.ok(fruit, 'A visible fruit should be available when the stun ends');
  await stroke(cutPoints(fruit), 7, 'touch');
  assert.ok((await snapshot()).score >= 10);
  ok('Pause preserves the remaining stun; a new touch stroke scores when it expires');

  state = await snapshot();
  assert.equal(state.progress.training, false);
  assert.equal(state.state, 'FREE_SLASH');
  await advance(Math.max(0, (20 - state.elapsed) * 1000 - 120));
  assert.equal((await snapshot()).progress.training, false);
  await advance(2200);
  state = await snapshot();
  assert.equal(state.state, 'FREE_RESULTS');
  assert.equal(state.elapsed, 20);
  assert.equal(state.progress.training, true);
  ok('Bomb hits never end the round early and unlock training only after the complete timer');

  await page.locator('#replayBtn').click();
  state = await snapshot();
  assert.equal(state.bombHits, 0);
  assert.equal(state.bombCount, 0);
  assert.equal(state.stun, 0);
  assert.equal(state.score, 0);
  ok('Replay clears bombs, hit totals, stun, and score');

  await page.locator('#homeBtn').click();
  for (const mode of ['straight', 'reducing', 'usage']) {
    await page.locator(`button[data-mode="${mode}"]`).click();
    await advance(7300);
    state = await snapshot();
    assert.equal(state.mode, mode);
    assert.equal(state.bombCount, 0);
    assert.deepEqual(state.bombs, []);
    assert.equal(state.bombHits, 0);
    assert.equal(state.stun, 0);
    await page.locator('#homeBtn').click();
  }
  ok('All three learning modes remain free of bombs and stun');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  ok('Bomb gameplay has no JavaScript errors or external network requests');
  writeReport();
  await browser.close();
})().catch(async error => {
  console.error(error); writeReport(error);
  await activeBrowser?.close(); process.exitCode = 1;
});
