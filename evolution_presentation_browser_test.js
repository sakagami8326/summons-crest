const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms};')(require,__dirname,()=>0,()=>0);
const out=path.join(__dirname,'output/evolution-implemented');fs.mkdirSync(out,{recursive:true});
(async()=>{await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{for(const [width,height] of [[1280,720],[1920,1080]]){
  const mode='phaser',label='phaser-'+width;
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.text().includes('Evolution presentation fallback'))errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+G.server.address().port+'/play?fixture=1&render='+mode+'&guide=done');
  await page.waitForFunction(()=>state?.catalog?.CREATURES?.jaki&&window.SummonsEvolution);
  if(mode==='phaser')await page.waitForFunction(()=>PW.isReady());
  assert.equal(await page.evaluate(()=>renderModeActive),mode);
  await page.evaluate(()=>{state.owners[1]={player:state.players[0].id,level:3,creature:'jaki',dmg:12};prev.ownersArr=state.owners.slice();render();});
  await page.waitForTimeout(600);
  // Inspect actual canvas operations: fullscreen flash, fixed-size captions, image-only landing.
  await page.evaluate(()=>{
    window.evolutionFrames=[];let current=null;
    for(const name of ['clearRect','fillRect','fillText','drawImage']){
      const original=CanvasRenderingContext2D.prototype[name];
      CanvasRenderingContext2D.prototype[name]=function(...args){
        if(this.canvas.id==='evolutionFx'){
          if(name==='clearRect'){
            const p=proj(GEO[1][0],GEO[1][1]),target=PW.worldToViewport(p.x,p.y-14+6);
            const right=PW.worldToViewport(p.x+80,p.y-14+6);
            current={rects:[],texts:[],images:[],target:{...target,width:right.x-target.x}};window.evolutionFrames.push(current);
          }
          else if(current){
            const m=this.getTransform(),dpr=Math.min(devicePixelRatio||1,1.5);
            const bounds=(x,y,w,h)=>({x:(x*m.a+m.e)/dpr,y:(y*m.d+m.f)/dpr,w:w*m.a/dpr,h:h*m.d/dpr});
            if(name==='fillRect')current.rects.push({...bounds(...args),style:String(this.fillStyle),alpha:this.globalAlpha});
            if(name==='fillText')current.texts.push({text:args[0],scale:m.a/dpr,alpha:this.globalAlpha});
            if(name==='drawImage')current.images.push({...bounds(...args.slice(1)),src:args[0].src});
          }
        }
        return original.apply(this,args);
      };
    }
  });
  await page.evaluate(()=>{window.evolutionDone=playEvolvePresentation(1,state.owners[1]);});
  await page.locator('#evolutionFx').waitFor();await page.waitForTimeout(1500);await page.screenshot({path:path.join(out,label+'-charge.png')});
  await page.waitForTimeout(1900);await page.screenshot({path:path.join(out,label+'-reveal.png')});
  await page.evaluate(()=>window.evolutionDone);await page.waitForTimeout(900);
  const frames=await page.evaluate(()=>window.evolutionFrames);
  const flashes=frames.flatMap(f=>f.rects).filter(r=>r.style.startsWith('rgba(255, 247, 222,'));
  assert.ok(flashes.length>0,'impact flash must actually render');
  for(const r of flashes)assert.deepEqual([r.x,r.y,r.w,r.h],[0,0,width,height],'flash covers the whole viewport');
  assert.ok(frames.some(f=>!f.images.length&&f.rects.some(r=>r.style.startsWith('rgba(4, 5, 12, 0.9'))),'darken before showing creature');
  const texts=frames.flatMap(f=>f.texts);
  assert.ok(!texts.some(t=>t.text.includes('目覚める')),'small tagline removed');
  const evolvedText=texts.filter(t=>t.text==='アシュラカン');
  assert.ok(evolvedText.length>0);
  assert.ok(evolvedText.every(t=>Math.abs(t.scale-evolvedText[0].scale)<.001),'text never scales down');
  const lastText=frames.findLastIndex(f=>f.texts.length);
  const landing=frames.slice(lastText+1).filter(f=>f.images.length);
  assert.ok(landing.length>3,'creature keeps flying after captions disappear');
  assert.ok(landing.at(-1).images[0].w<landing[0].images[0].w*.6,'only image shrinks');
  assert.ok(landing.every(f=>f.texts.length===0));
  const finalFrame=landing.at(-1),landed=finalFrame.images[0],target=finalFrame.target;
  assert.ok(Math.abs(landed.x+landed.w/2-target.x)<1,'land on actual tile x');
  assert.ok(Math.abs(landed.y+landed.h-target.y)<1,'land on actual tile baseline');
  assert.ok(Math.abs(landed.w-target.width)<1,'match board creature size');
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
 assert.deepEqual(errors,[]);console.log('Board evolution: actual Phaser at 1280/1920; viewport flash, blackout before charge, fixed captions, image-only landing, charge, reveal, level-up queue, cleanup, camera cancellation, mute and reduced motion passed.');
 }finally{await browser.close();G.rooms.clear();G.server.closeAllConnections();await new Promise(r=>G.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
