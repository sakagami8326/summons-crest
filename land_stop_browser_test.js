const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const out=path.join(__dirname,'output/land-stop-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,resolveTile,publicState};')(require,__dirname,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const r=G.makeFixtureRoom();r.code='LAND';r.turn=0;r.phase='playing';r.pending={};r.turnTransition=r.windSupply=r.shopVisit=null;r.owners.fill(null);r.elemOv={21:'wind'};r.curses={};r.tileFx={};r.barrier={};r.botMode=false;
 for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;
 const actor=r.players[0];actor.pos=21;actor.charId='mio';actor.name='テスト召喚士一号';actor.hand=['poponga'];actor.gold=2400;G.rooms.set(r.code,r);G.resolveTile(r,actor);
 browser=await chromium.launch({channel:'chrome',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.glowSamples=[];function sample(){const glow=typeof PW!=='undefined'?PW._debugScene?.()?.children.list.find(c=>c.name==='inspection-glow'):null;if(glow&&glowSamples.at(-1)!==1)glowSamples.push(glow.alpha);requestAnimationFrame(sample)}requestAnimationFrame(sample)});
 await p.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
 const shown=()=>p.waitForSelector('#boardNotice[data-kind=land-stop].elAnchoredVisible:not([hidden])',{timeout:45000});
 async function load(){await p.goto(base+'/play?fixture=1&guide=done');await shown()}
 async function render(){r.stateRev++;await p.evaluate(s=>{state=s;render()},G.publicState(r,null))}
 async function choose(id){const pd=r.pending[actor.id];const res=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:r.code,playerId:actor.id,type:'choose',optionId:id,promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'land-'+Math.random()})});assert.equal(res.status,200,await res.text());await render()}
 await load();assert.equal(await p.locator('.lsEmpty .elTileElement').evaluate(e=>e.offsetWidth),96);assert.equal(await p.locator('#tileInfo.on,.callout,#elTileLink').count(),0);assert(await p.evaluate(()=>!PW.cameraState().panRunning&&!PW.cameraState().zoomRunning));
 await p.waitForFunction(()=>glowSamples.at(-1)===1);const samples=await p.evaluate(()=>glowSamples);assert(samples[0]<.1);assert(samples.some(a=>a>.1&&a<.9));assert(samples.every((a,i)=>!i||a>=samples[i-1]));
 assert.deepEqual(await p.evaluate(()=>PW._debugScene().children.list.filter(c=>c.name==='inspection-glow').map(c=>c.depth)),[97]);await p.screenshot({path:path.join(out,'empty.png')});
 await choose('summon:poponga');assert.equal(r.owners[21].creature,'poponga');await p.waitForFunction(()=>!document.querySelector('#boardNotice[data-kind=land-stop]:not([hidden])'));assert.equal(await p.evaluate(()=>PW._debugScene().children.list.filter(c=>c.name==='inspection-glow').length),0);
 console.log('PASS empty -> zoom settled -> fade below actors -> actual summon API -> inspection removed');
 r.turn=0;r.pending={};r.turnTransition=null;for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;
 r.owners[21]={player:actor.id,creature:'poponga',level:4,dmg:10};r.owners[22]={player:actor.id,creature:'nome',level:1};G.resolveTile(r,actor);await load();
 assert.equal(await p.locator('.lsCreatureName').innerText(),'ワタランガ');assert.equal(await p.locator('.lsUpgradeGuide').innerText(),'自分の領地を選んで強化');assert.equal(await p.locator('.lsMax').innerText(),'このマスは最大レベル');assert.equal(await p.locator('.lsCost').count(),0);
 await p.waitForTimeout(12500);assert.equal(await p.evaluate(()=>PW.cameraState().target),'z21');
 await p.evaluate(()=>window.sameNode=document.querySelector('.lsCreature'));await render();assert(await p.evaluate(()=>sameNode===document.querySelector('.lsCreature')));
 for(const size of [{width:1440,height:900},{width:1024,height:768},{width:1280,height:720}]){await p.setViewportSize(size);await p.waitForTimeout(1500);await shown();assert(await p.locator('#boardNotice .messageWindow,.standName').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})));assert(await p.locator('#boardNotice img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth)));await p.screenshot({path:path.join(out,'own-'+size.width+'.png')});}
 await p.evaluate(()=>queueFx(1,()=>BoardNotice.effect({actor:state.players[0].id,scene:'test',kind:'interrupt',duration:700,html:'<h2>検証</h2>'},state),{id:'land-interrupt',kind:'test'}));await p.waitForSelector('#boardNotice[data-kind=interrupt]');assert.equal(await p.evaluate(()=>PW._debugScene().children.list.filter(c=>c.name==='inspection-glow').length),0);await shown();
 await choose('up:22');await p.waitForFunction(()=>!document.querySelector('#boardNotice[data-kind=land-stop]:not([hidden])'));await choose('ul:22:2');assert.equal(r.owners[22].level,2);assert.equal(r.owners[21].level,4);
 assert.deepEqual(errors,[]);console.log('PASS own/max level, other territory upgrade API, stable snapshots, three sizes, preemption, no missing art or browser errors');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close()}})().catch(e=>{console.error(e);process.exit(1)});
