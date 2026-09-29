const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/audio-settings-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom};')(require,root,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const r=G.makeFixtureRoom();r.code='AUDIO';r.pending={};r.turnTransition=null;G.rooms.set(r.code,r);
 async function enter(){await page.goto(base+'/play?guide=done');await page.waitForFunction(()=>window.BoardAudioSettings);assert(!await page.locator('#titleSettings').isVisible());await page.evaluate(({code,token})=>{$('titleOv').classList.remove('on');enterRoom(code,location.origin+'/phone?room='+code,token);},{code:r.code,token:r.boardToken});await page.locator('#optBtn').click();}
 await enter();assert(await page.locator('#optQr svg').isVisible());assert.equal(await page.locator('#optCode').innerText(),r.code);assert(await page.locator('#optSaveQuit').isVisible());
 await page.getByRole('tab',{name:'音声',exact:true}).click();assert.equal(await page.evaluate(()=>bgmMuted),true);
 await page.getByRole('switch',{name:'すべての音'}).click();await page.waitForFunction(()=>bgmCur&&!bgmCur.paused&&bgmCur.readyState>=2);
 await page.locator('#soundBgm').fill('24');await page.locator('#soundSe').fill('81');
 const gainCheck=await page.evaluate(async()=>{
  const c=new EvolutionChargeAudio();c.setVolume(.31);await c.unlock();const initial=c.output.gain.value;c.update(.5,2,true);c.setVolume(0);await new Promise(r=>setTimeout(r,60));const silent=c.output.gain.value;c.stopAll();await c.context.close();
  const A=window.AudioContext,original=A.prototype.createGain,created=[];A.prototype.createGain=function(){const node=original.call(this);created.push(node);return node;};
  const g=createResultGraphAudio();try{g.setVolume(.27);g.unlock();await created[0].context.resume();await new Promise(r=>setTimeout(r,60));const value=created[0].gain.value;g.setVolume(0);await new Promise(r=>setTimeout(r,60));const zero=created[0].gain.value;g.stop();return {initial,silent,value,zero};}finally{A.prototype.createGain=original;}
 });assert(Math.abs(gainCheck.initial-.31)<.001&&gainCheck.silent===0&&Math.abs(gainCheck.value-.27)<.001&&gainCheck.zero===0,'Web Audio output buses follow volume before and during playback: '+JSON.stringify(gainCheck));
 let volumes=await page.evaluate(()=>[bgmCur.volume,seSummon.volume]);assert(Math.abs(volumes[0]-.35*.24)<.001);assert(Math.abs(volumes[1]-.72*.81)<.001);
 await page.getByRole('button',{name:'効果音を試聴',exact:true}).click();await page.waitForFunction(()=>!seSummon.paused);
 await page.evaluate(()=>crossfadeBgmTo('battle',400));await page.locator('#soundBgm').fill('0');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>bgmCur.volume),0);await page.waitForTimeout(450);
 await page.locator('#soundBgm').fill('24');assert(Math.abs(await page.evaluate(()=>bgmCur.volume)-.084)<.001);
 await page.evaluate(()=>crossfadeBgmTo('result',120));await page.waitForTimeout(180);assert(Math.abs(await page.evaluate(()=>bgmCur.volume)-.06)<.001);
 await page.locator('#soundSe').fill('0');assert.equal(await page.evaluate(()=>seSummon.volume),0);assert(await page.locator('#soundSePlay').isDisabled());
 await page.getByRole('switch',{name:'すべての音'}).click();assert(await page.evaluate(()=>audioList().every(a=>a.paused)));
 await enter();await page.getByRole('tab',{name:'音声',exact:true}).click();assert(await page.evaluate(()=>bgmMuted&&BoardAudioSettings.value.se===0&&BoardAudioSettings.value.bgm===24));assert(await page.evaluate(()=>audioList().every(a=>a.paused)));
 await page.getByRole('switch',{name:'すべての音'}).click();await page.locator('#soundReset').click();assert.equal(await page.locator('#soundBgm').inputValue(),'70');
 for(const [width,height] of [[1440,900],[1024,768],[844,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(400);const a=await page.locator('#soundPanel').boundingBox();await page.getByRole('tab',{name:'ルーム',exact:true}).click();await page.waitForTimeout(250);const b=await page.locator('#soundPanel').boundingBox();assert.equal(a.height,b.height);assert(Math.abs(b.x+b.width/2-width/2)<1&&Math.abs(b.y+b.height/2-height/2)<1);await page.screenshot({path:path.join(out,`room-${width}.png`)});await page.getByRole('tab',{name:'音声',exact:true}).click();}
 await page.keyboard.press('Escape');assert(!await page.locator('#soundPanel').isVisible());assert.equal(await page.evaluate(()=>document.activeElement.id),'optBtn');
 await page.locator('#optBtn').click();await page.getByRole('tab',{name:'音声',exact:true}).click();await page.evaluate(()=>reportAudioBlocked());assert(await page.locator('#soundEnable').isVisible());await page.locator('#soundEnable').click();await page.waitForFunction(()=>!boardAudioBlocked);
 // BOT controls are the original DOM and continue to send the existing room action.
 r.botMode=true;await page.evaluate(()=>{state.botMode=true;syncBotSpeedUi();});await page.getByRole('tab',{name:'ルーム',exact:true}).click();assert(await page.locator('#optBotSpeed').isVisible());await page.locator('#optBotSpeed').click();await page.waitForFunction(()=>!$('optBotSpeed').disabled);assert.equal(r.presentationSpeed,2);
 await page.getByRole('tab',{name:'音声',exact:true}).click();await page.screenshot({path:path.join(out,'audio-844.png')});
 await page.getByRole('tab',{name:'ルーム',exact:true}).click();
 const closed=page.waitForResponse(res=>res.url().endsWith('/api/close'));
 await page.locator('#optSaveQuit').click();assert((await closed).ok());assert(!G.rooms.has(r.code),'save/quit closes the same fixture room');
 assert.deepEqual(errors,[]);console.log('PASS real board settings: room, mute, levels, fades, persistence, recovery, tabs, keyboard, BOT speed and save/quit');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
