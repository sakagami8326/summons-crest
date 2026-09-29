const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=process.cwd(),out=path.join(root,'output/draw-hand-ui');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,startDraft,startPickDraw,broadcast,publicState};')(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 for(const width of [844,667]){
  const page=await browser.newPage({viewport:{width,height:375},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  let actions=0;page.on('request',req=>{if(req.url().endsWith('/api/action')&&req.postDataJSON()?.type==='choose')actions++;});
  const r=G.makeFixtureRoom(),p=r.players[0];r.code='DH'+width;r.turn=0;r.pending={};r.turnTransition=null;r.owners.fill(null);r.tileFx={};
  for(const key of ['lastEvent','lastUlt','lastBattle','lastDraw','lastGain','lastDice'])r[key]=null;
  p.hand=['nome','nome','samurai_saga','sp_gold','weapon','shield','sp_step'];p.deck=['nome','shield','sp_gold'];p.discard=[];p.exile=[];G.rooms.set(r.code,r);
  const draft=()=>{r.deck=['samurai_saga','sp_gold','weapon'];G.startDraft(r,p,'battle');G.broadcast(r);};draft();
  await page.goto(base+'/phone?guide=done');await page.evaluate(code=>{room=code;pid='fx0';$('join').style.display='none';document.body.classList.add('ingame');['hdr','msg','action','handWrap'].forEach(id=>$(id).style.display='');connect();},r.code);
  await page.locator('#uxRail .card').first().waitFor();
  assert(await page.locator('#uxClose').isHidden());assert.equal(await page.locator('#uxZones button').count(),0);
  const candidates=await page.locator('#uxRail .card').evaluateAll(es=>es.map(e=>e.dataset.optionId));
  const inventory=G.publicState(r,p.id).players[0].inventoryList.slice().sort();
  await page.locator('#uxBrowseHand').tap();
  assert.deepEqual(await page.locator('#hand .card').evaluateAll(es=>es.map(e=>e.dataset.c)),p.hand);
  assert(await page.locator('#uxPicker').evaluate(e=>e.inert));assert(await page.locator('#hdr').isVisible());
  await page.locator('#hand .card').first().tap();assert(await page.locator('#cardZoomAction').isDisabled());
  assert(await page.locator('#cardZoomDetail').isVisible());await page.locator('#cardZoomClose').tap();
  await page.screenshot({path:path.join(out,'hand-'+width+'.png')});
  G.broadcast(r);await page.waitForTimeout(150);assert(await page.locator('#uxReturnDraw').isVisible());assert(await page.evaluate(()=>sharedCardPicker.handView));
  assert.deepEqual(G.publicState(r,p.id).players[0].inventoryList.slice().sort(),inventory);assert.equal(actions,0);
  await page.locator('#uxReturnDraw').tap();assert.deepEqual(await page.locator('#uxRail .card').evaluateAll(es=>es.map(e=>e.dataset.optionId)),candidates);
  await page.screenshot({path:path.join(out,'candidates-'+width+'.png')});
  await page.locator('#uxSkipDraw').tap();await page.locator('#uxCancelDialog[open]').waitFor();assert.equal(actions,0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'uxCancelBack');
  const geom=await page.locator('#uxCancelDialog .uxDialogClose').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('svg').getBoundingClientRect();return [Math.abs(a.x+a.width/2-b.x-b.width/2),Math.abs(a.y+a.height/2-b.y-b.height/2)];});assert(geom.every(v=>v<1));
  assert(await page.locator('#uxCancelDialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));
  await page.screenshot({path:path.join(out,'warning-'+width+'.png')});
  await page.locator('#uxCancelBack').tap();assert.equal(actions,0);assert.equal(r.pending[p.id].type,'draft');
  await page.locator('#uxSkipDraw').tap();await page.keyboard.press('Escape');assert(!await page.locator('#uxCancelDialog').evaluate(e=>e.open));assert.equal(actions,0);
  await page.locator('#uxSkipDraw').tap();await page.locator('#uxCancelDialog .uxDialogClose').tap();assert.equal(actions,0);
  const id=candidates[0];await page.locator('#uxRail .card').first().tap();await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>pend()?.type!=='draft');
  assert(p.deck.includes(id.slice(5)));assert.equal(actions,1);await page.waitForFunction(()=>!$('drawModal').classList.contains('on'));
  // Same type, new prompt closes the old warning and starts at candidates.
  draft();await page.locator('#uxSkipDraw').waitFor();await page.locator('#uxSkipDraw').tap();const old=r.pending[p.id].promptId;draft();assert.notEqual(r.pending[p.id].promptId,old);
  await page.waitForFunction(()=>!document.getElementById('uxCancelDialog').open);assert.equal(actions,1);
  const beforeSkip=G.publicState(r,p.id).players[0].inventoryList.slice().sort();
  let fail=true;await page.route('**/api/action',route=>{if(route.request().postDataJSON()?.optionId==='skip'&&fail){fail=false;return route.fulfill({status:503,body:'unavailable'});}return route.continue();});
  await page.locator('#uxSkipDraw').tap();await page.locator('#uxCancelSubmit').tap();await page.waitForFunction(()=>!sharedCardPicker.busy);
  assert.equal(r.pending[p.id].type,'draft');assert(await page.locator('#uxCancelDialog').evaluate(e=>e.open));assert.match(await page.locator('#uxCancelError').innerText(),/通信/);
  await page.locator('#uxCancelSubmit').tap();await page.waitForFunction(()=>pend()?.type!=='draft');
  assert.deepEqual(G.publicState(r,p.id).players[0].inventoryList.slice().sort(),beforeSkip);assert.equal(actions,3);
  // A normal selection draw also allows read-only hand inspection, with no skip.
  p.hand=['nome'];p.deck=['weapon','shield','sp_gold'];G.startPickDraw(r,p);G.broadcast(r);await page.waitForFunction(()=>pend()?.type==='pick_draw');
  assert(await page.locator('#uxClose').isHidden());assert(await page.locator('#uxSkipDraw').isHidden());assert.equal(await page.locator('#uxZones button').count(),0);await page.locator('#uxBrowseHand').tap();assert.equal(await page.locator('#hand .card').count(),1);
  await page.locator('#hand .card').tap();assert(await page.locator('#cardZoomAction').isDisabled());await page.locator('#cardZoomClose').tap();assert(await page.locator('#topTools').isHidden());
  await page.locator('#uxReturnDraw').tap();const drawCard=await page.locator('#uxRail .card').first().getAttribute('data-c');await page.locator('#uxRail .card').first().tap();await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>pend()?.type!=='pick_draw');assert(p.hand.includes(drawCard));assert.equal(actions,4);
  // Empty hand remains a valid viewing tab. Updates replace it with latest cards.
  p.hand=[];draft();await page.waitForFunction(()=>pend()?.type==='draft');await page.locator('#uxBrowseHand').tap();assert.equal(await page.locator('#hand .card').count(),0);
  p.hand=['weapon'];G.broadcast(r);await page.waitForFunction(()=>document.querySelector('#hand .card')?.dataset.c==='weapon');assert(await page.locator('#uxReturnDraw').isVisible());
  await page.close();console.log('PASS draw hand, cancel warning, retry, stale prompt, empty hand at',width);
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
