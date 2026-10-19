// Verify the $160,000 / 50% / $10,000 example through real case-card and cutting input.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium,launchOptions}=require('./browser-runtime.cjs');
const root=path.resolve(__dirname,'..'),reports=[],errors=[],external=[],caseCards={};
const expectedDepreciation=[80000,40000,20000,10000],expectedClosing=[80000,40000,20000,10000];
let browser;
const ok=name=>{reports.push(name);console.log('PASS:',name);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} should equal ${b}`);
(async()=>{
  browser=await chromium.launch(launchOptions);
  for(const viewport of [{width:1024,height:768},{width:390,height:844}]){
    const width=viewport.width,context=await browser.newContext({viewport,deviceScaleFactor:2});
    await context.addInitScript(()=>{
      localStorage.setItem('fruit-slash-academy-v1',JSON.stringify({training:true,best:100,completed:['straight'],settings:{duration:35,sound:false,hints:true}}));
      // Observe actual canvas wording, including text on each result-preview canvas.
      window.__canvasLabels=new Map();
      const original=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(value,...args){
        const labels=window.__canvasLabels.get(this.canvas)||[];
        labels.push(String(value));if(labels.length>500)labels.splice(0,labels.length-500);
        window.__canvasLabels.set(this.canvas,labels);
        return original.call(this,value,...args);
      };
    });
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push({width,error:String(e)}));
    page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
    await page.clock.install({time:new Date('2026-10-19T04:00:00Z')});
    await page.clock.pauseAt(new Date('2026-10-19T04:00:01Z'));
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    const snap=()=>page.evaluate(()=>FruitSlash.snapshot()),advance=ms=>page.clock.runFor(ms);
    async function stroke(points){
      await page.evaluate(points=>{
        const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();
        const emit=(event,p)=>c.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerId:7,pointerType:'touch',isPrimary:true,button:0,buttons:event==='pointerup'?0:1,clientX:r.left+p.x,clientY:r.top+p.y}));
        emit('pointerdown',points[0]);for(const p of points.slice(1))emit('pointermove',p);emit('pointerup',points.at(-1));
      },points);
    }
    const vertical=(g,x=g.x+g.cut)=>[{x,y:g.y-24},{x,y:g.y+g.h+24}];
    const screenshot=label=>page.screenshot({path:path.join(__dirname,`reducing-${label}-${width}.png`),fullPage:true});
    assert.equal((await page.locator('.reducing-card .small-ratio').innerText()).trim(),'50%');
    ok(`${width}: menu badge displays the updated 50% rate`);
    await page.locator('button[data-mode="reducing"]').click();
    assert.equal((await snap()).intro.total,5);
    const cards=[];
    while((await snap()).state==='CASE_INTRO'){
      const s=await snap(),g=s.intro.geometry;
      cards.push(Object.values(s.intro.card).join(' '));
      assert.equal(await page.locator('#caseCaption').isVisible(),true);
      assert.ok((await page.locator('#caseCaption').innerText()).includes(s.intro.card.value));
      await stroke([{x:g.x-15,y:g.y+g.h*.5},{x:g.x+g.w+15,y:g.y+g.h*.5}]);
      assert.equal((await snap()).intro.anim,true);await advance(650);
    }
    caseCards[width]=cards;
    assert.equal(cards.length,5);
    assert.equal(cards.some(c=>c.includes('殘值下限')),false);
    assert.equal((await snap()).state,'REDUCING_BALANCE');
    assert.ok(cards.some(c=>c.includes('$160,000')));
    assert.ok(cards.some(c=>c.includes('50%')));
    assert.ok(cards.some(c=>c.includes('示範年度')&&c.includes('4 年')&&c.includes('2026')&&c.includes('2029')));
    assert.ok(cards.some(c=>c.includes('殘值')&&c.includes('$10,000')));
    assert.equal(cards.some(c=>c.includes('$40,000')||c.includes('40%')||c.includes('切清餘額')||c.includes('2030')||c.includes('可使用年期')),false);
    assert.equal((await snap()).level.rows.length,4);
    assert.deepEqual((await snap()).level.rows.map(r=>r.year),[2026,2027,2028,2029]);
    ok(`${width}: five genuine case-card swipes explain $160,000 cost, 50% rate, four demonstration years and $10,000 residual`);
    const sliceWidths=[];
    for(let i=0;i<4;i++){
      const s=await snap(),g=s.level.geometry;sliceWidths.push(g.cut);
      assert.equal(s.level.index,i);assert.equal(g.row.finalYear,false);
      assert.equal(g.row.depreciation,expectedDepreciation[i]);near(g.cut/g.width,.5);near(g.residual/g.full,10000/160000);
      assert.equal(await page.locator('#taskText').innerText(),'切走剩餘的 50%');
      // Attempting to slice inside the retained strip must never advance a year.
      await stroke(vertical(g,g.x+g.width-g.residual*.5));
      assert.equal((await snap()).level.anim,false);assert.equal((await snap()).level.index,i);
      await stroke(vertical(g));assert.equal((await snap()).level.anim,true);await advance(900);
      assert.equal((await snap()).level.index,i+1);
      assert.ok((await snap()).level.geometry.width>=(await snap()).level.geometry.residual);
    }
    assert.ok(sliceWidths.slice(1).every((w,i)=>sliceWidths[i]>w));
    ok(`${width}: four 50% cuts decrease from $80,000 to $10,000, while cuts inside the residual strip are rejected`);
    let s=await snap(),g=s.level.geometry;
    assert.equal(s.level.index,4);assert.equal(s.level.rows.length,4);assert.equal(s.level.rows.at(-1).finalYear,false);
    assert.equal(s.level.rows.at(-1).year,2029);assert.equal(s.level.rows.at(-1).depreciation,10000);
    near(g.width,g.residual);assert.equal(g.cut,0);
    await page.evaluate(()=>window.__canvasLabels.set(document.getElementById('gameCanvas'),[]));await advance(32);
    const labels=await page.evaluate(()=>window.__canvasLabels.get(document.getElementById('gameCanvas'))||[]);
    assert.ok(labels.some(t=>t.includes('$10,000')));
    assert.equal(labels.some(t=>t.includes('2030')||t.includes('工廠休息')||t.includes('使用 0 次')||t.includes('西瓜皮')),false);
    await stroke(vertical(g,g.x+g.residual*.5));assert.equal((await snap()).level.anim,false);assert.equal((await snap()).level.index,4);
    ok(`${width}: the fourth cut leaves only $10,000 residual, with no 2030 target or additional zero-depreciation year`);
    await screenshot('retained');await advance(1000);s=await snap();assert.equal(s.state,'LEVEL_RESULTS');
    assert.deepEqual(s.level.rows.map(r=>r.depreciation),expectedDepreciation);assert.deepEqual(s.level.rows.map(r=>r.closing),expectedClosing);
    assert.equal(s.level.rows.at(-1).accumulated,150000);
    const rows=page.locator('.account-table tbody tr');assert.equal(await rows.count(),4);
    assert.deepEqual(await rows.last().locator('td').allTextContents(),['2029','$10,000','$150,000','$10,000']);
    const resultText=await page.locator('#resultContent').innerText(),formula=await page.locator('.formula').innerText();
    assert.ok(resultText.includes('50%'));assert.ok(formula.includes('期初帳面淨值'));assert.ok(formula.includes('殘值'));assert.ok(formula.includes('$10,000'));
    assert.equal(resultText.includes('40%')||resultText.includes('$5,184')||resultText.includes('2030'),false);
    assert.equal(await page.locator('.residual-result').count(),1);assert.ok((await page.locator('.residual-result').innerText()).includes('$10,000'));
    assert.equal(await page.locator('.residual-rind, [data-result-residual]').count(),0);assert.equal(resultText.includes('西瓜皮'),false);
    assert.equal(await page.locator('[data-result-piece]').count(),4);assert.equal(await page.locator('[data-result-piece="4"]').count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.body.scrollWidth<=innerWidth));
    await screenshot('results');
    ok(`${width}: results show exactly four rows through 2029 and preserve $10,000, with no 2030 preview or watermelon-rind art`);
    await page.locator('#replayBtn').click();assert.equal((await snap()).state,'CASE_INTRO');assert.equal((await snap()).intro.index,0);
    ok(`${width}: replay returns to the first case card`);
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  ok('Updated reducing-balance lesson works offline without JavaScript errors or external requests');
  fs.writeFileSync(path.join(__dirname,'reducing-final-results.json'),JSON.stringify({passed:reports.length,checks:reports,cards:caseCards,errors,externalRequests:external},null,2));
  await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
