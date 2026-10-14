// Verify that the reducing-balance lesson clears the depreciable balance in its final useful-life year.
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
  async function stroke(points,type='touch'){
    await page.evaluate(({points,type})=>{
      const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();
      const emit=(event,p)=>c.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerId:7,pointerType:type,isPrimary:true,button:0,buttons:event==='pointerup'?0:1,clientX:r.left+p.x,clientY:r.top+p.y}));
      emit('pointerdown',points[0]);for(const p of points.slice(1))emit('pointermove',p);emit('pointerup',points.at(-1));
    },{points,type});
  }
  const vertical=(g,x=g.x+g.cut)=>[{x,y:g.y-24},{x,y:g.y+g.h+24}];
  async function openCase(){
    await page.locator('button[data-mode="reducing"]').click();
    assert.equal((await snap()).intro.total,6);
    const cards=[];
    while((await snap()).state==='CASE_INTRO'){
      const s=await snap(),g=s.intro.geometry;
      cards.push(Object.values(s.intro.card).join(' '));
      assert.equal(await page.locator('#caseCaption').isVisible(),true);
      await stroke([{x:g.x-15,y:g.y+g.h*.5},{x:g.x+g.w+15,y:g.y+g.h*.5}]);
      assert.equal((await snap()).intro.anim,true);await advance(650);
    }
    assert.equal((await snap()).state,'REDUCING_BALANCE');
    assert.ok(cards.some(c=>c.includes('5 年')));
    assert.ok(cards.some(c=>c.includes('殘值')&&c.includes('$0')));
    assert.ok(cards.at(-1).includes('最後一年'));
    return cards;
  }
  const cards=await openCase();
  ok('Six separate case cards explain the five-year useful life, zero residual and final-year rule');
  const ordinary=[];
  for(let i=0;i<4;i++){
    const s=await snap(),g=s.level.geometry;ordinary.push(g.cut);
    assert.equal(g.row.finalYear,false);assert.ok(Math.abs(g.cut/g.width-.4)<1e-12);
    assert.equal(await page.locator('#taskText').innerText(),'切走剩餘的 40%');
    await stroke(vertical(g));assert.equal((await snap()).level.anim,true);await advance(900);
    assert.equal((await snap()).level.index,i+1);
  }
  assert.ok(ordinary.slice(1).every((w,i)=>ordinary[i]>w));
  ok('The first four years use 40% of their opening values and their slice widths decrease');
  let s=await snap(),g=s.level.geometry;
  assert.equal(g.row.finalYear,true);assert.equal(g.row.opening,5184);assert.equal(g.row.depreciation,5184);
  assert.equal(g.cut,g.width);
  const task=await page.locator('#taskText').innerText(),hint=await page.locator('#gameHint').innerText();
  assert.equal(task,'最後一年：切清剩餘 $5,184');assert.ok(hint.includes('期初帳面淨值 − 殘值'));
  assert.equal(`${task} ${hint}`.includes('40%'),false);
  await page.screenshot({path:path.join(root,'tests/reducing-final-before.png'),fullPage:true});
  ok('The final-year target reaches the fruit edge and the prompt replaces the ordinary 40% instruction');
  await stroke(vertical(g,g.x+g.width*.4));assert.equal((await snap()).level.anim,false);
  assert.equal((await snap()).level.index,4);
  ok('Cutting just 40% in the final year is rejected without advancing');
  // A small touch offset beyond the fruit edge still hits the final-year guide.
  await stroke(vertical(g,g.x+g.cut+g.width*.06));assert.equal((await snap()).level.anim,true);
  await advance(900);s=await snap();
  assert.equal(s.level.index,5);assert.equal(s.level.geometry.width,0);assert.equal(s.level.geometry.residual,0);
  assert.equal(s.level.rows.at(-1).closing,0);assert.equal(s.level.rows.at(-1).accumulated,40000);
  await page.screenshot({path:path.join(root,'tests/reducing-final-cleared.png'),fullPage:true});
  ok('A touch slice at the small final edge clears the entire $5,184 balance and leaves no residual fruit');
  await advance(1000);s=await snap();assert.equal(s.state,'LEVEL_RESULTS');
  assert.deepEqual(s.level.rows.map(r=>r.depreciation),[16000,9600,5760,3456,5184]);
  assert.deepEqual(s.level.rows.map(r=>r.closing),[24000,14400,8640,5184,0]);
  const message=await page.locator('.result-message').innerText();
  assert.ok(message.includes('最後一年'));assert.ok(message.includes('40%'));
  const formula=await page.locator('.formula').innerText();
  assert.ok(formula.includes('折舊率'));assert.ok(formula.includes('最後一年'));assert.ok(formula.includes('期初帳面淨值'));assert.ok(formula.includes('殘值'));assert.ok(formula.includes('$5,184'));
  const finalCells=await page.locator('.account-table tbody tr').last().locator('td').allTextContents();
  assert.deepEqual(finalCells,['2030','$5,184','$40,000','$0']);
  assert.equal(await page.locator('.residual-result').count(),0);
  await page.screenshot({path:path.join(root,'tests/reducing-final-results.png'),fullPage:true});
  ok('Results show $5,184 final depreciation, $40,000 accumulated depreciation and $0 closing value with the final-year formula');
  // Recheck the boundary on a phone where the fruit and hit tolerance are smaller.
  await page.locator('#resultMenuBtn').click();await page.setViewportSize({width:390,height:844});await advance(50);await openCase();
  for(let i=0;i<4;i++){g=(await snap()).level.geometry;await stroke(vertical(g));assert.equal((await snap()).level.anim,true);await advance(900);}
  g=(await snap()).level.geometry;await page.screenshot({path:path.join(root,'tests/reducing-final-phone-before.png'),fullPage:true});await stroke(vertical(g,g.x+g.cut+g.width*.06));assert.equal((await snap()).level.anim,true);await advance(900);
  assert.equal((await snap()).level.geometry.width,0);await advance(1000);assert.equal((await snap()).state,'LEVEL_RESULTS');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(root,'tests/reducing-final-phone-results.png'),fullPage:true});
  ok('Phone touch input also accepts the final fruit-edge slice and completes without horizontal overflow');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  ok('Reducing-balance final-year interactions work offline without JavaScript errors');
  fs.writeFileSync(path.join(root,'tests/reducing-final-results.json'),JSON.stringify({passed:reports.length,checks:reports,cards,errors,externalRequests:external},null,2));
  await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
