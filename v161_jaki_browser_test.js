// Optional real-browser verification. Use the bundled runtime's Playwright via NODE_PATH.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+`
return {server,makeRoom,startGame,continuePostBattle,resolveBattle,publicState,broadcast,rooms};`)(require,__dirname,()=>0,()=>0);
const out=path.join(__dirname,'output/jaki-v161');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+G.server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];
 try{
  const r=G.makeRoom();r.players=[{id:'j1',name:'ジャキ使い',charId:'grease'},{id:'j2',name:'相手',charId:'adel'}];G.startGame(r);
  r.pending={};r.turn=0;r.turnReadyAt=0;r.turnTransition=null;r.boardSeen=true;
  const p=r.players[1];p.hand=['nome','jaki','jaki_f'];p.gold=500;
  r.owners[21]={player:p.id,level:1,creature:'jaki',dmg:20};
  r.battleAfter={winner:p.id,attacker:r.players[0].id,defender:p.id,tile:21,invasionWon:false,mermaidDone:true,recoveryDone:true};
  G.continuePostBattle(r);
  const phone=await browser.newPage({viewport:{width:667,height:375}});
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.addInitScript(({room,pid})=>{localStorage.setItem('sc_session',JSON.stringify({room,pid}));localStorage.setItem('sc_start_guide_v1','done');},{room:r.code,pid:p.id});
  await phone.goto(base+'/phone');await phone.locator('#deckOv.on .dkCard').first().waitFor();
  for(const [w,h]of [[667,375],[844,390],[896,414]]){
   await phone.setViewportSize({width:w,height:h});await phone.waitForTimeout(200);
   assert.equal(await phone.locator('#deckScroll .dkCard.pick').count(),3);
   assert.equal(await phone.locator('#deckClose').innerText(),'やめる');
   assert.ok(await phone.locator('#deckScroll').innerText().then(t=>t.includes('召喚 90G')));
   const broken=await phone.locator('#deckScroll img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
   await phone.screenshot({path:path.join(out,`swap-${w}.png`)});
  }
  await phone.locator('#deckScroll .dkCard.pick').first().click();
  await phone.waitForFunction(()=>state?.owners[21]?.creature==='nome');
  assert.equal(p.gold,450);assert.deepEqual(p.hand,['jaki','jaki_f','jaki']);assert.equal(r.pending[p.id].type,'draft');
  for(const id of ['jaki','jaki_f']){
   await phone.evaluate(id=>openCardZoom(id),id);
   await phone.locator('#cardZoomDetail').waitFor({state:'visible'});
   await phone.waitForTimeout(450);
   assert.ok((await phone.locator('#cardZoomDetail').innerText()).includes('戦線交代'));
   await phone.screenshot({path:path.join(out,`detail-${id}.png`)});
   await phone.locator('#cardZoomClose').click();
  }
  const cards=await browser.newPage({viewport:{width:1280,height:720}});cards.on('pageerror',e=>errors.push(e.message));
  await cards.addInitScript(()=>sessionStorage.setItem('sc_site_audio_v1',JSON.stringify({choice:'off',position:0})));
  await cards.goto(base+'/cards?card=jaki');
  await cards.locator('[data-card-dialog][open]').waitFor();
  await cards.waitForFunction(()=>[...document.querySelectorAll('[data-card-dialog] img')].every(i=>i.complete&&i.naturalWidth>0));
  await cards.waitForTimeout(350);
  await cards.screenshot({path:path.join(out,'catalog.png')});
  const board=await browser.newPage({viewport:{width:1280,height:720}});board.on('pageerror',e=>errors.push(e.message));
  await board.goto(base+'/play?fixture=1&render=dom&guide=done');await board.waitForFunction(()=>state?.catalog?.CREATURES?.jaki);
  await board.evaluate(()=>{state.owners[1]={player:state.players[0].id,level:1,creature:'jaki'};state.owners[2]={player:state.players[0].id,level:3,creature:'jaki'};render();});
  await board.waitForTimeout(500);
  for(const [w,h]of [[1280,720],[1366,768],[1920,1080]]){
   await board.setViewportSize({width:w,height:h});await board.waitForTimeout(200);
   await board.screenshot({path:path.join(out,`board-${w}.png`)});
  }
  assert.deepEqual(errors,[]);console.log('Jaki browser: mobile selection, real swap, card details, catalog and board passed');
 }finally{await browser.close();G.rooms.clear();G.server.closeAllConnections();await new Promise(resolve=>G.server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
