const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/improvements-20260929');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,publicState,startDraft,resolveTile,endTurn};')(require,root,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const r=G.makeFixtureRoom();r.code='IMPR';r.pending={};r.turn=0;r.turnTransition=r.windSupply=r.shopVisit=null;r.boardSeen=Date.now();r.botMode=false;r.titles={conqueror:null,pilgrim:null};
 for(const key of Object.keys(r))if(key.startsWith('last'))r[key]=null;
 r.players.forEach(p=>{p.name='テスト召喚士一号';p.hand=[];p.gold=1000;p.battleWins=p.shrineVisits=0;});
 const actor=r.players[0];actor.charId='redani';G.rooms.set(r.code,r);
 // Added cards travel through the existing real choice API; unchosen candidates remain unowned.
 for(const id of ['weapon','shield','jinx']){
  actor.deck=[];actor.hand=[];actor.discard=[];r.deck=['weapon','shield','jinx'];r.pending={};r.turnTransition=null;
  G.startDraft(r,actor,'end');const pd=r.pending[actor.id];
  const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({room:r.code,playerId:actor.id,type:'choose',optionId:'take:'+id,promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'draft-'+id})});
  assert.equal(res.status,200,await res.text());assert.deepEqual(actor.deck,[id]);assert(!r.deck.includes(id));assert.equal(r.deck.length,2);
 }
 actor.hand=Array(7).fill('weapon').concat('gweapon');G.endTurn(r);assert.equal(r.pending[actor.id].type,'overflow');assert(r.pending[actor.id].options.some(o=>o.id==='ov:gweapon'));
 r.pending={};r.turnTransition=null;for(const key of Object.keys(r))if(key.startsWith('last'))r[key]=null;
 browser=await chromium.launch({channel:'chrome',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
 await p.goto(base+'/play?fixture=1&guide=done');await p.waitForFunction(()=>state?.catalog&&window.BoardMilestones);
 const idle=()=>p.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&!gameEntryRunning&&!animBusy&&!finishActiveTelop&&Date.now()>bannerUntil,null,{timeout:45000});await idle();
 const ids=r.players.map(p=>p.id);
 assert.deepEqual(await p.locator('.orderPlayer').evaluateAll(es=>es.map(e=>e.dataset.player)),ids);
 const current=await p.evaluate(()=>visualTurnId);assert.equal(await p.locator('.orderPlayer.active').getAttribute('data-player'),current);
 await p.evaluate(()=>{state.players[3].points=9000;renderHUD();});
 assert.deepEqual(await p.locator('.orderPlayer').evaluateAll(es=>es.map(e=>e.dataset.player)),ids,'asset rank never reorders turn icons');
 await p.evaluate(()=>{visualTurnId=state.players[2].id;renderHUD();});assert.equal(await p.locator('.orderPlayer.active').getAttribute('data-player'),ids[2]);
 for(const [width,height] of [[1440,900],[1024,768],[837,471]]){
  await p.setViewportSize({width,height});await p.evaluate(()=>renderHUD());await p.waitForTimeout(350);
  const fit=await p.locator('#hudTurnOrder').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;});assert(fit,'order strip fits '+width);
  assert(await p.locator('.orderPlayer img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth)));
  await p.screenshot({path:path.join(out,'hud-'+width+'.png')});
 }
 await p.setViewportSize({width:1440,height:900});
 await p.evaluate(()=>{window.noticeRun=BoardNotice.effect(BoardNext.ultimate(state,state.players[0]),state);});
 await p.waitForTimeout(550);assert.equal(await p.locator('#boardNotice').getAttribute('data-motion'),'calm');
 assert.equal(await p.locator('.ringLayer').evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await p.locator('#boardActorShade.active').count(),0);
 assert.match(await p.locator('.ultRedani').innerText(),/手札に 1 枚.*AT＋40.*3/s);
 assert(await p.locator('.ultAxe>img').evaluate(e=>e.complete&&e.naturalWidth>0));await p.screenshot({path:path.join(out,'redani.png')});await p.evaluate(()=>noticeRun);
 await p.evaluate(()=>{window.noticeRun=BoardFlow.start('turn',state,state.players[0].id);});await p.waitForTimeout(500);
 assert.equal(await p.locator('#boardNotice').getAttribute('data-motion'),'impact');assert.equal(await p.locator('#boardActorShade.active').count(),1);await p.evaluate(()=>noticeRun);
 await p.evaluate(()=>{const tile=state.tiles.findIndex(t=>t.t==='land');window.summonTile=tile;window.noticeRun=playSummonPresentation(tile,{player:state.players[0].id,creature:'gecko',level:1},state);});
 await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>cameraOwner),null);assert.equal(await p.locator('#boardNotice[data-kind=ms-summon]:not([hidden])').count(),1,'notice precedes zoom');assert(await p.evaluate(()=>PW.debugCounts().hiddenPlacements.includes(summonTile)));
 await p.waitForSelector('#boardNotice[data-kind=ms-summon]:not([hidden])');assert.equal(await p.evaluate(()=>zoomTile),null);assert.equal(await p.locator('#boardNotice').getAttribute('data-motion'),'calm');
 await p.waitForTimeout(400);await p.screenshot({path:path.join(out,'placement.png')});await p.waitForFunction(()=>cameraOwner?.owner==='summon');assert.equal(await p.locator('#boardNotice:not([hidden])').count(),0);assert(await p.evaluate(()=>PW.debugCounts().hiddenPlacements.includes(summonTile)));await p.waitForFunction(()=>!PW.debugCounts().hiddenPlacements.includes(summonTile));assert(await p.evaluate(()=>zoomTile===summonTile));await p.waitForFunction(()=>cameraOwner?.returning);const zoomBefore=await p.evaluate(()=>PW.debugCounts().zoom);await p.waitForTimeout(650);assert(await p.evaluate(()=>cameraOwner?.returning),'return keeps ownership beyond the watchdog interval');const zoomDuring=await p.evaluate(()=>PW.debugCounts().zoom);assert(zoomDuring<zoomBefore,'camera gradually zooms out');await p.waitForTimeout(300);assert((await p.evaluate(()=>PW.debugCounts().zoom))<zoomDuring,'zoom continues instead of snapping');await p.evaluate(()=>noticeRun);assert.equal(await p.evaluate(()=>cameraOwner),null);assert.equal(await p.evaluate(()=>zoomTile),null);
 await p.evaluate(()=>{window.noticeRun=playSpellPresentation({spell:'sp_swap',tiles:[summonTile],caster:state.players[0].id,cid:'gecko'},'');});
 await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>cameraOwner),null);await p.waitForFunction(()=>cameraOwner?.owner==='placement-swap');await p.evaluate(()=>noticeRun);assert.equal(await p.evaluate(()=>cameraOwner),null);
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>{window.noticeRun=BoardNotice.effect(BoardNext.ultimate(state,state.players[0]),state,{ms:n=>n*.2});});assert.equal(await p.locator('.actorStand').evaluate(e=>getComputedStyle(e).animationName),'none');await p.evaluate(()=>noticeRun);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify({passed:true,viewports:[1440,1024,837],checks:['random weapon choice API','overflow','turn order independent from rank','current player','quiet actor','turn impact','placement zoom and cleanup','reduced motion']},null,2));console.log('PASS improvement balance/API, HUD, actor motion and placement camera');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
