/* Fruit Slash Academy — all artwork and audio are generated locally. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const A = globalThis.Accounting, Art = globalThis.FruitArt;
  const STORAGE = 'fruit-slash-academy-v1';
  const STATES = Object.freeze({ MENU:'MENU', CASE:'CASE_INTRO', FREE:'FREE_SLASH', FREE_RESULTS:'FREE_RESULTS', UNLOCK:'UNLOCK_ANIMATION', SELECT:'MODE_SELECT', STRAIGHT:'STRAIGHT_LINE', REDUCING:'REDUCING_BALANCE', USAGE:'USAGE_BASED', RESULTS:'LEVEL_RESULTS', PAUSED:'PAUSED' });
  const TITLES = {free:'自由切水果',straight:'直線法 · 平均切',reducing:'餘額遞減法 · 保留殘值',usage:'按使用量法 · 用幾多，切幾多'};
  const BOMB_PENALTY=50, BOMB_STUN=.65;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch (_) { /* memory fallback */ }
  const settings = {duration:[20,35,60].includes(saved.settings?.duration) ? saved.settings.duration : 35,sound:saved.settings?.sound !== false,hints:saved.settings?.hints !== false};
  const progress = {training:saved.training === true,best:Number.isFinite(saved.best) ? Math.max(0,saved.best) : 0,completed:Array.isArray(saved.completed) ? saved.completed.filter(v=>['straight','reducing','usage'].includes(v)) : []};
  let storageWorks = true, state = STATES.MENU, mode = 'free', previousState = null;
  let W=900,H=520,dpr=1,last=0,elapsed=0,countdown=0,score=0,maxCombo=0,wave=0,nextWave=0;
  let fruits=[],bombs=[],explosions=[],halves=[],particles=[],popups=[],trail=[],gesture=null,level=null,intro=null,resultAge=0,firstUnlock=false,bombHits=0,stun=0;
  let frameAverage=16,particleBudget=28,fruitID=0,shake=0;
  const canvas=$('gameCanvas'),ctx=canvas.getContext('2d',{alpha:false});
  const random=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const ease=t=>1-Math.pow(1-clamp(t,0,1),3);
  const fmt=A.money;
  function save() {
    try { localStorage.setItem(STORAGE,JSON.stringify({...progress,settings})); storageWorks=true; }
    catch (_) { storageWorks=false; }
  }
  if(Object.prototype.hasOwnProperty.call(saved.settings||{},'observation'))save();
  const AudioFX={
    context:null,
    init(){if(!settings.sound)return;try{this.context ||= new (window.AudioContext||window.webkitAudioContext)();if(this.context.state==='suspended')this.context.resume().catch(()=>{});}catch(_){}},
    tone(f=600,d=.1,volume=.08,type='sine',end=900,delay=0){const c=this.context;if(!settings.sound||!c||c.state!=='running')return;const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,end),t+d);g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d+.02);},
    slice(){this.tone(random(700,1000),.09,.055,'triangle',220);const c=this.context;if(!settings.sound||!c||c.state!=='running')return;const b=c.createBuffer(1,Math.floor(c.sampleRate*.07),c.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=b;f.type='highpass';f.frequency.value=1600;g.gain.value=.10;s.connect(f);f.connect(g);g.connect(c.destination);s.start();},
    win(){[523,659,784,1047].forEach((f,i)=>this.tone(f,.23,.09,'triangle',f*1.01,i*.105));},
    combo(){this.tone(880,.15,.09,'sine',1320);},
    explode(){this.tone(95,.32,.16,'sine',30);const c=this.context;if(!settings.sound||!c||c.state!=='running')return;const b=c.createBuffer(1,Math.floor(c.sampleRate*.22),c.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=900;g.gain.value=.18;s.connect(f);f.connect(g);g.connect(c.destination);s.start();}
  };
  function soundButtons(){['soundBtn','playSoundBtn'].forEach(id=>{const b=$(id);b.setAttribute('aria-label',settings.sound?'關閉音效':'開啟音效');b.setAttribute('aria-pressed',String(settings.sound));b.classList.toggle('muted',!settings.sound);b.dataset.sound=settings.sound?'on':'off';});$('soundSetting').checked=settings.sound;}
  function showScreen(name){['menuScreen','playScreen','resultScreen'].forEach(id=>$(id).classList.toggle('hidden',id!==name));document.body.classList.toggle('playing',name==='playScreen');document.body.classList.toggle('learning',name==='playScreen'&&mode!=='free');document.body.classList.toggle('case-intro',name==='playScreen'&&!!intro);window.scrollTo(0,0);if(name==='playScreen')resize();}
  function updateMenu(){
    const straightDone=progress.completed.includes('straight'),allowed=A.allowedModes(progress.training,straightDone);
    document.querySelectorAll('button[data-mode]').forEach(card=>{const m=card.dataset.mode,open=allowed.includes(m),needsStraight=m!=='free'&&m!=='straight'&&!straightDone;card.disabled=!open;card.setAttribute('aria-label',`${TITLES[m]}，${open?'開始遊戲':needsStraight?'完成直線法後解鎖':'目前鎖定'}`);card.classList.toggle('locked',!open);card.classList.toggle('is-unlocked',open);card.querySelector('.card-status').textContent=open?(progress.completed.includes(m)?'挑戰完成':m==='free'?'已開放':'已解鎖'):(progress.training?'稍後開放':'未解鎖');card.querySelector('.card-action').innerHTML=open?(m==='free'?'開始切水果':'開始挑戰'):`<svg class="lock-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4.5" y="8" width="11" height="8.5" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 8V5a3 3 0 0 1 6 0v3" stroke="currentColor" stroke-width="1.5"/></svg>${needsStraight?'先完成直線法':'尚未解鎖'}`;});
    $('bestScore').textContent=progress.best.toLocaleString('en-HK');
    $('menuNote').textContent=!storageWorks?'這個瀏覽器未能儲存進度，本次仍可正常遊玩。':progress.training?(straightDone?'三種切法已開放，揀一種開始挑戰！':'先完成直線法，再解鎖另外兩種切法。'):`先玩一場 ${settings.duration} 秒自由切水果，完成就解鎖直線法。`;
    soundButtons();drawMenuArt();
  }
  function drawMenuArt(){document.querySelectorAll('canvas[data-fruit]').forEach((c,i)=>{const r=c.getBoundingClientRect();if(!r.width)return;const ratio=window.devicePixelRatio||1;c.width=Math.round(r.width*ratio);c.height=Math.round(r.height*ratio);const cc=c.getContext('2d');cc.setTransform(ratio,0,0,ratio,0,0);cc.translate(r.width*.52,r.height*.56);cc.rotate(i===2?-.18:.12);Art.draw(cc,c.dataset.fruit,Math.min(r.width*.28,r.height*.35),i===1);});}
  function menu(){state=STATES.SELECT;gesture=null;level=null;intro=null;$('caseCaption').classList.add('hidden');fruits=[];bombs=[];explosions=[];stun=0;halves=[];particles=[];trail=[];popups=[];hideOverlay();showScreen('menuScreen');updateMenu();}
  function resize(){const rect=$('canvasWrap').getBoundingClientRect();if(!rect.width||!rect.height)return;const ratio=window.devicePixelRatio||1;if(W===rect.width&&H===rect.height&&dpr===ratio&&canvas.width===Math.round(W*dpr))return;const oldW=W,oldH=H;W=rect.width;H=rect.height;dpr=ratio;canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(oldW&&oldH){for(const list of [fruits,bombs,explosions,halves,particles,popups])for(const f of list){f.x*=W/oldW;f.y*=H/oldH;}for(const p of trail){p.x*=W/oldW;p.y*=H/oldH;}}gesture=null;drawMenuArt();syncCaseCaption();render();}
  new ResizeObserver(()=>resize()).observe($('canvasWrap'));
  window.addEventListener('resize',()=>{resize();drawMenuArt();});
  function overlay(html){$('gameOverlay').innerHTML=html;$('gameOverlay').classList.remove('hidden');}
  function hideOverlay(){$('gameOverlay').classList.add('hidden');$('gameOverlay').innerHTML='';}
  function start(m){
    if(!A.allowedModes(progress.training,progress.completed.includes('straight')).includes(m))return;
    AudioFX.init();mode=m;document.body.dataset.mode=m;state=m==='free'?STATES.FREE:m==='straight'?STATES.STRAIGHT:m==='reducing'?STATES.REDUCING:STATES.USAGE;
    elapsed=0;countdown=3;score=0;maxCombo=0;wave=0;nextWave=.2;fruits=[];bombs=[];explosions=[];bombHits=0;stun=0;halves=[];particles=[];popups=[];trail=[];gesture=null;shake=0;
    level=m==='free'?null:{model:m==='straight'?A.straight():m==='reducing'?A.reducing():A.usage(),index:0,pieces:[],anim:null,restAge:0,finishAge:0};
    intro=m==='free'?null:{cards:caseCards(m,level.model),index:0,anim:null};if(intro){state=STATES.CASE;countdown=0;}
    $('modeTitle').textContent=m==='free'?TITLES[m]:{straight:'直線法',reducing:'餘額遞減法',usage:'按使用量法'}[m];$('pauseBtn').setAttribute('aria-label','暫停遊戲');$('factPanel').classList.add('hidden');$('factPanel').innerHTML='';$('caseCaption').classList.add('hidden');
    showScreen('playScreen');hideOverlay();updateHUD();
    if(m==='free')overlay('<div class="countdown-number">3</div><p>切水果，避開炸彈！切中 −50 分、連擊中斷。</p>');
  }
  function caseCards(m,model){
    const card=(title,value,detail='')=>({title,value,detail});
    if(m==='straight')return[
      card('公司購入一部機器','開始使用','從 2026 年起，按完整年度計算。'),
      card('買價',fmt(48000)),card('運輸費',fmt(2000)),card('安裝費',fmt(4000)),
      card('資產成本',fmt(model.cost),'買價 + 運輸費 + 安裝費'),
      card('估計殘值',fmt(model.residual),'使用年期完結時，估計保留的價值。'),
      card('估計可使用年期',`${model.years} 年`,'用直線法平均分配。'),card('年結日','12 月 31 日')
    ];
    if(m==='reducing')return[
      card('公司購入另一部機器','開始使用','從 2026 年起，按完整年度計算。'),
      card('購入成本',fmt(model.cost)),card('折舊率',`${model.rate*100}%`,'一般年度按期初帳面淨值計算。'),
      card('示範年度',`${model.years} 年`,`${model.rows[0].year}–${model.rows.at(-1).year}，計算至達到殘值。`),
      card('估計殘值',fmt(model.residual))
    ];
    return[
      card('水果加工廠購入機器','準備開工','按機器的實際使用量分配成本。'),
      card('機器成本',fmt(model.cost)),card('估計殘值',fmt(model.residual)),
      card('估計總使用量',`${model.totalUsage.toLocaleString('en-HK')} 次`),
      card('生產訂單','按用量切','每年會收到一張訂單。')
    ];
  }
  function caseGeometry(){const w=Math.min(W*.84,620),h=Math.min(H*.70,330);return{x:(W-w)/2,y:(H-h)/2,w,h};}
  function syncCaseCaption(){
    const caption=$('caseCaption');if(!intro||intro.anim){caption.classList.add('hidden');return;}
    const g=caseGeometry(),card=intro.cards[intro.index];caption.style.left=`${g.x}px`;caption.style.top=`${g.y}px`;caption.style.width=`${g.w}px`;caption.style.height=`${g.h}px`;
    caption.innerHTML=`<span class="case-kicker">情境 ${intro.index+1} / ${intro.cards.length}</span><h3 class="case-title">${card.title}</h3><strong class="case-value">${card.value}</strong>${card.detail?`<p class="case-detail">${card.detail}</p>`:''}`;caption.classList.remove('hidden');
  }
  function enterLesson(){intro=null;gesture=null;trail=[];state=mode==='straight'?STATES.STRAIGHT:mode==='reducing'?STATES.REDUCING:STATES.USAGE;document.body.classList.remove('case-intro');$('caseCaption').classList.add('hidden');updateHUD();resize();}
  function updateHUD(){
    if(mode==='free'){$('statLabel').textContent='得分';$('statValue').textContent=score.toLocaleString('en-HK');$('taskText').textContent=stun>0?`炸彈命中！鬆手再開切 · 仲有 ${Math.max(0,Math.ceil(settings.duration-elapsed))} 秒`:`仲有 ${Math.max(0,Math.ceil(settings.duration-elapsed))} 秒 · 切水果，避開炸彈！`;$('progressFill').style.width=`${clamp(elapsed/settings.duration,0,1)*100}%`;$('gameHint').textContent=`炸彈 −${BOMB_PENALTY} 分、連擊中斷 · 最高 Combo：${maxCombo} 個 · 命中炸彈：${bombHits}`;return;}
    if(intro){$('taskText').textContent='';$('statLabel').textContent='情境';$('statValue').textContent=`${intro.index+1} / ${intro.cards.length}`;$('gameHint').textContent=intro.index===intro.cards.length-1?'劃過情境卡，開始切水果':'劃過情境卡，睇下一項';syncCaseCaption();return;}
    const model=level.model,row=model.rows[level.index];if(!row){$('progressFill').style.width='100%';return;}
    $('statLabel').textContent='年度';$('statValue').textContent=mode==='straight'?String(row.year):`${level.index+1} / ${model.rows.length}`;
    $('progressFill').style.width=`${level.index/model.rows.length*100}%`;
    $('taskText').textContent=mode==='usage'?(row.usage===0?'今年使用 0 次':`訂單：使用 ${row.usage.toLocaleString('en-HK')} 次`):row.depreciation===0?'已達殘值：本年折舊 $0':mode==='straight'?`切下 ${fmt(row.depreciation)}`:row.finalYear?`最後一年：折舊 ${fmt(row.depreciation)}`:`切走剩餘的 ${model.rate*100}%`;
    $('gameHint').textContent=row.depreciation===0?(mode==='usage'?'按使用量法：沒有使用，折舊 $0。':`保留估計殘值 ${fmt(model.residual)}，毋須切割。`):mode==='reducing'&&row.finalYear?'期初帳面淨值 − 殘值':settings.hints?'沿光線向下切':'由上向下切';
  }
  function geometry(){const model=level.model,complete=level.index>=model.rows.length,row=complete?{...model.rows.at(-1),opening:model.rows.at(-1).closing,depreciation:0}:model.rows[level.index],full=W*.84,x=W*.08,y=H*.33,h=Math.min(122,H*.22);return{x,y,h,full,width:full*row.opening/model.cost,cut:full*row.depreciation/model.cost,residual:full*model.residual/model.cost,row};}
  function spawnWave(){
    wave++;const amount=clamp(1+Math.floor(Math.random()*5),1,5),g=Math.max(400,H*1.18),rBase=clamp(W*.036,25,43),side=Math.random()<.18;
    for(let i=0;i<amount;i++){const type=Art.types[Math.floor(Math.random()*Art.types.length)],r=rBase*random(.8,1.12);let x,y,vx,vy;
      if(side){const left=Math.random()<.5;x=left?-r:r+W;y=H*random(.65,.92);vx=(left?1:-1)*random(W*.30,W*.48);vy=-Math.sqrt(2*g*H*random(.35,.58));}
      else{x=clamp(W*random(.22,.78)+(i-(amount-1)/2)*r*1.7,r,W-r);y=H+r*1.4;vx=(W*.5-x)*random(.12,.4)+random(-W*.06,W*.06);vy=-Math.sqrt(2*g*H*random(.55,.82));}
      fruits.push({id:++fruitID,type,x,y,vx,vy,r,g,rot:random(-1,1),spin:random(-2,2)});
    }
    // A short introductory window, then hazards become more frequent.
    if(elapsed>=2.5&&bombs.length<2&&(wave%4===0||Math.random()<.28+.28*elapsed/settings.duration)){
      const r=rBase*.95;let x=W*random(.15,.85),bestGap=-1;
      for(let i=0;i<8;i++){const candidate=W*random(.15,.85),gap=Math.min(...fruits.filter(f=>f.y>=H).map(f=>Math.abs(f.x-candidate)),W);if(gap>bestGap){x=candidate;bestGap=gap;}}
      bombs.push({id:++fruitID,x,y:H+r*1.4,vx:(W*.5-x)*random(.08,.2),vy:-Math.sqrt(2*g*H*random(.55,.76)),r,g,rot:random(-.3,.3),spin:random(-.65,.65)});
    }
    nextWave=random(.70,1.02)-(elapsed/settings.duration)*.23;
  }
  function burst(x,y,color,amount=particleBudget){for(let i=0;i<amount;i++){const a=random(0,Math.PI*2),speed=random(40,260);particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:random(.35,.7),max:.7,r:random(2,6),color});}if(particles.length>260)particles.splice(0,particles.length-260);}
  function popup(x,y,text,color='#fff',big=false){popups.push({x,y,text,color,life:big?1.1:.75,big});}
  function ellipseHit(a,b,cx,cy,rx,ry){const ax=(a.x-cx)/rx,ay=(a.y-cy)/ry,bx=(b.x-cx)/rx,by=(b.y-cy)/ry,dx=bx-ax,dy=by-ay,t=clamp(-(ax*dx+ay*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(ax+t*dx,ay+t*dy)<=1;}
  function hitFruit(a,b,f){const cos=Math.cos(-f.rot),sin=Math.sin(-f.rot),local=p=>({x:(p.x-f.x)*cos-(p.y-f.y)*sin,y:(p.x-f.x)*sin+(p.y-f.y)*cos}),aa=local(a),bb=local(b),r=f.r;if(f.type==='banana')return [[-.48,.05,.33,.4],[-.12,.34,.4,.3],[.37,.23,.38,.34]].some(v=>ellipseHit(aa,bb,v[0]*r,v[1]*r,v[2]*r,v[3]*r));return ellipseHit(aa,bb,0,0,r*(f.type==='pineapple'?.74:f.type==='watermelon'?1.08:.93),r*(f.type==='pineapple'?1.03:f.type==='watermelon'?.88:1));}
  function cutFruit(f,a,b){
    fruits.splice(fruits.indexOf(f),1);const angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle),ny=Math.cos(angle);
    for(const side of [-1,1])halves.push({...f,vx:f.vx+nx*side*random(100,150),vy:f.vy+ny*side*100-35,spin:f.spin+side*2.2,cutAngle:angle-f.rot,side,life:1.5});
    burst(f.x,f.y,Art.colors[f.type]);score+=10;gesture.hits++;maxCombo=Math.max(maxCombo,gesture.hits);const n=gesture.hits;if(n>=3){score+=20;if(n===3)AudioFX.combo();popup(f.x,f.y-36,`COMBO ×${n}`,'#ffe18a',true);}popup(f.x,f.y,'+10','#ffffff');AudioFX.slice();updateHUD();
  }
  function explodeBomb(b){
    bombs.splice(bombs.indexOf(b),1);score=Math.max(0,score-BOMB_PENALTY);bombHits++;stun=BOMB_STUN;shake=.48;
    // End this combo and require the player to release before another stroke.
    gesture.hits=0;gesture.blocked=true;trail=[];explosions.push({x:b.x,y:b.y,r:b.r,age:0});
    burst(b.x,b.y,'#ffb658',particleBudget);burst(b.x,b.y,'#667484',Math.floor(particleBudget*.65));
    popup(clamp(b.x,90,W-90),clamp(b.y-40,50,H-60),`炸彈！−${BOMB_PENALTY}`,'#ff9b85',true);AudioFX.explode();updateHUD();
  }
  function slashFree(a,b){
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy||1;
    const hits=[...fruits.filter(f=>hitFruit(a,b,f)).map(f=>({object:f,bomb:false})),...bombs.filter(f=>ellipseHit(a,b,f.x,f.y,f.r,f.r)).map(f=>({object:f,bomb:true}))];
    hits.forEach(h=>h.t=clamp(((h.object.x-a.x)*dx+(h.object.y-a.y)*dy)/length,0,1));hits.sort((a,b)=>a.t-b.t||Number(b.bomb)-Number(a.bomb));
    for(const h of hits){if(gesture.blocked)break;if(h.bomb)explodeBomb(h.object);else cutFruit(h.object,a,b);}
  }
  function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:clamp(e.clientX-r.left,-100,W+100),y:clamp(e.clientY-r.top,-100,H+100)};}
  function isPlaying(){return[STATES.CASE,STATES.FREE,STATES.STRAIGHT,STATES.REDUCING,STATES.USAGE].includes(state);}
  canvas.addEventListener('pointerdown',e=>{if(!isPlaying()||countdown>0||gesture||stun>0)return;e.preventDefault();AudioFX.init();const p=canvasPoint(e);gesture={id:e.pointerId,last:p,hits:0,distance:0,edges:{},attempted:false,blocked:false};trail.push({...p,life:.2,start:true});try{canvas.setPointerCapture(e.pointerId);}catch(_){/* Synthetic replay or a cancelled pointer has no active capture. */}});
  function pointerMove(e){if(!gesture||e.pointerId!==gesture.id||!isPlaying()||countdown>0||gesture.blocked||stun>0)return;e.preventDefault();const events=e.getCoalescedEvents?.()||[];for(const event of events.length?events:[e]){const p=canvasPoint(event),a=gesture.last,dist=Math.hypot(p.x-a.x,p.y-a.y);if(dist<.8)continue;gesture.distance+=dist;trail.push({...p,life:.2,start:false});if(trail.length>90)trail.shift();if(gesture.distance>=8){if(intro)slashCase(a,p);else if(mode==='free')slashFree(a,p);else learningSlash(a,p);}gesture.last=p;if(gesture.blocked)break;}}
  canvas.addEventListener('pointermove',pointerMove);
  function endGesture(e){if(!gesture||e.pointerId!==gesture.id)return;if(gesture.hits>=3)popup(clamp(gesture.last.x,80,W-80),clamp(gesture.last.y,70,H-60),`一刀 ${gesture.hits} 個 · 獎勵 +${20*(gesture.hits-2)}`,'#ffe18a',true);gesture=null;}
  canvas.addEventListener('pointerup',e=>{pointerMove(e);endGesture(e);});canvas.addEventListener('pointercancel',endGesture);canvas.addEventListener('lostpointercapture',endGesture);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function slashCase(a,b){
    if(!intro||intro.anim||gesture.attempted)return;const g=caseGeometry(),dx=b.x-a.x,dy=b.y-a.y;let lo=0,hi=1;
    for(const [p,q] of [[-dx,a.x-g.x],[dx,g.x+g.w-a.x],[-dy,a.y-g.y],[dy,g.y+g.h-a.y]]){
      if(Math.abs(p)<.0001){if(q<0)return;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return;}
    }
    gesture.caseDistance=(gesture.caseDistance||0)+Math.hypot(dx,dy)*Math.max(0,hi-lo);
    if(gesture.caseDistance<Math.min(g.w,g.h)*.5)return;
    gesture.attempted=true;gesture.blocked=true;intro.anim={age:0,angle:Math.atan2(dy,dx),card:intro.cards[intro.index],g};syncCaseCaption();AudioFX.slice();burst(W*.5,H*.5,'#ffcc79',Math.floor(particleBudget*.6));
  }
  function learningSlash(a,b){
    if(!level||level.anim||level.index>=level.model.rows.length||gesture.attempted)return;const g=geometry();if(g.row.depreciation===0)return;
    for(const [key,y] of [['top',g.y+3],['bottom',g.y+g.h-3]])if((a.y<=y&&b.y>=y)||(a.y>=y&&b.y<=y)){if(Math.abs(b.y-a.y)<.01)continue;const t=(y-a.y)/(b.y-a.y),x=a.x+(b.x-a.x)*t;if(x>=g.x-10&&x<=g.x+g.width+10)gesture.edges[key]=x;}
    const edges=gesture.edges;if(edges.top===undefined||edges.bottom===undefined)return;gesture.attempted=true;
    const target=g.x+g.cut,tolerance=g.width*.08;
    if(Math.abs(edges.top-target)<=tolerance&&Math.abs(edges.bottom-target)<=tolerance){
      level.anim={age:0,g,piece:{index:level.index,row:g.row,fraction:g.row.depreciation/level.model.cost}};AudioFX.slice();burst(target,g.y+g.h*.5,mode==='straight'?'#ff688b':'#ffbe5a');popup(target,g.y-20,`${g.row.year} 年折舊：${fmt(g.row.depreciation)}`,'#ffe18a');
      $('taskText').textContent=`切得啱！${g.row.year} 年折舊 ${fmt(g.row.depreciation)}`;
    }else{shake=.24;popup(W*.5,g.y-20,settings.hints?'沿光線由上切落下，再試一次！':'份量未啱，再試一次。','#ffa0a5');AudioFX.tone(180,.1,.04,'sine',130);}
  }
  function tableHTML(model){return `<div class="table-scroll"><table class="account-table"><thead><tr><th>年度</th>${mode==='usage'?'<th>使用量</th>':''}<th>年度折舊</th><th>累計折舊</th><th>帳面淨值</th></tr></thead><tbody>${model.rows.map(r=>`<tr><td>${r.year}</td>${mode==='usage'?`<td>${r.usage.toLocaleString('en-HK')} 次</td>`:''}<td>${fmt(r.depreciation)}</td><td>${fmt(r.accumulated)}</td><td>${fmt(r.closing)}</td></tr>`).join('')}</tbody></table></div>`;}
  function resultEmblem(){
    $('resultContent').insertAdjacentHTML('afterbegin','<div class="completion-emblem" aria-hidden="true"><svg viewBox="0 0 80 80" fill="none"><circle cx="40" cy="37" r="30" fill="#ffe6a0"/><circle cx="40" cy="37" r="24" stroke="#cf944a" stroke-width="2"/><path d="m25 60-4 15 12-4 7 6 3-17m10 0 6 15-12-4-7 6-3-17" fill="#ff9783" stroke="#d66b5a" stroke-width="2"/><path d="m40 18 5.7 11.5 12.7 1.8-9.2 9 2.2 12.7L40 47l-11.4 6 2.2-12.7-9.2-9 12.7-1.8L40 18Z" fill="#f8bb57" stroke="#b87d36" stroke-width="2"/><path d="m34 36 4 4 9-10" stroke="#fff9e8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>');
  }
  function finishFree(){
    gesture=null;fruits=[];bombs=[];explosions=[];stun=0;countdown=0;progress.best=Math.max(progress.best,score);firstUnlock=!progress.training;progress.training=true;save();state=firstUnlock?STATES.UNLOCK:STATES.FREE_RESULTS;resultAge=0;AudioFX.win();hideOverlay();
    const straightDone=progress.completed.includes('straight'),names=A.allowedModes(true,straightDone).filter(m=>m!=='free').map(m=>({straight:'直線法',reducing:'餘額遞減法',usage:'按使用量法'}[m]));
    $('resultContent').innerHTML=`<span class="eyebrow">TRAINING COMPLETE</span><h1>時間到！<br><span class="accent">切得好痛快。</span></h1><p>${firstUnlock?'恭喜！水果切割訓練完成！':'再來一刀，挑戰自己的紀錄。'}</p><div class="result-stats"><div><span>你的得分</span><strong>${score.toLocaleString('en-HK')}</strong></div><div><span>最高 Combo</span><strong>${maxCombo}<small> 個</small></strong></div><div><span>個人最高分</span><strong>${progress.best.toLocaleString('en-HK')}</strong></div></div><div class="unlock-summary"><h2>${names.length===1?'直線法已解鎖！':'三種切法已開放！'}</h2><div class="unlock-cards">${names.map((n,i)=>`<div class="unlock-item ${firstUnlock?'lock-pop':''}" style="--delay:${i*.35}s"><svg class="unlock-lock" width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="3"><path class="shackle" d="M13 21v-8a9 9 0 0 1 18 0"/><rect x="9" y="21" width="26" height="18" rx="5"/><path d="m17 30 4 4 8-8"/></svg><strong>${n}</strong><span>已解鎖</span></div>`).join('')}</div>${!straightDone?'<p>完成直線法，再解鎖餘額遞減法和按使用量法。</p>':''}</div>`;
    $('resultContent').querySelector('.result-stats').insertAdjacentHTML('afterend',`<p class="result-caveat">本回合命中炸彈：${bombHits} 次 · 每次 −${BOMB_PENALTY} 分（最低 0 分）</p>`);
    resultEmblem();
    $('resultMenuBtn').textContent=names.length===1?'選擇直線法':'選擇切法';$('replayBtn').textContent='再切一場';showScreen('resultScreen');
  }
  function finishLevel(){
    const unlockOthers=mode==='straight'&&!progress.completed.includes('straight');
    state=STATES.RESULTS;gesture=null;AudioFX.win();if(!progress.completed.includes(mode))progress.completed.push(mode);save();
    const model=level.model,title=mode==='straight'?'完美平均切割！':mode==='reducing'?'折舊完成，保留殘值！':'生產訂單，全部完成！';
    const message=mode==='straight'?'直線法：每年折舊額相同！':mode==='reducing'?`按期初帳面淨值的 ${model.rate*100}% 折舊；達到殘值後停止折舊。`:'用得越多，折舊越多！';
    const formula=mode==='straight'?'年度折舊 =（成本 − 估計殘值）÷ 估計可使用年期':mode==='reducing'?'一般年度折舊 = 期初帳面淨值 × 折舊率<br>以估計殘值為下限；達到殘值後，年度折舊 = $0':'年度折舊 =（成本 − 估計殘值）÷ 估計總使用量 × 當期實際使用量';
    $('resultContent').innerHTML=`<span class="eyebrow">CHALLENGE COMPLETE</span><h1>${title}</h1><p class="result-message">${message}</p><div class="result-fruit-row">${model.rows.map((r,i)=>`<div class="result-fruit-piece"><canvas data-result-piece="${i}" width="160" height="110"></canvas><strong>${r.year}</strong><span>${fmt(r.depreciation)}</span></div>`).join('')}${model.residual?`<div class="residual-result ${mode==='straight'?'residual-rind':''}">${mode==='straight'?`<canvas data-result-residual width="320" height="220" role="img" aria-label="西瓜皮代表保留殘值 ${fmt(model.residual)}"></canvas><div class="residual-copy"><span>保留殘值 · 西瓜皮</span><strong>${fmt(model.residual)}</strong></div>`:`<span>保留殘值</span><strong>${fmt(model.residual)}</strong>`}</div>`:''}</div><div class="formula">${formula}</div>${tableHTML(model)}<p class="result-caveat">${mode==='usage'?'第 3 年使用量為 0，所以本法折舊為 $0；其他折舊方法不能一概當作停用就沒有折舊。':'水果形狀只用作切割比喻；現實應按資產經濟利益的消耗模式選擇折舊方法。'}</p>`;
    const calculation=mode==='straight'?`(${fmt(model.cost)} − ${fmt(model.residual)}) ÷ ${model.years} = ${fmt(model.annual)}`:mode==='reducing'?`最後一筆折舊：${fmt(model.rows.at(-1).opening)} − ${fmt(model.rows.at(-1).closing)} = ${fmt(model.rows.at(-1).depreciation)}`:`每次：(${fmt(model.cost)} − ${fmt(model.residual)}) ÷ ${model.totalUsage.toLocaleString('en-HK')} = ${fmt(model.perUse)}`;
    $('resultContent').querySelector('.formula').insertAdjacentHTML('beforeend',`<br><small>${calculation}</small>`);
    if(mode==='reducing')$('resultContent').querySelector('.result-caveat').textContent=`本例購入成本 ${fmt(model.cost)}、折舊率 ${model.rate*100}%、估計殘值 ${fmt(model.residual)}。第 ${model.rows.findIndex(r=>r.closing===model.residual)+1} 年已達殘值，其後毋須再折舊；累計折舊 ${fmt(model.rows.at(-1).accumulated)}。`;
    if(unlockOthers)$('resultContent').insertAdjacentHTML('beforeend','<div class="unlock-summary"><h2>兩種新切法已解鎖！</h2><p>餘額遞減法 · 按使用量法</p></div>');
    resultEmblem();
    $('resultMenuBtn').textContent='選擇其他切法';$('replayBtn').textContent='再挑戰一次';showScreen('resultScreen');
    document.querySelectorAll('[data-result-piece]').forEach(c=>{const index=Number(c.dataset.resultPiece),r=model.rows[index],cc=c.getContext('2d'),max=Math.max(...model.rows.map(v=>v.depreciation)),width=max?r.depreciation/max*140:0;if(width>0)Art.drawLong(cc,mode==='straight'?'watermelon':'papaya',(160-width)/2,25,width,65);else{cc.fillStyle='#94a6b9';cc.font='bold 16px sans-serif';cc.textAlign='center';cc.fillText(mode==='usage'?'休息 · $0':'已達殘值 · $0',80,65);}});
    const rindCanvas=$('resultContent').querySelector('[data-result-residual]');if(rindCanvas){const cc=rindCanvas.getContext('2d');cc.setTransform(2,0,0,2,0,0);Art.drawRind(cc,10,25,140,65);}
  }
  function pause(){if(!isPlaying())return;previousState=state;state=STATES.PAUSED;gesture=null;overlay('<div class="overlay-card"><span class="eyebrow">TAKE A BREAK</span><h2>休息一下</h2><p>時間已暫停，準備好再開切。</p><button class="primary-button" id="resumeBtn">繼續遊戲</button><button class="secondary-button" id="pauseHomeBtn">返回主選單</button></div>');$('resumeBtn').onclick=resume;$('pauseHomeBtn').onclick=menu;}
  function resume(){if(state!==STATES.PAUSED)return;state=previousState;previousState=null;last=performance.now();hideOverlay();AudioFX.init();if(countdown>0)overlay(`<div class="countdown-number">${Math.ceil(countdown)}</div><p>準備好，滑動開切！</p>`);}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);window.addEventListener('pagehide',save);
  $('pauseBtn').onclick=pause;$('homeBtn').onclick=menu;$('resultMenuBtn').onclick=menu;$('replayBtn').onclick=()=>start(mode);
  document.querySelectorAll('button[data-mode]').forEach(b=>b.onclick=()=>start(b.dataset.mode));
  ['soundBtn','playSoundBtn'].forEach(id=>$(id).onclick=()=>{settings.sound=!settings.sound;AudioFX.init();soundButtons();save();});
  $('settingsBtn').onclick=()=>{$('durationSetting').value=settings.duration;$('soundSetting').checked=settings.sound;$('hintsSetting').checked=settings.hints;$('resetConfirm').classList.add('hidden');$('settingsDialog').showModal();};
  $('closeSettingsBtn').onclick=()=>{$('settingsDialog').close();};
  $('settingsDialog').addEventListener('click',e=>{if(e.target===$('settingsDialog'))$('settingsDialog').close();});
  $('durationSetting').onchange=e=>{settings.duration=Number(e.target.value);save();updateMenu();};
  $('soundSetting').onchange=e=>{settings.sound=e.target.checked;AudioFX.init();soundButtons();save();};
  $('hintsSetting').onchange=e=>{settings.hints=e.target.checked;save();};
  $('resetProgressBtn').onclick=()=>{$('resetConfirm').classList.remove('hidden');};$('cancelResetBtn').onclick=()=>{$('resetConfirm').classList.add('hidden');};
  $('confirmResetBtn').onclick=()=>{progress.training=false;progress.best=0;progress.completed=[];save();$('resetConfirm').classList.add('hidden');updateMenu();};
  function update(dt,real){
    trail.forEach(p=>p.life-=dt);trail=trail.filter(p=>p.life>0);
    if(!isPlaying())return;
    if(countdown>0){const before=Math.ceil(countdown);countdown=Math.max(0,countdown-real);const after=Math.ceil(countdown);if(before!==after){if(after>0){$('gameOverlay').querySelector('.countdown-number').textContent=after;AudioFX.tone(440,.09,.05,'sine',440);}else{hideOverlay();AudioFX.tone(880,.15,.08,'triangle',1100);}}return;}
    if(state===STATES.CASE){
      if(intro.anim){intro.anim.age+=real;if(intro.anim.age>=.55){intro.index++;intro.anim=null;if(intro.index>=intro.cards.length)enterLesson();else updateHUD();}}
      for(const p of particles){p.vy+=250*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);return;
    }
    if(mode==='free'){elapsed=Math.min(settings.duration,elapsed+real);if(elapsed>=settings.duration){finishFree();return;}stun=Math.max(0,stun-real);nextWave-=dt;if(nextWave<=0)spawnWave();for(const list of [fruits,bombs])for(const f of list){f.vy+=f.g*dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.rot+=f.spin*dt;}fruits=fruits.filter(f=>f.y<H+f.r*4&&f.x>-W*.3&&f.x<W*1.3);bombs=bombs.filter(f=>f.y<H+f.r*4&&f.x>-W*.3&&f.x<W*1.3);for(const e of explosions)e.age+=dt;explosions=explosions.filter(e=>e.age<.55);updateHUD();}
    else if(level){
      if(level.anim){level.anim.age+=dt;if(level.anim.age>=.8){level.pieces.push(level.anim.piece);level.anim=null;level.index++;level.restAge=0;gesture=null;updateHUD();}}
      else if(level.index>=level.model.rows.length){level.finishAge+=dt;if(level.finishAge>.85){finishLevel();return;}}
      else if(level.model.rows[level.index].depreciation===0){level.restAge+=dt;if(level.restAge>=2.8){level.pieces.push({index:level.index,row:level.model.rows[level.index],fraction:0});level.index++;level.restAge=0;gesture=null;updateHUD();}}
    }
    for(const f of halves){f.vy+=f.g*dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.rot+=f.spin*dt;f.life-=dt;}halves=halves.filter(f=>f.life>0&&f.y<H+150);
    for(const p of particles){p.vy+=420*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
    for(const p of popups){p.y-=35*dt;p.life-=dt;}popups=popups.filter(p=>p.life>0);shake=Math.max(0,shake-dt);
  }
  function rounded(x,y,w,h,r=10){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function text(t,x,y,size=18,color='#fff',align='center',weight='700'){ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Microsoft JhengHei", "PingFang TC", sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(t,x,y);}
  function background(){
    const accent={free:'#79e3ad',straight:'#ff8d80',reducing:'#ffc877',usage:'#b8a0ff'}[mode],spot={free:'#243b39',straight:'#392c3a',reducing:'#37323d',usage:'#2d304a'}[mode];
    ctx.fillStyle='#171b30';ctx.fillRect(0,0,W,H);const grad=ctx.createRadialGradient(W*.5,H*.35,0,W*.5,H*.35,Math.max(W,H)*.65);grad.addColorStop(0,spot);grad.addColorStop(1,'#12182b');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    // Soft arena lighting and quiet corner details keep the swipe target clear.
    ctx.save();ctx.strokeStyle=accent+'09';ctx.lineWidth=Math.max(24,W*.04);ctx.beginPath();ctx.ellipse(W*.5,H*.45,W*.48,H*.68,-.12,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle=accent+'15';rounded(16,16,W-32,H-32,22);ctx.stroke();
    ctx.fillStyle=accent+'25';for(const [x,y,dir] of [[27,27,1],[W-27,27,-1],[27,H-27,1],[W-27,H-27,-1]]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dir*12,y);ctx.lineTo(x,y+(y<H/2?12:-12));ctx.closePath();ctx.fill();}
    ctx.fillStyle='#ffffff08';for(let i=0;i<12;i++){const x=W*(.08+((i*7)%13)/13*.84),y=H*(.12+((i*11)%17)/17*.72);ctx.beginPath();ctx.arc(x,y,i%3===0?2:1,0,Math.PI*2);ctx.fill();}ctx.restore();
    if(mode==='free'){const floor=ctx.createLinearGradient(0,H-60,0,H);floor.addColorStop(0,'#79e3ad00');floor.addColorStop(1,'#79e3ad10');ctx.fillStyle=floor;ctx.fillRect(0,H-60,W,60);}
    if(mode==='usage'&&!intro){
      const by=H*.33+Math.min(122,H*.22)+18,bh=Math.max(14,H*.035);ctx.fillStyle='#354654';rounded(W*.045,by,W*.91,bh,7);ctx.fill();ctx.fillStyle='#728c91';for(let x=W*.065;x<W*.94;x+=25){ctx.beginPath();ctx.arc(x,by+bh*.5,bh*.31,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#304352';for(const x of [W*.055,W*.92]){ctx.fillRect(x,by+bh,12,H*.07);ctx.fillStyle='#506973';ctx.fillRect(x-8,by+bh+H*.07,28,6);ctx.fillStyle='#304352';}ctx.fillStyle='#5ee4bc';rounded(W*.89,H*.08,W*.06,H*.07,5);ctx.fill();text('ON',W*.92,H*.115,Math.max(9,W*.011),'#174337');
    }
  }
  function drawFree(){for(const f of fruits){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.rot);Art.draw(ctx,f.type,f.r);ctx.restore();}for(const f of halves){ctx.save();ctx.globalAlpha=Math.min(1,f.life*2);ctx.translate(f.x,f.y);ctx.rotate(f.rot);ctx.rotate(f.cutAngle);ctx.beginPath();ctx.rect(-f.r*2.5,f.side===1?0:-f.r*2.5,f.r*5,f.r*2.5);ctx.clip();ctx.rotate(-f.cutAngle);Art.draw(ctx,f.type,f.r,true);ctx.restore();}for(const b of bombs){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot);Art.drawBomb(ctx,b.r,elapsed);ctx.restore();}}
  function drawCaseCard(g,card,withText=false){
    const accent={straight:'#f58e7b',reducing:'#efb960',usage:'#a692de'}[mode]||'#f58e7b';
    ctx.save();ctx.shadowColor='#050a1c70';ctx.shadowBlur=25;ctx.shadowOffsetY=14;ctx.fillStyle='#eddfc1';rounded(g.x+5,g.y+7,g.w,g.h,26);ctx.fill();ctx.restore();
    const paper=ctx.createLinearGradient(g.x,g.y,g.x,g.y+g.h);paper.addColorStop(0,'#fff9eb');paper.addColorStop(1,'#fff0d3');ctx.fillStyle=paper;rounded(g.x,g.y,g.w,g.h,26);ctx.fill();ctx.strokeStyle='#ffdeab';ctx.lineWidth=2;ctx.stroke();
    ctx.save();rounded(g.x,g.y,g.w,g.h,26);ctx.clip();ctx.fillStyle=accent;ctx.fillRect(g.x,g.y,g.w,7);ctx.fillStyle=accent+'13';ctx.beginPath();ctx.arc(g.x+g.w-18,g.y+18,g.h*.32,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff55';for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(g.x+g.w-36-i*10,g.y+28,2,0,Math.PI*2);ctx.fill();}ctx.restore();
    ctx.strokeStyle=accent+'80';ctx.lineWidth=1.5;ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(g.x+g.w*.12,g.y+g.h*.87);ctx.lineTo(g.x+g.w*.88,g.y+g.h*.87);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#e6cea0';for(const x of [g.x,g.x+g.w]){ctx.beginPath();ctx.arc(x,g.y+g.h*.87,5,0,Math.PI*2);ctx.fill();}
    if(withText){const small=g.h<230; text(`情境 ${intro.index+1} / ${intro.cards.length}`,g.x+g.w*.5,g.y+g.h*.14,small?12:14,'#617080');text(card.title,g.x+g.w*.5,g.y+g.h*.31,small?20:clamp(g.w*.045,20,28),'#23374b');text(card.value,g.x+g.w*.5,g.y+g.h*.53,small?37:clamp(g.w*.105,32,60),'#de594b');if(card.detail)text(card.detail,g.x+g.w*.5,g.y+g.h*.74,small?12:clamp(g.w*.027,12,16),'#617080');}
  }
  function drawCases(){
    if(!intro)return;const g=caseGeometry();if(!intro.anim){drawCaseCard(g,intro.cards[intro.index]);return;}
    const a=intro.anim,t=ease(a.age/.55),cx=g.x+g.w*.5,cy=g.y+g.h*.5,nx=-Math.sin(a.angle),ny=Math.cos(a.angle);
    for(const side of [-1,1]){ctx.save();ctx.globalAlpha=1-t*.85;ctx.translate(nx*side*t*W*.25,ny*side*t*H*.4+t*t*H*.12);ctx.translate(cx,cy);ctx.rotate(side*t*.14);ctx.rotate(a.angle);ctx.beginPath();ctx.rect(-W*2,side===1?0:-H*2,W*4,H*2);ctx.clip();ctx.rotate(-a.angle);ctx.translate(-cx,-cy);drawCaseCard(g,a.card,true);ctx.restore();}
  }
  function fruitSegment(g,left,width,tx=0,ty=0){if(width<=0)return;ctx.save();ctx.translate(tx,ty);ctx.beginPath();ctx.rect(g.x+left,g.y-3,width,g.h+6);ctx.clip();Art.drawLong(ctx,mode==='straight'?'watermelon':'papaya',g.x,g.y,g.width,g.h);const residual=g.residual;if(residual>0){const rx=g.x+g.width-residual;ctx.fillStyle='#50bd7d';ctx.fillRect(rx,g.y,residual,g.h);ctx.strokeStyle='#b0f2a9';ctx.lineWidth=3;for(let x=rx+5;x<rx+residual;x+=12){ctx.beginPath();ctx.moveTo(x,g.y+7);ctx.lineTo(x,g.y+g.h-7);ctx.stroke();}}ctx.restore();}
  function trayInfo(){const n=level.model.rows.length,gap=W<520?8:14,tw=(W*.88-gap*(n-1))/n;return{n,gap,tw,x:W*.06,y:H*.72,h:H*.21};}
  function trayScale(){const largest=Math.max(...level.model.rows.map(r=>r.depreciation)),full=W*.84;return largest?Math.min(.58,(trayInfo().tw-12)/(full*largest/level.model.cost)):.58;}
  function drawTrays(){
    const t=trayInfo(),scale=trayScale();for(let i=0;i<t.n;i++){const row=level.model.rows[i],x=t.x+i*(t.tw+t.gap);ctx.fillStyle='#ffffff05';rounded(x,t.y,t.tw,t.h,12);ctx.fill();ctx.strokeStyle=level.index===i?'#74e6c759':'#ffffff12';ctx.lineWidth=1;ctx.stroke();text(String(row.year),x+t.tw*.5,t.y+16,W<520?12:14,'#9aafbd');const piece=level.pieces.find(p=>p.index===i);if(piece){const width=geometry().full*piece.fraction*scale;if(width>0)Art.drawLong(ctx,mode==='straight'?'watermelon':'papaya',x+(t.tw-width)/2,t.y+28,width,Math.max(14,t.h-58));else text(mode==='usage'?'休息':'已達殘值',x+t.tw/2,t.y+t.h*.5,W<520?10:14,'#92a6b6');text(fmt(row.depreciation),x+t.tw/2,t.y+t.h-15,W<520?11:15,'#ffe18a');}}
  }
  function drawLearning(){
    if(!level)return;const g=level.anim?.g||geometry();drawTrays();
    if(level.index>=level.model.rows.length){g.width=g.full*level.model.rows.at(-1).closing/level.model.cost;fruitSegment(g,0,g.width);text(level.model.residual?`保留估計殘值 ${fmt(level.model.residual)}`:level.model.rows.at(-1).closing===0?'已全數折舊 · 帳面淨值 $0':`尚餘帳面淨值 ${fmt(level.model.rows.at(-1).closing)}`,W*.5,g.y+g.h+25,16,'#96efb5');return;}
    text(`尚餘 ${fmt(g.row.opening)}`,W*.5,H*.20,W<520?17:21,'#e5ecf1');
    ctx.fillStyle='#00000040';ctx.beginPath();ctx.ellipse(g.x+g.width/2,g.y+g.h+12,g.width/2,9,0,0,Math.PI*2);ctx.fill();
    if(level.anim){const a=level.anim,t=ease(a.age/.8),tray=trayInfo(),scale=trayScale(),destX=tray.x+a.piece.index*(tray.tw+tray.gap)+(tray.tw-g.cut*scale)/2,destY=tray.y+29;
      fruitSegment(g,g.cut,g.width-g.cut,-g.cut*t,0);
      ctx.save();ctx.translate(g.x+(destX-g.x)*t,g.y+(destY-g.y)*t);ctx.scale(1-(1-scale)*t,1-.45*t);ctx.translate(-g.x,-g.y);fruitSegment(g,0,g.cut);ctx.restore();
    }else{fruitSegment(g,0,g.width);if(settings.hints&&g.row.depreciation>0){const target=g.x+g.cut,pulse=.65+.35*Math.sin(performance.now()/230);ctx.save();ctx.setLineDash([6,6]);ctx.lineWidth=3;ctx.strokeStyle=`rgba(164,255,221,${pulse})`;ctx.shadowColor='#9affda';ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(target,g.y-20);ctx.lineTo(target,g.y+g.h+20);ctx.stroke();ctx.restore();text('↓',target,g.y-36,27,'#9affda');}}
    if(g.residual&&g.width>g.residual){const rx=g.x+g.width-g.residual/2;text('殘值',rx,g.y+g.h*.5,clamp(g.residual*.24,11,16),'#0b452d');}
    if(g.row.depreciation===0&&!level.anim){ctx.fillStyle='#101b2cdd';rounded(W*.18,g.y-12,W*.64,g.h+28,16);ctx.fill();text(mode==='usage'?'工廠休息':'已達殘值',W*.5,g.y+g.h*.35,W<520?25:32,'#a9e9de');text(mode==='usage'?'使用 0 次 → 折舊 $0':`保留 ${fmt(level.model.residual)} · 本年折舊 $0`,W*.5,g.y+g.h*.72,W<520?14:20,'#ffe18a');}
  }
  function drawEffects(){
    for(const e of explosions){const t=clamp(e.age/.55,0,1),radius=e.r*(1+3*t);ctx.save();ctx.globalAlpha=1-t;const glow=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,radius);glow.addColorStop(0,'#ffe8b0');glow.addColorStop(.4,'#ff9946b0');glow.addColorStop(1,'#ff654000');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(e.x,e.y,radius,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffc873';ctx.lineWidth=4*(1-t)+1;ctx.beginPath();ctx.arc(e.x,e.y,radius*.85,0,Math.PI*2);ctx.stroke();ctx.restore();}
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(p.x,p.y,p.r,p.r*.65,Math.atan2(p.vy,p.vx),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    for(let i=1;i<trail.length;i++){const a=trail[i-1],b=trail[i];if(b.start)continue;ctx.save();ctx.globalAlpha=clamp(b.life/.2,0,1);ctx.lineCap='round';ctx.strokeStyle='#5cebd0';ctx.lineWidth=11;ctx.shadowColor='#5fffe6';ctx.shadowBlur=17;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.stroke();ctx.restore();}
    for(const p of popups){ctx.save();ctx.globalAlpha=Math.min(1,p.life*3);ctx.shadowColor='#0c182d';ctx.shadowBlur=6;text(p.text,p.x,p.y,p.big?clamp(W*.035,18,32):clamp(W*.026,15,23),p.color);ctx.restore();}
  }
  function render(){if($('playScreen').classList.contains('hidden'))return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.save();if(shake>0)ctx.translate(Math.sin(performance.now()*.08)*shake*15,0);background();if(intro)drawCases();else if(mode==='free')drawFree();else drawLearning();drawEffects();ctx.restore();}
  function frame(now){const raw=last?(now-last)/1000:0;last=now;const real=Math.max(raw,0),dt=Math.min(real,.035);if(raw<.1){frameAverage=frameAverage*.96+raw*1000*.04;particleBudget=frameAverage>23?12:28;}if(state===STATES.UNLOCK){resultAge+=real;if(resultAge>1.8)state=STATES.FREE_RESULTS;}update(dt,real);render();requestAnimationFrame(frame);}
  /* Read-only inspection makes browser tests exercise the real input handlers. */
  globalThis.FruitSlash=Object.freeze({snapshot:()=>({state,mode,score,maxCombo,elapsed,countdown,settings:{...settings},progress:{...progress,completed:[...progress.completed]},intro:intro?{index:intro.index,total:intro.cards.length,anim:!!intro.anim,card:{...intro.cards[intro.index]},geometry:caseGeometry()}:null,fruitCount:fruits.length,bombCount:bombs.length,bombHits,stun,explosions:explosions.length,bombs:bombs.map(b=>({id:b.id,x:b.x,y:b.y,r:b.r})),halves:halves.length,particles:particles.length,fruits:fruits.map(f=>({id:f.id,type:f.type,x:f.x,y:f.y,r:f.r})),level:level?{index:level.index,anim:!!level.anim,rows:level.model.rows.map(r=>({...r})),geometry:geometry()}:null})});
  updateMenu();requestAnimationFrame(frame);
})();
