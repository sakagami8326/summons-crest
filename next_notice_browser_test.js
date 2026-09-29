const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const out=path.join(__dirname,'output/notice-070809-integration');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,publicState,askRoll,resolveUltSequence,startDraft};')(require,__dirname,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const r=G.makeFixtureRoom();r.code='NEXT';r.pending={};r.turn=0;r.turnTransition=r.windSupply=r.shopVisit=null;r.owners.fill(null);r.tileFx={};r.curses={};r.botMode=false;
 for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;
 const actor=r.players[0];actor.charId='adel';actor.ultUsed=false;actor.name='テスト召喚士一号';r.owners[21]={player:actor.id,creature:'orphe',level:1,dmg:20};G.rooms.set(r.code,r);G.askRoll(r,actor);
 browser=await chromium.launch({channel:'chrome',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/fixture',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(G.publicState(r,null))}));
 await p.goto(base+'/play?fixture=1&guide=done');await p.waitForFunction(()=>state?.catalog&&window.BoardNext);
 const idle=()=>p.waitForFunction(()=>!presentationRunning&&!presentationQueue.length&&!cutBusy&&!gameEntryRunning&&!animBusy&&!finishActiveTelop&&Date.now()>bannerUntil,null,{timeout:60000});await idle();
 async function render(){await p.evaluate(s=>{state=s;render()},G.publicState(r,null))}
 const pd=r.pending[actor.id],response=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:r.code,playerId:actor.id,type:'choose',optionId:'ult',promptId:pd.promptId,turnEpoch:pd.turnEpoch,actionId:'notice-ult'})});assert.equal(response.status,200,await response.text());
 assert.equal(r.ultSequence.resolveAt-r.ultSequence.startedAt,7000);assert.equal(r.pending[actor.id].type,'ult_resolve');await render();
 await p.waitForSelector('#nextUltSplash.on');await p.waitForSelector('#boardNotice[data-kind=next-ultimate]:not([hidden])');const shown=Date.now();assert.match(await p.locator('#boardNotice').innerText(),/HPを\s*20\s*回復/);
 await p.waitForTimeout(4000);assert(await p.locator('#boardNotice').isVisible());await idle();assert(Date.now()-shown>=5600);G.resolveUltSequence(r);
 console.log('PASS actual ultimate API -> input lock -> intro -> six-second effect -> auto close');
 // Same player, same rarity, different draw prompt must produce two notices.
 const ur=Object.keys(G.publicState(r,null).catalog.CREATURES).find(id=>G.publicState(r,null).catalog.CREATURES[id].rarity==='UR');assert(ur);
 for(let i=0;i<2;i++){r.pending={};r.deck=[ur,'gecko','nome',...r.deck];G.startDraft(r,actor,'end');await render();await p.waitForSelector('#boardNotice[data-kind=next-rare]:not([hidden])');assert.match(await p.locator('#boardNotice').innerText(),/レアカードを引いた/);assert(!(await p.locator('#boardNotice').innerText()).includes(G.publicState(r,null).catalog.CREATURES[ur].name));assert.equal(await p.locator('.rareHand img').evaluate(e=>e.naturalWidth),1254);if(i===0)await p.screenshot({path:path.join(out,'rare.png')});await idle();}
 console.log('PASS repeated same-rarity draft prompts, private identity, high-resolution art');
 r.pending={};r.owners.fill(null);for(let i=1;i<=2;i++){r.owners[i]={player:actor.id,creature:'gecko',level:1};r.elemOv[i]='fire'}await render();await idle();
 r.owners[3]={player:actor.id,creature:'gecko',level:1};r.elemOv[3]='fire';await render();await p.waitForSelector('#boardNotice[data-kind=next-chain]:not([hidden])');assert.deepEqual(await p.locator('.chainValues').innerText().then(t=>t.match(/\d+/g)),['2','3']);await idle();
 r.owners[3]=null;await render();await p.waitForSelector('#boardNotice[data-kind=next-chain]:not([hidden])');assert.match(await p.locator('.chainBody').getAttribute('class'),/decreased/);await idle();
 console.log('PASS real ownership changes -> queued chain increase/decrease');
 for(const width of [1440,1024]){await p.setViewportSize({width,height:width===1440?900:768});for(const id of Object.keys(G.publicState(r,null).catalog.CHARS)){
  await p.evaluate(id=>{BoardNotice.reset();const s=structuredClone(state);s.players[0].charId=id;window.noticeRun=BoardNext.present('ultimate',{player:s.players[0].id},s,{ms:n=>n*.4})},id);await p.waitForTimeout(1050);
  assert(await p.locator('#boardNotice img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth)),id+' images');assert(await p.locator('#boardNotice .messageWindow,.standName').evaluateAll(es=>es.every(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth+1&&b.top>=0&&b.bottom<=innerHeight+1})),id+' bounds');
  if(width===1440)await p.screenshot({path:path.join(out,'ultimate-'+id+'.png')});await p.evaluate(()=>noticeRun);
 }}
 await p.evaluate(()=>{window.noticeRun=BoardNext.present('ultimate',{player:state.players[0].id},state);BoardNotice.reset()});await p.evaluate(()=>noticeRun);assert.equal(await p.locator('#nextUltSplash.on').count(),0);assert.equal(await p.locator('#boardNotice:not([hidden])').count(),0);
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>{window.noticeRun=BoardNext.present('rare',{player:state.players[0].id},state,{ms:n=>n*.3})});assert.equal(await p.locator('.rareHalo').evaluate(e=>getComputedStyle(e).animationName),'none');await p.evaluate(()=>noticeRun);
 assert.deepEqual(errors,[]);console.log('PASS eight summoners, two viewport sizes, cancellation, reduced motion, no browser errors');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close()}})().catch(e=>{console.error(e);process.exit(1)});
