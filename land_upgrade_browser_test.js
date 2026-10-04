'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/land-upgrade-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,askUpgrade,handleChoose,publicState,broadcast};')(require,root,()=>0,()=>0);
function fixture(code,level=1,creature='poponga'){
 code=code.toUpperCase();
 const r=G.makeFixtureRoom(),p=r.players[0];Object.assign(r,{code,phase:'playing',turn:0,turnEpoch:12,turnReadyAt:0,turnTransition:null,pending:{},tileFx:{},curses:{},barrier:{},lastUpgrade:null,boardToken:'upgrade-test'});r.owners.fill(null);
 for(const k of ['lastEvent','lastUlt','lastBattle','lastDraw','lastGain','lastSpellFx','lastDice','lastHeal','lastSeal','lastRuin'])r[k]=null;
 Object.assign(p,{charId:'mio',gold:3000,hand:['cleo'],pos:21,bankrupt:false,name:'テスト召喚士'});r.owners[21]={player:p.id,creature,level,dmg:0};r.elemOv[21]='wind';G.askUpgrade(r,p,'自領地');G.rooms.set(code,r);return {r,p};
}
async function phone(browser,base,r,p,width){const page=await browser.newPage({viewport:{width,height:390},isMobile:true,hasTouch:true});await page.goto(base+'/phone?guide=done');await page.evaluate(s=>{room=s.code;pid='fx0';state=s;syncHasArt();$('join').style.display='none';document.body.classList.add('ingame');render();connect();},G.publicState(r,p.id));return page;}
(async()=>{let browser;const errors=[],reports=[];try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [844,667,932]){
  const {r,p}=fixture('UP'+width);const page=await phone(browser,base,r,p,width);page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>choose('up:21'));await page.locator('#phoneUpgrade:not([hidden])').waitFor();
  await page.locator('#phoneUpgrade [data-level="3"]').tap();
  assert(await page.locator('#phoneUpgrade').evaluate(e=>{const r=e.getBoundingClientRect();return r.x>=-1&&r.right<=innerWidth+1&&r.y>=-1&&r.bottom<=innerHeight+1;}),'phone frame fits');
  assert(await page.locator('#phoneUpgrade .evolveTag').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect(),c=e.closest('.levelChoice').getBoundingClientRect();return r.top>=c.top&&r.right<=c.right+1;})),'badge inside card');
  assert(await page.locator('#phoneUpgrade img').evaluateAll(async es=>{await Promise.all(es.map(e=>e.decode().catch(()=>{})));return es.every(e=>e.naturalWidth);}), 'phone artwork loads');
  await page.screenshot({path:path.join(out,'phone-'+width+'.png')});
  await page.locator('#phoneUpgrade .back').tap();await page.waitForFunction(()=>pend()?.type==='upgrade');assert.equal(p.gold,3000);
  await page.evaluate(()=>choose('up:21'));await page.locator('#phoneUpgrade:not([hidden])').waitFor();
  await page.locator('#phoneUpgrade .skip').tap();await page.waitForFunction(()=>!document.getElementById('phoneUpgrade')||document.getElementById('phoneUpgrade').hidden);assert.equal(p.gold,3000);assert.equal(r.owners[21].level,1);
  await page.close();reports.push({phone:width,passed:true});console.log('PASS phone frame, art, badge, back and skip',width);
 }
 {
  const {r,p}=fixture('UPRETRY');p.gold=80;G.askUpgrade(r,p,'自領地');
  const page=await phone(browser,base,r,p,844);page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>choose('up:21'));await page.locator('#phoneUpgrade:not([hidden])').waitFor();
  assert(await page.locator('#phoneUpgrade [data-level="3"]').isDisabled());assert(await page.locator('#phoneUpgrade [data-level="4"]').isDisabled());
  let fail=true;
  await page.route('**/api/action',route=>{const data=route.request().postDataJSON();if(fail&&data.optionId==='ul:21:2'){fail=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"test"}'});}return route.continue();});
  await page.locator('#phoneUpgrade [data-level="2"]').tap();await page.locator('#phoneUpgrade .upgradeConfirm').tap();
  await page.waitForFunction(()=>document.querySelector('#phoneUpgrade .summary')?.textContent.includes('送信できません'));
  assert.equal(p.gold,80);await page.locator('#phoneUpgrade .upgradeConfirm').tap();await page.waitForFunction(()=>document.getElementById('phoneUpgrade').hidden);assert.equal(p.gold,0);assert.equal(r.owners[21].level,2);
  await page.close();reports.push({phone:'affordability and network retry',passed:true});console.log('PASS disabled unaffordable levels, failed action and retry');
 }
 for(const [name,current,target,creature,renderMode,reduced] of [['jump',1,4,'poponga','phaser',false],['ordinary',1,2,'poponga','phaser',true],['max',3,4,'poponga','dom',true],['cancel',1,4,'poponga','phaser',false]]){
  const {r,p}=fixture('UB'+name,current,creature),board=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference'});board.on('pageerror',e=>errors.push(e.message));
  await board.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
  await board.goto(base+'/play?fixture=1&guide=done'+(renderMode==='dom'?'&render=dom':''));await board.waitForFunction(()=>state?.catalog&&window.BoardUpgrade);
  await board.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&!gameEntryRunning&&!animBusy&&Date.now()>bannerUntil,null,{timeout:60000});
  await board.evaluate(()=>{code=state.code;boardToken='upgrade-test';connectBoard();window.upgradeSamples=[];window.sampleUpgrade=true;function sample(){if(BoardUpgrade.status){const v=BoardUpgrade.view(state),status=BoardUpgrade.status;upgradeSamples.push({...status,pawnAlpha:BoardUpgrade.pawnAlpha('fx0'),otherAlpha:BoardUpgrade.pawnAlpha('fx1'),visualLevel:v.owners[21].level,creatureAlpha:BoardUpgrade.creatureAlpha(21)});}if(sampleUpgrade)requestAnimationFrame(sample);}sample();});
  const ph=await phone(browser,base,r,p,844);ph.on('pageerror',e=>errors.push(e.message));await ph.evaluate(()=>choose('up:21'));await ph.locator('#phoneUpgrade:not([hidden])').waitFor();
  const cost=r.pending[p.id].upgrade.levels.find(t=>t.level===target).cost;
  await ph.locator(`#phoneUpgrade [data-level="${target}"]`).tap();await ph.locator('#phoneUpgrade .upgradeConfirm').tap();
  await board.waitForFunction(()=>BoardUpgrade.status?.phase==='level',null,{timeout:15000});
  assert.equal(p.gold,3000-cost);assert.equal(r.owners[21].level,target);
  assert(!/強化費用|ポポンガ|ワタランガ/.test(await board.locator('#upgradeResult').innerText()));
  await board.screenshot({path:path.join(out,'board-'+name+'-level.png')});
  if(name==='cancel'){
   await board.setViewportSize({width:1280,height:720});await board.waitForFunction(()=>!BoardUpgrade.status);
   await board.waitForFunction(()=>PW.cameraState().isFit);
   assert(await board.evaluate(()=>BoardUpgrade.pawnAlpha('fx0')===1&&BoardUpgrade.creatureAlpha(21)===1&&BoardUpgrade.view(state).owners[21].level===4));
   await board.waitForFunction(()=>PW._debugScene().children.list.some(x=>x.texture?.key==='pwCre_e_poponga'&&x.alpha===1&&x.visible));
   assert(!await board.locator('#upgradeResult').isVisible());reports.push({name,passed:true});await ph.close();await board.close();console.log('PASS resize cancels safely and restores current artwork');continue;
  }
  if(name==='jump'){
   await board.waitForFunction(()=>BoardUpgrade.status?.level===4&&BoardUpgrade.status.phase==='level');
   assert(await board.evaluate(()=>PW._debugScene().children.list.some(x=>x.texture?.key==='pwCre_c_poponga'&&x.alpha===1&&x.visible)),'pre-evolution art retained at Lv4');
  }
  await board.waitForFunction(()=>BoardUpgrade.status?.phase==='result',null,{timeout:15000});
  assert(await board.locator('#upgradeResult').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),'result fits');
  await board.screenshot({path:path.join(out,'board-'+name+'-result.png')});
  await board.waitForFunction(()=>!BoardUpgrade.status,null,{timeout:20000});
  const samples=await board.evaluate(()=>{sampleUpgrade=false;return upgradeSamples;});assert(samples.some(s=>s.phase==='conceal'&&s.pawnAlpha>0&&s.pawnAlpha<1));assert(samples.some(s=>s.phase==='restore'&&s.pawnAlpha>0&&s.pawnAlpha<1));assert(samples.every(s=>s.otherAlpha===1));assert(samples.filter(s=>s.phase==='level').every(s=>s.pawnAlpha===0));
  if(name==='jump'){assert(samples.some(s=>s.phase==='evolution'));assert(await board.evaluate(()=>PW._debugScene().children.list.some(x=>x.texture?.key==='pwCre_e_poponga'&&x.alpha===1&&x.visible)),'evolved artwork restored');}
  else assert(!samples.some(s=>s.phase==='evolution'));
  reports.push({name,renderMode,reduced,phases:[...new Set(samples.map(s=>s.phase))],passed:true});console.log('PASS real upgrade API and board phases',name,renderMode);
  await ph.close();await board.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({passed:true,reports,errors},null,2));
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
