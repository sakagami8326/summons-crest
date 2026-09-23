const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,src=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,publicState,broadcast,serializeRoom,restoreRoom};')(require,root,()=>0,()=>0);
const output=path.join(root,'output/deck-sync');fs.mkdirSync(output,{recursive:true});
(async()=>{let browser;const errors=[];try{
  await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
  let r=G.makeFixtureRoom();r.code='SYNC';r.turn=0;r.pending={};r.turnTransition=null;r.owners.fill(null);r.tileFx={};
  for(const key of ['lastEvent','lastUlt','lastBattle','lastDraw','lastGain','lastDice'])r[key]=null;
  let p=r.players[0];p.hand=['nome'];p.deck=['weapon','sp_gold'];p.discard=[];p.exile=['shield'];p.resolving=[];p.pickCards=[];
  G.rooms.set(r.code,r);
  const api=async suffix=>fetch(base+'/api/state'+suffix);
  assert.equal((await api('?room=NONE&me=fx0')).status,404);
  assert.equal((await api('?room=SYNC&me=missing')).status,403);
  r.players[1].isBot=true;assert.equal((await api('?room=SYNC&me=fx1')).status,403);r.players[1].isBot=false;
  const before=JSON.stringify(G.serializeRoom(r));const initial=await api('?room=SYNC&me=fx0');
  assert.equal(initial.headers.get('cache-control'),'no-store');
  const snapshot=await initial.json();assert.deepEqual(snapshot.players[0].inventoryList.sort(),['nome','sp_gold','weapon']);
  for(const other of snapshot.players.slice(1)){assert.equal(other.inventoryList,undefined);assert.equal(other.exileList,undefined);assert.deepEqual(other.hand,[]);}
  const after=G.serializeRoom(r);delete after.savedAt;const beforeObject=JSON.parse(before);delete beforeObject.savedAt;
  assert.deepEqual(after,beforeObject,'GET must not change gameplay, revision, save data or log');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/phone?guide=done');await page.evaluate(()=>{room='SYNC';pid='fx0';enterGame();});
  await page.waitForFunction(()=>state?.stateInstanceId);
  const ids=()=>page.locator('#deckOv .overviewCard').evaluateAll(es=>es.map(e=>e.dataset.card).sort());
  const open=async()=>{await page.locator('#deckBtn').tap();await page.waitForFunction(()=>deckReady && deckIsOpen() && !!document.querySelector('#deckOv .overviewGrid'));};
  let calls=0,release;const hold=new Promise(resolve=>release=resolve);
  await page.route('**/api/state?*',async route=>{calls++;await hold;await route.continue().catch(()=>{});});
  await page.locator('#deckBtn').tap();await page.waitForSelector('.overviewSpinner');
  assert.equal(await page.locator('#deckOv .overviewCard').count(),0,'no stale cards while opening');
  await page.evaluate(()=>{refreshDeckOverview();refreshDeckOverview();});
  await page.waitForTimeout(100);assert.equal(calls,1,'single flight');
  release();await page.waitForSelector('#deckOv .overviewGrid');await page.unroute('**/api/state?*');
  assert.deepEqual(await ids(),['nome','shield','sp_gold','weapon']);
  console.log('PASS private read-only endpoint, loading and single-flight');

  // An unchanged verification preserves the nodes and scroll; polling recovers lost SSE.
  await page.evaluate(()=>{es.close();window.keptCard=$('deckOv').querySelector('.overviewCard');});
  await page.evaluate(()=>refreshDeckOverview());assert(await page.evaluate(()=>keptCard===$('deckOv').querySelector('.overviewCard')));
  p.deck.push('jaki');G.broadcast(r);
  await page.waitForFunction(()=>[...document.querySelectorAll('#deckOv .overviewCard')].some(e=>e.dataset.card==='jaki'),null,{timeout:7000});
  await page.route('**/api/state?*',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.evaluate(()=>refreshDeckOverview());assert.match(await page.locator('.overviewNotice').innerText(),/更新できませんでした/);
  assert((await ids()).includes('jaki'),'failed refresh retains cards');
  await page.locator('#deckClose').tap();await page.locator('#deckBtn').tap();
  await page.waitForFunction(()=>document.querySelector('.overviewNotice')?.textContent.includes('取得できませんでした'));
  assert.equal(await page.locator('.overviewCard').count(),0);
  await page.unroute('**/api/state?*');await page.locator('.overviewNotice button').tap();await page.waitForSelector('#deckOv .overviewGrid');
  console.log('PASS periodic recovery, failed open/refresh and retry');

  // Missing inventory must never fall back to partial zones. Empty inventory is valid.
  await page.locator('#deckClose').tap();
  await page.route('**/api/state?*',async route=>{const s=G.publicState(r,p.id);delete s.players[0].inventoryList;await route.fulfill({json:s});});
  await page.locator('#deckBtn').tap();await page.waitForFunction(()=>document.querySelector('.overviewNotice')?.textContent.includes('取得できませんでした'));
  assert.equal(await page.locator('.overviewCard').count(),0);await page.unroute('**/api/state?*');
  await page.locator('#deckClose').tap();p.hand=[];p.deck=[];p.exile=[];G.broadcast(r);await open();
  assert.deepEqual(await ids(),[]);assert.deepEqual(await page.locator('.kindCounts b').allTextContents(),['0','0','0','0']);

  // Hidden pages stop polling; foreground and network recovery reconcile without an action.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert(await page.evaluate(()=>deckPollTimer===null));p.deck=['samurai_saga'];G.broadcast(r);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('.overviewCard')?.dataset.card==='samurai_saga');
  p.deck.push('sp_evolve');G.broadcast(r);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>document.querySelectorAll('.overviewCard').length===2);
  console.log('PASS missing vs empty inventory, background and online recovery');

  // A restored game may have a lower revision and the same room code.
  const oldInstance=r.stateInstanceId,stale=G.publicState(r,p.id),save=G.serializeRoom(r);assert.equal(save.room.stateInstanceId,undefined);
  save.room.stateRev=0;save.room.players[0].deck=['jaki_f'];
  const restored=G.restoreRoom(save);assert(!restored.error,restored.error);r=restored.room;p=r.players[0];
  assert.notEqual(r.stateInstanceId,oldInstance);await page.evaluate(()=>refreshDeckOverview());
  await page.waitForFunction(id=>state.stateInstanceId===id,r.stateInstanceId);
  assert.deepEqual(await ids(),['jaki_f']);
  await page.evaluate(s=>applyPhoneSnapshot(s,{room:'SYNC',pid:'fx0',generation:phoneSyncGeneration-1}),stale);
  assert.deepEqual(await ids(),['jaki_f']);
  await page.waitForFunction(()=>es.readyState===EventSource.OPEN);
  console.log('PASS restore instance, lower revision and old-connection rejection');

  // A cached display must recover after a rendering failure without poisoning its key.
  await page.evaluate(()=>{window.savedBigCard=bigCardHTML;bigCardHTML=()=>{throw Error('injected rendering failure');};});
  p.deck.push('weapon');G.broadcast(r);await page.evaluate(()=>refreshDeckOverview());
  assert.match(await page.locator('.overviewNotice').innerText(),/更新できませんでした/);
  await page.evaluate(()=>{bigCardHTML=savedBigCard;});await page.locator('.overviewNotice button').tap();
  await page.waitForFunction(()=>document.querySelectorAll('.overviewCard').length===2);
  await page.locator('#deckClose').tap();
  await page.route('**/assets/cards/e_jaki.webp',route=>route.abort());await open();
  assert.deepEqual(await ids(),['jaki_f','weapon']);assert.match(await page.locator('[data-card="jaki_f"]').getAttribute('aria-label'),/アシュラカン/);
  await page.screenshot({path:path.join(output,'image-failure.png')});
  await page.locator('#deckClose').tap();assert(await page.evaluate(()=>deckPollTimer===null));
  console.log('PASS render retry, image failure and closed polling');

  // A timed-out opening retains a usable close control.
  await page.route('**/api/state?*',()=>{});await page.locator('#deckBtn').tap();
  await page.waitForFunction(()=>document.querySelector('.overviewNotice')?.textContent.includes('取得できませんでした'),null,{timeout:10000});
  assert(await page.locator('#deckClose').isVisible());await page.locator('#deckClose').tap();
  await page.unroute('**/api/state?*');
  await page.reload();await page.evaluate(()=>{room='SYNC';pid='fx0';enterGame();});
  await page.waitForFunction(()=>state?.players?.[0]?.inventoryList);await open();assert.deepEqual(await ids(),['jaki_f','weapon']);
  // Switching participants in the same room must replace private data even at an equal revision.
  await page.locator('#deckClose').tap();r.players[2].deck=['gecko'];
  await page.evaluate(()=>{pid='fx2';connect();});
  await page.waitForFunction(()=>me()?.inventoryList?.includes('gecko'));
  await open();assert.deepEqual(await ids(),['gecko']);
  assert(await page.evaluate(()=>state.players.find(q=>q.id==='fx0').inventoryList===undefined));
  assert.deepEqual(errors,[]);console.log('PASS timeout, reload and zero browser errors');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
