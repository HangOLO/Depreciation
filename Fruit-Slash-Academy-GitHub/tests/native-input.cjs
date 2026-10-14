const path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium,launchOptions}=require('./browser-runtime.cjs');
let browser;
(async()=>{
  browser=await chromium.launch(launchOptions);
  const page=await browser.newPage({viewport:{width:1024,height:768},deviceScaleFactor:2,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.locator('button[data-mode="free"]').click();await page.waitForTimeout(4100);
  const s=await page.evaluate(()=>FruitSlash.snapshot()),box=await page.locator('#gameCanvas').boundingBox();const f=s.fruits.find(f=>f.y>30&&f.y<box.height-40);assert.ok(f);
  await page.mouse.move(box.x+f.x-f.r*2,box.y+f.y);await page.mouse.down();await page.mouse.move(box.x+f.x+f.r*2,box.y+f.y);await page.mouse.up();assert.ok((await page.evaluate(()=>FruitSlash.snapshot())).score>=10);await page.waitForTimeout(30);await page.screenshot({path:path.resolve(__dirname,'native-free.png')});
  await page.locator('#homeBtn').click();
  // Lesson fixture: reflects saved completed training, without changing game internals.
  await page.addInitScript(()=>localStorage.setItem('fruit-slash-academy-v1',JSON.stringify({training:true,best:100,completed:[],settings:{duration:35,sound:false,hints:true}})));await page.reload();await page.locator('button[data-mode="straight"]').click();
  assert.equal((await page.evaluate(()=>FruitSlash.snapshot())).state,'CASE_INTRO');
  await page.screenshot({path:path.resolve(__dirname,'native-case.png')});
  const count=(await page.evaluate(()=>FruitSlash.snapshot())).intro.total;
  for(let i=0;i<count;i++){
    const intro=await page.evaluate(()=>FruitSlash.snapshot().intro),r=await page.locator('#gameCanvas').boundingBox(),g=intro.geometry;
    assert.equal(intro.index,i);
    await page.mouse.move(r.x+g.x-15,r.y+g.y+g.h*.5);await page.mouse.down();
    await page.mouse.move(r.x+g.x+g.w+15,r.y+g.y+g.h*.5,{steps:12});await page.mouse.up();
    assert.equal((await page.evaluate(()=>FruitSlash.snapshot())).intro.anim,true);await page.waitForTimeout(650);
  }
  assert.equal((await page.evaluate(()=>FruitSlash.snapshot())).state,'STRAIGHT_LINE');
  await page.screenshot({path:path.resolve(__dirname,'native-straight.png')});
  const g=await page.evaluate(()=>FruitSlash.snapshot().level.geometry),rect=await page.locator('#gameCanvas').boundingBox();
  const client=await page.context().newCDPSession(page),x=rect.x+g.x+g.cut;await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:rect.y+g.y-20}]});for(let y=rect.y+g.y-19;y<=rect.y+g.y+g.h+20;y+=1)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok((await page.evaluate(()=>FruitSlash.snapshot())).level.anim);await page.waitForTimeout(1000);assert.equal((await page.evaluate(()=>FruitSlash.snapshot())).level.index,1);
  const pixels=await page.locator('#gameCanvas').evaluate(c=>{const v=c.getContext('2d').getImageData(0,0,1,1).data;return [...v];});assert.ok(pixels[0]+pixels[1]+pixels[2]>0);assert.deepEqual(errors,[]);
  console.log('PASS: native mouse case-card swipes, native free-play mouse, native emulated touch with 1 px movement, live Canvas rendering and no JavaScript errors');await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
