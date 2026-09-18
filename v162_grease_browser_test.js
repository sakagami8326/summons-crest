const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+`
return {server,makeRoom,startGame,askRoll,resolveUltSequence,publicState,broadcast,rooms};`)(require,__dirname,()=>0,()=>0);
const out=path.join(__dirname,'output/grease-ultimate-v162');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+G.server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try {
  const r=G.makeRoom();r.players=[{id:'g1',name:'グリース',charId:'grease'},{id:'g2',name:'相手',charId:'adel'}];G.startGame(r);
  r.pending={};r.turn=0;r.turnReadyAt=0;r.turnTransition=null;r.boardSeen=true;
  const p=r.players[0];p.charId='grease';p.hand=['jaki','nome','sp_evolve'];p.gold=500;
  r.owners[1]={player:p.id,level:1,creature:'jaki',dmg:12};G.askRoll(r,p);
  const phone=await browser.newPage({viewport:{width:844,height:390}});
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.addInitScript(({room,pid})=>{localStorage.setItem('sc_session',JSON.stringify({room,pid}));localStorage.setItem('sc_start_guide_v1','done');},{room:r.code,pid:p.id});
  await phone.goto(base+'/phone');await phone.locator('#ultBtn').click();
  assert.ok((await phone.locator('#ucName').innerText()).includes('進化の胎動'));
  await phone.locator('#ultActivate').click();await phone.locator('#deckOv.on').waitFor();
  assert.equal(await phone.locator('#deckScroll .dkCard.pick').count(),3);
  for(const [w,h]of [[667,375],[844,390],[896,414]]) {
   await phone.setViewportSize({width:w,height:h});await phone.waitForTimeout(200);
   await phone.waitForFunction(()=>[...document.querySelectorAll('#deckScroll img')].every(i=>i.complete&&i.naturalWidth));
   await phone.screenshot({path:path.join(out,`selection-${w}.png`)});
   const b=await phone.locator('#deckClose').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=w+1&&b.y+b.height<=h+1);
  }
  await phone.locator('[onclick="pickOvChoose(\'gh:0\')"]').click();
  await phone.waitForFunction(()=>pend()?.selected?.includes('gh:0'));
  await phone.locator('[onclick="pickOvChoose(\'gl:1\')"]').click();
  await phone.waitForFunction(()=>pend()?.selected?.length===2);
  await phone.locator('[onclick="pickOvChoose(\'gu:confirm\')"]').scrollIntoViewIfNeeded();
  await phone.screenshot({path:path.join(out,'selection-confirm.png')});
  await phone.locator('[onclick="pickOvChoose(\'gu:confirm\')"]').click();
  await phone.locator('#phoneUlt.on').waitFor();await phone.waitForTimeout(1900);
  assert.ok((await phone.locator('#phoneUltArt').getAttribute('src')).includes('evolution-v1'));
  assert.deepEqual(p.hand,['jaki','nome','sp_evolve']);
  await phone.screenshot({path:path.join(out,'phone-cutin.png')});
  G.resolveUltSequence(r);G.broadcast(r);
  await phone.waitForFunction(()=>me()?.hand[0]==='jaki_f');assert.equal(r.owners[1].creature,'jaki_f');assert.equal(r.owners[1].dmg,12);
  const board=await browser.newPage({viewport:{width:1280,height:720}});board.on('pageerror',e=>errors.push(e.message));
  await board.goto(base+'/play?fixture=1&render=dom&guide=done');await board.waitForFunction(()=>state?.catalog?.ULTS?.grease?.art);
  await board.evaluate(()=>{playUlt({player:state.players[0].id,charId:'grease'});});
  await board.locator('#ultCut.on').waitFor();await board.waitForTimeout(2000);
  assert.ok((await board.locator('#ultArt').getAttribute('src')).includes('evolution-v1'));
  await board.screenshot({path:path.join(out,'board-cutin.png')});
  await board.waitForTimeout(3500);
  await board.evaluate(()=>{const p=state.players[0];state.owners[1]={player:p.id,level:1,creature:'jaki_f',dmg:12};
   return playInternalAbilityFx({spell:'ult_grease',caster:p.id,at:Date.now(),handCount:1,targets:[{tile:1,owner:state.owners[1]}]});});
  await board.waitForTimeout(300);
  const site=await browser.newPage();await site.goto(base+'/');
  assert.equal(await site.locator('[data-name="グリース"]').getAttribute('data-ult'),'進化の胎動');
  assert.deepEqual(errors,[]);console.log('Grease browser: selection on 3 mobile sizes, confirm, cut-ins, actual evolution, board FX, homepage passed');
 } finally {await browser.close();G.rooms.clear();G.server.closeAllConnections();await new Promise(resolve=>G.server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
