const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const out=path.join(__dirname,'output/goal-notice-integration');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,publicState,broadcast,askRoll};')(require,__dirname,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const r=G.makeFixtureRoom(),actor=r.players[0];r.code='GOAL';r.pending={};r.owners.fill(null);r.titles={conqueror:null,pilgrim:null};r.curses={};r.tileFx={};r.barrier={};r.turnTransition=r.windSupply=r.shopVisit=null;
 for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;
 r.players.forEach(p=>p.gold=1000);actor.gold=6900;actor.name='テスト召喚士一号';actor.charId='mio';G.rooms.set(r.code,r);
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
 await page.addInitScript(()=>{window.goalShown=[];addEventListener('DOMContentLoaded',()=>{let active='';new MutationObserver(()=>{const h=document.getElementById('boardNotice');if(!h||h.hidden||h.dataset.scene!=='goal-notice'){active='';return}const key=h.dataset.kind+':'+h.querySelector('.goalAsset strong')?.textContent;if(key!==active){active=key;goalShown.push(key)}}).observe(document.body,{attributes:true,childList:true,subtree:true})})});
 const load=async()=>{await page.goto(base+'/play?fixture=1&guide=done');await page.waitForFunction(()=>typeof state!=='undefined'&&state?.code==='GOAL'&&typeof PW!=='undefined'&&PW.isReady());await page.evaluate(()=>{code='GOAL';connectBoard()});await page.waitForTimeout(800)};
 await load();
 async function castGold(from,lap=1){actor.gold=from;actor.lap=lap;actor.hand=['sp_gold'];actor.spellCast=false;G.askRoll(r,actor);G.broadcast(r);const pd=r.pending[actor.id];const response=await page.request.post(base+'/api/action',{data:{room:r.code,playerId:actor.id,type:'choose',optionId:'sp:sp_gold',promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'goal-'+Date.now()}});assert.equal(response.status(),200,await response.text());}
 const shown=async kind=>{try{return await page.waitForSelector('#boardNotice[data-kind=goal-'+kind+']:not([hidden])',{timeout:30000})}catch(e){console.log(JSON.stringify(await page.evaluate(()=>({phase:state.phase,rev:state.stateRev,notices:state.goalNotices,players:state.players.map(p=>({id:p.id,points:p.points})),queue:presentationQueue.map(i=>({id:i.id,kind:i.kind,stale:i.stale?.()})),registry:[...presentationRegistry],running:presentationRunning,context:presentationContext,animBusy,cutBusy,bannerUntil,shown:goalShown})),null,2));console.log(errors);await page.screenshot({path:path.join(out,'failure.png')});throw e}};
 await castGold(6900);await shown('near');assert.equal(await page.locator('.goalAsset strong').innerText(),'7,000');await page.waitForTimeout(1300);await page.screenshot({path:path.join(out,'near.png')});await page.waitForFunction(()=>document.getElementById('boardNotice').hidden);
 await castGold(7900);await shown('ready');assert.equal(await page.locator('.goalNotice h2').innerText(),'城へ戻れば勝利');await page.waitForTimeout(1300);await page.screenshot({path:path.join(out,'ready.png')});await page.waitForFunction(()=>document.getElementById('boardNotice').hidden);
 actor.gold=6500;G.broadcast(r);actor.gold=8500;G.broadcast(r);await page.waitForTimeout(1000);assert.deepEqual(await page.evaluate(()=>goalShown),['goal-near:7,000','goal-ready:8,000']);assert.equal(r.goalNotices.length,2);
 await load();await page.waitForTimeout(1000);assert.deepEqual(await page.evaluate(()=>goalShown),[]);
 // A second player crosses both thresholds in one actual gold-spell choice.
 const other=r.players[1];r.turn=1;other.gold=6900;other.lap=12;other.hand=['sp_gold'];other.spellCast=false;G.askRoll(r,other);G.broadcast(r);
 const pd=r.pending[other.id];const res=await page.request.post(base+'/api/action',{data:{room:r.code,playerId:other.id,type:'choose',optionId:'sp:sp_gold',promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'goal-jump'}});assert.equal(res.status(),200,await res.text());await shown('ready');assert.equal(await page.locator('.goalAsset strong').innerText(),'8,100');assert.equal(r.goalNotices.filter(e=>e.player===other.id).length,1);await page.waitForFunction(()=>document.getElementById('boardNotice').hidden);
 // Shared artwork and label geometry at supported board sizes, including reduced motion.
 for(const [width,height,charId]of [[1440,900,'mio'],[1280,720,'redani'],[1024,768,'adel']]){
  await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:width===1024?'reduce':'no-preference'});
  await page.evaluate(({charId})=>{const s=structuredClone(state),e={...s.goalNotices[1]};s.players[0].charId=charId;window.goalTestFinished=BoardNotice.effect(BoardGoal.model(e,s),s)}, {charId});await page.waitForTimeout(1300);
  assert(await page.locator('#boardNotice img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
  assert(await page.locator('.goalNotice h2,.goalAsset strong,.standName').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})));
  await page.screenshot({path:path.join(out,'size-'+width+'.png')});await page.evaluate(()=>goalTestFinished);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({errors,spellApi:true,sse:true,once:true,directJump:true,reload:true,sizes:3},null,2));console.log('PASS real spell API -> SSE -> goal notices, once per match, direct jump, reload, art, sizes, reduced motion');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close()}})().catch(e=>{console.error(e);process.exit(1)});
