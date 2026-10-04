'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/gate-evolution-ui');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,publicState,resolveTile,broadcast,handleChoose};')(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
function fixture(gate=true){
 const r=G.makeFixtureRoom();r.code='EVUI';r.phase='playing';r.turn=0;r.turnEpoch=12;r.turnReadyAt=0;r.turnTransition=null;r.pending={};r.owners.fill(null);r.tileFx={};r.curses={};r.lastEvent=r.lastUlt=r.lastBattle=r.lastDraw=r.lastGain=null;
 const p=r.players[0];Object.assign(p,{charId:'noir',hand:['joma','yomiga','inkcrow','kagetsuzuri','joma','bedebero','sp_gold'],gold:1000,pos:1});
 if(gate)p.gateEvolutionEpoch=r.turnEpoch;
 G.rooms.set(r.code,r);G.resolveTile(r,p);return {r,p};
}
async function load(page,base,f){
 await page.goto(base+'/phone?guide=done');await page.evaluate(s=>{room='EVUI';pid='fx0';state=s;syncHasArt();$('join').style.display='none';['hdr','msg','action','handWrap'].forEach(id=>$(id).style.display='');document.body.classList.add('ingame');render();connect();},G.publicState(f.r,f.p.id));
}
async function fits(page,selector){
 assert(await page.locator(selector).evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})),selector+' fits');
}
(async()=>{let browser;const errors=[],reports=[];try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [width,height] of [[844,390],[667,375],[640,360]]){
  const f=fixture(),page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await load(page,base,f);await page.locator('#uxRail .card').first().waitFor();await page.waitForTimeout(150);
  assert.equal(await page.locator('#uxTitle').innerText(),'門通過ボーナス');assert.match(await page.locator('.uxEvolutionGuide').innerText(),/150G.*進化.*1枚/);
  assert.equal(await page.locator('#uxRail .card').count(),5,'only eligible hand instances');
  const ids=await page.locator('#uxRail .card').evaluateAll(es=>es.map(e=>e.dataset.optionId));assert.deepEqual(ids,['gp:0','gp:1','gp:2','gp:3','gp:4']);
  const before=JSON.stringify(f.p.hand);await page.locator('#uxZones [data-mode=evo]').tap();
  assert.equal(await page.locator('#uxRail .card').first().getAttribute('aria-label'),'ジョーマギア');
  assert(await page.locator('#uxRail .card').first().locator('img[src*="e_joma"]').count());
  assert.deepEqual(await page.locator('#uxRail .card').evaluateAll(es=>es.map(e=>e.dataset.optionId)),ids);
  G.broadcast(f.r);await page.waitForTimeout(150);assert.equal(await page.locator('#uxZones [data-mode=evo]').getAttribute('aria-pressed'),'true','same prompt preserves preview');
  await fits(page,'.uxEvolutionGuide,#uxZones button,#uxClose');assert(await page.locator('#uxPicker').evaluate(e=>e.clientHeight===e.scrollHeight));
  assert(await page.locator('#uxRail img').evaluateAll(async es=>{await Promise.all(es.map(e=>e.decode().catch(()=>{})));return es.every(e=>e.naturalWidth>0);}));
  await page.screenshot({path:path.join(out,`gate-list-${width}.png`)});
  await page.locator('#uxRail .card').first().tap();await page.locator('#uxPickDialog[open]').waitFor();
  assert.equal(await page.locator('#uxPickName').innerText(),'ジョーマギア');assert.match(await page.locator('#uxPickFace .ccStats').innerText(),/30[\s\S]*90/);
  await page.locator('#uxDetailModes [data-mode=base]').tap();assert.equal(await page.locator('#uxPickName').innerText(),'ジョーマ');assert.match(await page.locator('#uxPickFace .ccStats').innerText(),/10[\s\S]*40/);
  await page.locator('#uxDetailModes [data-mode=evo]').tap();await fits(page,'#uxDetailModes button,#uxPickName,#uxPickCost,#uxPickEffect,#uxConfirm,#uxBack');
  await page.screenshot({path:path.join(out,`gate-detail-${width}.png`)});
  await page.locator('#uxPickDialog .uxDialogClose').tap();assert.equal(f.r.pending[f.p.id].type,'gate_pass_evolve','detail X only returns to candidates');
  await page.locator('#uxClose').tap();await page.locator('#uxCancelDialog[open]').waitFor();assert.match(await page.locator('#uxCancelTitle').innerText(),/進化させず/);
  await fits(page,'#uxCancelTitle,#uxCancelBack,#uxCancelSubmit');await page.screenshot({path:path.join(out,`gate-skip-${width}.png`)});
  await page.locator('#uxCancelBack').tap();assert.equal(f.p.gold,1000);assert.equal(JSON.stringify(f.p.hand),before);
  await page.locator('#uxRail .card').first().tap();await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>pend()?.type!=='gate_pass_evolve');
  assert.equal(f.p.gold,850);assert.equal(f.p.hand[0],'joma_f');assert.equal(f.p.hand[4],'joma','only selected duplicate evolves');
  reports.push({width,height,scenario:'gate comparison and confirmed evolution',passed:true});await page.close();console.log('PASS gate evolution choice',width,height);
 }
 const f=fixture(),page=await browser.newPage({viewport:{width:667,height:375},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await load(page,base,f);await page.locator('#uxClose').tap();await page.locator('#uxCancelSubmit').tap();await page.waitForFunction(()=>pend()?.type!=='gate_pass_evolve');
 assert.equal(f.p.gold,1000);assert.equal(f.p.hand[0],'joma');assert(await page.locator('#uxPicker').isHidden());
 console.log('PASS explicit skip keeps cards and gold');
 await page.locator('#hand .card[data-c=joma]').first().tap();await page.locator('#cardZoom.on').waitFor();
 const option=await page.locator('#cardZoomAction').getAttribute('data-option');assert(option.startsWith('summon:joma'));
 await page.locator('#cardZoomDetail [data-mode=evo]').tap();assert.equal(await page.locator('#cardZoomDetail .galDetailName').innerText(),'ジョーマギア');
 assert.match(await page.locator('#cardZoomDetail .galStats').innerText(),/30[\s\S]*90/);assert.equal(await page.locator('#cardZoomAction').getAttribute('data-option'),option,'preview cannot change played card');
 assert.match(await page.locator('#cardZoomAction').innerText(),/ジョーマを召喚/);assert.equal(f.p.hand[0],'joma');assert.equal(f.p.gold,1000);
 await fits(page,'#cardZoomCard,#cardZoomPanel,#cardZoomDetail .galModeBtn,#cardZoomActions');await page.waitForTimeout(350);await page.screenshot({path:path.join(out,'hand-evolution-667.png')});
 await page.locator('#cardZoomDetail [data-mode=base]').tap();assert.equal(await page.locator('#cardZoomDetail .galDetailName').innerText(),'ジョーマ');
 // The actual card action must still summon the unevolved card after looking at its evolution.
 await page.locator('#cardZoomDetail [data-mode=evo]').tap();await page.locator('#cardZoomAction').tap();await page.waitForFunction(()=>!$('cardZoom').classList.contains('on'));
 assert.equal(f.r.owners[1].creature,'joma');assert.equal(f.p.gold,910);
 await page.evaluate(()=>openCardZoom('joma_f',true));assert.equal(await page.locator('#cardZoomDetail .galDetailName').innerText(),'ジョーマギア');
 await page.locator('#cardZoomDetail [data-mode=base]').tap();assert.equal(await page.locator('#cardZoomDetail .galDetailName').innerText(),'ジョーマ');assert(await page.locator('#cardZoomAction').isDisabled());
 for(const card of ['bedebero','sp_gold','shield']){await page.evaluate(c=>openCardZoom(c,true),card);assert.equal(await page.locator('#cardZoomDetail .galModeBtn').count(),0);assert(await page.locator('#cardZoomAction').isDisabled());}
 await page.close();console.log('PASS hand comparison preserves actual action, evolved cards, read-only and non-evolving cards');
 // Failure, double taps and changed prompts remain safe while using either preview mode.
 const retry=fixture(),pg=await browser.newPage({viewport:{width:844,height:390}});pg.on('pageerror',e=>errors.push(e.message));await load(pg,base,retry);
 let actions=0;await pg.route('**/api/action',async route=>{if(route.request().postDataJSON()?.type==='choose'){actions++;if(actions===1)return route.fulfill({status:503,body:'unavailable'});}return route.continue();});
 await pg.locator('#uxRail .card').first().click();await pg.locator('#uxConfirm').click();await pg.waitForFunction(()=>!sharedCardPicker.busy);assert.equal(retry.p.gold,1000);assert(await pg.locator('#uxPickDialog').evaluate(e=>e.open));
 await pg.locator('#uxDetailModes [data-mode=evo]').click();await pg.evaluate(()=>{$('uxConfirm').click();$('uxConfirm').click();});await pg.waitForFunction(()=>pend()?.type!=='gate_pass_evolve');assert.equal(actions,2);assert.equal(retry.p.gold,850);
 const stale=fixture();await pg.evaluate(s=>{es.close();state=s;render();connect();},G.publicState(stale.r,stale.p.id));await pg.locator('#uxClose').click();G.handleChoose(stale.r,stale.p.id,'gp:skip');G.broadcast(stale.r);await pg.waitForFunction(()=>!$('uxCancelDialog').open);assert(await pg.locator('#uxPicker').isHidden());
 await pg.close();console.log('PASS retry, duplicate submit and stale cancel confirmation');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,reports,errors},null,2));
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
