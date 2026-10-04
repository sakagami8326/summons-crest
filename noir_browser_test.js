'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/noir-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,publicState,onCreatureSummoned,askRoll,handleChoose,resolveTile,ownedCardSnapshot,broadcast};')(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
const counts=list=>list.reduce((a,c)=>(a[c]=(a[c]||0)+1,a),{});
(async()=>{let browser;const errors=[],reports=[];try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [844,667])for(const type of ['joma','yomiga','inkcrow','censor','gate']){
  const r=G.makeFixtureRoom();r.code='NOIR';r.phase='playing';r.turn=0;r.turnEpoch=12;r.turnReadyAt=0;r.turnTransition=null;r.pending={};r.owners.fill(null);r.tileFx={};r.curses={};r.lastEvent=r.lastUlt=r.lastBattle=r.lastDraw=r.lastGain=null;
  const p=r.players[0],q=r.players[1];Object.assign(p,{charId:'noir',hand:['cleo'],deck:['shield','sp_gold','sp_insight'],discard:['gweapon','sp_censor'],exile:['shield'],gold:1000,spellCast:false,cardsCollected:0,pos:1});q.hand=['weapon','shield','sp_gold'];
  G.rooms.set(r.code,r);
  if(['joma','yomiga','inkcrow'].includes(type)){r.owners[1]={player:p.id,creature:type,level:1,dmg:0};G.onCreatureSummoned(r,p,type,'swap',1);}
  if(type==='censor'){p.hand.push('sp_censor');G.askRoll(r,p);G.handleChoose(r,p.id,'sp:sp_censor');}
  if(type==='gate'){p.hand=['joma'];p.gateEvolutionEpoch=r.turnEpoch;G.resolveTile(r,p);}
  const before=counts(G.ownedCardSnapshot(r,p)),money=p.gold,otherHand=q.hand.length;
  const page=await browser.newPage({viewport:{width,height:375},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/phone?guide=done');await page.evaluate(s=>{room='NOIR';pid='fx0';state=s;syncHasArt();$('join').style.display='none';document.body.classList.add('ingame');render();connect();},G.publicState(r,p.id));
  if(type==='censor'){
   await page.locator('#phonePlayerTarget [data-player="fx1"]').tap();
   await page.locator('#ptConfirm').tap();
   await page.waitForFunction(()=>pend()?.type==='censor_pick');assert.equal(p.gold,money-120);assert.equal(G.publicState(r,q.id).pending[p.id].options.length,0);
  }
  await page.locator('#uxRail .card').first().waitFor();await page.waitForTimeout(400);
  assert(await page.locator('#uxPicker').evaluate(e=>e.scrollHeight===e.clientHeight),'picker has no outer overflow');
  const broken=await page.locator('#uxRail img').evaluateAll(async es=>{await Promise.all(es.map(e=>e.decode().catch(()=>{})));return es.filter(e=>!e.naturalWidth).map(e=>e.src);});assert.deepEqual(broken,[]);
  await page.screenshot({path:path.join(out,`${type}-${width}.png`)});
  if(['joma','yomiga'].includes(type)){
   assert.equal(await page.locator('#uxZones button').count(),0);assert.match(await page.locator('#uxRail').innerText(),/山札/);assert.match(await page.locator('#uxRail').innerText(),/捨て札/);
  }
  const candidate=page.locator(['joma','yomiga'].includes(type)?'#uxRail .card[data-option-id^="search:discard:"]':'#uxRail .card[data-option-id]').first(),optionId=await candidate.getAttribute('data-option-id');assert(optionId);
  await candidate.tap();await page.locator('#uxPickDialog[open]').waitFor();assert(await page.locator('#uxPickEffect').isVisible());
  if(type==='gate')assert(await page.locator('#uxPickDialog img[src*="c_joma"]').count(),'approved Joma art renders');
  await page.screenshot({path:path.join(out,`${type}-detail-${width}.png`)});await page.locator('#uxConfirm').tap();
  await page.waitForFunction(t=>!['card_search','inkcrow_discard','censor_pick','gate_pass_evolve'].includes(pend()?.type),type);
  if(['joma','yomiga','inkcrow'].includes(type)){assert.deepEqual(counts(G.ownedCardSnapshot(r,p)),before);assert.equal(p.cardsCollected,0);assert.equal(p.gold,money);}
  if(type==='censor'){assert.equal(q.hand.length,otherHand-1);assert.equal(p.gold,money-120);}
  if(type==='gate'){assert(p.hand.includes('joma_f'));assert.equal(p.gold,money-150);}
  const after=counts(G.ownedCardSnapshot(r,p));const repeated=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({room:r.code,type:'choose',playerId:p.id,optionId,turnEpoch:r.turnEpoch,promptId:'stale-prompt'})});assert.equal(repeated.status,409);assert.deepEqual(counts(G.ownedCardSnapshot(r,p)),after,'repeat request cannot duplicate a card');
  reports.push({width,type,passed:true});await page.close();console.log('PASS real phone selection and API',width,type);
 }
 const boardState=G.publicState(G.makeFixtureRoom(),null);boardState.players[0].charId='noir';boardState.players[0].name='黒書の召喚士';boardState.pending={};boardState.lastUlt=boardState.lastBattle=boardState.lastEvent=null;
 const board=await browser.newPage({viewport:{width:1440,height:900}});board.on('pageerror',e=>errors.push(e.message));await board.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(boardState)}));
 await board.goto(base+'/play?fixture=1&guide=done');await board.waitForFunction(()=>state?.catalog&&window.BoardEffects);await board.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&!gameEntryRunning&&!animBusy&&!finishActiveTelop&&Date.now()>bannerUntil,null,{timeout:60000});
 for(const event of [{kind:'search',creature:'joma_f',count:1},{kind:'draw',creature:'inkcrow_f',count:3},{kind:'censor',target:boardState.players[1].id,count:1,drawn:1}]){
  await board.evaluate(event=>{BoardNotice.reset();window.noirNotice=BoardEffects.present('card_operation',{...event,player:state.players[0].id},state,{ms:n=>n*.5});},event);
  await board.locator('#boardNotice:not([hidden])').waitFor();await board.waitForTimeout(450);
  assert(await board.locator('#boardNotice img').evaluateAll(async es=>{await Promise.all(es.map(e=>e.decode().catch(()=>{})));return es.every(e=>e.naturalWidth>0);}),'board notice art loads');
  assert(await board.locator('#boardNotice .messageWindow,.standName').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight+1;})),'board notice fits');
  await board.screenshot({path:path.join(out,'board-'+event.kind+'.png')});await board.evaluate(()=>noirNotice);
 }
 await board.close();console.log('PASS Noir board operation notices, adopted art, bounds and private card identities');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({passed:true,reports,errors},null,2));
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
