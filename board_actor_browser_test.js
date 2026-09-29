const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const out=path.join(__dirname,'output/actor-integration');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,publicState,resolveTile,askRoll,handleChoose,creatureMaxHp};')(require,__dirname,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const r=G.makeFixtureRoom();r.code='ACTR';r.pending={};r.turn=0;r.turnTransition=r.windSupply=r.shopVisit=null;r.owners.fill(null);r.tileFx={};r.curses={};r.botMode=false;
 for(const key of Object.keys(r))if(key.startsWith('last'))r[key]=null;
 r.players.forEach(p=>{p.hand=['sp_weaken'];p.gold=5000;p.name='テスト召喚士一号';p.spellCast=false;});G.rooms.set(r.code,r);const actor=r.players[0];
 browser=await chromium.launch({channel:'chrome',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
 await p.goto(base+'/play?fixture=1&guide=done');await p.waitForFunction(()=>state?.catalog&&window.BoardActor&&window.BoardEffects);
 const idle=()=>p.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&!gameEntryRunning&&!animBusy&&!finishActiveTelop&&Date.now()>bannerUntil,null,{timeout:45000});await idle();
 async function render(){await p.evaluate(s=>{state=s;render();},G.publicState(r,null));}
 async function choose(id){const pd=r.pending[actor.id];const res=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:r.code,playerId:actor.id,type:'choose',optionId:id,promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'actor-'+Math.random()})});assert.equal(res.status,200,await res.text());}
 actor.pos=G.publicState(r,null).tiles.findIndex(t=>t.t==='shrine');G.resolveTile(r,actor);await render();
 await p.waitForSelector('#boardNotice[data-kind=shrine][data-actor]:not([hidden])');assert.equal(await p.locator('.standName').innerText(),actor.name);assert.match(await p.locator('.metricValue').innerText(),/100/);await idle();
 console.log('PASS shrine server event -> real render queue -> actor notice -> auto close');
 for(const [cid,expectedDamage]of [['gecko',20],['bunnyhop',0],['bedebero',10]]){
  r.pending={};r.turn=0;r.turnTransition=null;actor.spellCast=false;actor.hand=['sp_weaken'];r.lastDice=null;r.owners[2]={player:r.players[1].id,creature:cid,level:1};G.askRoll(r,actor);
  const before=G.creatureMaxHp(r.owners[2]);await choose('sp:sp_weaken');await choose('ct:2');assert.equal(r.lastSpellFx.display.beforeHp,before);assert.equal(r.lastSpellFx.display.afterHp,before-expectedDamage);
  await render();await p.waitForSelector('#boardNotice[data-kind=spell][data-actor]:not([hidden])');await p.waitForTimeout(1300);
  assert.equal(await p.locator('.standArt img').getAttribute('alt'),G.publicState(r,null).catalog.CHARS[actor.charId].name);
  assert.equal(await p.locator('.valuePair b').innerText(),String(before-expectedDamage));assert.equal(await p.locator('#spellCut.on,#healRewardCutin.on').count(),0);await idle();
 }
 console.log('PASS spell choose/API -> actual HP (damage, immunity, reduction) -> shared presentation');
 // Public model must not invent identity for a private hand evolution.
 assert.equal(await p.evaluate(()=>BoardEffects.model('spell',{caster:state.players[0].id,spell:'sp_evolve'},state).html.includes('card-id="gecko"')),false);
 // All summoners and elements, normal/BOT timing, no missing portraits or out-of-frame content.
 for(const width of [1440,1280,1024]){
  await p.setViewportSize({width,height:width===1440?900:768});
  for(const id of Object.keys(G.publicState(r,null).catalog.CHARS)){
   await p.evaluate(id=>{BoardNotice.reset();const s=structuredClone(state);s.players[0].charId=id;window.actorRun=BoardEffects.present('shrine',{player:s.players[0].id,gold:100,visits:3},s,{ms:n=>n*.5});},id);
   await p.waitForTimeout(750);
   assert.equal(await p.locator('#boardNotice').getAttribute('data-element'),G.publicState(r,null).catalog.CHARS[id].elem);
   const assets=await p.locator('#boardNotice').evaluate(e=>[getComputedStyle(e.querySelector('.standBackdrop'),':before').backgroundImage,getComputedStyle(e.querySelector('.cutinCrest')).backgroundImage].flatMap(v=>[...v.matchAll(/url\("?([^"\)]+)"?\)/g)].map(m=>m[1])));
   for(const asset of assets)assert((await fetch(asset)).ok,id+' attribute asset '+asset);
   assert(await p.locator('#boardNotice img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)),id+' images');
   assert(await p.locator('#boardNotice .messageWindow,.standName').evaluateAll(es=>es.every(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth+1&&b.top>=0&&b.bottom<=innerHeight+1&&e.scrollWidth<=e.clientWidth+1})),id+' bounds '+width);
   if(width===1440)await p.screenshot({path:path.join(out,'actor-'+id+'.png')});await p.evaluate(()=>actorRun);
  }
 }
 console.log('PASS all eight summoners, element mappings, images, eight-character names, three viewports, BOT speed');
 await p.evaluate(()=>{BoardNotice.reset();window.pagesSeen=new Set();window.actorRun=BoardEffects.present('heal',{player:state.players[0].id,reward:{creature:'wakatama',healed:120,gold:120},targets:Array.from({length:12},()=>({creatureId:'poponga_f',amount:10}))},state,{ms:n=>n*.2});window.pageWatcher=setInterval(()=>{document.querySelectorAll('.miniPage').forEach((e,i)=>{if(e.classList.contains('active'))pagesSeen.add(i)})},10);});
 await p.evaluate(()=>actorRun);assert.equal(await p.evaluate(()=>{clearInterval(pageWatcher);return pagesSeen.size}),4);
 await p.evaluate(()=>{window.actorRun=BoardEffects.present('abyss_anchor',{player:state.players[1].id,owner:state.players[0].id,creature:'mist_jelly_f'},state);});
 assert.equal(await p.locator('#boardNotice').getAttribute('data-actor'),actor.id);await p.evaluate(()=>actorRun);
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>{window.actorRun=BoardEffects.present('shrine',{player:state.players[0].id,gold:100,visits:1},state,{ms:n=>n*.2});});
 assert.equal(await p.locator('.standArt').evaluate(e=>getComputedStyle(e).animationName),'none');await p.evaluate(()=>actorRun);
 assert.deepEqual(errors,[]);console.log('PASS every healing page, anchor owner, reduced motion, no browser errors');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
