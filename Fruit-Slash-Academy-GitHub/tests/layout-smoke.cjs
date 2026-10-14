const path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium,launchOptions}=require('./browser-runtime.cjs');
let browser;
(async()=>{
  browser=await chromium.launch(launchOptions);
  const page=await browser.newPage({deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>localStorage.setItem('fruit-slash-academy-v1',JSON.stringify({training:true,settings:{sound:false}})));
  for(const viewport of [{width:1024,height:768},{width:844,height:390},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.locator('button[data-mode="straight"]').click();
    assert.equal((await page.evaluate(()=>FruitSlash.snapshot())).state,'CASE_INTRO');
    await page.screenshot({path:path.resolve(__dirname,`final-case-${viewport.width}.png`),fullPage:true});
    const count=(await page.evaluate(()=>FruitSlash.snapshot())).intro.total;
    for(let i=0;i<count;i++){
      const intro=await page.evaluate(()=>FruitSlash.snapshot().intro),r=await page.locator('#gameCanvas').boundingBox(),g=intro.geometry;
      assert.equal(intro.index,i);await page.mouse.move(r.x+g.x-15,r.y+g.y+g.h*.5);await page.mouse.down();await page.mouse.move(r.x+g.x+g.w+15,r.y+g.y+g.h*.5,{steps:8});await page.mouse.up();await page.waitForTimeout(650);
    }
    assert.equal((await page.evaluate(()=>FruitSlash.snapshot())).state,'STRAIGHT_LINE');
    const size=await page.locator('#gameCanvas').boundingBox(),home=await page.locator('#homeBtn').boundingBox(),pause=await page.locator('#pauseBtn').boundingBox();assert.ok(size.height>=220);assert.ok(home.y>=0&&pause.y>=0&&home.height>=44&&pause.height>=44);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(viewport.width>viewport.height)assert.ok(size.y+size.height<=viewport.height);
    const colors=await page.locator('#gameCanvas').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,1,1).data;return p[0]+p[1]+p[2];});assert.ok(colors>0);
    await page.screenshot({path:path.resolve(__dirname,`final-play-${viewport.width}.png`),fullPage:true});console.log('PASS: responsive live game',viewport.width,viewport.height,'canvas',Math.round(size.width),Math.round(size.height));
  }
  assert.deepEqual(errors,[]);await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
