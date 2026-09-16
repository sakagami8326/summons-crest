// Local Chromium integration, including real SSE, pointer input and HTML audio playback.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {chromium}=require('playwright');
const {loadGame,game}=require('./feedback_ui_test');const G=loadGame();
const OUT=path.join(__dirname,'output/feedback-ui');fs.mkdirSync(OUT,{recursive:true});
const baseline=execFileSync('git',['show','HEAD:public/phone.html'],{cwd:__dirname,encoding:'utf8',maxBuffer:4e6});
(async()=>{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 assert.equal((await fetch(base+'/result-graph-audio.js')).status,200,'graph audio script is served by the game server');
 const errors=[],metrics=[];const {r,p}=game(G);G.askRoll(r,p);G.rooms.set(r.code,r);
 const observe=async page=>{page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('sc_start_guide_v1','done'));};
 const phone=await browser.newPage({viewport:{width:667,height:375}});await observe(phone);
 await phone.addInitScript(({room,pid})=>localStorage.setItem('sc_session',JSON.stringify({room,pid})),{room:r.code,pid:p.id});
 const publish=async()=>{G.broadcast(r);await phone.waitForFunction(rev=>state?.stateRev>=rev,r.stateRev);await phone.waitForTimeout(350);};
 try{
  await phone.goto(base+'/phone');await phone.locator('#diceBtn').waitFor();
  const ids=['gaston','pakawata','weapon','gaston','sp_step','shield','gecko','gaston'];
  for(const [w,h] of [[667,375],[844,390],[896,414]]){
   await phone.setViewportSize({width:w,height:h});
   for(const n of [1,4,7,8]){
    p.hand=ids.slice(0,n);await publish();await phone.waitForTimeout(850);
    const m=await phone.evaluate(()=>{const hand=$('hand'),a=[...hand.querySelectorAll('.card')].map(x=>x.getBoundingClientRect());return {width:innerWidth,n:a.length,cardWidth:a[0].width,spacing:parseFloat(hand.style.getPropertyValue('--hand-spacing')),scroll:hand.scrollWidth-hand.clientWidth,overlaps:a.slice(1).map((x,i)=>(a[i].right-x.left)/x.width)};});
    assert.ok(m.overlaps.every(x=>x<=.101),'overlap capped at ten percent: '+JSON.stringify(m));if(n===1)assert.equal(m.scroll,0);
    metrics.push(m);
    if(n===4||n===7)await phone.screenshot({path:path.join(OUT,`after-${w}-${n}.png`)});
   }
  }
  // Real baseline page, same assets, same seven/four-card fixture, same viewport.
  const before=await browser.newPage({viewport:{width:667,height:375}});await observe(before);
  await before.route('**/phone',route=>route.fulfill({contentType:'text/html',body:baseline}));
  await before.addInitScript(({room,pid})=>localStorage.setItem('sc_session',JSON.stringify({room,pid})),{room:r.code,pid:p.id});
  await before.goto(base+'/phone');await before.locator('#diceBtn').waitFor();
  for(const n of [4,7]){p.hand=ids.slice(0,n);await publish();await before.waitForFunction(n=>$('hand').children.length===n,n);await before.waitForTimeout(950);await before.screenshot({path:path.join(OUT,`before-667-${n}.png`)});metrics.push(await before.evaluate(()=>({baseline:true,n:$('hand').children.length,scroll:$('hand').scrollWidth-$('hand').clientWidth,cardWidth:$('hand').firstElementChild.getBoundingClientRect().width})));}
  await before.close();await phone.setViewportSize({width:667,height:375});
  // A state refresh must not replace the clickable die or restart its animation.
  await phone.evaluate(()=>window.testDie=$('diceBtn'));await publish();assert.ok(await phone.evaluate(()=>window.testDie===$('diceBtn')));
  await phone.locator('#hand .card').first().click();await phone.locator('#cardZoom').waitFor({state:'visible'});
  await phone.evaluate(()=>$('cardZoom').classList.remove('on'));
  const original=await phone.evaluate(()=>handDisplay.slice());
  const a=await phone.locator('#hand .card').nth(0).boundingBox(),b=await phone.locator('#hand .card').nth(2).boundingBox();
  await phone.mouse.move(a.x+a.width*.4,a.y+a.height*.45);await phone.mouse.down();await phone.waitForTimeout(500);
  await publish();assert.ok(await phone.evaluate(()=>!!handGesture),'SSE preserves active drag');
  await phone.mouse.move(b.x+b.width*.85,b.y+b.height*.45,{steps:8});await phone.mouse.up();await phone.waitForTimeout(450);
  const order=await phone.evaluate(()=>handDisplay.slice());assert.notDeepEqual(order,original);assert.deepEqual([...order].sort(),[...original].sort());
  assert.equal(await phone.locator('.handDragging,.handPlaceholder').count(),0);
  const dragCard=await phone.locator('#hand .card').first().boundingBox();
  await phone.mouse.move(dragCard.x+40,dragCard.y+50);await phone.mouse.down();await phone.waitForTimeout(450);
  await phone.setViewportSize({width:844,height:390});await phone.waitForTimeout(200);await phone.mouse.up();
  assert.equal(await phone.evaluate(()=>handGesture),null);assert.equal(await phone.locator('.handDragging,.handPlaceholder').count(),0);
  await phone.setViewportSize({width:375,height:667});await phone.locator('#rotate').waitFor({state:'visible'});await phone.setViewportSize({width:667,height:375});
  // Draft headers update even when the options are unchanged and the UI takes its cache fast path.
  G.ask(r,p.id,'pick_draw','選択',[{id:'pick:0',card:'gaston'},{id:'pick:1',card:'pakawata'}]);await publish();await phone.locator('#pickOv').waitFor({state:'visible'});
  p.gold=45;await publish();assert.match(await phone.locator('#pickGold').innerText(),/45 G/);assert.equal(await phone.locator('#pickRow .draftCard').count(),2);
  await phone.screenshot({path:path.join(OUT,'draw-gold.png')});
  G.startDraft(r,p,'end');await publish();await phone.locator('#draftOv').waitFor({state:'visible'});p.gold=567;await publish();assert.match(await phone.locator('#draftGold').innerText(),/567 G/);
  // Real server request rejects the stale level prompt after going back.
  r.pending={};p.gold=1600;G.askUpgrade(r,p,'門');G.handleChoose(r,p.id,'up:1');const stale={...r.pending[p.id]};await publish();
  await phone.getByRole('button',{name:'別の領地を選ぶ',exact:false}).click();await phone.waitForFunction(()=>pend()?.type==='upgrade');assert.equal(r.pending[p.id].where,'門');
  const res=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:r.code,playerId:p.id,type:'choose',optionId:'ul:1:2',promptId:stale.promptId,turnEpoch:stale.turnEpoch,actionId:'stale-feedback-test'})});assert.equal(res.status,409);
  G.handleChoose(r,p.id,'up:2');await publish();await phone.screenshot({path:path.join(OUT,'upgrade-reselect.png')});
  // Board speed uses the existing board token, and all buttons share the saved status.
  const board=await browser.newPage({viewport:{width:1280,height:720}});await observe(board);r.botMode=true;r.pending={};r.turnTransition=null;await board.goto(base+'/play');
  await board.evaluate(({code,token})=>{$('titleOv').classList.remove('on');enterRoom(code,'',token);},{code:r.code,token:r.boardToken});
  await board.locator('#botSpeedBar').waitFor({state:'visible'});await board.locator('#botSpeed2').click();await board.waitForFunction(()=>state?.presentationSpeed===2&&!botSpeedSaving);assert.equal(r.presentationSpeed,2);
  await board.screenshot({path:path.join(OUT,'bot-speed.png')});
  await board.route('**/api/action',route=>route.request().postDataJSON()?.type==='set_presentation_speed'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'テスト通信エラー'})}):route.continue());
  await board.locator('#botSpeed1').click();await board.waitForFunction(()=>!botSpeedSaving);assert.equal(await board.locator('#botSpeed2').getAttribute('aria-pressed'),'true');assert.match(await board.locator('#botSpeedStatus').innerText(),/通信エラー/);await board.unroute('**/api/action');
  r.botMode=false;G.broadcast(r);await board.locator('#botSpeedBar').waitFor({state:'hidden'});
  // Actual browser media decoding/playback plus battle deferral, mute, resume and repeat state updates.
  await board.evaluate(()=>{initAudio();setAudioMuted(false);state.phase='ended';state.lastBattle=null;state.battlePreview=null;activeBattleKey='last';battlePlayingKey='last';setBgm('battle');syncResultBgm();});
  assert.equal(await board.evaluate(()=>bgmCur===bgmBattle),true);
  await board.evaluate(()=>{activeBattleKey=null;battlePlayingKey=null;battleOpeningKey=null;restoreBoardBgm();});
  await board.waitForFunction(()=>bgmCur===bgmResult&&bgmResult.currentTime>.2&&!bgmResult.paused);
  const at=await board.evaluate(()=>bgmResult.currentTime);await board.evaluate(()=>{syncResultBgm();restoreBoardBgm();});await board.waitForTimeout(1200);
  assert.ok(await board.evaluate(t=>bgmResult.currentTime>t,at));assert.equal(await board.evaluate(()=>bgmResult.volume),.25);
  await board.evaluate(()=>setAudioMuted(true));assert.equal(await board.evaluate(()=>bgmResult.paused),true);
  await board.evaluate(()=>setAudioMuted(false));await board.waitForFunction(()=>!bgmResult.paused);
  await board.evaluate(()=>{bgmResult.pause();bgmHeal();});await board.waitForFunction(()=>!bgmResult.paused);
  const duration=await board.evaluate(()=>bgmResult.duration);assert.ok(duration>=60&&duration<=90);
  await board.evaluate(()=>bgmResult.currentTime=bgmResult.duration-.15);await board.waitForTimeout(600);assert.ok(await board.evaluate(()=>bgmResult.currentTime<2&&!bgmResult.paused),'result track loops');
  await board.evaluate(()=>{state.phase='select';setBgm('select');});assert.equal(await board.evaluate(()=>bgmCur===bgmSelect&&bgmResult.paused),true);
  // Reload a completed four-player result as a returning viewer; ranking never controls board music.
  const resultState=await(await fetch(base+'/api/fixture?result=1')).json();
  for(const rank of [1,4]){
    const mine=resultState.matchResult.rankings.find(x=>x.rank===rank)||resultState.matchResult.rankings[rank-1];
    await phone.goto(base+'/phone?fixture=result&player='+encodeURIComponent(mine.id));
    await phone.waitForFunction(()=>state?.phase==='ended');
    await phone.screenshot({path:path.join(OUT,`result-rank-${rank}.png`)});
    await board.goto(base+'/play?fixture=1&result=1&render=dom');
    await board.waitForFunction(()=>state?.phase==='ended');
    await board.evaluate(()=>{initAudio();state.lastBattle=null;state.battlePreview=null;activeBattleKey=null;battlePlayingKey=null;battleOpeningKey=null;syncResultBgm();});
    await board.waitForFunction(()=>bgmCur===bgmResult&&!bgmResult.paused&&bgmResult.currentTime>.15);
  }
  await board.evaluate(()=>{
    window.graphToneCount=0;
    const create=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){window.graphToneCount++;return create.call(this);};
    initAudio();showMatchResult(state.matchResult,false);
    // Isolate growth/hold controls without waiting through all narrated turning points.
    matchResultPlayback.result={...matchResultPlayback.result,turningPoints:[]};
  });
  await board.waitForFunction(()=>window.graphToneCount>=2);
  await board.locator('#mrPlayBtn').click();const pausedCount=await board.evaluate(()=>window.graphToneCount);await board.waitForTimeout(600);assert.equal(await board.evaluate(()=>window.graphToneCount),pausedCount);
  await board.locator('#mrPlayBtn').click();await board.waitForFunction(n=>window.graphToneCount>n,pausedCount);
  await board.evaluate(()=>matchResultPlayback.hold=3000);const holdCount=await board.evaluate(()=>window.graphToneCount);await board.waitForTimeout(450);assert.equal(await board.evaluate(()=>window.graphToneCount),holdCount);
  await board.evaluate(()=>{setAudioMuted(true);matchResultPlayback.hold=0;});const mutedCount=await board.evaluate(()=>window.graphToneCount);await board.waitForTimeout(700);assert.equal(await board.evaluate(()=>window.graphToneCount),mutedCount);
  await board.evaluate(()=>setAudioMuted(false));await board.waitForFunction(n=>window.graphToneCount>n,mutedCount);
  await board.locator('#mrNextBtn').click();const skipCount=await board.evaluate(()=>window.graphToneCount);await board.waitForTimeout(400);assert.equal(await board.evaluate(()=>window.graphToneCount),skipCount);
  await board.evaluate(()=>{showMatchResult(state.matchResult,false);matchResultPlayback.result={...matchResultPlayback.result,turningPoints:[]};matchResultPlayback.progress=.999;});await board.waitForFunction(()=>matchResultPlayback.finished);assert.ok(await board.evaluate(n=>window.graphToneCount>=n+2,skipCount));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'browser-metrics.json'),JSON.stringify({metrics,audioDuration:duration,errors},null,2));console.log('Feedback browser: all layout, pointer, SSE, navigation, speed and audio checks passed');
 }finally{await browser.close();G.server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
