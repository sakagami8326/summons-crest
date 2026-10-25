'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const {loadGame,lobby:makeLobby}=require('./mixed_bot_test');const G=loadGame(setTimeout);
const out=path.join(__dirname,'output/summoner-random-integrated');fs.mkdirSync(out,{recursive:true});
(async()=>{let browser;try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
 const errors=[],watch=p=>p.on('pageerror',e=>errors.push(e.message));
 const r=makeLobby(2,'normal',G);r.botMode=true;G.startSelect(r);
 const tv=await browser.newPage({viewport:{width:1440,height:900}});watch(tv);
 async function connectTv(room=r){await tv.goto(base+'/play?guide=done');await tv.evaluate(({code,token})=>{$('titleOv').classList.remove('on');enterRoom(code,location.origin+'/phone?room='+code,token);},{code:room.code,token:room.boardToken});await tv.waitForFunction(()=>state?.phase==='select');}
 const phone=async(id,room=r)=>{const p=await browser.newPage({viewport:{width:844,height:390}});watch(p);await p.goto(base+'/phone?guide=done');await p.evaluate(({code,id})=>{room=code;pid=id;enterGame();},{code:room.code,id});await p.waitForSelector('.roster');return p;};
 await connectTv();const a=await phone('human0'),b=await phone('human1');
 async function align(){assert(await tv.locator('#selRow').evaluate(e=>{const ys=[...e.querySelectorAll('.scChosenName')].map(e=>e.getBoundingClientRect().top);return ys.length===4&&Math.max(...ys)-Math.min(...ys)<1;}));}
 await align();assert.equal(await tv.locator('.scBotBadge').first().evaluate(e=>getComputedStyle(e).borderRadius),'0px');
 for(const filter of ['fire','water','earth','wind','neutral','all']){
  await a.locator(`[data-filter="${filter}"]`).click();assert.equal(await a.locator('.roster>:last-child').getAttribute('data-random-selection'),'');
  assert(await a.locator(`[data-filter="${filter}"]`).evaluate(e=>{const b=e.getBoundingClientRect(),i=e.firstElementChild.getBoundingClientRect();return Math.abs(b.top+b.bottom-i.top-i.bottom)<1&&Math.abs(b.left+b.right-i.left-i.right)<1;}));
 }
 await a.locator('[data-random-selection]').scrollIntoViewIfNeeded();await a.screenshot({path:path.join(out,'phone-list.png')});
 await a.locator('[data-random-selection]').click();await a.locator('.randomWaiting').waitFor();
 await tv.waitForFunction(()=>state.players.find(p=>p.id==='human0').randomSelection);assert.equal(r.selectionDraw,null);await align();
 await a.locator('.reselectSummoner').click();await a.locator('.roster').waitFor();
 await a.locator('[data-random-selection]').scrollIntoViewIfNeeded();await a.locator('[data-random-selection]').click();
 await b.locator('[data-id="redani"]').click();await b.locator('.chooseSummoner').click();
 await tv.waitForFunction(()=>state.selectionDraw?.phase==='rolling',null,{timeout:30000});
 const id=r.selectionDraw.id,startedAt=r.selectionDraw.startedAt;
 assert.equal(await tv.locator('.selectionDrawFrames').count(),3);assert(r.selectionDraw.targets.every(t=>t.charId!=='redani'));
 assert(!await tv.locator('#selectionStart').evaluate(e=>e.classList.contains('on')));await align();
 await tv.waitForTimeout(650);assert.equal(await tv.locator('.selectionDrawFrames .selectionCurrent').count(),3);
 await tv.screenshot({path:path.join(out,'switching.png')});
 await connectTv();assert.equal(r.selectionDraw.id,id);assert.equal(r.selectionDraw.startedAt,startedAt);
 await tv.waitForFunction(()=>state.selectionReady,null,{timeout:15000});await a.locator('.summonerDetail').waitFor();
 assert.equal(await a.locator('.chooseSummoner').innerText(),'選び直す');assert.equal(await tv.locator('.selCard.chosen').count(),4);await align();
 assert.equal(new Set(r.players.map(p=>p.charId)).size,4);
 for(const [width,height]of[[1440,900],[1920,1080]]){await tv.setViewportSize({width,height});await tv.waitForTimeout(750);await align();assert(await tv.locator('#selectionStartBtn').evaluate(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight&&[...document.querySelectorAll('.scPawnWrap')].every(p=>p.getBoundingClientRect().bottom<r.top);}));await tv.screenshot({path:path.join(out,'tv-'+width+'.png')});}
 for(const [width,height]of[[844,390],[667,375]]){await a.setViewportSize({width,height});assert(await a.locator('.chooseSummoner').isVisible());await a.screenshot({path:path.join(out,'phone-result-'+width+'.png')});}
 await a.locator('.chooseSummoner').click();await a.locator('.roster').waitFor();await tv.waitForFunction(()=>!state.selectionDraw);
 assert.equal(r.players.find(p=>p.id==='human1').charId,'redani');
 await a.locator('[data-random-selection]').scrollIntoViewIfNeeded();await a.locator('[data-random-selection]').click();
 await tv.waitForFunction(()=>state.selectionReady,null,{timeout:15000});assert.notEqual(r.selectionDraw.id,id);
 await tv.locator('#selectionStartBtn').click();await tv.waitForFunction(()=>state.phase==='playing');assert.equal(r.selectionDraw,null);
 const all=makeLobby(4,'normal',G);G.startSelect(all);await connectTv(all);
 for(const human of all.players){const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({room:all.code,type:'choose',playerId:human.id,optionId:'random'})});assert(res.ok);}
 await tv.waitForFunction(()=>state.selectionDraw?.phase==='rolling');assert.equal(await tv.locator('.selectionDrawFrames').count(),4);
 await tv.waitForFunction(()=>state.selectionReady);assert.equal(new Set(all.players.map(p=>p.charId)).size,4);
 const conflict=makeLobby(3,'normal',G);conflict.botMode=true;G.startSelect(conflict);await connectTv(conflict);
 const chooseConflict=async(playerId,optionId)=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({room:conflict.code,type:'choose',playerId,optionId})});assert(res.ok);};
 await chooseConflict('human0','redani');await chooseConflict('human1','redani');await chooseConflict('human2','random');
 await tv.waitForFunction(()=>duelPlaying);assert.equal(conflict.selectionDraw,null);
 const loser=conflict.players.find(p=>!p.isBot&&!p.confirmed);await chooseConflict(loser.id,'random');
 await tv.waitForTimeout(300);assert.equal(conflict.selectionDraw.phase,'preparing');assert(await tv.evaluate(()=>duelPlaying));
 await tv.waitForFunction(()=>state.selectionReady,null,{timeout:15000});assert(!await tv.evaluate(()=>duelPlaying));
 await connectTv(conflict);assert(!await tv.evaluate(()=>duelPlaying));assert.equal(conflict.selectionDraw.phase,'done');
 const single=makeLobby(1,'bot',G);G.startSelect(single);
 const quiet=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});watch(quiet);
 await quiet.goto(base+'/play?guide=done');await quiet.evaluate(({code,token})=>{$('titleOv').classList.remove('on');enterRoom(code,location.origin+'/phone?room='+code,token);},{code:single.code,token:single.boardToken});await quiet.waitForFunction(()=>state?.phase==='select');
 await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({room:single.code,type:'choose',playerId:'human0',optionId:'redani'})});
 await quiet.waitForFunction(()=>state.selectionReady,null,{timeout:15000});assert(single.selectionDraw.targets.at(-1).stopAt-single.selectionDraw.startedAt<=400);
 assert.deepEqual(errors,[]);
 console.log('PASS live integration: native TV/phone SSE, last/filter button, centered icons/labels, BOT badge, manual+random+BOT, preparing/rolling/reveal, reload without redraw, reselect, actual game start, all random and reduced motion');
}finally{await browser?.close();for(const r of G.rooms.values()){G.clearBotTimer(r);G.clearSelectionDrawTimer(r);G.clearUltTimer(r);G.clearTurnTransitionTimer(r);clearTimeout(r.windSupplyTimer);}G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
