// Verify the staged unlock path through visible controls and actual case/year swipes.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, launchOptions} = require('./browser-runtime.cjs');
const entry = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const key = 'fruit-slash-academy-v1';
const reports = [], errors = [], external = [];
let browser;
const ok = name => { reports.push(name); console.log('PASS:', name); };
function save(failure) {
  fs.writeFileSync(path.join(__dirname, 'unlock-results.json'), JSON.stringify({
    passed:reports.length, checks:reports, errors, externalRequests:external,
    ...(failure ? {failure:String(failure)} : {})
  }, null, 2));
}
async function setup(fixture) {
  const context = await browser.newContext({viewport:{width:1024,height:768}, deviceScaleFactor:2});
  if(fixture) {
    await context.addInitScript(({key, fixture})=>{
      if(localStorage.getItem(key)===null)localStorage.setItem(key, JSON.stringify(fixture));
    }, {key, fixture});
  }
  const page = await context.newPage();
  page.on('pageerror', e=>errors.push(String(e)));
  page.on('request', r=>{ if(/^https?:/.test(r.url()))external.push(r.url()); });
  await page.clock.install({time:new Date('2026-10-14T04:00:00Z')});
  await page.goto(entry);
  await page.clock.pauseAt(new Date('2026-10-14T04:00:01Z'));
  return {context, page};
}
const snap = page => page.evaluate(()=>FruitSlash.snapshot());
const advance = (page, ms) => page.clock.runFor(ms);
async function available(page, modes) {
  const actual = await page.locator('button[data-mode]').evaluateAll(nodes=>nodes.filter(n=>!n.disabled).map(n=>n.dataset.mode));
  assert.deepEqual(actual, modes);
  const statuses = await page.locator('button[data-mode]').evaluateAll(nodes=>nodes.map(n=>({
    mode:n.dataset.mode, disabled:n.disabled, locked:n.classList.contains('locked'), name:n.getAttribute('aria-label')
  })));
  assert.ok(statuses.every(n=>n.disabled===n.locked && (n.disabled?/鎖定|解鎖/.test(n.name):n.name.includes('開始遊戲'))),JSON.stringify(statuses));
}
async function stroke(page, points) {
  await page.evaluate(points=>{
    const c=document.getElementById('gameCanvas'), r=c.getBoundingClientRect();
    const emit=(event,p)=>c.dispatchEvent(new PointerEvent(event, {
      bubbles:true, pointerId:7, pointerType:'touch', isPrimary:true, button:0,
      buttons:event==='pointerup'?0:1, clientX:r.left+p.x, clientY:r.top+p.y
    }));
    emit('pointerdown',points[0]);
    for(const p of points.slice(1))emit('pointermove',p);
    emit('pointerup',points.at(-1));
  }, points);
}
async function readCase(page) {
  assert.equal((await snap(page)).state, 'CASE_INTRO');
  let count=0;
  while((await snap(page)).state==='CASE_INTRO') {
    const s=await snap(page), g=s.intro.geometry;
    assert.equal(s.intro.index, count);
    await stroke(page,[{x:g.x-15,y:g.y+g.h*.5},{x:g.x+g.w+15,y:g.y+g.h*.5}]);
    assert.equal((await snap(page)).intro.anim, true);
    await advance(page,650);
    count++;
    assert.ok(count<12);
  }
  assert.equal((await snap(page)).state, 'STRAIGHT_LINE');
  assert.equal((await snap(page)).level.index, 0);
}
async function cutYear(page) {
  const g=(await snap(page)).level.geometry;
  await stroke(page,[{x:g.x+g.cut,y:g.y-24},{x:g.x+g.cut,y:g.y+g.h+24}]);
  assert.equal((await snap(page)).level.anim, true);
  await advance(page,900);
}
async function completeFree(page) {
  await page.locator('button[data-mode="free"]').click();
  await advance(page,2900);
  assert.equal((await snap(page)).progress.training, false);
  await advance(page,23100);
  assert.equal((await snap(page)).state, 'FREE_RESULTS');
  assert.equal((await snap(page)).elapsed, 20);
  assert.equal((await snap(page)).progress.training, true);
}
async function menuLayout() {
  for(const width of [1024,390]){
    const session=await setup({training:true,best:100,completed:[],settings:{duration:20,sound:false}});
    const page=session.page;
    await page.setViewportSize({width,height:844});
    await advance(page,80);
    await available(page,['free','straight']);
    const labels=await page.locator('button[data-mode="reducing"] .card-action, button[data-mode="usage"] .card-action').evaluateAll(nodes=>nodes.map(n=>{
      const r=n.getBoundingClientRect(), c=n.closest('button').getBoundingClientRect();
      return {text:n.textContent,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,height:r.height,inside:r.x>=c.x&&r.right<=c.right};
    }));
    assert.equal(labels.length,2);
    assert.ok(labels.every(n=>n.text==='先完成直線法'&&n.scrollWidth<=n.clientWidth+1&&n.height>=43.9&&n.inside),JSON.stringify(labels));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(__dirname,`unlock-straight-only-${width}.png`),fullPage:true});
    ok(`${width}px staged menu keeps both six-character prerequisite labels readable inside their cards`);
    await session.context.close();
  }
}
(async()=>{
  browser=await chromium.launch(launchOptions);
  if(process.argv.includes('--menu-layout')){
    const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'unlock-results.json'),'utf8'));
    reports.push(...previous.checks);errors.push(...previous.errors);external.push(...previous.externalRequests);
    await menuLayout();
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    save();await browser.close();return;
  }
  const session=await setup(), page=session.page;
  await available(page,['free']);
  assert.deepEqual((await snap(page)).progress.completed,[]);
  ok('Fresh visitors can play only free mode; every depreciation method is visibly locked');
  assert.equal(await page.locator('#observationSetting').count(),0);
  assert.equal((await page.locator('#settingsDialog').textContent()).includes('直線法觀課模式'),false);
  assert.equal(Object.hasOwn((await snap(page)).settings,'observation'),false);
  ok('The removed observation option is absent from the interface and active settings');

  // A synthetic click must still go through the normal button handler's unlock guard.
  await page.locator('button[data-mode="reducing"]').dispatchEvent('click');
  assert.equal((await snap(page)).state,'MENU');
  await page.locator('button[data-mode="usage"]').dispatchEvent('click');
  assert.equal((await snap(page)).state,'MENU');
  ok('Locked mode handlers reject forced click events before any training');

  await page.locator('#settingsBtn').click();
  await page.locator('#durationSetting').selectOption('20');
  await page.locator('#soundSetting').uncheck();
  await page.locator('#closeSettingsBtn').click();
  await page.locator('button[data-mode="free"]').click();
  await advance(page,10000);
  await page.locator('#homeBtn').click();
  await available(page,['free']);
  assert.equal((await snap(page)).progress.training,false);
  await page.reload();
  await available(page,['free']);
  ok('Aborting a free round leaves all methods locked, including after reload');

  await completeFree(page);
  assert.equal(await page.locator('.unlock-item').count(),1);
  const freeResult=await page.locator('.unlock-summary').innerText();
  assert.ok(freeResult.includes('直線法'));
  assert.equal(freeResult.includes('三種新切法已解鎖'),false);
  await page.locator('#resultMenuBtn').click();
  await available(page,['free','straight']);
  await page.screenshot({path:path.join(__dirname,'unlock-straight-only.png'),fullPage:true});
  ok('Completing a full free round unlocks straight line alone and announces that single unlock');

  await page.reload();
  await available(page,['free','straight']);
  for(const mode of ['reducing','usage']){
    await page.locator(`button[data-mode="${mode}"]`).dispatchEvent('click');
    assert.equal((await snap(page)).state,'MENU');
  }
  ok('Training progress persists and both later methods remain protected by the start guard');

  await page.locator('button[data-mode="straight"]').click();
  assert.equal((await snap(page)).state,'CASE_INTRO');
  await page.locator('#homeBtn').click();
  await available(page,['free','straight']);
  assert.equal((await snap(page)).progress.completed.includes('straight'),false);
  ok('Opening then leaving the straight-line background does not unlock another method');

  await page.locator('button[data-mode="straight"]').click();
  await readCase(page);
  assert.equal((await snap(page)).progress.completed.includes('straight'),false);
  await cutYear(page);
  assert.equal((await snap(page)).level.index,1);
  await page.locator('#homeBtn').click();
  await available(page,['free','straight']);
  await page.reload();
  await available(page,['free','straight']);
  assert.equal((await snap(page)).progress.completed.includes('straight'),false);
  ok('Reading every case fact and cutting one year still leaves the two later methods locked');

  await page.locator('button[data-mode="straight"]').click();
  await readCase(page);
  for(let year=0;year<3;year++){
    await cutYear(page);
    assert.equal((await snap(page)).level.index,year+1);
    assert.equal((await snap(page)).progress.completed.includes('straight'),false);
  }
  ok('Three completed straight-line years are insufficient to unlock the other methods');
  await cutYear(page);
  assert.equal((await snap(page)).level.index,4);
  assert.equal((await snap(page)).progress.completed.includes('straight'),false);
  await advance(page,1000);
  assert.equal((await snap(page)).state,'LEVEL_RESULTS');
  assert.ok((await snap(page)).progress.completed.includes('straight'));
  assert.deepEqual((await snap(page)).level.rows.map(r=>r.depreciation),[12000,12000,12000,12000]);
  const straightResult=await page.locator('.unlock-summary').innerText();
  assert.ok(straightResult.includes('餘額遞減法')&&straightResult.includes('按使用量法'));
  await page.locator('#resultMenuBtn').click();
  await available(page,['free','straight','reducing','usage']);
  await page.screenshot({path:path.join(__dirname,'unlock-all-methods.png'),fullPage:true});
  ok('Four real annual slices and the completed result unlock reducing balance and usage together');

  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(saved.training,true);
  assert.ok(saved.completed.includes('straight'));
  await page.reload();
  await available(page,['free','straight','reducing','usage']);
  for(const [mode,playState] of [['reducing','REDUCING_BALANCE'],['usage','USAGE_BASED']]){
    await page.locator(`button[data-mode="${mode}"]`).click();
    assert.equal((await snap(page)).state,'CASE_INTRO');
    assert.equal((await snap(page)).mode,mode);
    await page.locator('#homeBtn').click();
  }
  ok('Saved straight-line completion survives reload and both newly available lesson cards open');

  await page.locator('button[data-mode="free"]').click();
  await advance(page,24000);
  assert.equal((await snap(page)).state,'FREE_RESULTS');
  assert.equal(await page.locator('.unlock-item').count(),3);
  await page.locator('#resultMenuBtn').click();
  await available(page,['free','straight','reducing','usage']);
  ok('Replaying free mode after straight-line completion preserves all unlocked lessons');

  await page.locator('#settingsBtn').click();
  await page.locator('#resetProgressBtn').click();
  await page.locator('#confirmResetBtn').click();
  await page.locator('#closeSettingsBtn').click();
  await available(page,['free']);
  assert.equal((await snap(page)).progress.training,false);
  assert.deepEqual((await snap(page)).progress.completed,[]);
  await page.reload();
  await available(page,['free']);
  ok('Reset clears training and straight-line completion and saves the original lock state');

  await completeFree(page);
  await page.locator('#resultMenuBtn').click();
  await available(page,['free','straight']);
  assert.deepEqual((await snap(page)).progress.completed,[]);
  ok('After reset, a new completed warm-up unlocks straight line alone again');
  await session.context.close();

  const legacy=await setup({training:true,best:250,completed:['reducing','usage'],settings:{duration:20,sound:false}});
  await available(legacy.page,['free','straight']);
  assert.deepEqual((await snap(legacy.page)).progress.completed,['reducing','usage']);
  assert.equal((await snap(legacy.page)).progress.best,250);
  await legacy.page.reload();
  await available(legacy.page,['free','straight']);
  ok('Legacy training records without straight-line completion keep both later lessons locked and preserve scores');
  await legacy.context.close();
  const inconsistent=await setup({training:false,completed:['straight'],settings:{sound:false}});
  await available(inconsistent.page,['free']);
  ok('A saved straight-line flag cannot bypass the required completed free round');
  await inconsistent.context.close();

  // These two legacy fixtures intentionally retain the removed option to verify migration.
  const oldCompleted=await setup({training:true,best:530,completed:['straight','reducing'],settings:{duration:60,sound:false,hints:false,observation:true}});
  await available(oldCompleted.page,['free','straight','reducing','usage']);
  assert.deepEqual((await snap(oldCompleted.page)).progress,{training:true,best:530,completed:['straight','reducing']});
  assert.deepEqual((await snap(oldCompleted.page)).settings,{duration:60,sound:false,hints:false});
  let migrated=await oldCompleted.page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(Object.hasOwn(migrated.settings,'observation'),false);
  assert.deepEqual(migrated.settings,{duration:60,sound:false,hints:false});
  assert.equal(migrated.training,true);
  assert.equal(migrated.best,530);
  assert.deepEqual(migrated.completed,['straight','reducing']);
  assert.equal(await oldCompleted.page.locator('#observationSetting').count(),0);
  await oldCompleted.page.reload();
  await available(oldCompleted.page,['free','straight','reducing','usage']);
  assert.equal((await snap(oldCompleted.page)).progress.best,530);
  ok('Legacy observation=true with completed straight line is removed on load, restores all lessons and preserves progress/settings');
  await oldCompleted.context.close();

  const oldTraining=await setup({training:true,best:280,completed:[],settings:{duration:20,sound:false,hints:false,observation:true}});
  await available(oldTraining.page,['free','straight']);
  assert.deepEqual((await snap(oldTraining.page)).settings,{duration:20,sound:false,hints:false});
  migrated=await oldTraining.page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(Object.hasOwn(migrated.settings,'observation'),false);
  assert.deepEqual(migrated.settings,{duration:20,sound:false,hints:false});
  assert.equal(migrated.training,true);
  assert.deepEqual(migrated.completed,[]);
  assert.equal(migrated.best,280);
  await oldTraining.page.reload();
  await available(oldTraining.page,['free','straight']);
  ok('Legacy observation=true with training only is removed without falsely completing or unlocking later lessons');
  await oldTraining.page.locator('button[data-mode="straight"]').click();
  await readCase(oldTraining.page);
  for(let year=0;year<4;year++)await cutYear(oldTraining.page);
  await advance(oldTraining.page,1000);
  assert.equal((await snap(oldTraining.page)).state,'LEVEL_RESULTS');
  assert.ok((await snap(oldTraining.page)).progress.completed.includes('straight'));
  const migratedUnlock=await oldTraining.page.locator('.unlock-summary').innerText();
  assert.ok(migratedUnlock.includes('餘額遞減法')&&migratedUnlock.includes('按使用量法'));
  await oldTraining.page.locator('#resultMenuBtn').click();
  await available(oldTraining.page,['free','straight','reducing','usage']);
  await oldTraining.page.reload();
  await available(oldTraining.page,['free','straight','reducing','usage']);
  migrated=await oldTraining.page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(Object.hasOwn(migrated.settings,'observation'),false);
  assert.equal(migrated.best,280);
  ok('Migrated training-only players genuinely complete straight line and unlock both other methods permanently');
  await oldTraining.context.close();

  await menuLayout();

  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  ok('The staged unlock paths run offline without JavaScript errors or network requests');
  save();
  await browser.close();
})().catch(async e=>{console.error(e);save(e);await browser?.close();process.exitCode=1;});
