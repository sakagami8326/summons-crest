const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval',src+';return {server};')(require,__dirname,()=>0);
const shared='sc_site_audio_v2',legacy='sc_site_audio_v1';
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:900}}),errors=[];
 await context.addInitScript(()=>{window.siteTestAudio=[];const Native=window.Audio;window.Audio=function(...args){const a=new Native(...args);siteTestAudio.push(a);return a;};window.Audio.prototype=Native.prototype;});
 const open=async(ctx=context,route='/')=>{const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+route);return p;};
 const off=async p=>{await p.waitForFunction(()=>document.querySelector('.site-bgm')?.textContent==='BGM OFF');assert(await p.evaluate(()=>!window.siteTestAudio||siteTestAudio.every(a=>a.paused)));};
 const a=await open();assert.equal(await a.evaluate(()=>siteTestAudio.length),0);await a.locator('[data-audio="off"]').click();await off(a);
 const fresh=await open(context,'/news');await off(fresh);assert.equal(await fresh.locator('.site-audio-gate').count(),0);assert.equal(await fresh.evaluate(()=>siteTestAudio.length),0);await fresh.close();
 await a.locator('.site-bgm').click();await a.waitForFunction(()=>document.querySelector('.site-bgm').textContent==='BGM ON');
 const popup=context.waitForEvent('page');await a.evaluate(()=>window.open('/rules','_blank'));const b=await popup;await b.waitForLoadState();await b.bringToFront();await b.locator('.site-bgm').waitFor();if(await b.locator('.site-bgm').innerText()!=='BGM ON')await b.locator('.site-bgm').click();await b.waitForFunction(()=>document.querySelector('.site-bgm').textContent==='BGM ON');
 await b.locator('.site-bgm').click();await off(b);await off(a);
 await a.evaluate(()=>{for(const media of siteTestAudio)media.dispatchEvent(new Event('timeupdate'));dispatchEvent(new PageTransitionEvent('pagehide'));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));document.dispatchEvent(new Event('visibilitychange'));});await off(a);
 assert.equal(await a.evaluate(k=>JSON.parse(localStorage.getItem(k)).choice,shared),'off');
 // Restore a page whose in-memory flag is still ON (no storage event to itself).
 await a.locator('.site-bgm').click();await a.waitForFunction(()=>document.querySelector('.site-bgm').textContent==='BGM ON');
 await a.evaluate(k=>{localStorage.setItem(k,JSON.stringify({choice:'off'}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));},shared);await off(a);
 assert.equal(await a.evaluate(k=>JSON.parse(localStorage.getItem(k)).choice,shared),'off');
 await a.goto(base+'/cards');await off(a);await a.goBack();await off(a);
 await a.evaluate(k=>sessionStorage.setItem(k,JSON.stringify({choice:'on',position:5})),legacy);await a.reload();await off(a);
 await a.close();await b.close();const reopened=await open();await off(reopened);assert.equal(await reopened.locator('.site-audio-gate').count(),0);await reopened.close();
 console.log('PASS shared OFF: new tabs, existing tabs, navigation, back, lifecycle, stale legacy and reopen');
 // Old per-tab settings migrate only if no newer shared choice exists.
 const migration=await browser.newContext();await migration.addInitScript(k=>sessionStorage.setItem(k,JSON.stringify({choice:'off',position:12})),legacy);const m=await open(migration);await off(m);assert.equal(await m.evaluate(k=>JSON.parse(localStorage.getItem(k)).choice,shared),'off');await migration.close();
 // A late play promise must not revive an OFF chosen in a different tab.
 const delayed=await browser.newContext();await delayed.addInitScript(()=>{window.siteTestAudio=[];const Original=Audio;window.Audio=function(){const a=new Original();siteTestAudio.push(a);a.play=()=>new Promise(resolve=>{window.finishSitePlay=resolve;});return a;};window.Audio.prototype=Original.prototype;});
 const d=await open(delayed);await d.locator('[data-audio="on"]').click();const d2=await open(delayed,'/news');await d2.evaluate(k=>localStorage.setItem(k,JSON.stringify({choice:'off'})),shared);await off(d);await d.evaluate(()=>finishSitePlay());await off(d);await delayed.close();
 // Saving denied: same-page operation remains usable without claiming cross-tab persistence.
 const denied=await browser.newContext();await denied.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('denied');};});const n=await open(denied);await n.locator('[data-audio="on"]').click();await n.waitForFunction(()=>document.querySelector('.site-bgm').textContent==='BGM ON');await n.locator('.site-bgm').click();await off(n);await denied.close();
 assert.deepEqual(errors,[]);console.log('PASS migration, delayed play after OFF, and storage failure');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
