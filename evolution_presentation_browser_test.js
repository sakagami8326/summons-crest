const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms};')(require,__dirname,()=>0,()=>0);
const out=path.join(__dirname,'output/evolution-implemented');fs.mkdirSync(out,{recursive:true});
(async()=>{await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{for(const [width,height] of [[1280,720],[1920,1080]]){
  const mode='phaser',label='phaser-'+width;
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+G.server.address().port+'/play?fixture=1&render='+mode+'&guide=done');
  await page.waitForFunction(()=>state?.catalog?.CREATURES?.jaki&&window.SummonsEvolution);
  if(mode==='phaser')await page.waitForFunction(()=>PW.isReady());
  assert.equal(await page.evaluate(()=>renderModeActive),mode);
  await page.evaluate(()=>{state.owners[1]={player:state.players[0].id,level:3,creature:'jaki',dmg:12};prev.ownersArr=state.owners.slice();render();});
  await page.waitForTimeout(600);
  await page.evaluate(()=>{window.evolutionDone=playEvolvePresentation(1,state.owners[1]);});
  await page.locator('#evolutionFx').waitFor();await page.waitForTimeout(1500);await page.screenshot({path:path.join(out,label+'-charge.png')});
  await page.waitForTimeout(1900);await page.screenshot({path:path.join(out,label+'-reveal.png')});
  await page.evaluate(()=>window.evolutionDone);await page.waitForTimeout(900);
  assert.equal(await page.locator('#evolutionFx').count(),0);assert.equal(await page.evaluate(()=>evolvingTiles.size),0);
  assert.equal(await page.evaluate(()=>cutBusy),0);
  await page.evaluate(()=>{window.evolutionDone=playEvolvePresentation(1,state.owners[1]);});await page.locator('#evolutionFx').waitFor();
  await page.evaluate(()=>{setAudioMuted(true);resetPresentationCamera('test-reset');});await page.evaluate(()=>window.evolutionDone);
  assert.equal(await page.locator('#evolutionFx').count(),0);assert.equal(await page.evaluate(()=>evolvingTiles.size),0);
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>playEvolvePresentation(1,state.owners[1]));
  assert.equal(await page.locator('#evolutionFx').count(),0);
  // Actual level-up render path must enqueue the same presentation.
  await page.evaluate(()=>{state.owners[1]={...state.owners[1],level:2};prev.ownersArr=state.owners.slice();render();});
  await page.evaluate(()=>{state={...state,stateRev:state.stateRev+1,owners:state.owners.slice()};state.owners[1]={...state.owners[1],level:3};render();});
  await page.locator('#evolutionFx').waitFor();await page.locator('#evolutionFx').waitFor({state:'detached'});
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('Board evolution: actual Phaser at 1280/1920; charge, reveal, level-up queue, cleanup, camera cancellation, mute and reduced motion passed.');
 }finally{await browser.close();G.rooms.clear();G.server.closeAllConnections();await new Promise(r=>G.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
