'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/player-target-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,publicState,askCensor,askRoll,processEffectQueue,broadcast};')(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
function fixture(scene,one=false){
 const r=G.makeFixtureRoom();Object.assign(r,{code:'TRGT',phase:'playing',turn:scene==='toxy'?1:0,turnEpoch:12,turnReadyAt:0,turnTransition:null,pending:{},lastDraw:null,lastGain:null,lastDice:null,lastUlt:null,lastEvent:null,lastBattle:null,effectQueue:[]});
 r.owners.fill(null);r.tileFx={};r.curses={};
 r.players.forEach((p,i)=>Object.assign(p,{charId:['noir','mio','redani','adel'][i],name:['プレイヤー','あおぞら召喚士２','くろがね召喚士３','しろがね召喚士４'][i],bankrupt:false,hand:Array([1,2,0,12][i]).fill(i?'shield':'sp_censor'),deck:['joma','sp_gold'],discard:[],exile:[],gold:1000,spellCast:false}));
 if(one)r.players=r.players.slice(0,2);
 G.rooms.set(r.code,r);const p=r.players[0];
 if(scene==='censor')G.askCensor(r,p);else{r.effectQueue=[{type:'toxy',owner:p.id,creature:'toxy',order:1}];G.processEffectQueue(r);}
 return r;
}
(async()=>{let browser;const errors=[],checks=[];try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 async function open(r,width=667){const page=await browser.newPage({viewport:{width,height:375},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/phone?guide=done');await page.evaluate(s=>{room='TRGT';pid='fx0';state=s;syncHasArt();$('join').style.display='none';document.body.classList.add('ingame');render();connect();},G.publicState(r,'fx0'));await page.locator('#phonePlayerTarget:not([hidden])').waitFor();return page;}
 for(const width of [844,667,640])for(const scene of ['censor','toxy']){
  const r=fixture(scene),p=r.players[0],q=r.players[1],page=await open(r,width);
  assert.equal(await page.locator('#phonePlayerTarget .ptPlayer').count(),3);
  assert(await page.locator('[data-player="fx2"]').isDisabled());assert.equal(await page.locator('[data-player="fx3"] .ptHand strong').textContent(),'12枚');
  assert.equal(await page.locator('#phonePlayerTarget .ptClose').count(),scene==='censor'?1:0);
  assert(await page.locator('#ptConfirm').isDisabled());assert.equal(await page.locator('#phonePlayerTarget img').evaluateAll(async es=>{await Promise.all(es.map(e=>e.decode().catch(()=>{})));return es.filter(e=>!e.naturalWidth).length;}),0);
  assert(await page.locator('#phonePlayerTarget .ptPlayer,#ptConfirm,.ptHeader,.ptFooter').evaluateAll(es=>es.every(e=>{const b=e.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth+1&&b.y>=0&&b.bottom<=innerHeight+1;})),'phone controls fit');
  assert(await page.locator('#phonePlayerTarget').evaluate(e=>e.scrollHeight===e.clientHeight),'no outer scroll');
  await page.locator('[data-player="fx1"]').tap();assert.equal(q.hand.length,2,'card tap only selects');assert.equal(p.gold,1000);
  G.broadcast(r);await page.waitForTimeout(80);assert.equal(await page.locator('[data-player="fx1"]').getAttribute('aria-pressed'),'true','snapshot preserves selection');
  await page.screenshot({path:path.join(out,scene+'-'+width+'.png')});
  await page.locator('#ptConfirm').tap();
  if(scene==='censor'){
   await page.waitForFunction(()=>pend()?.type==='censor_pick');assert.equal(p.gold,880);assert(await page.locator('#phonePlayerTarget').isHidden());
   await page.locator('#uxRail .card').first().tap();await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>pend()?.type!=='censor_pick');assert.equal(q.hand.length,1);assert(p.discard.includes('sp_censor'));assert.equal(p.gold,880);
  }else{await page.waitForFunction(()=>pend()?.type!=='toxy_target');assert.equal(q.hand.length,1);assert.equal(q.discard.length,1);assert.equal(p.gold,1000);}
  checks.push({width,scene,passed:true});await page.close();console.log('PASS target UI, real API and hand privacy',width,scene);
 }
 {const r=fixture('censor',true),page=await open(r);await page.locator('.ptClose').tap();await page.waitForFunction(()=>pend()?.type!=='censor_target');assert.equal(r.players[0].gold,1000);assert(r.players[0].hand.includes('sp_censor'));await page.close();console.log('PASS single opponent and cancellation without consumption');}
 {const r=fixture('censor',true);r.players[1].hand=['shield'];r.owners[2]={player:'fx0',creature:'trooper_f',level:4,dmg:0};const page=await open(r);
  assert.match(await page.locator('.ptExtra').innerText(),/100G/);await page.locator('[data-player="fx1"]').tap();assert.match(await page.locator('.ptEffect p').innerText(),/手札1枚/);await page.locator('#ptConfirm').tap();await page.waitForFunction(()=>pend()?.type==='censor_pick');assert.equal(r.players[0].gold,900);assert.equal(r.pending.fx0.options.length,1);await page.close();console.log('PASS discounted cost and one-card target');}
 {const r=fixture('censor'),page=await open(r);let failed=false;
  await page.route('**/api/action',route=>{if(!failed){failed=true;return route.fulfill({status:503,body:'unavailable'});}return route.continue();});
  await page.locator('[data-player="fx1"]').tap();await page.locator('#ptConfirm').tap();await page.locator('.ptError').waitFor();assert.equal(r.players[0].gold,1000);assert(await page.locator('#ptConfirm').isEnabled());await page.locator('#ptConfirm').tap();await page.waitForFunction(()=>pend()?.type==='censor_pick');assert.equal(r.players[0].gold,880);await page.close();console.log('PASS failed request retries without losing target or duplicating cost');}
 {const r=fixture('toxy'),page=await open(r);await page.locator('[data-player="fx1"]').tap();r.players[1].hand=[];r.pending.fx0.options=r.pending.fx0.options.filter(o=>o.player!=='fx1');G.broadcast(r);await page.waitForFunction(()=>document.querySelector('[data-player="fx1"]')?.disabled);assert(await page.locator('#ptConfirm').isDisabled());await page.close();console.log('PASS authoritative candidate changes clear invalid selection');}
 {const r=fixture('censor'),page=await open(r);
  // Exercise late responses and repeated taps independently of network timing.
  await page.evaluate(()=>{playerTarget.api.choose=()=>new Promise((resolve,reject)=>{window.targetResolve=resolve;window.targetReject=reject;window.targetCalls=(window.targetCalls||0)+1;});});
  await page.locator('[data-player="fx1"]').tap();await page.evaluate(()=>{document.getElementById('ptConfirm').click();document.getElementById('ptConfirm').click();});assert.equal(await page.evaluate(()=>targetCalls),1);
  await page.evaluate(()=>{state.pending[pid].promptId+='next';render();targetReject(Error('late'));});await page.waitForTimeout(80);assert(await page.locator('#ptConfirm').isDisabled());assert.equal(await page.locator('.ptError').count(),0);assert.equal(await page.locator('[aria-pressed="true"]').count(),0);
  await page.evaluate(()=>{state.pending[pid].availableAt=Date.now()+60000;render();});assert(await page.locator('#phonePlayerTarget').isHidden());
  await page.evaluate(()=>{state.pending[pid].availableAt=0;render();});assert(await page.locator('#phonePlayerTarget').isVisible());
  await page.evaluate(()=>{state.phase='ended';state.winner=pid;render();});assert(await page.locator('#phonePlayerTarget').isHidden());assert.equal(await page.evaluate(()=>$('hdr').inert||$('handWrap').inert),false);await page.close();console.log('PASS duplicate, stale response, presentation readiness and cleanup');}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({passed:true,checks,errors},null,2));
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
