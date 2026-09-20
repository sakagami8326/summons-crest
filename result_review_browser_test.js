const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=process.cwd(),source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','console',source+`;return {server,rooms,makeFixtureRoom,initMatchAnalytics,buildMatchResult,gainToDeck,payToll,startDraft};`)(require,root,()=>{}, {log(){},error:console.error});
(async()=>{
 let browser;try{
 const r=G.makeFixtureRoom();r.code='RV01';r.lastBattle=null;r.lastEvent=null;r.lastUlt=null;r.pending={};r.players.forEach((p,i)=>{p.name=['レダーニ','リンネイ','グリース','ミオ'][i];p.cardsCollected=0;p.tollCollected=0;p.battleWins=[6,3,4,8][i];G.gainToDeck(r,p,Array.from({length:[8,9,12,10][i]},(_,j)=>['gecko','weapon','sp_gold','poponga'][j%4]));});G.payToll(r,r.players[1],r.players[0],4200);G.initMatchAnalytics(r);r.phase='ended';r.winner=r.players[0].id;G.buildMatchResult(r);r.resultReview.unlockAt=Date.now()+120000;G.rooms.set(r.code,r);
 const rare=G.makeFixtureRoom();rare.code='UR01';rare.phase='playing';rare.winner=null;rare.matchResult=null;rare.resultReview=null;rare.pending={};rare.lastBattle=null;rare.lastEvent=null;rare.lastUlt=null;rare.turn=0;rare.deck=['samurai_saga','gecko','sp_gold'];G.startDraft(rare,rare.players[0],'castle');G.rooms.set(rare.code,rare);
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',res=>{if(res.status()>=400)errors.push(res.status()+' '+res.url())});};watch(page);
 await page.goto(base+'/play?guide=done');await page.evaluate(({code,token,winner,base})=>{prev.winPlayed=winner;document.getElementById('titleOv').classList.remove('on');enterRoom(code,base+'/phone?room='+code,token);},{code:r.code,token:r.boardToken,winner:r.winner,base});await page.waitForFunction(()=>state?.matchResult?.id);await page.evaluate(()=>showMatchResult(state.matchResult));await page.waitForSelector('#rvPodium.on');
 const phone=await browser.newPage({viewport:{width:844,height:390}});watch(phone);await phone.goto(base+'/phone?fixture=result&waiting=1&guide=done');await phone.waitForFunction(()=>state?.matchResult);await phone.evaluate(code=>{room=code;pid='fx0';state=null;connect();},r.code);await phone.waitForFunction(()=>state?.code==='RV01');assert.equal(await phone.locator('.resultWaiting').count(),1);
 await page.locator('#rvToHistory').click();assert.equal(await page.locator('.awardCopy h3').innerText(),'最多バトル勝利');assert.match(await page.locator('.awardValue').innerText(),/8/);await page.locator('#awardNext').click();assert.match(await page.locator('.awardValue').innerText(),/12/);await page.locator('#awardNext').click();assert.match(await page.locator('.awardValue').innerText(),/4,200/);await page.locator('#awardNext').click();await page.waitForTimeout(300);assert.ok(r.resultReview.completedAt,'server received completion');await phone.waitForFunction(()=>!!state?.resultReview?.completedAt);assert.equal(await phone.locator('.resultWaiting').count(),0);
 for(const row of r.matchResult.rankings){await page.locator('#deck-tab-'+row.id).click();assert.equal(await page.locator('.reviewDeckCard').count(),Math.min(24,row.finalDeck.length));}
 await page.locator('.reviewDeckCard').first().click();await page.waitForSelector('.reviewCardDialog[open]');await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:720});await page.screenshot({path:'output/rarity-result-preview/implemented-deck-720.png'});
 // Cover every summoner, including characters absent from the default four-player fixture.
 const chars=await page.evaluate(()=>Object.keys(state.catalog.CHARS));
 assert.equal(chars.length,8);
 const portraitChecks=[];
 for(let offset=0;offset<chars.length;offset+=4){
  const group=chars.slice(offset,offset+4);
  await page.evaluate(group=>{
   const result=structuredClone(state.matchResult);
   result.rankings=result.rankings.slice(0,group.length).map((row,i)=>({...row,charId:group[i],name:state.catalog.CHARS[group[i]].name}));
   showMatchResult(result);resultReviewScreen.showDecks();
  },group);
  const portraits=page.locator('#deckTabs .hudBust');assert.equal(await portraits.count(),group.length);
  await portraits.evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  for(let i=0;i<group.length;i++){
   await page.locator('#deckTabs [role="tab"]').nth(i).click();
   assert.equal(await page.locator('#deckTabs [aria-selected="true"]').count(),1);
   const data=await page.locator('#deckTabs .hudBust').nth(i).evaluate(img=>({src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0,visible:img.getBoundingClientRect().width>0&&img.getBoundingClientRect().height>0}));
   assert(data.loaded&&data.visible,group[i]+' portrait visible');
   assert.equal(data.src,'/assets/pawn_'+group[i]+(group[i]==='adel'?'.webp':'.png'));
   portraitChecks.push({summoner:group[i],...data});
  }
  await page.screenshot({path:'output/rarity-result-preview/all-summoners-'+(offset/4+1)+'.png'});
 }
 fs.writeFileSync('output/rarity-result-preview/all-summoners-verification.json',JSON.stringify(portraitChecks,null,2));
 console.log('PASS all 8 summoner portraits in final deck tabs');
 await page.evaluate(()=>showMatchResult(state.matchResult));assert.equal(await page.locator('#rvPodium').count(),1);assert.equal(await page.locator('.reviewCardDialog').count(),1);await page.evaluate(()=>resultReviewScreen.showDecks());await page.locator('#reviewClose').click();await page.waitForSelector('#titleOv.on');
 const rp=await browser.newPage({viewport:{width:844,height:390}});watch(rp);await rp.goto(base+'/phone?guide=done');await rp.evaluate(()=>{room='UR01';pid='fx0';state=null;document.getElementById('join').style.display='none';document.body.classList.add('ingame');connect();});await rp.waitForSelector('#uxRail .card.rarity-UR');assert.equal(await rp.locator('#uxRail .card.rarity-UR').count(),1);assert.equal(await rp.locator('#uxRail .card:not(.rarity-UR) .urShine').count(),0);assert.equal(await rp.locator('#uxRail .card .pvRarity,#uxRail .card .galBadge').count(),0);await rp.locator('#uxRail .card.rarity-UR').click();await rp.locator('#uxConfirm').click();await rp.waitForSelector('.dcOne.rarity-UR');assert.equal(rare.players[0].cardsCollected,1);await rp.screenshot({path:'output/rarity-result-preview/implemented-ur-phone.png'});
 await rp.evaluate(()=>{revealQueue=[];revealCurrent=null;enqueueCardReveal(['samurai_saga'],'draw');});assert.equal(await rp.locator('.dcOne.rarity-UR').count(),0,'ordinary draw does not replay random-draw effect');
 assert.deepEqual(errors,[]);fs.writeFileSync('output/rarity-result-preview/implemented-ui-verification.json',JSON.stringify({passed:true,checks:['Production result routes and scripts','Three live counters','Completion API and phone SSE synchronization','All final deck counts','Card detail, replay cleanup and return to title','720p layout','UR random draw and acquired card shine','Ordinary draw excluded'],errors},null,2));console.log('Integrated result and UR browser checks passed.');
 }finally{await browser?.close();G.server.closeAllConnections();await new Promise(resolve=>G.server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
