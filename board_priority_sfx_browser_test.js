'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');
const {G} = require('./battle_presentation_test');
const remoteBase = process.env.SFX_TEST_BASE;
const out = path.join(__dirname,'output/priority-sfx-integration'+(remoteBase?'-live':''));
fs.mkdirSync(out,{recursive:true});
(async()=>{
 let browser;
 try {
  if(!remoteBase)await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));
  const base=remoteBase||'http://127.0.0.1:'+G.server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__sfxPlays=[];window.__voiceIds=new WeakMap();let nextId=0;
   const original=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(){
    if(!this.muted&&this.volume>0&&/se_(attack_hit|pawn_step)_b_v1\.wav/.test(this.src)){
     if(!window.__voiceIds.has(this))window.__voiceIds.set(this,++nextId);
     window.__sfxPlays.push({file:this.src.split('/').pop(),voice:window.__voiceIds.get(this),at:performance.now(),volume:this.volume});
    }
    return original.apply(this,arguments);
   };
  });
  await page.goto(base+'/play?guide=done&fixture=1&fx=battle&atk=avalanche&result=win');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state?.catalog&&PW.isReady());
  const formats=await page.evaluate(async()=>{
   const c=new AudioContext(),rows=[];
   for(const file of ['se_attack_hit_b_v1.wav','se_pawn_step_b_v1.wav']){
    const res=await fetch('/assets/'+file);if(!res.ok)throw Error(file+' HTTP '+res.status);
    const decoded=await c.decodeAudioData(await res.arrayBuffer());rows.push({file,rate:decoded.sampleRate,duration:decoded.duration});
   }
   await c.close();initAudio();setAudioMuted(false);return rows;
  });
  assert(formats[0].duration>.7&&formats[0].duration<.8);
  assert(formats[1].duration>.09&&formats[1].duration<.15);
  await page.waitForTimeout(350);
  await page.evaluate(()=>{window.__sfxPlays=[];window.__battleDone=false;runFxHarness('battle').then(()=>window.__battleDone=true);});
  await page.waitForFunction(()=>window.__sfxPlays.filter(x=>x.file.includes('attack_hit')).length===2,{timeout:15000});
  await page.screenshot({path:path.join(out,'battle-combo.png')});
  await page.waitForFunction(()=>window.__battleDone,{timeout:20000});
  const combo=await page.evaluate(()=>window.__sfxPlays.filter(x=>x.file.includes('attack_hit')));
  assert.equal(combo.length,2,'both combo impacts produce audio');
  assert.notEqual(combo[0].voice,combo[1].voice,'overlapping combo tails use separate audio voices');
  assert(combo[1].at-combo[0].at>450&&combo[1].at-combo[0].at<900,'sound follows actual combo impact timing');
  await page.evaluate(async()=>{
   history.replaceState(null,'','?guide=done&fixture=1&result=counter');window.__sfxPlays=[];
   await runFxHarness('battle');
  });
  const counter=await page.evaluate(()=>window.__sfxPlays.filter(x=>x.file.includes('attack_hit')));
  assert.equal(counter.length,2,'attacker and defender counterattack both produce audio');
  async function move(map,from,pathSteps,expected){
   await page.evaluate(async({map,from,pathSteps})=>{
    presentationQueue.length=0;queuedTurn=null;state.phase='playing';state.mapId=map;
    state.tiles=structuredClone(SummonsMaps[map].tiles);state.owners=state.tiles.map(()=>null);
    state.elemOv={};state.tileFx={};state.curses={};syncSelectedMap();
    const p=state.players[0];p.pos=pathSteps.at(-1);prevPos[p.id]=p.pos;pawnAnim[p.id]=from;
    renderPawns();await new Promise(r=>setTimeout(r,350));window.__sfxPlays=[];
    hopState={id:p.id,from,to:p.pos,path:pathSteps,steps:pathSteps.length,sN:0,holding:false,events:[],castleEv:null};
    hopStep();renderPawns();renderPawns();
   },{map,from,pathSteps});
   await page.waitForFunction(n=>!hopState&&window.__sfxPlays.filter(x=>x.file.includes('pawn_step')).length===n,expected,{timeout:6000});
   return page.evaluate(()=>window.__sfxPlays.filter(x=>x.file.includes('pawn_step')));
  }
  const normal=await move('starting_corridor',1,[2,3,4],3);
  const cave=await move('twin_gate_cavern',4,[5,6,7],3);
  await page.screenshot({path:path.join(out,'cavern-steps.png')});
  const levels=await page.evaluate(()=>{
   BoardAudioSettings.set({se:34});applyBoardAudioVolume();
   const levels={step:sePawnStep.volume,hits:attackHitVoices.map(a=>a.volume)};
   window.__sfxPlays=[];playAttackHit();setAudioMuted(true);
   const stopped=audioList().every(a=>a.paused);window.__sfxPlays=[];
   playAttackHit();playSe(sePawnStep);const muted=window.__sfxPlays.length;
   setAudioMuted(false);BoardAudioSettings.set({se:0});applyBoardAudioVolume();window.__sfxPlays=[];
   playAttackHit();playSe(sePawnStep);
   return {...levels,stopped,muted,zero:window.__sfxPlays.length};
  });
  assert(Math.abs(levels.step-.9*.34)<1e-6&&levels.hits.every(v=>Math.abs(v-.85*.34)<1e-6));
  assert(levels.stopped&&levels.muted===0&&levels.zero===0,'mute stops all voices; mute and 0% suppress new playback');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,formats,combo,counter,normal,cave,levels,errors},null,2));
  console.log('PASS priority SFX: decoded assets, combo voices, counterattack, normal/cavern landing once per step, volume, mute and zero volume');
 } finally {await browser?.close();if(!remoteBase){G.server.closeAllConnections();G.server.close();}}
})().catch(e=>{console.error(e);process.exit(1)});
