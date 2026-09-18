const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms};')(require,__dirname,()=>0,()=>0);
(async()=>{await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+G.server.address().port+'/play?fixture=1&guide=done');
  await page.waitForFunction(()=>state?.catalog?.CREATURES?.jaki&&PW.isReady());
  await page.evaluate(()=>{
    window.impactEvents=[];window.mediaImpactCalls=0;
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){if(this.src.includes('se_evolve'))mediaImpactCalls++;return play.apply(this,args);};
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      if(this.buffer?.duration>3.09&&this.buffer.duration<3.11){
        const event={offset:args[1],time:performance.now(),context:this.context.state,ended:false,rms:0};impactEvents.push(event);
        this.addEventListener('ended',()=>{event.ended=true;});
        const analyser=this.context.createAnalyser(),silent=this.context.createGain();silent.gain.value=0;
        this.connect(analyser);analyser.connect(silent);silent.connect(this.context.destination);
        setTimeout(()=>{const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);event.rms=Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);analyser.disconnect();silent.disconnect();},300);
      }
      return start.apply(this,args);
    };
    const b=document.createElement('button');b.id='testEvolution';b.textContent='Evolution';b.style='position:fixed;top:0;left:0;z-index:9999';
    b.onclick=()=>{setAudioMuted(false);initAudio();state.owners[1]={player:state.players[0].id,level:3,creature:'jaki',dmg:0};prev.ownersArr=state.owners.slice();render();window.evolutionDone=playEvolvePresentation(1,state.owners[1]);};document.body.append(b);
  });
  await page.click('#testEvolution');await page.waitForFunction(()=>impactEvents[0]?.rms>.02);
  const first=await page.evaluate(()=>impactEvents[0]);
  assert.equal(first.offset,.18);assert.equal(first.context,'running');assert.ok(first.rms>.02,'decoded evolution sound produces non-silent audio');
  assert.equal(await page.evaluate(()=>mediaImpactCalls),0,'no second HTML-audio playback at impact');
  await page.evaluate(()=>setAudioMuted(true));await page.waitForFunction(()=>impactEvents[0].ended);
  await page.evaluate(()=>window.evolutionDone);
  await page.click('#testEvolution');await page.locator('#evolutionFx').waitFor();
  await page.evaluate(()=>setAudioMuted(true));await page.evaluate(()=>window.evolutionDone);
  assert.equal(await page.evaluate(()=>impactEvents.length),1,'muting before impact suppresses evolution sound');
  await page.click('#testEvolution');await page.waitForFunction(()=>impactEvents.length===2);
  await page.evaluate(()=>resetPresentationCamera('audio-test'));await page.waitForFunction(()=>impactEvents[1].ended);
  await page.evaluate(()=>window.evolutionDone);
  // Missing/unready buffer falls back to the existing media sound path.
  assert.equal(await page.evaluate(()=>new EvolutionChargeAudio().playImpact()),false);
  assert.deepEqual(errors,[]);console.log('Evolution audio: real decoded MP3 audible RMS='+first.rms.toFixed(3)+'; shared running AudioContext, attack offset, no double-play, mute before/during impact and cancellation passed.');
 }finally{await browser.close();G.rooms.clear();G.server.closeAllConnections();await new Promise(r=>G.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
