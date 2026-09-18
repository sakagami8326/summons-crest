const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,makeRoom,startGame,askRoll,resolveBattle,publicState,rooms};')(require,__dirname,()=>0,()=>0);
const out=path.join(__dirname,'output/evol');fs.mkdirSync(out,{recursive:true});
(async()=>{await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{const base='http://127.0.0.1:'+G.server.address().port;
  const site=await browser.newPage({viewport:{width:1280,height:720}});site.on('pageerror',e=>errors.push(e.message));
  await site.goto(base+'/cards?card=evol');await site.locator('[data-card-dialog][open]').waitFor();
  assert.equal(await site.locator('[data-dialog-name]').innerText(),'エヴォル');
  await site.locator('[data-dialog-mode="evolution"]').click();assert.equal(await site.locator('[data-dialog-name]').innerText(),'アセンシア');
  assert.ok((await site.locator('[data-dialog-meta]').innerText()).includes('70'));
  await site.waitForFunction(()=>[...document.querySelectorAll('[data-dialog-card] img')].every(i=>i.complete&&i.naturalWidth));
  await site.screenshot({path:path.join(out,'catalog-ascensia.png')});
  const r=G.makeRoom();r.players=[{id:'g1',name:'グリース',charId:'grease'},{id:'g2',name:'相手',charId:'adel'}];G.startGame(r);r.pending={};r.turnTransition=null;r.turnReadyAt=0;r.boardSeen=true;
  const p=r.players[0];p.hand=['evol','evol_f'];p.gold=500;G.askRoll(r,p);
  const phone=await browser.newPage();phone.on('pageerror',e=>errors.push(e.message));
  await phone.addInitScript(({room,pid})=>{localStorage.setItem('sc_session',JSON.stringify({room,pid}));localStorage.setItem('sc_start_guide_v1','done');},{room:r.code,pid:p.id});
  await phone.goto(base+'/phone');await phone.waitForFunction(()=>state?.catalog?.CREATURES?.evol);
  await phone.evaluate(()=>openGalleryDetail('evol'));
  for(const [w,h]of [[667,375],[844,390],[896,414]]){
    await phone.setViewportSize({width:w,height:h});
    for(const mode of ['base','evo']){
      await phone.locator(`#galZoomInfo [data-mode="${mode}"]`).click();
      await phone.waitForFunction(()=>[...document.querySelectorAll('#galZoomCard img')].every(i=>i.complete&&i.naturalWidth));
      await phone.screenshot({path:path.join(out,`phone-${w}-${mode}.png`)});
      assert.equal(await phone.locator('.galDetailName').innerText(),mode==='base'?'エヴォル':'アセンシア');
      const box=await phone.locator('.galAbilityText').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=w+1);
      assert.ok((await phone.locator('.galAbilityText').innerText()).includes(mode==='base'?'100G':'300G'));
    }
  }
  const board=await browser.newPage({viewport:{width:1280,height:720}});board.on('pageerror',e=>errors.push(e.message));
  await board.goto(base+'/play?fixture=1&guide=done');await board.waitForFunction(()=>state?.catalog?.CREATURES?.evol&&PW.isReady());
  await board.evaluate(()=>{state.owners[1]={player:state.players[0].id,level:1,creature:'evol'};state.owners[2]={player:state.players[0].id,level:1,creature:'evol_f'};prev.ownersArr=state.owners.slice();render();});
  await board.waitForTimeout(1500);await board.screenshot({path:path.join(out,'board-forms.png')});
  await board.evaluate(()=>{window.evolDone=playEvolvePresentation(1,{...state.owners[1],level:3});});await board.locator('#evolutionFx').waitFor();
  await board.waitForTimeout(3900);await board.screenshot({path:path.join(out,'evolution-ascensia.png')});await board.evaluate(()=>window.evolDone);
  r.owners.fill(null);r.pending={};r.turnTransition=null;r.phase='playing';
  const enemy=r.players[1];p.hand=['gecko_f'];p.gold=1000;enemy.gold=1000;
  r.owners[1]={player:p.id,level:1,creature:'evol'};r.owners[2]={player:p.id,level:1,creature:'evol_f'};
  r.owners[21]={player:enemy.id,level:1,creature:'gecko'};r.elemOv[21]='earth';
  r.battle={tile:21,attacker:p.id,defender:enemy.id,atkCreature:'gecko_f',startedAt:Date.now(),supports:{[p.id]:{kind:'none'},[enemy.id]:{kind:'none'}}};
  G.resolveBattle(r);assert.equal(r.lastBattle.evolutionPrayer.gold,400);
  await board.evaluate(data=>{state=data;prev.battleAt=state.lastBattle.at;prev.ownersArr=state.owners.slice();render();window.rewardDone=playBattle(state.lastBattle);},G.publicState(r,null));
  await board.waitForFunction(()=>document.getElementById('tileMsg').classList.contains('show')&&document.getElementById('tileMsg').textContent.includes('進化の祈り +400G'),{},{timeout:30000});
  await board.waitForTimeout(500);
  await board.screenshot({path:path.join(out,'stacked-reward.png')});await board.evaluate(()=>window.rewardDone);
  assert.deepEqual(errors,[]);console.log('Evol UI: public catalog + evolution switch, phone 3 sizes / both forms / correct amounts, real board sprites, evolution and actual stacked +400G battle reward passed.');
 }finally{await browser.close();G.rooms.clear();G.server.closeAllConnections();await new Promise(r=>G.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
