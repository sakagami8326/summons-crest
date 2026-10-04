'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/phone-feedback-20261004');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,publicState,onCreatureSummoned,startPickDraw,askUpgrade,resolveTile,handleChoose,broadcast,serializeRoom,restoreRoom};')(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
function fixture(){
 const r=G.makeFixtureRoom();r.code='FBUI';r.phase='playing';r.turn=0;r.turnEpoch=12;r.turnReadyAt=0;r.turnTransition=null;r.pending={};r.owners.fill(null);r.tileFx={};r.curses={};r.cardEffectNotices=[];r.lastEvent=r.lastUlt=r.lastBattle=r.lastDraw=r.lastGain=r.lastDice=null;
 const p=r.players[0];Object.assign(p,{charId:'noir',hand:['joma','yomiga','inkcrow','kagetsuzuri','weapon','sp_gold'],deck:['shield','sp_gold','gweapon'],discard:[],exile:[],gold:1000,pos:1});G.rooms.set(r.code,r);return {r,p};
}
async function load(page,base,f){await page.goto(base+'/phone?guide=done');await page.evaluate(s=>{room='FBUI';pid='fx0';state=s;syncHasArt();$('join').style.display='none';['hdr','msg','action','handWrap'].forEach(id=>$(id).style.display='');document.body.classList.add('ingame');render();connect();},G.publicState(f.r,f.p.id));}
(async()=>{let browser;const errors=[];try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [844,667]){
  const page=await browser.newPage({viewport:{width,height:375},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  const ink=fixture();ink.r.owners[1]={player:ink.p.id,creature:'inkcrow',level:1,dmg:0};G.onCreatureSummoned(ink.r,ink.p,'inkcrow','swap',1);
  await load(page,base,ink);await page.locator('#uxRail .card').first().waitFor();assert.equal(await page.locator('#uxRail .card').count(),8);
  assert(await page.locator('#uxCount').isHidden());assert.equal(await page.locator('#uxPurpose').innerText(),'捨てる手札を1枚選択');
  await page.screenshot({path:path.join(out,`discard-${width}.png`)});
  const before=ink.p.hand.length;await page.locator('#uxRail .card').first().tap();assert.equal(await page.locator('#uxConfirm').innerText(),'捨てる');await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>pend()?.type!=='inkcrow_discard');assert.equal(ink.p.hand.length,before-1);
  const search=fixture();search.p.discard=['weapon','shield'];search.p.exile=['gweapon'];search.r.owners[1]={player:search.p.id,creature:'joma',level:1,dmg:0};G.onCreatureSummoned(search.r,search.p,'joma','swap',1);
  await load(page,base,search);assert.equal(await page.locator('#uxZones button').count(),0);assert.equal(await page.locator('#uxRail .card').count(),4);
  assert.equal(await page.locator('#uxRail .card[data-option-id^="search:deck:"]').count(),2);assert.equal(await page.locator('#uxRail .card[data-option-id^="search:discard:"]').count(),2);
  assert.match(await page.locator('#uxRail').innerText(),/山札/);assert.match(await page.locator('#uxRail').innerText(),/捨て札/);
  await page.screenshot({path:path.join(out,`search-${width}.png`)});
  await page.locator('#uxRail .card[data-option-id^="search:discard:"]').first().tap();assert.match(await page.locator('#uxPickName').innerText(),/捨て札/);await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>pend()?.type!=='card_search');assert.deepEqual(search.p.discard,['shield']);assert(search.p.hand.includes('weapon'));assert.equal(search.p.gold,1000);
  const up=fixture();up.r.owners[1]={player:up.p.id,creature:'joma',level:1,dmg:0};up.r.owners[3]={player:'fx1',creature:'nome',level:1,dmg:0};G.askUpgrade(up.r,up.p,'自領地');
  await load(page,base,up);await page.locator('#phoneLand:not([hidden])').waitFor();assert.equal(await page.locator('#phoneLand [data-player=fx0]').getAttribute('aria-pressed'),'true');
  assert(await page.locator('#phoneLand [data-tile="3"]').evaluate(e=>e.classList.contains('muted')));assert(!await page.locator('#phoneLand [data-tile="1"]').evaluate(e=>e.classList.contains('muted')));
  await page.screenshot({path:path.join(out,`upgrade-${width}.png`)});
  await page.locator('#phoneLand [data-player=fx0]').tap();G.broadcast(up.r);await page.waitForTimeout(150);assert.equal(await page.locator('#phoneLand [data-player=fx0]').getAttribute('aria-pressed'),'false','manual filter persists within prompt');
  await page.close();console.log('PASS discard, combined search and initial upgrade filter',width);
 }
 // A one-card automatic draw must reveal even from an empty hand. Other viewers never receive the card ID.
 for(const initial of [[],['joma']]){
  const f=fixture();f.p.hand=initial.slice();f.p.deck=['joma'];f.p.discard=[];G.resolveTile(f.r,f.p);
  const pg=await browser.newPage({viewport:{width:667,height:375}});pg.on('pageerror',e=>errors.push(e.message));await load(pg,base,f);
  G.startPickDraw(f.r,f.p);G.broadcast(f.r);await pg.locator('#drawModal.on').waitFor();assert.equal(await pg.locator('#drawTitle').innerText(),'ドロー');assert(await pg.locator('#drawCard img[src*="c_joma"]').count());
  assert.deepEqual(G.publicState(f.r,f.p.id).lastDraw.cards,['joma']);assert.equal(G.publicState(f.r,null).lastDraw.cards,undefined);assert.equal(G.publicState(f.r,'fx1').lastDraw.cards,undefined);
  assert.equal(f.p.hand.length,initial.length+1);assert.equal(await pg.evaluate(()=>revealQueue.length),0);G.broadcast(f.r);await pg.waitForTimeout(100);assert.equal(await pg.evaluate(()=>revealQueue.length),0);
  await pg.waitForTimeout(350);await pg.screenshot({path:path.join(out,`single-draw-${initial.length}.png`)});await pg.waitForFunction(()=>!$('drawModal').classList.contains('on'));
  f.p.deck=['weapon','shield'];f.p.discard=[];G.startPickDraw(f.r,f.p);G.broadcast(f.r);await pg.locator('#uxRail .card').first().waitFor();await pg.locator('#uxRail .card').first().click();await pg.locator('#uxConfirm').click();await pg.waitForFunction(()=>pend()?.type!=='pick_draw');assert(!await pg.locator('#drawModal').evaluate(e=>e.classList.contains('on')),'normal selected draw is not revealed twice');await pg.close();
 }
 console.log('PASS one-card draw, empty and duplicate hands, privacy, deduplication and normal selected draw');
 const box={window:{},GAME_TIMING:{anchorStop:1500},structuredClone};vm.runInNewContext(fs.readFileSync(path.join(root,'public/board-effects.js'),'utf8'),box);const FX=box.window.BoardEffects;
 for(const skip of [false,true]){
  const f=fixture();f.p.hand=['joma'];f.p.pos=f.r.tiles?.findIndex(t=>t.t==='shrine')??1;
  // Use the public map metadata to ensure a shrine overwrites lastEvent after the gate decision.
  f.p.pos=G.publicState(f.r,f.p.id).tiles.findIndex(t=>t.t==='shrine');f.p.gateEvolutionEpoch=f.r.turnEpoch;G.resolveTile(f.r,f.p);
  assert.equal(f.r.pending[f.p.id].type,'gate_pass_evolve');const queued=[];FX.observeCardOperations(G.publicState(f.r,null),{queue:(...args)=>queued.push(args),current:()=>G.publicState(f.r,null),ms:n=>n});
  G.handleChoose(f.r,f.p.id,skip?'gp:skip':'gp:0');const s=G.publicState(f.r,null),notice=s.cardEffectNotices.at(-1);assert.equal(s.lastEvent.type,'shrine');assert.equal(notice.kind,skip?'gate_skip':'gate_evolve');assert.equal(notice.creature,undefined);assert.equal(notice.card,undefined);assert.equal(notice.cost,skip?0:150);assert.equal(f.p.hand[0],skip?'joma':'joma_f');
  const m=FX.model('card_operation',notice,s);assert.match(m.html,skip?/進化を見送り/:/進化完了/);assert(!/ジョーマ|c_joma|e_joma/.test(m.html));
  FX.observeCardOperations(s,{queue:(...args)=>queued.push(args),current:()=>s,ms:n=>n});assert.equal(queued.length,1);FX.observeCardOperations(s,{queue:(...args)=>queued.push(args),current:()=>s,ms:n=>n});assert.equal(queued.length,1);
  const cold={window:{},GAME_TIMING:{anchorStop:1500},structuredClone};vm.runInNewContext(fs.readFileSync(path.join(root,'public/board-effects.js'),'utf8'),cold);cold.window.BoardEffects.observeCardOperations(s,{queue:(...args)=>queued.push(args),current:()=>s,ms:n=>n});assert.equal(queued.length,1,'reconnect does not replay historical results');
  const restored=G.restoreRoom(G.serializeRoom(f.r));assert(restored.room||restored.r||!restored.error);assert.equal(G.serializeRoom(f.r).room.cardEffectNotices.at(-1).kind,notice.kind);
 }
 console.log('PASS gate success/skip survives arrival event, preserves privacy and queues once');
 const board=await browser.newPage({viewport:{width:1440,height:900}});board.on('pageerror',e=>errors.push(e.message));const fixtureState=G.publicState(G.makeFixtureRoom(),null);fixtureState.pending={};fixtureState.lastUlt=fixtureState.lastBattle=fixtureState.lastEvent=null;
 await board.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(fixtureState)}));await board.goto(base+'/play?fixture=1&guide=done');await board.waitForFunction(()=>state?.catalog&&window.BoardEffects);await board.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&!gameEntryRunning&&!animBusy&&!finishActiveTelop&&Date.now()>bannerUntil,null,{timeout:60000});
 for(const kind of ['gate_evolve','gate_skip']){
  await board.evaluate(kind=>{BoardNotice.reset();window.gateResult=BoardEffects.present('card_operation',{player:state.players[0].id,kind,count:kind==='gate_evolve'?1:0,cost:kind==='gate_evolve'?150:0},state,{ms:n=>n*.5});},kind);
  await board.locator('#boardNotice:not([hidden])').waitFor();await board.waitForTimeout(500);assert.match(await board.locator('#boardNotice').innerText(),kind==='gate_evolve'?/進化完了/:/進化を見送り/);
  assert(await board.locator('#boardNotice .messageWindow').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));await board.screenshot({path:path.join(out,`board-${kind}.png`)});await board.evaluate(()=>gateResult);
 }
 await board.close();assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,errors},null,2));console.log('PASS actual board gate result windows');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
