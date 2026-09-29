const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const out=path.join(__dirname,'output/board-flow-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,makeRoom,startGame,publicState,broadcast,askRoll,askCavernRoute,beginCavernMove,CREATURES};')(require,__dirname,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 const board=async(r,width=1440)=>{const p=await browser.newPage({viewport:{width,height:width===1440?900:768}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.text().includes('演出例外'))errors.push(m.text())});await p.goto(base+'/play?guide=done');await p.evaluate(({code,token,base})=>{document.getElementById('titleOv').classList.remove('on');enterRoom(code,base+'/phone?room='+code,token)},{code:r.code,token:r.boardToken,base});await p.waitForFunction(()=>state?.catalog&&PW.isReady());return p};
 const phone=async(r,id)=>{const p=await browser.newPage({viewport:{width:844,height:390}});p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/phone?guide=done');await p.evaluate(({code,id})=>{room=code;pid=id;connect()},{code:r.code,id});await p.waitForFunction(()=>state?.catalog);return p};
 const idle=p=>p.waitForFunction(()=>boardPresentationIdle(),null,{timeout:60000});
 const choose=async(r,id,optionId)=>{const pd=r.pending[id];const res=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:r.code,playerId:id,type:'choose',optionId,promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'flow-'+Math.random()})});assert.equal(res.status,200,await res.text())};
 // Real start button -> API -> SSE -> game intro -> first turn, on both maps.
 for(const map of ['starting_corridor','twin_gate_cavern']){
  const r=G.makeFixtureRoom();r.code=map==='starting_corridor'?'FSTART':'CSTART';r.mapId=map;r.owners=Array(map==='starting_corridor'?28:33).fill(null);r.phase='select';r.pending={};r.turnTransition=r.windSupply=r.shopVisit=null;r.tileFx={};r.curses={};r.barrier={};r.elemOv={};r.titles={conqueror:null,pilgrim:null};
  r.players.forEach((p,i)=>{p.charId=['mio','redani','adel','nerasio'][i];p.confirmed=true;p.name=i?'召喚士'+i:'テスト召喚士一号'});for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;G.rooms.set(r.code,r);
  const p=await board(r);await p.locator('#selectionStartBtn').click();await p.waitForFunction(()=>state?.phase==='playing');
  const actor=r.players[r.turn],ph=await phone(r,actor.id);
  await p.waitForSelector('#boardNotice[data-scene=start-game]:not([hidden])',{timeout:30000});
  assert.equal(await p.locator('.startPlayers img').count(),4);assert(await p.locator('.startPlayers img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
  assert((await ph.locator('#msg').innerText()).includes('テレビ演出'));
  const pd=r.pending[actor.id],early=await ph.request.post(base+'/api/action',{data:{room:r.code,playerId:actor.id,type:'choose',optionId:pd.options[0].id,promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'early'}});assert.equal(early.status(),425);
  await p.waitForTimeout(1300);await p.screenshot({path:path.join(out,'game-'+map+'.png')});
  await p.waitForSelector('#boardNotice[data-scene=start-turn]:not([hidden])');assert.equal(await p.locator('.startTurn h2').innerText(),actor.name+'のターン');assert((await ph.locator('#msg').innerText()).includes('テレビ演出'));
  await p.waitForTimeout(1400);await p.screenshot({path:path.join(out,'turn-'+map+'.png')});await idle(p);
  assert(Date.now()<r.pending[actor.id].availableAt+250,'notice finishes before input deadline');
  await ph.waitForFunction(()=>!document.getElementById('msg').textContent.includes('テレビ演出'),null,{timeout:15000});
  await choose(r,actor.id,r.pending[actor.id].options[0].id);
  await p.reload();await p.evaluate(({code,token,base})=>{document.getElementById('titleOv').classList.remove('on');enterRoom(code,base+'/phone?room='+code,token)},{code:r.code,token:r.boardToken,base});await p.waitForTimeout(800);assert.equal(await p.locator('#boardNotice[data-scene=start-game]:not([hidden])').count(),0);
  await p.close();await ph.close();console.log('PASS game/turn introductions, input deadline and reload',map);
 }
 // A real lethal spell choice preserves the dead creature's evolved appearance.
 {
  const r=G.makeFixtureRoom();r.code='FRUIN';r.pending={};r.turn=0;r.turnReadyAt=0;r.turnTransition=r.windSupply=r.shopVisit=null;r.owners.fill(null);r.titles={conqueror:null,pilgrim:null};r.curses={};r.tileFx={};r.barrier={};for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;
  const a=r.players[0],owner=r.players[1];a.hand=['sp_flame_vortex'];a.gold=1000;a.spellCast=false;r.owners[1]={player:owner.id,creature:'gecko',level:3,dmg:G.CREATURES.gecko.evoHp-10};G.askRoll(r,a);G.rooms.set(r.code,r);
  const p=await board(r,1024);await idle(p);await choose(r,a.id,'sp:sp_flame_vortex');await choose(r,a.id,r.pending[a.id].options.find(o=>o.id.endsWith(':1')).id);
  await p.waitForSelector('#boardNotice[data-scene=ruin]:not([hidden])',{timeout:40000});assert.equal(r.owners[1],null);
  assert((await p.locator('.ruinArt img').getAttribute('src')).endsWith('/e_gecko.webp'));assert(!(await p.locator('#boardNotice').innerText()).includes('炎の渦'));
  assert.equal(await p.locator('#boardNotice .standName b').innerText(),owner.name);await p.waitForTimeout(2500);await p.screenshot({path:path.join(out,'ruin.png')});await idle(p);
  G.broadcast(r);await p.waitForTimeout(500);assert.equal(await p.locator('#boardNotice[data-scene=ruin]:not([hidden])').count(),0);await p.close();console.log('PASS lethal spell API -> evolved ruin notice -> empty land');
 }
 // Real phone route buttons -> preview API/SSE -> board -> confirmed movement.
 {
  const r=G.makeFixtureRoom();r.code='FROUTE';r.mapId='twin_gate_cavern';r.owners=Array(33).fill(null);r.pending={};r.turn=0;r.turnReadyAt=0;r.turnTransition=r.windSupply=r.shopVisit=null;r.curses={};r.tileFx={};r.barrier={};r.elemOv={};r.titles={conqueror:null,pilgrim:null};for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;
  const a=r.players[0];a.pos=24;a.previousTile=25;a.charId='mio';a.name='テスト召喚士一号';a.gatesVisited=[];
  r.owners[20]={player:r.players[1].id,creature:'orphe',level:4,dmg:0};r.players[1].pos=20;
  r.owners[23]={player:r.players[2].id,creature:'nome',level:4,dmg:0};
  G.beginCavernMove(r,a,4,{suppressPresentation:true},'test');G.rooms.set(r.code,r);
  const p=await board(r),ph=await phone(r,a.id);await ph.waitForSelector('[data-route]');await p.waitForSelector('#gdLayer:not([hidden])');
  const chosen=r.pending[a.id].options.find(o=>o.destinations.some(d=>d.tile===20));assert(chosen);
  await ph.locator('[data-route="'+chosen.id+'"]').click();await p.waitForSelector('.gdChosenTip');
  const tips=await p.locator('.gdChosenTip').evaluateAll(es=>es.map(e=>Number(e.dataset.tile)));assert.deepEqual(tips.sort((a,b)=>a-b),chosen.destinations.map(d=>d.tile).sort((a,b)=>a-b));
  const depth=await p.evaluate(()=>PW._debugScene().children.list.filter(g=>g.name==='route-destination-glow').map(g=>({tile:g.destinationTile,depth:g.depth})));assert(depth.length);assert(depth.every(g=>g.depth===97));
  await p.evaluate(()=>window.sameRouteNode=document.querySelector('.gdChosen'));await p.waitForTimeout(500);assert(await p.evaluate(()=>sameRouteNode===document.querySelector('.gdChosen')),'unchanged polling preserves dash animation');
  await p.screenshot({path:path.join(out,'route-occupied.png')});
  await p.setViewportSize({width:1024,height:768});await p.waitForTimeout(1100);assert(await p.locator('.gdBar').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight}));
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(250);assert.equal(await p.locator('.gdChosen').first().evaluate(e=>getComputedStyle(e).animationName),'none');
  await ph.locator('#routeConfirm').click();await p.waitForFunction(()=>document.getElementById('gdLayer').hidden);assert(await p.evaluate(()=>PW._debugScene().children.list.every(g=>g.name!=='route-destination-glow')));
  await p.close();await ph.close();console.log('PASS phone choice API, long path tips, stable dashes, lower glow layer, resize, reduced motion, cleanup');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({errors,startMaps:2,inputLock:true,spellApi:true,evolvedRuin:true,phoneRoute:true,routeCleanup:true,viewports:[1440,1024]},null,2));
}finally{await browser?.close();G.server.closeAllConnections();G.server.close()}})().catch(e=>{console.error(e);process.exit(1)});
