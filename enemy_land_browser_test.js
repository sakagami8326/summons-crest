const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/enemy-land-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,resolveTile,publicState};')(require,root,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+G.server.address().port;
 const r=G.makeFixtureRoom();r.code='ENMY';r.turn=0;r.phase='playing';r.pending={};r.turnTransition=r.windSupply=r.shopVisit=null;r.owners.fill(null);r.elemOv={21:'wind'};r.curses={};r.tileFx={21:{vortex:true,uplift:true}};r.barrier={};r.botMode=false;
 for(const key of Object.keys(r))if(key.startsWith('last'))r[key]=null;
 r.players[0].pos=21;r.players[0].hand=['gecko'];r.players[1].charId='mio';r.players[1].name='テスト召喚士一号';r.players[1].exile=['sp_gold','sp_gold','sp_gold','sp_gold'];r.owners[21]={player:'fx1',creature:'alter',level:3,dmg:30};G.rooms.set(r.code,r);G.resolveTile(r,r.players[0]);
 browser=await chromium.launch({channel:'chrome',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
 await p.goto(url+'/play?fixture=1&guide=done');
 const shown=()=>p.waitForSelector('#boardNotice[data-flow=inspection].elAnchoredVisible:not([hidden])',{timeout:45000});
 try{await shown();}catch(e){console.log('DEBUG',errors,await p.evaluate(()=>({enemy:state?.enemyLand,phase:state?.phase,hop:!!hopState,anim:animBusy,cut:cutBusy,running:presentationRunning,queue:presentationQueue.length,entry:gameEntryRunning,duel:duelPlaying,closeup:closeupTile,banner:bannerUntil-Date.now(),camera:cameraOwner,host:document.querySelector('#boardNotice')?.outerHTML.slice(0,500)})));throw e;}
 const render=async()=>{r.stateRev++;await p.evaluate(s=>{state=s;render()},G.publicState(r,null));};
 assert.equal(await p.locator('.elTotal strong').innerText(),'80');assert.deepEqual(await p.locator('.elEffectGroup h3 span').allTextContents(),['攻め側','守り側']);assert.equal(await p.locator('#tileInfo.on,.callout').count(),0);assert.equal(await p.locator('#boardActorShade.active').count(),0);
 await p.waitForTimeout(13000);assert.equal(await p.evaluate(()=>PW.cameraState().target),'z21');console.log('PASS persistent inspection and zoom beyond watchdog');
 for(const size of [{width:1440,height:900},{width:1024,height:768},{width:1280,height:720}]){await p.setViewportSize(size);await p.waitForTimeout(1200);const box=await p.locator('#boardNotice .messageWindow').boundingBox();assert(box.y>=0&&box.y+box.height<=size.height+1);assert(await p.locator('#boardNotice img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));await p.screenshot({path:path.join(out,'many-'+size.width+'.png')});}
 // Shared notices must preempt inspection and release its camera without deadlocking the lane.
 await p.evaluate(()=>queueFx(1,()=>BoardNotice.effect({actor:state.players[0].id,scene:'test',kind:'test',duration:800,html:'<h2>検証</h2>'},state),{id:'enemy-test-interrupt',kind:'test'}));await p.waitForSelector('#boardNotice[data-kind=test]:not([hidden])');assert.equal(await p.evaluate(()=>cameraOwner),null);await shown();
 // Repeated snapshots cannot replay the panel; a changed HP replaces the same land contents.
 await p.evaluate(()=>{window.savedLandNode=document.querySelector('.elTotal')});await render();assert(await p.evaluate(()=>savedLandNode===document.querySelector('.elTotal')));r.owners[21].dmg=20;await render();await shown();assert.equal(await p.locator('.elTotal strong').innerText(),'90');
 // Server selection is authoritative; selecting invade transitions to the existing creature picker.
 async function choose(id){const pd=r.pending.fx0;pd.availableAt=0;const res=await fetch(url+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:r.code,playerId:'fx0',type:'choose',optionId:id,promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'enemy-'+Date.now()})});assert.equal(res.status,200,await res.text());await render();}
 await choose('invade');await p.waitForFunction(()=>document.querySelector('#boardNotice')?.hidden);assert.equal(await p.evaluate(()=>cameraOwner),null);assert.equal(r.pending.fx0.type,'pick_creature');
 r.battle=null;r.pending={};r.barrier.fx1=true;G.resolveTile(r,r.players[0]);await render();await shown();assert.equal(await p.locator('.elWardNotice strong').innerText(),'侵略不可');assert.equal(await p.locator('#tileMsg.show,.callout').count(),0);assert(!r.pending.fx0.options.some(x=>x.id==='invade'));await p.screenshot({path:path.join(out,'barrier.png')});
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.elWardNotice svg').evaluate(e=>getComputedStyle(e).animationName),'none');
 await choose('toll');await p.waitForFunction(()=>!document.querySelector('#boardNotice[data-flow=inspection]:not([hidden])'));assert.equal(await p.locator('#elTileLink.visible').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS production display, images, three sizes, preemption, live stats, invade/toll API, barrier, reduced motion');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
