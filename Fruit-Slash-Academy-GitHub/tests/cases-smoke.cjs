// Exercise the real case-card input path before every learning method.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium,launchOptions}=require('./browser-runtime.cjs');
const root=path.resolve(__dirname,'..'),reports=[];
let browser;
const ok=name=>{reports.push(name);console.log('PASS:',name);};
(async()=>{
  browser=await chromium.launch(launchOptions);
  const page=await browser.newPage({viewport:{width:1024,height:768},deviceScaleFactor:2});
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await page.addInitScript(()=>localStorage.setItem('fruit-slash-academy-v1',JSON.stringify({training:true,best:100,completed:['straight'],settings:{duration:35,sound:false,hints:true}})));
  await page.clock.install({time:new Date('2026-10-13T04:00:00Z')});
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.clock.pauseAt(new Date('2026-10-13T04:00:01Z'));
  const snap=()=>page.evaluate(()=>FruitSlash.snapshot()),advance=ms=>page.clock.runFor(ms);
  async function pointer(event,p,id=7,type='touch'){
    await page.evaluate(({event,p,id,type})=>{
      const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerId:id,pointerType:type,isPrimary:true,button:0,buttons:event==='pointerup'?0:1,clientX:r.left+p.x,clientY:r.top+p.y}));
    },{event,p,id,type});
  }
  async function stroke(points,type='touch'){
    await pointer('pointerdown',points[0],7,type);
    for(const p of points.slice(1))await pointer('pointermove',p,7,type);
    await pointer('pointerup',points.at(-1),7,type);
  }
  const ends=g=>[{x:g.x-15,y:g.y+g.h*.5},{x:g.x+g.w+15,y:g.y+g.h*.5}];
  async function cardVisible(s){
    assert.equal(s.state,'CASE_INTRO');assert.equal(s.countdown,0);assert.equal(s.level?.index??0,0);
    assert.equal(await page.locator('#caseCaption:visible').count(),1);
    const caption=await page.locator('#caseCaption').innerText();
    for(const value of [s.intro.card.title,s.intro.card.value,s.intro.card.detail])assert.ok(caption.includes(value),`current card text missing: ${value}`);
    assert.equal(await page.locator('#factPanel').isVisible(),false);
    assert.equal(await page.locator('#gameOverlay').isVisible(),false);
  }
  async function clearRemaining(){
    while((await snap()).state==='CASE_INTRO'){
      const s=await snap();await cardVisible(s);await stroke(ends(s.intro.geometry));
      assert.equal((await snap()).intro.anim,true);await advance(650);
    }
  }
  async function cutYear(){
    const g=(await snap()).level.geometry;
    await stroke([{x:g.x+g.cut,y:g.y-24},{x:g.x+g.cut,y:g.y+g.h+24}]);
  }
  const modes={straight:'STRAIGHT_LINE',reducing:'REDUCING_BALANCE',usage:'USAGE_BASED'};
  for(const [mode,playState] of Object.entries(modes)){
    await page.setViewportSize({width:1024,height:768});await page.locator(`button[data-mode="${mode}"]`).click();
    let s=await snap();await cardVisible(s);assert.ok(s.intro.total>=3);
    await page.screenshot({path:path.join(root,`tests/case-${mode}-1024.png`),fullPage:true});
    const first=structuredClone(s.intro.card);await advance(4000);
    assert.equal((await snap()).intro.index,0);assert.deepEqual((await snap()).intro.card,first);
    ok(`${mode}: one case fact at a time, with no automatic progress or countdown`);

    let g=(await snap()).intro.geometry;
    const center={x:g.x+g.w*.5,y:g.y+g.h*.5};
    await stroke([center]);assert.equal((await snap()).intro.anim,false);
    await stroke([center,{x:center.x+10,y:center.y}]);assert.equal((await snap()).intro.anim,false);
    await stroke([{x:g.x-15,y:g.y-20},{x:g.x+g.w+15,y:g.y-20}]);assert.equal((await snap()).intro.anim,false);
    await stroke([{x:g.x+g.w-5,y:center.y},{x:g.x+g.w+15,y:center.y}]);assert.equal((await snap()).intro.anim,false);
    assert.equal((await snap()).intro.index,0);
    ok(`${mode}: clicks, short drags, misses and corner brushes stay on the card`);

    const cardBeforeResize=(await snap()).intro.card;
    await page.setViewportSize({width:390,height:844});await advance(50);s=await snap();
    assert.equal(s.intro.index,0);assert.deepEqual(s.intro.card,cardBeforeResize);await cardVisible(s);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const r=await page.locator('#gameCanvas').boundingBox();g=s.intro.geometry;
    assert.ok(g.x>=0&&g.y>=0&&g.x+g.w<=r.width+.1&&g.y+g.h<=r.height+.1);
    await page.screenshot({path:path.join(root,`tests/case-${mode}-390.png`),fullPage:true});
    ok(`${mode}: resize preserves the current case and its cut target fits the phone screen`);

    let [left,right]=ends(g);await pointer('pointerdown',left);await pointer('pointermove',right);
    assert.equal((await snap()).intro.anim,true);await advance(650);
    assert.equal((await snap()).intro.index,1);
    g=(await snap()).intro.geometry;[left,right]=ends(g);
    await pointer('pointermove',left);await pointer('pointermove',right);await advance(750);
    assert.equal((await snap()).intro.index,1);assert.equal((await snap()).intro.anim,false);
    await pointer('pointerup',right);
    ok(`${mode}: one held gesture cannot dismiss two successive case cards`);

    await stroke(ends(g));assert.equal((await snap()).intro.anim,true);await advance(100);
    await page.screenshot({path:path.join(root,`tests/case-split-${mode}.png`),fullPage:true});
    await page.locator('#pauseBtn').click();assert.equal((await snap()).state,'PAUSED');
    await advance(2000);await page.locator('#resumeBtn').click();
    s=await snap();assert.equal(s.state,'CASE_INTRO');assert.equal(s.intro.index,1);assert.equal(s.intro.anim,true);
    await advance(650);assert.equal((await snap()).intro.index,2);
    ok(`${mode}: pausing freezes the card cut animation until resumed`);

    await clearRemaining();s=await snap();assert.equal(s.state,playState);assert.equal(s.intro,null);assert.equal(s.countdown,0);
    assert.equal(await page.locator('#caseCaption').isVisible(),false);assert.equal(await page.locator('#factPanel').isVisible(),false);
    assert.equal(s.level.index,0);await page.screenshot({path:path.join(root,`tests/cutting-${mode}-390.png`),fullPage:true});
    await cutYear();s=await snap();assert.equal(s.level.anim,true);await advance(900);assert.equal((await snap()).level.index,1);
    ok(`${mode}: cutting the final case card opens the minimal learning page and the first year slices correctly`);
    await page.setViewportSize({width:1024,height:768});await advance(50);
    await page.screenshot({path:path.join(root,`tests/cutting-${mode}-1024.png`),fullPage:true});
    // Reach the real results and replay path, including the factory's rest year.
    while((await snap()).state===playState){
      s=await snap();
      if(s.level.index>=s.level.rows.length){await advance(1000);break;}
      if(s.level.rows[s.level.index].depreciation===0)await advance(3000);
      else{await cutYear();await advance(900);}
    }
    assert.equal((await snap()).state,'LEVEL_RESULTS');await page.locator('#replayBtn').click();
    s=await snap();assert.equal(s.state,'CASE_INTRO');assert.equal(s.intro.index,0);assert.deepEqual(s.intro.card,first);await cardVisible(s);
    ok(`${mode}: replay presents the case background again from its first card`);
    await page.locator('#homeBtn').click();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  ok('All case and lesson paths work offline without JavaScript errors or network requests');
  fs.writeFileSync(path.join(root,'tests/cases-results.json'),JSON.stringify({passed:reports.length,checks:reports,errors,externalRequests:external},null,2));
  await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
