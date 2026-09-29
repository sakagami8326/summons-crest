const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/board-message-integration');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,publicState,ask,startBattle,resolveBattle};')(require,root,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const r=G.makeFixtureRoom();r.code='BMSG';r.pending={};r.turn=0;r.turnTransition=null;r.lastBattle=r.lastEvent=r.lastUlt=r.lastDice=r.lastDraw=r.lastGain=null;r.owners.fill(null);r.tileFx={};r.curses={};
 r.players.forEach(p=>{p.hand=[];p.gold=800;});r.players[0].pos=0;r.players[0].dir=0;r.players[0].name='レダーニ';r.players[1].name='ミオ';r.players[1].charId='mio';G.rooms.set(r.code,r);
 browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
 await p.goto(base+'/play?fixture=1&guide=done');await p.waitForFunction(()=>state?.catalog && document.querySelector('#hud .plate'));
 await p.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&!gameEntryRunning&&!animBusy&&!finishActiveTelop&&Date.now()>bannerUntil,{},{timeout:45000});
 G.ask(r,'fx0','direction','進む方向を選択',[{id:'dir:1',label:'左回りに進む'},{id:'dir:-1',label:'右回りに進む'}]);
 await p.evaluate(s=>{state=s;updateDirCut();},G.publicState(r,null));await p.waitForSelector('#boardNotice:not([hidden])');await p.waitForTimeout(500);
 assert.equal(await p.locator('#boardDirectionRoutes .routeTip').count(),2);
 assert.equal(await p.locator('.routeTip').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.equal(await p.locator('.routeLine').first().evaluate(e=>getComputedStyle(e).strokeDasharray),'9px, 12px');
 await p.screenshot({path:path.join(out,'direction-integrated.png')});
 for(const flag of ['presentationRunning','cutBusy','gameEntryRunning','animBusy']){
  await p.evaluate(flag=>{window.eval(`${flag}=true`);updateDirCut();},flag);assert(await p.locator('#boardNotice').isHidden(),flag);
  await p.evaluate(flag=>{window.eval(`${flag}=false`);updateDirCut();},flag);assert(await p.locator('#boardNotice').isVisible());
 }
 await p.evaluate(()=>{presentationQueue.push({});updateDirCut();});assert(await p.locator('#boardNotice').isHidden());await p.evaluate(()=>{presentationQueue.pop();updateDirCut();});
 const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});phone.on('pageerror',e=>errors.push(e.message));
 await phone.goto(base+'/phone?guide=done');await phone.evaluate(()=>{room='BMSG';pid='fx0';$('join').style.display='none';document.body.classList.add('ingame');connect();});
 await phone.locator('#actionOvBtns button').filter({hasText:'左回り'}).click();await phone.waitForFunction(()=>me()?.dir===1);assert.equal(r.players[0].dir,1);
 await p.evaluate(s=>{state=s;updateDirCut();},G.publicState(r,null));assert(await p.locator('#boardNotice').isHidden());assert(await p.locator('#boardDirectionRoutes').isHidden());
 console.log('PASS direction: actual phone selection/API, static tips, presentation exclusion, dismiss on resolved state');
 await phone.close();
 r.pending={};r.players[0].hand=['orphe'];r.owners[21]={player:'fx1',creature:'nome_f',level:1};r.elemOv[21]='earth';G.startBattle(r,r.players[0],21);Object.assign(r.battle,{atkCreature:'orphe',supports:{fx0:{kind:'none'},fx1:{kind:'none'}}});G.resolveBattle(r);
 const b=r.lastBattle,e=b.moneyEvents[0];assert.equal(e.reason,'toll');
 await p.evaluate(s=>{state=s;BoardNotice.prepare(state,state.lastBattle,false);},G.publicState(r,null));
 assert.equal(await p.evaluate(()=>BoardNotice.hudGold(state.players[0])),e.fromBefore);
 // Run the production battle presentation, including its real money integration.
 await p.evaluate(()=>{window.noticeSeen=[];new MutationObserver(()=>{const h=document.querySelector('#boardNotice:not([hidden]) h2');if(h)noticeSeen.push(h.textContent);}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});render();});
 await p.waitForFunction(()=>presentationRegistry.get(presentationId("battle",state.lastBattle.at))==="completed",{},{timeout:45000});const seen=await p.evaluate(()=>noticeSeen);assert(seen.includes('通行料'));assert(seen.includes('防衛成功'));assert(seen.indexOf('防衛成功')<seen.indexOf('通行料'));await p.locator('#boardNotice').waitFor({state:'hidden',timeout:10000});assert.equal(await p.evaluate(()=>BoardNotice.hudGold(state.players[0])),e.fromAfter);

 for(const [w,h]of [[1440,900],[1280,720],[1024,768]]){
  await p.setViewportSize({width:w,height:h});await p.evaluate(()=>{BoardNotice.reset();BoardNotice.prepare(state,state.lastBattle,false);window.moneyRun=BoardNotice.battle(state.lastBattle,()=>state,{ms:n=>n,onHud:renderHUD});});
  await p.waitForFunction(()=>document.querySelector('#boardNotice.settled'));assert.equal(await p.locator('[data-counter=from]').textContent(),e.fromAfter.toLocaleString('ja-JP'));assert.equal(await p.locator('[data-counter=to]').textContent(),e.toAfter.toLocaleString('ja-JP'));
  const bounds=await p.locator('#boardNotice .messageWindow').evaluate(el=>{const r=el.getBoundingClientRect();return{ok:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:el.scrollWidth>el.clientWidth+1};});assert(bounds.ok&&!bounds.overflow,JSON.stringify({w,bounds}));
  assert(await p.locator('#boardNotice img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
  await p.screenshot({path:path.join(out,`money-integrated-${w}.png`)});await p.evaluate(()=>window.moneyRun);assert(await p.locator('#boardNotice').isHidden());
 }
 // Multiple authoritative events, including a creature source, preserve their order.
 r.pending={};r.players[0].hand=['zati_f'];r.players[0].blade=true;r.owners[21]={player:'fx1',creature:'gecko',level:1};r.owners[2]={player:'fx0',creature:'evol_f',level:1};
 G.startBattle(r,r.players[0],21);Object.assign(r.battle,{atkCreature:'zati_f',supports:{fx0:{kind:'support',cardId:'gweapon'},fx1:{kind:'none'}}});G.resolveBattle(r);assert.equal(r.lastBattle.moneyEvents.length,3);
 await p.evaluate(s=>{state=s;prev.battleAt=s.lastBattle.at;BoardNotice.reset();BoardNotice.prepare(s,s.lastBattle,false);window.settlements=[];window.moneyRun=BoardNotice.battle(state.lastBattle,()=>state,{ms:n=>n*.15,onHud:()=>settlements.push({title:document.querySelector('#boardNotice h2').textContent,cash:BoardNotice.hudGold(state.players[0])})});},G.publicState(r,null));
 await p.waitForFunction(()=>document.querySelector('#boardNotice .prayerSource img')?.complete);assert(await p.locator('.prayerSource img').evaluate(e=>e.naturalWidth>0));await p.evaluate(()=>window.moneyRun);
 const settled=await p.evaluate(()=>settlements);assert.deepEqual(settled.slice(0,3).map(x=>x.title),['略奪','血染めの刃','進化の祈り']);assert.deepEqual(settled.slice(0,3).map(x=>x.cash),r.lastBattle.moneyEvents.map(x=>x.toAfter));
 await p.evaluate(()=>{BoardNotice.reset();window.moneyRun=BoardNotice.battle({at:123,defender:'fx1',tollWaived:true,moneyEvents:[]},()=>state,{ms:n=>n*.1,onHud:()=>{}});});assert.match(await p.locator('#boardNotice').innerText(),/通行料なし/);await p.evaluate(()=>window.moneyRun);assert(await p.locator('#boardNotice').isHidden());
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>{BoardNotice.reset();window.moneyRun=BoardNotice.battle(state.lastBattle,()=>state,{ms:n=>n*.1,onHud:()=>{}});});await p.evaluate(()=>window.moneyRun);assert(await p.locator('#boardNotice').isHidden());
 assert.deepEqual(errors,[]);console.log('PASS actual battle sequence, held/final cash, auto-dismiss, three viewports, images, reduced motion, no page errors');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
