// Optional browser verification: node tests/browser-smoke.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const {chromium,launchOptions}=require('./browser-runtime.cjs');
const root = path.resolve(__dirname, '..');
const reports=[];
let activeBrowser;
const ok = name => { reports.push(name); console.log('PASS:',name); };
(async()=>{
  const browser=await chromium.launch(launchOptions);activeBrowser=browser;
  const context=await browser.newContext({viewport:{width:1280,height:850},deviceScaleFactor:2});
  // Repeat real spawn trajectories so the combo check never depends on luck.
  await context.addInitScript(()=>{let seed=1000;Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const external=[];page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await page.clock.install({time:new Date('2026-10-13T04:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-13T04:00:01Z'));
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  const snap=()=>page.evaluate(()=>FruitSlash.snapshot());
  const advance=ms=>page.clock.runFor(ms);
  async function stroke(points,type='mouse',id=1){await page.evaluate(({points,type,id})=>{const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();const dispatch=(event,p)=>c.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerId:id,pointerType:type,buttons:event==='pointerup'?0:1,button:0,clientX:r.left+p.x,clientY:r.top+p.y,isPrimary:true}));dispatch('pointerdown',points[0]);for(const p of points.slice(1))dispatch('pointermove',p);dispatch('pointerup',points.at(-1));},{points,type,id});}
  async function cutYear(type='touch',offset=0){const g=(await snap()).level.geometry;await stroke([{x:g.x+g.cut+offset,y:g.y-24},{x:g.x+g.cut+offset,y:g.y+g.h+24}],type);}
  async function readCase(type='touch'){
    assert.equal((await snap()).state,'CASE_INTRO');
    const total=(await snap()).intro.total;
    for(let i=0;i<total;i++){
      const s=await snap(),g=s.intro.geometry;
      assert.equal(s.intro.index,i);assert.equal(s.countdown,0);
      await stroke([{x:g.x-15,y:g.y+g.h*.5},{x:g.x+g.w+15,y:g.y+g.h*.5}],type);
      assert.equal((await snap()).intro.anim,true);await advance(650);
    }
    assert.equal((await snap()).intro,null);
  }
  assert.equal((await snap()).settings.duration,35);
  assert.equal(await page.locator('button[data-mode]:disabled').count(),3);ok('初次開啟只有自由切水果可選');
  await page.screenshot({path:path.join(root,'tests/menu.png'),fullPage:true});
  await page.locator('button[data-mode="free"]').click();
  await advance(2900);assert.equal((await snap()).progress.training,false);assert.ok((await snap()).countdown>0);
  await advance(1100);let s=await snap();assert.ok(s.fruitCount>0);ok('3 秒倒數後生成原創飛行水果');
  const f=s.fruits.find(f=>f.y>50&&f.y<450)||s.fruits[0];
  await stroke([{x:f.x,y:f.y}], 'mouse');assert.equal((await snap()).score,0);ok('單純點擊不會得分');
  await stroke([{x:f.x-f.r*2,y:f.y},{x:f.x+f.r*2,y:f.y}], 'mouse');s=await snap();assert.ok(s.score>=10);assert.ok(s.halves>=2&&s.particles>0);ok('快速鼠標刀痕切開水果並生成兩半、果汁及分數');
  await page.screenshot({path:path.join(root,'tests/free-play.png')});
  // Keep one gesture across real moving fruits during the introductory window.
  // Also reject every segment that would touch a visible bomb, including travel
  // between fruits, so a hazard cannot accidentally invalidate the combo check.
  let comboPoint={x:10,y:10};
  await page.evaluate(()=>{const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:2,pointerType:'pen',buttons:1,clientX:r.left+10,clientY:r.top+10}));});
  for(let n=0;n<4;n++){await advance(300);comboPoint=await page.evaluate(last=>{
    const s=FruitSlash.snapshot(),c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();
    const safe=(a,b)=>(s.bombs||[]).every(bomb=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((bomb.x-a.x)*dx+(bomb.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(a.x+t*dx-bomb.x,a.y+t*dy-bomb.y)>bomb.r+12;});
    for(const f of s.fruits.filter(f=>f.y>20&&f.y<r.height-10).slice(0,2)){
      const left={x:f.x-f.r*1.6,y:f.y},right={x:f.x+f.r*1.6,y:f.y};
      const route=[[left,right],[right,left]].find(([a,b])=>safe(last,a)&&safe(a,b));
      if(!route)continue;
      for(const p of route){c.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:2,pointerType:'pen',buttons:1,clientX:r.left+p.x,clientY:r.top+p.y}));last=p;}
    }
    return last;
  },comboPoint);}
  await page.evaluate(p=>{const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:2,pointerType:'pen',clientX:r.left+p.x,clientY:r.top+p.y}));},comboPoint);
  assert.ok((await snap()).maxCombo>=3);ok('同一觸控筆刀痕可切多個水果並觸發 Combo');
  await page.locator('#pauseBtn').click();const before=(await snap()).elapsed;await advance(4000);assert.equal((await snap()).elapsed,before);await page.locator('#resumeBtn').click();await advance(1000);assert.ok(Math.abs((await snap()).elapsed-before-1)<.1);ok('暫停與繼續保留正確時間');
  s=await snap();await advance((35-s.elapsed)*1000-100);assert.equal((await snap()).progress.training,false);await advance(2200);s=await snap();assert.equal(s.state,'FREE_RESULTS');assert.equal(s.elapsed,35);assert.equal(s.progress.training,true);assert.equal(await page.locator('.unlock-item').count(),1);ok('完整 35 秒後只解鎖直線法，無最低分要求');
  await page.screenshot({path:path.join(root,'tests/unlocked.png'),fullPage:true});
  await page.reload();assert.equal((await snap()).progress.training,true);assert.equal(await page.locator('button[data-mode]:disabled').count(),2);ok('重新整理保留直線法解鎖及最高分，其他兩法仍鎖定');
  await page.locator('button[data-mode="straight"]').click();await readCase();ok('學習背景逐張出現，每張必須滑刀切開才進入切割');
  await cutYear('touch',120);assert.equal((await snap()).level.anim,false);ok('錯誤份量不能切下果肉，也不會扣分');
  await page.screenshot({path:path.join(root,'tests/straight-play.png'),fullPage:true});
  for(let i=0;i<4;i++){await cutYear(i%2?'pen':'touch');assert.equal((await snap()).level.anim,true);await advance(900);assert.equal((await snap()).level.index,i+1);}
  // Completed levels reject additional cuts during the final celebration.
  await stroke([{x:200,y:10},{x:200,y:400}]);assert.equal((await snap()).level.anim,false);await advance(1000);
  assert.equal((await snap()).state,'LEVEL_RESULTS');assert.deepEqual((await snap()).level.rows.map(r=>r.depreciation),[12000,12000,12000,12000]);assert.ok((await page.locator('#resultContent').innerText()).includes('$6,000'));assert.ok((await snap()).progress.completed.includes('straight'));ok('手指及觸控筆完成直線法四次等額切割，保留 $6,000 殘值並解鎖其餘切法');
  await page.screenshot({path:path.join(root,'tests/straight-results.png'),fullPage:true});
  await page.locator('#resultMenuBtn').click();await page.locator('button[data-mode="reducing"]').click();await readCase();
  assert.equal((await snap()).level.rows.length,4);const widths=[];for(let i=0;i<4;i++){const g=(await snap()).level.geometry;widths.push(g.cut);assert.equal(g.row.finalYear,false);await cutYear();assert.equal((await snap()).level.anim,true);await advance(900);}assert.ok(widths.slice(1).every((w,i)=>widths[i]>w));let final=(await snap()).level.geometry;assert.equal(final.width,final.residual);await cutYear();assert.equal((await snap()).level.anim,false);await advance(1000);assert.equal((await snap()).state,'LEVEL_RESULTS');assert.deepEqual((await snap()).level.rows.map(r=>r.depreciation),[80000,40000,20000,10000]);assert.deepEqual((await snap()).level.rows.map(r=>r.closing),[80000,40000,20000,10000]);assert.equal((await page.locator('#resultContent').innerText()).includes('2030'),false);ok('餘額遞減法按 50% 完成四年示範，於 2029 年保留 $10,000，不顯示 2030 年');
  await page.locator('#resultMenuBtn').click();await page.locator('button[data-mode="usage"]').click();await readCase();await cutYear();await advance(900);await cutYear();await advance(900);assert.equal((await snap()).level.index,2);assert.equal((await snap()).level.rows[2].depreciation,0);await cutYear();assert.equal((await snap()).level.anim,false);assert.ok((await page.locator('#taskText').innerText()).includes('0 次'));await advance(3000);assert.equal((await snap()).level.index,3);await cutYear();await advance(1900);assert.equal((await snap()).state,'LEVEL_RESULTS');assert.deepEqual((await snap()).level.rows.map(r=>r.depreciation),[12000,18000,0,18000]);ok('使用量法處理生產訂單、休息年 $0 和最後殘值');
  await page.locator('#resultMenuBtn').click();await page.locator('#settingsBtn').click();assert.equal(await page.locator('#observationSetting').count(),0);assert.equal((await page.locator('#settingsDialog').innerText()).includes('直線法觀課模式'),false);assert.equal(Object.hasOwn((await snap()).settings,'observation'),false);await page.locator('#hintsSetting').uncheck();assert.equal((await snap()).settings.hints,false);await page.locator('#hintsSetting').check();assert.equal((await snap()).settings.hints,true);await page.locator('#closeSettingsBtn').click();assert.equal(await page.locator('button[data-mode]:disabled').count(),0);ok('已移除觀課模式，標準教師設定可用且不會重新鎖定已完成的切法');
  await page.locator('#settingsBtn').click();await page.locator('#resetProgressBtn').click();await page.locator('#confirmResetBtn').click();await page.locator('#durationSetting').selectOption('20');await page.locator('#soundSetting').uncheck();await page.locator('#closeSettingsBtn').click();assert.equal(await page.locator('button[data-mode]:disabled').count(),3);assert.equal((await snap()).progress.best,0);ok('重設清除進度，教師設定可改為 20 秒及關音效');
  await page.locator('button[data-mode="free"]').click();await advance(23400);assert.equal((await snap()).progress.training,true);await page.locator('#resultMenuBtn').click();assert.equal(await page.locator('button[data-mode]:disabled').count(),2);ok('重設後的新自由回合完成，只解鎖直線法');
  await page.locator('#settingsBtn').click();await page.locator('#durationSetting').selectOption('60');await page.locator('#closeSettingsBtn').click();await page.locator('button[data-mode="free"]').click();await advance(4000);assert.ok((await snap()).elapsed<2);await page.locator('#homeBtn').click();await page.locator('button[data-mode="free"]').click();await advance(4000);assert.ok((await snap()).elapsed<2);ok('60 秒設定與重新開始沒有重複計時器');
  await page.locator('#homeBtn').click();
  for(const viewport of [{width:1024,height:768},{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(viewport);await advance(50);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,`tests/layout-${viewport.width}.png`),fullPage:true});await page.locator('button[data-mode="straight"]').click();await readCase();const size=await page.locator('#gameCanvas').boundingBox();assert.ok(size.width>250&&size.height>=220);await cutYear('touch');assert.equal((await snap()).level.anim,true);await advance(32);await page.screenshot({path:path.join(root,`tests/play-${viewport.width}.png`),fullPage:true});await page.locator('#homeBtn').click();}
  ok('iPad、手機直向及橫向無橫向溢出，Pointer Events 觸控切割可用');
  assert.equal(await page.locator('#gameCanvas').evaluate(c=>getComputedStyle(c).touchAction),'none');assert.equal(external.length,0);assert.deepEqual(errors,[]);ok('無 JavaScript 錯誤、無外部請求、可 file:// 離線遊玩');
  fs.writeFileSync(path.join(root,'tests/browser-results.json'),JSON.stringify({passed:reports.length,checks:reports,errors,externalRequests:external},null,2));
  await browser.close();
})().catch(async e=>{console.error(e);await activeBrowser?.close();process.exitCode=1;});
