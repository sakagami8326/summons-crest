const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const out=path.join(__dirname,'output/finale-integration');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,publicState,broadcast,bankrupt,declareWin,initMatchAnalytics};')(require,__dirname,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 for(const [width,height,lastSurvivor] of [[1440,900,false],[1024,768,true]]){
  const r=G.makeFixtureRoom();r.code='FN'+width;r.pending={};r.turnTransition=r.windSupply=r.shopVisit=null;r.curses={};r.tileFx={};r.barrier={};
  for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;
  r.players[0].charId='mio';r.players[0].name='テスト召喚士一号';
  if(lastSurvivor)r.players.slice(2).forEach(p=>p.bankrupt=true);
  G.initMatchAnalytics(r);G.rooms.set(r.code,r);
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
  await page.addInitScript(()=>{window.finaleShown=[];addEventListener('DOMContentLoaded',()=>{
   let active='';new MutationObserver(()=>{const h=document.getElementById('boardNotice');if(!h||h.hidden||h.dataset.scene!=='finale'){active='';return}if(h.dataset.kind!==active){active=h.dataset.kind;finaleShown.push(active)}}).observe(document.body,{attributes:true,childList:true,subtree:true});
  })});
  await page.goto(base+'/play?fixture=1&guide=done');await page.waitForFunction(()=>typeof state!=='undefined'&&state?.code.startsWith('FN')&&PW.isReady());
  await page.evaluate(roomCode=>{code=roomCode;connectBoard()},r.code);await page.waitForTimeout(800);
  G.bankrupt(r,r.players[1]);G.broadcast(r);
  await page.waitForSelector('#boardNotice[data-kind=bankrupt]:not([hidden])',{timeout:30000});await page.waitForTimeout(1600);
  assert.equal(await page.locator('#plate-'+r.players[1].id).evaluate(e=>getComputedStyle(e).filter),'grayscale(1) brightness(0.65)');
  assert(!(await page.locator('#plate-'+r.players[0].id).evaluate(e=>getComputedStyle(e).filter)).includes('grayscale'));
  assert.equal(await page.locator('#bankruptCut.on').count(),0);
  await page.screenshot({path:path.join(out,'bankrupt-'+width+'.png')});
  await page.waitForFunction(()=>!document.querySelector('#boardNotice[data-kind=bankrupt]:not([hidden])'));
  if(!lastSurvivor){G.declareWin(r,r.players[0],'castle');G.broadcast(r)}
  await page.waitForSelector('#boardNotice[data-kind=victory]:not([hidden])',{timeout:40000});await page.waitForTimeout(1300);
  const camera=await page.evaluate(()=>({camera:PW.cameraState(),owner:cameraOwner?.owner,castle:state.tiles.findIndex(t=>t.t==='castle')}));
  assert.equal(camera.camera.target,'z'+camera.castle);assert.equal(camera.owner,'victory');assert(!camera.camera.isFit);
  assert.equal(await page.locator('#winOv.on,#matchResultOv.on').count(),0);
  assert(await page.locator('#boardNotice img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
  await page.screenshot({path:path.join(out,'victory-'+width+'.png')});
  // A late SSE update with expired review fallback must not interrupt the active notice.
  r.resultReview.unlockAt=Date.now()-1;G.broadcast(r);await page.waitForTimeout(2300);
  assert(await page.evaluate(()=>!PW.cameraState().isFit&&!document.getElementById('boardNotice').hidden));
  assert.equal(await page.locator('#matchResultOv.on').count(),0);
  await page.waitForSelector('#rvPodium.on');await page.waitForFunction(()=>PW.cameraState().isFit);
  assert.deepEqual(await page.evaluate(()=>finaleShown),['bankrupt','victory']);
  G.broadcast(r);await page.waitForTimeout(500);assert.deepEqual(await page.evaluate(()=>finaleShown),['bankrupt','victory']);
  assert.equal(await page.locator('#plate-'+r.players[1].id).evaluate(e=>getComputedStyle(e).filter),'grayscale(1) brightness(0.65)');
  // Completed/expired saved games reopen the result, without replaying the win.
  await page.reload();await page.waitForSelector('#rvPodium.on');assert.deepEqual(await page.evaluate(()=>finaleShown),[]);
  await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({errors,bankruptcySse:true,lastSurvivorOrder:true,hudPersistent:true,castleZoomHeld:true,lateSse:true,once:true,reload:true,result:true,widths:[1440,1024]},null,2));
 console.log('PASS finale: server events -> SSE -> bankruptcy -> castle victory -> results, persistent HUD, late SSE, reload, two viewports');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close()}})().catch(e=>{console.error(e);process.exit(1)});
