// Keep the original cutting bar intact; show the watermelon rind only in results.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,launchOptions}=require('./browser-runtime.cjs');
const root=path.resolve(__dirname,'..'),checks=[],metrics=[],errors=[],external=[];
let browser;
const ok=name=>{checks.push(name);console.log('PASS:',name);};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);
const snap=p=>p.evaluate(()=>FruitSlash.snapshot());
const advance=(p,ms)=>p.clock.runFor(ms);
async function stroke(p,points){
  await p.evaluate(points=>{
    const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect();
    const emit=(event,point)=>c.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerId:7,pointerType:'touch',isPrimary:true,button:0,buttons:event==='pointerup'?0:1,clientX:r.left+point.x,clientY:r.top+point.y}));
    emit('pointerdown',points[0]);for(const point of points.slice(1))emit('pointermove',point);emit('pointerup',points.at(-1));
  },points);
}
async function vertical(p,g,x=g.x+g.cut){await stroke(p,[{x,y:g.y-24},{x,y:g.y+g.h+24}]);}
async function setup(viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:2});
  await context.addInitScript(()=>localStorage.setItem('fruit-slash-academy-v1',JSON.stringify({training:true,best:100,completed:['straight'],settings:{duration:35,sound:false,hints:true}})));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await page.clock.install({time:new Date('2026-10-14T04:00:00Z')});
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.clock.pauseAt(new Date('2026-10-14T04:00:01Z'));
  await page.evaluate(()=>{
    const cc=document.getElementById('gameCanvas').getContext('2d'),fill=cc.fillText.bind(cc);
    window.__cuttingLabels=[];cc.fillText=function(text,...args){window.__cuttingLabels.push(String(text));return fill(text,...args);};
  });
  return {context,page};
}
async function open(p,mode){
  await p.locator(`button[data-mode="${mode}"]`).click();let count=0;
  while((await snap(p)).state==='CASE_INTRO'){
    const g=(await snap(p)).intro.geometry;
    await stroke(p,[{x:g.x-15,y:g.y+g.h*.5},{x:g.x+g.w+15,y:g.y+g.h*.5}]);
    assert.equal((await snap(p)).intro.anim,true);await advance(p,650);assert.ok(++count<12);
  }
  assert.equal((await snap(p)).mode,mode);
}
async function fit(p,label){
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.body.scrollWidth<=innerWidth));
  const s=await snap(p),g=s.level.geometry,r=await p.locator('#gameCanvas').boundingBox();
  assert.ok(g.x>=0&&g.y>=0&&g.x+g.width<=r.width+.5&&g.y+g.h<=r.height+.5);
  ok(`${label}: original watermelon bar and residual strip fit the canvas without horizontal page overflow`);
}
async function inspectLiveStrip(p,label){
  const g=(await snap(p)).level.geometry;
  const result=await p.evaluate(g=>{
    const c=document.getElementById('gameCanvas'),r=c.getBoundingClientRect(),ratio=c.width/r.width;
    const x=(g.x+g.width-g.residual*.90)*ratio,y=(g.y+g.h*.10)*ratio,w=g.residual*.80*ratio,h=g.h*.80*ratio;
    const data=c.getContext('2d').getImageData(Math.floor(x),Math.floor(y),Math.max(1,Math.floor(w)),Math.max(1,Math.floor(h))).data;
    let red=0,green=0;
    for(let i=0;i<data.length;i+=4){const [r,g,b]=[data[i],data[i+1],data[i+2]];if(r>150&&r>g*1.45&&r>b*1.18)red++;if(g>r*1.08&&g>b*1.05)green++;}
    const cc=c.getContext('2d');
    // These points lie in the hollow area of the discarded live crescent.
    const samples=[[.20,.25],[.20,.75],[.80,.25],[.80,.75]].map(([dx,dy])=>{
      const pixel=cc.getImageData(Math.floor((g.x+g.width-g.residual+g.residual*dx)*ratio),Math.floor((g.y+g.h*dy)*ratio),1,1).data;
      return [...pixel];
    });
    return {red,green,pixels:data.length/4,samples};
  },g);
  metrics.push({label,...result});assert.equal(result.red,0);assert.ok(result.green>result.pixels*.90);
  for(const [r,g,b,a] of result.samples){assert.ok(g>r*1.08&&g>b*1.05&&a===255);}
  assert.ok(await p.evaluate(()=>window.__cuttingLabels.every(text=>!text.includes('西瓜皮'))));
  ok(`${label}: live residual remains a filled green rectangle with the original labels and no live rind illustration`);
}
async function inspectPreview(p,label,watermelon){
  const card=p.locator('.residual-result');assert.equal(await card.count(),1);assert.ok((await card.innerText()).includes('$6,000'));
  assert.ok((await card.innerText()).includes('西瓜皮'));
  const c=card.locator('canvas[data-result-residual]');assert.equal(await c.count(),1);assert.equal(await c.getAttribute('role'),'img');
  const name=await c.getAttribute('aria-label');assert.ok(name&&name.includes('$6,000')&&name.includes('殘值'));
  assert.equal(name.includes('西瓜'),watermelon);
  const box=await c.boundingBox();assert.ok(box.width>=50&&box.height>=25);
  const result=await c.evaluate(c=>{
    const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let painted=0,red=0,green=0;
    for(let i=0;i<data.length;i+=4){if(data[i+3]<128)continue;painted++;const [r,g,b]=[data[i],data[i+1],data[i+2]];if(r>150&&r>g*1.45&&r>b*1.18)red++;if(g>r*1.08&&g>b*1.05)green++;}
    return {width:c.width,height:c.height,painted,red,green};
  });
  metrics.push({label,...result});assert.ok(result.painted>200);
  if(watermelon){assert.equal(result.red,0);assert.ok(result.green>result.painted*.25);}
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  ok(`${label}: result displays a painted, accessible ${watermelon?'watermelon rind':'fruit-appropriate peel'} worth $6,000`);
}
async function straight(p,width){
  const label=`${width} px straight-line`;
  await open(p,'straight');assert.equal((await snap(p)).state,'STRAIGHT_LINE');
  const initial=(await snap(p)).level.geometry;near(initial.residual/initial.full,6000/54000);
  await fit(p,label);
  await inspectLiveStrip(p,`${label} first-year full bar`);
  assert.ok(await p.evaluate(()=>window.__cuttingLabels.includes('殘值')));
  await p.screenshot({path:path.join(__dirname,`rind-live-before-${width}.png`),fullPage:true});
  for(let i=0;i<4;i++){
    let s=await snap(p),g=s.level.geometry;assert.equal(s.level.index,i);near(g.residual,initial.residual);assert.ok(g.width>=g.residual+g.cut-1e-8);
    await vertical(p,g,g.x+g.width-g.residual*.5);assert.equal((await snap(p)).level.anim,false);assert.equal((await snap(p)).level.index,i);
    await advance(p,900);await inspectLiveStrip(p,`${label} year ${i+1}`);
    if(i===3)await p.screenshot({path:path.join(__dirname,`rind-live-last-year-${width}.png`),fullPage:true});
    await vertical(p,g);assert.equal((await snap(p)).level.anim,true);await advance(p,900);
    s=await snap(p);assert.equal(s.level.index,i+1);near(s.level.geometry.residual,initial.residual);
  }
  ok(`${label}: all four $12,000 slices preserve the proportional rectangular strip and cuts inside it cannot remove the residual`);
  let s=await snap(p);near(s.level.geometry.width,s.level.geometry.residual);assert.equal(s.level.rows.at(-1).closing,6000);assert.equal(s.level.rows.at(-1).accumulated,48000);
  // Preserve the original brief retained-residual rectangle before results.
  await advance(p,300);await inspectLiveStrip(p,`${label} completed live fruit`);
  assert.ok(await p.evaluate(()=>window.__cuttingLabels.includes('保留估計殘值 $6,000')));
  await p.screenshot({path:path.join(__dirname,`rind-live-retained-${width}.png`),fullPage:true});
  await vertical(p,s.level.geometry,s.level.geometry.x+s.level.geometry.residual*.5);assert.equal((await snap(p)).level.anim,false);
  await advance(p,1000);assert.equal((await snap(p)).state,'LEVEL_RESULTS');
  await inspectPreview(p,label,true);
  const cells=await p.locator('.account-table tbody tr').last().locator('td').allTextContents();assert.deepEqual(cells,['2029','$12,000','$48,000','$6,000']);
  await p.screenshot({path:path.join(__dirname,`rind-results-${width}.png`),fullPage:true});
  await p.locator('.residual-result').screenshot({path:path.join(__dirname,`rind-preview-${width}.png`)});
  if(width===1280)await p.locator('.residual-rind').screenshot({path:path.join(__dirname,'rind-result-card.png')});
  ok(`${label}: the completed table preserves the $6,000 closing value`);
}
async function usage(p){
  await p.locator('#resultMenuBtn').click();await open(p,'usage');const start=(await snap(p)).level.geometry;
  while((await snap(p)).state==='USAGE_BASED'){
    const s=await snap(p),g=s.level.geometry;near(g.residual,start.residual);
    if(s.level.index>=s.level.rows.length){await advance(p,1000);break;}
    if(g.row.depreciation===0)await advance(p,3000);else{await vertical(p,g);assert.equal((await snap(p)).level.anim,true);await advance(p,900);}
  }
  assert.equal((await snap(p)).state,'LEVEL_RESULTS');assert.equal((await snap(p)).level.rows.at(-1).closing,6000);
  const residual=p.locator('.residual-result');assert.equal(await residual.count(),1);assert.ok((await residual.innerText()).includes('$6,000'));assert.equal(await residual.locator('canvas[data-result-residual]').count(),0);assert.equal((await residual.innerText()).includes('西瓜皮'),false);
  await p.locator('.residual-result').screenshot({path:path.join(__dirname,'rind-usage-preview.png')});
  ok('Usage-based depreciation still preserves $6,000 and does not label its papaya peel as watermelon');
}
async function reducing(p){
  await p.locator('#resultMenuBtn').click();await open(p,'reducing');assert.equal((await snap(p)).level.rows.length,5);
  for(let i=0;i<5;i++){
    const g=(await snap(p)).level.geometry;assert.equal(g.residual,0);await vertical(p,g);assert.equal((await snap(p)).level.anim,true);await advance(p,900);
  }
  near((await snap(p)).level.geometry.width,0);await advance(p,1000);assert.equal((await snap(p)).state,'LEVEL_RESULTS');
  assert.equal((await snap(p)).level.rows.at(-1).closing,0);assert.equal(await p.locator('.residual-result').count(),0);
  ok('Five-year reducing balance fully depreciates to $0 and has no retained-peel result');
}
(async()=>{
  browser=await chromium.launch(launchOptions);
  for(const viewport of [{width:1280,height:850},{width:390,height:844}]){
    const {context,page}=await setup(viewport);await straight(page,viewport.width);
    if(viewport.width===1280){await usage(page);await reducing(page);}
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);ok('Original live bars and completion-only rind previews work offline without JavaScript errors or network requests');
  fs.writeFileSync(path.join(__dirname,'residual-rind-results.json'),JSON.stringify({passed:checks.length,checks,metrics,errors,externalRequests:external},null,2));
  await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
