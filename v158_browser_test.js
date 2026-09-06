// Real Chromium/SSE integration. Run with NODE_PATH pointing at the Playwright runtime.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','process','console','setInterval',src+'\nreturn {server,makeRoom,startGame,performMove,serializeRoom,broadcast,rooms};')(require,__dirname,process,console,()=>{});
const out=path.join(__dirname,'output','v158');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+G.server.address().port;
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}).catch(e=>{G.server.close();throw e;});const errors=[];
 const observe=p=>p.on('pageerror',e=>errors.push(e.stack));
 try{
  const title=await browser.newPage({viewport:{width:1280,height:720}});observe(title);
  await title.goto(base+'/play');await title.locator('#titleCreate').click();
  await title.locator('[data-map="twin_gate_cavern"]').click();
  assert.match(await title.locator('[data-map="twin_gate_cavern"]').innerText(),/中央は各属性4マス・祠1、外周は各属性5マス・祠3・店2/);
  await title.screenshot({path:path.join(out,'map-selection.png')});
  await title.locator('#mapSelectCreate').click();await title.waitForFunction(()=>state?.mapId==='twin_gate_cavern');
  assert.match(await title.locator('#joined').innerText(),/双門の洞窟/);
  await title.close();
  const r=G.makeRoom(); // Unknown IDs and omitted-map API behavior.
  assert.equal((await fetch(base+'/api/create',{method:'POST',body:JSON.stringify({mapId:'wrong'})})).status,400);
  assert.equal((await fetch(base+'/map-definitions.js')).status,200);
  const cave=G.makeRoom('normal','twin_gate_cavern');
  cave.players=[{id:'q0',name:'進路テスト',charId:'adel'},{id:'q1',name:'相手',charId:'redani'},{id:'q2',name:'参加者3',charId:'villa'},{id:'q3',name:'参加者4',charId:'mio'}];G.startGame(cave);
  cave.pending={};const actor=cave.players[0];actor.pos=24;actor.previousTile=null;actor.dir=0;actor.gold=1400;
  cave.owners[28]={player:cave.players[1].id,creature:'night_jelly',level:4,abyssMarkTarget:29};
  cave.owners[29]={player:cave.players[1].id,creature:'mist_jelly',level:3};
  G.performMove(cave,actor,8,{value:4,multi:[4,4]},'テスト移動');
  cave.pending[actor.id].availableAt=0;cave.lastDice.segment.startAt=0;cave.lastDice.segment.availableAt=0;
  const board=await browser.newPage({viewport:{width:1280,height:720}});observe(board);await board.goto(base+'/play');
  await board.evaluate(({code,token})=>{document.getElementById('titleOv').classList.remove('on');enterRoom(code,'',token);},{code:cave.code,token:cave.boardToken});
  await board.waitForFunction(()=>state?.mapId==='twin_gate_cavern'&&PW.isReady());
  assert.deepEqual(await board.evaluate(()=>state.tiles.flatMap((t,i)=>t.t==='shrine'?[i]:[])),[3,8,26,30],'TV uses relocated shrines');
  const phone=await browser.newPage({viewport:{width:667,height:375}});observe(phone);
  await phone.addInitScript(({room,pid})=>localStorage.setItem('sc_session',JSON.stringify({room,pid})),{room:cave.code,pid:actor.id});
  await phone.goto(base+'/phone');await phone.locator('#routeConfirm').waitFor({state:'visible'});
  assert.deepEqual(await phone.evaluate(()=>state.tiles.flatMap((t,i)=>t.t==='shrine'?[i]:[])),[3,8,26,30],'phone uses same shrine layout');
  assert.equal(await phone.locator('[data-route]').count(),3);assert.equal(await phone.locator('#routeConfirm').isDisabled(),true);
  await phone.locator('[data-route="route:28"]').click();
  await board.waitForFunction(()=>state?.routePreview?.optionId==='route:28');
  const active=cave.pending[actor.id];
  assert.equal((await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({room:cave.code,playerId:actor.id,type:'route_preview',promptId:active.promptId,turnEpoch:active.turnEpoch,optionId:'route:25',sequence:0})})).status,409);
  assert.equal(cave.routePreview.optionId,'route:28','older preview cannot replace newer');
  assert.match(await phone.locator('.routeDetail').innerText(),/深淵の錨/);
  for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]){
   await board.setViewportSize({width,height});await board.waitForTimeout(600);
   await board.screenshot({path:path.join(out,`tv-${width}.png`)});
   assert.equal(await board.locator('#routeTvTitle').isVisible(),true);
  }
  for(const [width,height] of [[667,375],[844,390],[896,414]]){
   await phone.setViewportSize({width,height});await phone.waitForTimeout(150);
   const box=await phone.locator('#routeConfirm').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height&&box.x+box.width<=width,'confirm fits');
   await phone.screenshot({path:path.join(out,`phone-${width}.png`)});
  }
  // Failed confirmation must keep the selection available, with an error message.
  await phone.route('**/api/action',route=>route.request().postDataJSON()?.type==='choose'?route.abort():route.continue());
  await phone.locator('#routeConfirm').click();await phone.waitForFunction(()=>!routeBusy&&!!routeError);
  assert.equal(await phone.locator('#routeConfirm').isEnabled(),true);await phone.unroute('**/api/action');
  // Real confirmation / duplicate / stale preview validation through HTTP.
  const pd=cave.pending[actor.id];
  let confirmedBody=null;phone.on('request',req=>{if(req.url().endsWith('/api/action')&&req.postDataJSON()?.type==='choose')confirmedBody=req.postDataJSON();});
  await phone.locator('#routeConfirm').click();await board.waitForFunction(()=>state?.players.find(p=>p.id===state.lastDice?.player)?.pos===29);
  assert.equal(cave.players[0].pos,29);assert.equal(cave.lastDice.forcedStop.tile,29);
  const afterGold=cave.players[0].gold;
  assert.equal((await fetch(base+'/api/action',{method:'POST',body:JSON.stringify(confirmedBody)})).status,409,'duplicate confirmation rejected');
  assert.equal(cave.players[0].gold,afterGold,'duplicate confirmation cannot replay payments');
  const stale={room:cave.code,playerId:actor.id,type:'route_preview',promptId:pd.promptId,turnEpoch:pd.turnEpoch,optionId:'route:28'};
  assert.equal((await fetch(base+'/api/action',{method:'POST',body:JSON.stringify(stale)})).status,409);
  await phone.reload();await phone.waitForFunction(()=>state?.lastDice?.forcedStop?.tile===29);
  assert.equal(cave.players[0].pos,29,'reload does not repeat move');
  await phone.setViewportSize({width:667,height:375});
  await phone.evaluate(()=>{renderMapView();});await phone.screenshot({path:path.join(out,'phone-territory.png')});
  assert.equal(await phone.locator('#miniMap .mmT').count(),33,'territory mini map includes central tiles');
  assert.deepEqual(await phone.locator('#miniMap .mmT').evaluateAll(nodes=>nodes.filter(n=>n.textContent.includes('祠')).map(n=>[n.style.gridColumn,n.style.gridRow])),[['4','1'],['7','3'],['1','3'],['4','5']],'mini-map shrine coordinates');
  const dom=await browser.newPage({viewport:{width:1280,height:720}});observe(dom);
  // Exercise the retained DOM renderer without exposing a production renderer switch.
  await dom.route('**/play?render=dom',async route=>{const res=await route.fetch();let html=await res.text();html=html.replace("const renderModeActive = 'phaser';","const renderModeActive = 'dom';").replace("$('world').style.display = 'none';","$('world').style.display = 'block'; $('phaserHost').style.display = 'none';");await route.fulfill({response:res,body:html});});
  await dom.goto(base+'/play?render=dom');await dom.evaluate(({code,token})=>{document.getElementById('titleOv').classList.remove('on');enterRoom(code,'',token);},{code:cave.code,token:cave.boardToken});
  await dom.waitForFunction(()=>state?.tiles.length===33);await dom.waitForTimeout(500);await dom.screenshot({path:path.join(out,'tv-dom.png')});
  assert.ok(await dom.locator('#stage img[src="/assets/e_night_jelly.png"]').count()>0,'DOM central creature drawn');
  assert.equal(await dom.locator('#stage img[src="/assets/struct_shrine.png"]').count(),4,'DOM renders four shrines');
  await phone.emulateMedia({reducedMotion:'reduce'});await phone.setViewportSize({width:375,height:667});await phone.screenshot({path:path.join(out,'phone-portrait.png')});
  // Observe a new segment live, including ordered gate notification at its actual hop.
  const gateRoom=G.makeRoom('normal','twin_gate_cavern');
  gateRoom.players=[{id:'g0',name:'門通過テスト',charId:'adel'},{id:'g1',name:'相手',charId:'redani'}];G.startGame(gateRoom);gateRoom.pending={};
  const gp=gateRoom.players[0];gp.pos=18;gp.previousTile=17;gp.dir=1;
  const live=await browser.newPage({viewport:{width:1280,height:720}});observe(live);await live.goto(base+'/play');
  await live.evaluate(({code,token})=>{document.getElementById('titleOv').classList.remove('on');enterRoom(code,'',token);},{code:gateRoom.code,token:gateRoom.boardToken});
  await live.waitForFunction(()=>state?.players[0]?.pos===18&&PW.isReady());
  G.performMove(gateRoom,gp,6,{value:6,suppressPresentation:true},'門の検査');G.broadcast(gateRoom);
  await live.locator('#cavernGateNotice').waitFor({state:'visible'});
  assert.match(await live.locator('#cavernGateNotice').innerText(),/西門通過 \+100G/);
  await live.waitForFunction(()=>!animBusy&&prevPos[state.players[0].id]===24);
  assert.deepEqual(gateRoom.lastDice.segment.path,[19,20,21,22,23,24]);
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log('v1.58 Chromium/SSE tests passed; screenshots: '+out);
 }finally{await browser.close();for(const r of G.rooms.values()){clearTimeout(r.botTimer);clearTimeout(r.ultTimer);clearTimeout(r.turnTransitionTimer);}G.server.closeAllConnections();await new Promise(resolve=>G.server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
