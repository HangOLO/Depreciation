// Responsive visual QA for the interface refresh. Exercises public UI and pointer input only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, launchOptions} = require('./browser-runtime.cjs');
const root = path.resolve(__dirname, '..');
const reports = [], failures = [], errors = [], external = [], metrics = [];
const viewports = [{width:1280,height:850},{width:1024,height:768},{width:844,height:390},{width:390,height:844}];
const entry = pathToFileURL(path.join(root, 'index.html')).href;
let browser;
function check(name, condition, detail) {
  const item = {name, ...(detail === undefined ? {} : {detail})};
  (condition ? reports : failures).push(item);
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${condition || detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
}
function save(failure) {
  fs.writeFileSync(path.join(__dirname, 'interface-results.json'), JSON.stringify({
    passed:reports.length, failed:failures.length, checks:reports, failures, errors,
    externalRequests:external, viewports, metrics, ...(failure ? {failure:String(failure)} : {})
  }, null, 2));
}
async function setup(viewport, training) {
  const context = await browser.newContext({viewport, deviceScaleFactor:2});
  await context.addInitScript(training => {
    let seed=7013;
    Math.random=()=>{seed|=0;seed=(seed+0x6D2B79F5)|0;let n=Math.imul(seed^seed>>>15,1|seed);n=(n+Math.imul(n^n>>>7,61|n))^n;return ((n^n>>>14)>>>0)/4294967296;};
    localStorage.setItem('fruit-slash-academy-v1', JSON.stringify({training, best:training?120:0, completed:training?['straight']:[], settings:{duration:20,sound:false,hints:true}}));
  }, training);
  const page = await context.newPage();
  page.on('pageerror', e=>errors.push({viewport, error:String(e)}));
  page.on('request', r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await page.clock.install({time:new Date('2026-10-14T04:00:00Z')});
  await page.goto(entry);
  await page.clock.pauseAt(new Date('2026-10-14T04:00:01Z'));
  return {context,page};
}
const snapshot = page => page.evaluate(()=>FruitSlash.snapshot());
const advance = (page,ms) => page.clock.runFor(ms);
const screenshot = (page,label,width) => page.screenshot({path:path.join(__dirname,`ui-${label}-${width}.png`),fullPage:true});
async function noOverflow(page,label) {
  const result=await page.evaluate(()=>({width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  check(`${label}: no horizontal page overflow`, result.html<=result.width&&result.body<=result.width,result);
}
async function buttons(page,label) {
  const controls=await page.locator('button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>{
    const r=n.getBoundingClientRect();return {id:n.id||n.dataset.mode||n.className,width:r.width,height:r.height,name:n.getAttribute('aria-label')||n.innerText.trim()};
  }));
  const small=controls.filter(c=>c.width<43.9||c.height<43.9);
  check(`${label}: visible buttons have accessible names and 44 px targets`,!small.length&&controls.every(c=>c.name),small);
}
async function hero(page,label) {
  const canvas=page.locator('#menuScreen canvas:not([data-fruit])').first();
  check(`${label}: hero canvas exists`,await canvas.count()===1);
  if(!await canvas.count())return;
  const result=await canvas.evaluate(c=>{
    const r=c.getBoundingClientRect(),ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;
    let painted=0;for(let i=3;i<data.length;i+=4)if(data[i]>0)painted++;
    return {cssWidth:r.width,cssHeight:r.height,width:c.width,height:c.height,painted,dpr:devicePixelRatio};
  });
  check(`${label}: hero rendered at DPR 2`,result.cssWidth>0&&result.cssHeight>0&&result.painted>100&&Math.abs(result.width-result.cssWidth*2)<3&&Math.abs(result.height-result.cssHeight*2)<3,result);
}
async function stage(page,label,viewport) {
  const canvas=await page.locator('#gameCanvas').boundingBox();
  metrics.push({label,canvas});
  check(`${label}: cutting canvas is at least 220 px tall`,canvas.width>250&&canvas.height>=219.9,canvas);
  if(viewport.width>viewport.height)check(`${label}: landscape canvas fits viewport`,canvas.y>=0&&canvas.y+canvas.height<=viewport.height+.5,canvas);
  await noOverflow(page,label);await buttons(page,label);
}
async function stroke(page,points) {
  await page.evaluate(points=>{
    const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();
    const emit=(event,p)=>c.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerId:7,pointerType:'touch',isPrimary:true,button:0,buttons:event==='pointerup'?0:1,clientX:r.left+p.x,clientY:r.top+p.y}));
    emit('pointerdown',points[0]);for(const p of points.slice(1))emit('pointermove',p);emit('pointerup',points.at(-1));
  },points);
}
async function caption(page,label) {
  const result=await page.locator('#caseCaption').evaluate(c=>{
    const r=c.getBoundingClientRect(),canvas=document.getElementById('gameCanvas').getBoundingClientRect();
    const children=[...c.children].map(n=>{const b=n.getBoundingClientRect();return {text:n.textContent,x:b.x,y:b.y,right:b.right,bottom:b.bottom};});
    return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,canvas:{x:canvas.x,y:canvas.y,right:canvas.right,bottom:canvas.bottom},children};
  });
  const fits=result.x>=result.canvas.x-.5&&result.y>=result.canvas.y-.5&&result.right<=result.canvas.right+.5&&result.bottom<=result.canvas.bottom+.5&&result.children.every(c=>c.x>=result.x-.5&&c.y>=result.y-.5&&c.right<=result.right+.5&&c.bottom<=result.bottom+.5);
  check(`${label}: current fact and all caption text fit the case card`,fits,result);
  check(`${label}: no side panel or duplicate case background`,!await page.locator('#factPanel').isVisible()&&await page.locator('#caseCaption:visible').count()===1);
}
async function readCase(page,label) {
  let count=0;
  while((await snapshot(page)).state==='CASE_INTRO') {
    const s=await snapshot(page),g=s.intro.geometry;
    await caption(page,`${label} card ${s.intro.index+1}`);
    await stroke(page,[{x:g.x-15,y:g.y+g.h*.5},{x:g.x+g.w+15,y:g.y+g.h*.5}]);
    assert.equal((await snapshot(page)).intro.anim,true,'Real pointer swipe must slice the case card');
    await advance(page,650);count++;
    assert.ok(count<12,'Case should enter lesson');
  }
  return count;
}
async function cutYear(page) {
  const g=(await snapshot(page)).level.geometry;
  await stroke(page,[{x:g.x+g.cut,y:g.y-24},{x:g.x+g.cut,y:g.y+g.h+24}]);
}
(async()=>{
  browser=await chromium.launch(launchOptions);
  if(process.argv.includes('--menu-copy')) {
    const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'interface-results.json'),'utf8'));
    reports.push(...previous.checks);failures.push(...previous.failures);metrics.push(...previous.metrics);
    errors.push(...previous.errors);external.push(...previous.externalRequests);
    for(const viewport of viewports)for(const training of [false,true]){
      const session=await setup(viewport,training),p=session.page,label=`${viewport.width} final ${training?'unlocked':'locked'} menu`;
      const copy=await p.locator('.free-card .card-copy p').innerText();
      check(`${label}: fruit reward shows +10 points`,/\+10\s*分/.test(copy),copy);
      await noOverflow(p,label);await screenshot(p,training?'menu-unlocked':'menu-locked',viewport.width);
      await session.context.close();
    }
    check('Final menu wording refresh has no errors or external requests',errors.length===0&&external.length===0,{errors,external});
    save();await browser.close();if(failures.length)process.exitCode=1;return;
  }
  if(process.argv.includes('--landscape-fixes')) {
    const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'interface-results.json'),'utf8'));
    reports.push(...previous.checks);failures.push(...previous.failures);metrics.push(...previous.metrics);
    errors.push(...previous.errors);external.push(...previous.externalRequests);
    const viewport={width:844,height:390},session=await setup(viewport,true),p=session.page;
    await p.locator('button[data-mode="free"]').click();await advance(p,4200);await p.locator('#pauseBtn').click();
    const panel=await p.locator('.overlay-card').boundingBox(),canvas=await p.locator('#gameCanvas').boundingBox();
    check('844 revised pause: compact panel fits fully inside canvas',panel.x>=canvas.x&&panel.y>=canvas.y&&panel.x+panel.width<=canvas.x+canvas.width+.5&&panel.y+panel.height<=canvas.y+canvas.height+.5,{panel,canvas});
    await buttons(p,'844 revised pause');await screenshot(p,'pause',844);
    await p.locator('#resumeBtn').click();check('844 revised pause: resume works',(await snapshot(p)).state==='FREE_SLASH');
    await p.locator('#pauseBtn').click();await p.locator('#pauseHomeBtn').click();
    await p.locator('button[data-mode="reducing"]').click();await screenshot(p,'case',844);
    while((await snapshot(p)).state==='CASE_INTRO') {
      const s=await snapshot(p),g=s.intro.geometry;await caption(p,`844 revised case ${s.intro.index+1}`);
      if(await p.locator('.case-detail').count()){
        const detail=await p.locator('.case-detail').boundingBox(),canvas=await p.locator('#gameCanvas').boundingBox();
        const line=canvas.y+g.y+g.h*.87;
        check(`844 revised case ${s.intro.index+1}: detail stays clear of perforation`,detail.y+detail.height<=line-3,{detailBottom:detail.y+detail.height,perforation:line});
      }
      await stroke(p,[{x:g.x-15,y:g.y+g.h*.5},{x:g.x+g.w+15,y:g.y+g.h*.5}]);await advance(p,650);
    }
    check('844 revised case: real card swipes still enter lesson',(await snapshot(p)).state==='REDUCING_BALANCE');
    check('Latest landscape refinements have no errors or external requests',errors.length===0&&external.length===0,{errors,external});
    save();await session.context.close();await browser.close();if(failures.length)process.exitCode=1;return;
  }
  for(const viewport of viewports) {
    const w=viewport.width;
    const fresh=await setup(viewport,false),p=fresh.page;
    const cards=await p.locator('button[data-mode]').evaluateAll(ns=>ns.map(n=>({mode:n.dataset.mode,disabled:n.disabled,name:n.getAttribute('aria-label')})));
    check(`${w}: four labelled mode cards, with three lessons locked on first visit`,cards.length===4&&cards.filter(c=>c.disabled).length===3&&cards.every(c=>c.name),cards);
    await noOverflow(p,`${w} fresh menu`);await buttons(p,`${w} fresh menu`);await hero(p,`${w} initial menu`);
    await screenshot(p,'menu-locked',w);
    const resizeWidth=w===1280?1024:w===390?420:w-20;
    await p.setViewportSize({width:resizeWidth,height:viewport.height});await advance(p,80);
    await hero(p,`${w} menu after resize`);await p.setViewportSize(viewport);await advance(p,80);
    await p.locator('#settingsBtn').click();
    const dialog=await p.locator('#settingsDialog').evaluate(d=>{const r=d.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height,scrollHeight:d.scrollHeight,clientHeight:d.clientHeight,overflow:getComputedStyle(d).overflowY};});
    check(`${w}: settings dialog fits the viewport and scrolls when needed`,dialog.x>=0&&dialog.y>=0&&dialog.right<=viewport.width+.5&&dialog.bottom<=viewport.height+.5&&(dialog.scrollHeight<=dialog.clientHeight||['auto','scroll'].includes(dialog.overflow)),dialog);
    await buttons(p,`${w} settings`);
    const rows=await p.locator('.setting-row').evaluateAll(ns=>ns.map(n=>({height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
    check(`${w}: settings rows have 44 px touch targets`,rows.every(r=>r.height>=44&&r.width>=44),rows);
    await screenshot(p,'settings',w);
    await p.locator('#resetProgressBtn').scrollIntoViewIfNeeded();
    const reset=await p.locator('#resetProgressBtn').boundingBox();
    check(`${w}: settings reset button can be scrolled fully into view`,reset&&reset.x>=0&&reset.y>=0&&reset.x+reset.width<=viewport.width+.5&&reset.y+reset.height<=viewport.height+.5,reset);
    await p.locator('#closeSettingsBtn').click();
    await p.locator('button[data-mode="free"]').click();await advance(p,4200);
    check(`${w}: free play starts from public mode card`,(await snapshot(p)).state==='FREE_SLASH');
    await stage(p,`${w} free play`,viewport);
    // Find a naturally spawned visible hazard for the screenshot, without changing game state.
    for(let step=0;step<65;step++) {
      const s=await snapshot(p),bounds=await p.locator('#gameCanvas').boundingBox();
      if(s.bombs.some(b=>b.y>b.r&&b.y<bounds.height-b.r)&&s.fruits.some(f=>f.y>f.r&&f.y<bounds.height-f.r))break;
      await advance(p,80);
    }
    await screenshot(p,'free',w);
    await p.locator('#pauseBtn').click();
    const pause=await p.locator('.overlay-card').boundingBox();
    check(`${w}: pause panel fits visible canvas and viewport`,pause.x>=0&&pause.y>=0&&pause.x+pause.width<=viewport.width+.5&&pause.y+pause.height<=viewport.height+.5,pause);
    await buttons(p,`${w} pause`);await screenshot(p,'pause',w);
    await p.locator('#resumeBtn').click();check(`${w}: pause resume button works`,(await snapshot(p)).state==='FREE_SLASH');
    await p.locator('#pauseBtn').click();await p.locator('#pauseHomeBtn').click();
    check(`${w}: pause home button returns to menu`,(await snapshot(p)).state==='MODE_SELECT');
    await fresh.context.close();

    const unlocked=await setup(viewport,true),q=unlocked.page;
    check(`${w}: unlocked menu exposes all four modes`,await q.locator('button[data-mode]:disabled').count()===0);
    await screenshot(q,'menu-unlocked',w);await noOverflow(q,`${w} unlocked menu`);
    await q.locator('button[data-mode="reducing"]').click();
    check(`${w}: reducing balance opens one case fact`,(await snapshot(q)).state==='CASE_INTRO');
    await stage(q,`${w} case intro`,viewport);await caption(q,`${w} initial case`);await screenshot(q,'case',w);
    await readCase(q,`${w} reducing`);
    let s=await snapshot(q);
    check(`${w}: real card swipes enter minimal five-year lesson`,s.state==='REDUCING_BALANCE'&&s.level.rows.length===5&&!await q.locator('#caseCaption').isVisible()&&!await q.locator('#factPanel').isVisible());
    await stage(q,`${w} reducing cut`,viewport);await screenshot(q,'cut',w);
    for(let year=0;year<5;year++){await cutYear(q);assert.equal((await snapshot(q)).level.anim,true);await advance(q,900);}
    await advance(q,1000);s=await snapshot(q);
    check(`${w}: five-year lesson reaches results with zero final book value`,s.state==='LEVEL_RESULTS'&&s.level.rows.at(-1).closing===0&&s.level.rows.at(-1).depreciation===5184);
    await noOverflow(q,`${w} results`);await buttons(q,`${w} results`);await screenshot(q,'results',w);
    if(w===1280||w===390){
      await q.locator('#resultMenuBtn').click();
      for(const [mode,state] of [['straight','STRAIGHT_LINE'],['usage','USAGE_BASED']]) {
        await q.locator(`button[data-mode="${mode}"]`).click();
        await readCase(q,`${w} ${mode}`);check(`${w}: ${mode} mode routing and first slice preserved`,(await snapshot(q)).state===state);
        await cutYear(q);assert.equal((await snapshot(q)).level.anim,true);await advance(q,900);
        await q.locator('#homeBtn').click();
      }
    }
    await unlocked.context.close();
  }
  check('All refreshed UI paths run offline without external requests',external.length===0,external);
  check('All refreshed UI paths have no JavaScript page errors',errors.length===0,errors);
  save();await browser.close();if(failures.length)process.exitCode=1;
})().catch(async error=>{console.error(error);save(error);await browser?.close();process.exitCode=1;});
