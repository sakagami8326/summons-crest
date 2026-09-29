const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const out=path.join(__dirname,'output/economy-integration');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,publicState,performMove,resolveTile,handleChoose,MAPS};')(require,__dirname,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const r=G.makeFixtureRoom();r.code='ECON';r.pending={};r.turn=0;r.turnTransition=null;r.windSupply=null;r.shopVisit=null;r.lastBattle=r.lastEvent=r.lastUlt=r.lastDice=r.lastDraw=r.lastGain=r.lastHeal=r.lastSeal=null;r.owners.fill(null);r.tileFx={};r.curses={};r.players.forEach(p=>{p.hand=['gecko'];p.gold=900;p.dir=1;});
 const actor=r.players[0];actor.pos=27;actor.seal=true;actor.lap=1;G.rooms.set(r.code,r);
 // Arrange pre-existing recovery targets before the first observed state; these are not six new summons.
 for(let i=0;i<6;i++)r.owners[i+1]={player:actor.id,creature:i?'poponga':'poponga_f',level:1,dmg:i%2?6:13};
 browser=await chromium.launch({channel:'chrome',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
 await p.goto(base+'/play?fixture=1&guide=done');await p.waitForFunction(()=>state?.catalog&&document.querySelector('#hud .plate'));
 await p.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&!gameEntryRunning&&!animBusy&&!finishActiveTelop&&Date.now()>bannerUntil,{},{timeout:45000});
 G.performMove(r,actor,1,{value:1},'test');const castle=JSON.parse(JSON.stringify(r.lastDice.castle));
 await p.evaluate(s=>{state=s;render();},G.publicState(r,null));
 assert.equal(await p.evaluate(()=>BoardNotice.hudGold(state.players[0])),castle.beforeGold);
 const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});phone.on('pageerror',e=>errors.push(e.message));
 await phone.goto(base+'/phone?guide=done');await phone.evaluate(()=>{room='ECON';pid='fx0';$('join').style.display='none';document.body.classList.add('ingame');connect();});
 await phone.waitForFunction(()=>state?.pending?.fx0?.type==='draft');assert.match(await phone.locator('#diceDock').innerText(),/テレビ演出中/);
 const pd=r.pending[actor.id];const early=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:r.code,playerId:actor.id,type:'choose',optionId:pd.options[0].id,promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'early-castle'})});assert.equal(early.status,425);
 await p.waitForSelector('#boardNotice[data-kind=castle]:not([hidden])');await p.waitForFunction(()=>document.querySelector('#boardNotice.settled'));
 assert.equal(await p.locator('.returnReward').count(),3);assert.equal(await p.locator('.goldReward h3').innerText(),'ボーナス');assert(!(await p.locator('.hpReward').innerText()).includes('最大'));assert.equal(await p.locator('.healTarget').count(),6);
 assert((await p.locator('.healTarget img').first().getAttribute('src')).includes('e_poponga.png'));
 assert.equal(await p.locator('[data-counter=cash]').innerText(),castle.afterGold.toLocaleString('ja-JP'));
 await p.screenshot({path:path.join(out,'castle-integrated.png')});
 await p.waitForFunction(()=>document.querySelector('.healPage.active')?.dataset.page==='1');assert.match(await phone.locator('#diceDock').innerText(),/テレビ演出中/);
 await p.waitForFunction(()=>document.querySelector('#boardNotice').hidden);await phone.waitForFunction(()=>!document.querySelector('#diceDock').textContent.includes('テレビ演出中'));
 assert.equal(await p.evaluate(()=>BoardNotice.hudGold(state.players[0])),castle.afterGold);
 const chosen=pd.options[0].id;const result=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:r.code,playerId:actor.id,type:'choose',optionId:chosen,promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'castle-done'})});assert.equal(result.status,200);await phone.close();
 await p.evaluate(s=>{state=s;render();},G.publicState(r,null));await p.waitForFunction(()=>!hopState&&!animBusy);
 console.log('PASS actual castle movement -> reward pages -> auto close -> phone/API selection gate');
 // An actual no-battle toll uses the same two-account notice, including negative balances.
 r.pending={};r.turn=0;r.turnTransition=null;actor.pos=2;actor.gold=20;r.owners[2]={player:'fx1',creature:'nome',level:3};r.players[1].gold=900;
 G.resolveTile(r,actor);G.handleChoose(r,actor.id,'toll');const toll=JSON.parse(JSON.stringify(r.lastEvent));assert.equal(toll.type,'toll');assert(toll.fromGold<0);
 // The defending territory is fixture setup, not a level-up/evolution event.
 await p.evaluate(s=>{state=s;state.lastDice=null;prev.ownersArr=structuredClone(s.owners);prevPos[state.players[0].id]=state.players[0].pos;render();},G.publicState(r,null));
 await p.waitForSelector('#boardNotice[data-kind=toll]:not([hidden])');await p.waitForFunction(()=>document.querySelector('#boardNotice.settled'));
 assert(!(await p.locator('#boardNotice').innerText()).includes('防衛成功'));assert.equal(await p.locator('[data-counter=from]').innerText(),toll.fromGold.toLocaleString('ja-JP'));await p.screenshot({path:path.join(out,'toll-integrated.png')});await p.waitForFunction(()=>document.querySelector('#boardNotice').hidden);
 // Exercise the real move path and gate pause, rather than only invoking the renderer.
 r.pending={};r.turn=0;r.turnTransition=null;r.phase='playing';r.lastEvent=null;r.lastHeal=null;r.owners.fill(null);actor.pos=14;actor.seal=false;actor.gold=900;
 await p.evaluate(s=>{state=s;prevPos[state.players[0].id]=14;render();},G.publicState(r,null));
 G.performMove(r,actor,2,{value:2},'test');const gate=r.lastDice.gateEvents[0];await p.evaluate(s=>{state=s;render();},G.publicState(r,null));
 await p.waitForSelector('#boardNotice[data-kind=gate]:not([hidden])');assert.equal(await p.evaluate(()=>pawnAnim[state.players[0].id]),15);assert(await p.evaluate(()=>hopState.gatePresenting));
 await p.waitForFunction(()=>document.querySelector('#boardNotice.settled'));assert.equal(await p.locator('[data-counter=cash]').innerText(),gate.afterGold.toLocaleString('ja-JP'));assert.match(await p.locator('.castleDestination').innerText(),/城へ戻ってボーナスをGET/);await p.screenshot({path:path.join(out,'gate-integrated.png')});
 await p.waitForFunction(()=>!hopState&&!animBusy);assert(await p.locator('#boardNotice').isHidden());
 console.log('PASS actual toll/API path, negative cash, gate hop pause/resume, no duplicated cutin');
 // Real cavern segment uses the same gate pause before unlocking the next action.
 r.mapId='twin_gate_cavern';r.tiles=G.MAPS.twin_gate_cavern.tiles.map(t=>({...t}));r.owners=Array(r.tiles.length).fill(null);r.pending={};r.lastEvent=null;r.lastSeal=null;r.lastDice=null;r.turn=0;r.turnTransition=null;actor.pos=11;actor.previousTile=10;actor.gatesVisited=[];actor.gold=900;
 await p.evaluate(s=>{state=s;prevPos[state.players[0].id]=11;render();},G.publicState(r,null));
 G.performMove(r,actor,1,{value:1},'cave test');await p.evaluate(s=>{state=s;render();},G.publicState(r,null));
 await p.waitForSelector('#boardNotice[data-kind=gate]:not([hidden])');assert.match(await p.locator('.moneyHeader').innerText(),/東門/);assert(await p.evaluate(()=>hopState.gatePresenting));await p.waitForFunction(()=>!hopState&&!animBusy);assert(await p.locator('#boardNotice').isHidden());
 // A reconnect to the already finished segment must not put old cash back into the HUD.
 await p.evaluate(()=>{BoardNotice.reset();BoardNotice.prepareEconomy(state,prev,state.lastDice.segment.id,false);});assert.equal(await p.evaluate(()=>BoardNotice.hudGold(state.players[0])),actor.gold);
 console.log('PASS actual cavern gate segment and completed-segment reconnect');
 // Larger real recovery collections stay inside the same fixed frame and visit every page.
 await p.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&Date.now()>bannerUntil);
 for(const width of [1440,1280,1024])for(const count of [0,6,12,24]){
  await p.setViewportSize({width,height:width===1440?900:768});
  const e={...castle,healed:Array.from({length:count},(_,i)=>({tile:i,creatureId:i%2?'poponga':'poponga_f',amount:i%2?6:10}))};
  await p.evaluate(({e,count})=>{BoardNotice.reset();window.pagesSeen=new Set();window.rewardRun=BoardNotice.reward('castle',e,state.players[0],state,{ms:n=>n*.2,onHud:()=>{},key:'test:'+count});window.pageWatch=setInterval(()=>{const page=document.querySelector('.healPage.active');if(page)pagesSeen.add(page.dataset.page)},20);},{e,count});
  await p.waitForFunction(()=>document.querySelector('#boardNotice.settled'));
  assert(await p.locator('#boardNotice .messageWindow,.returnReward').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&e.scrollWidth<=e.clientWidth+1;})),`overflow ${width}/${count}`);
  assert(await p.locator('#boardNotice img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth)));
  if(count===24)await p.screenshot({path:path.join(out,`castle-many-${width}.png`)});
  await p.evaluate(()=>rewardRun);assert.equal(await p.evaluate(()=>{clearInterval(pageWatch);return pagesSeen.size}),Math.ceil(count/3));
 }
 for(const [tile,visited]of [[12,[12]],[22,[22]],[22,[12,22]]]){
  await p.evaluate(({tile,visited})=>{state.mapId='twin_gate_cavern';window.rewardRun=BoardNotice.reward('gate',{tile,gatesVisited:visited,gold:100,beforeGold:900,afterGold:1000},state.players[0],state,{ms:n=>n*.2,onHud:()=>{},key:'cave:'+visited.join()});},{tile,visited});
  await p.waitForFunction(()=>document.querySelector('#boardNotice.rewardLit'));
  assert.equal(await p.locator('.sealChip').count(),2);assert.match(await p.locator('.castleDestination').innerText(),visited.length===2?/城へ戻ってボーナスをGET/:tile===12?/次は西門へ/:/次は東門へ/);await p.evaluate(()=>rewardRun);
 }
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(e=>{window.rewardRun=BoardNotice.reward('castle',e,state.players[0],state,{ms:n=>n*.1,onHud:()=>{},key:'reduce'});},castle);assert.equal(await p.locator('.cardReward .bonusIcon img').evaluate(e=>getComputedStyle(e).animationName),'none');await p.evaluate(()=>rewardRun);
 assert.deepEqual(errors,[]);console.log('PASS recovery counts/viewports, evolved images, both gates/directions, reduced motion, no browser exceptions');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
