'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const base='http://127.0.0.1:4373',out=path.resolve(__dirname,'../output/suminoko-v169');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage(),errors=[],report=[];p.on('pageerror',e=>errors.push(e.message));
 for(const stage of ['base','evolved'])for(const armor of [0,15,150]){
  for(const size of [{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080}]){
   await p.setViewportSize(size);await p.goto(base+'/play?fixture=1&guide=done&suminoko-preview=1&stage='+stage+'&armor='+armor);
   const panel=p.locator('#boardNotice[data-flow=inspection].elAnchoredVisible:not([hidden])');await panel.waitFor({timeout:45000});
   assert.equal(await p.locator('.elCharcoal b').innerText(),'+'+armor);
   assert.equal(await p.locator('.elDf b').innerText(),''+(armor+(stage==='base'?10:30)));
   assert.equal(await p.locator('.elAt b').innerText(),stage==='base'?'10':'20');
   assert.equal(await p.locator('.elHp strong').innerText(),stage==='base'?'50 / 50':'70 / 70');
   await p.waitForFunction(()=>Array.from(document.querySelectorAll('#boardNotice img')).every(e=>e.complete&&e.naturalWidth>0));
   const box=await p.locator('#boardNotice .messageWindow').boundingBox();assert(box.y>=0&&box.y+box.height<=size.height+1);
   assert(await p.locator('.elCharcoal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   if(armor===15)await p.screenshot({path:path.join(out,'board-'+stage+'-'+size.width+'.png')});report.push({view:'board',stage,armor,...size});
  }
  for(const size of [{width:667,height:375},{width:844,height:390},{width:896,height:414}]){
   await p.setViewportSize(size);await p.goto(base+'/phone?fixture=result&suminoko-preview=1&stage='+stage+'&armor='+armor);
   await p.waitForSelector('#phoneEnemyChoice:not([hidden])');assert.equal(await p.locator('.ecCharcoal b').innerText(),'+'+armor);
   assert(await p.locator('.ecArt img').evaluate(e=>e.complete&&e.naturalWidth===300));
   const box=await p.locator('.ecCharcoal').boundingBox();assert(box.x>=0&&box.y+box.height<size.height);
   assert(await p.locator('.ecCharcoal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(armor===15)await p.screenshot({path:path.join(out,'phone-'+stage+'-'+size.width+'.png')});report.push({view:'phone',stage,armor,...size});
  }
 }
 await p.setViewportSize({width:1440,height:1000});
 await p.goto(base+'/preview/suminoko?stage=evolved&armor=15');
 await p.frameLocator('iframe').locator('.elCharcoal b').waitFor();
 assert.equal(await p.frameLocator('iframe').locator('.elCharcoal b').innerText(),'+15');
 await p.locator('#armor').selectOption('150');
 await p.frameLocator('iframe').locator('.elCharcoal b').filter({hasText:'+150'}).waitFor();
 await p.locator('[data-view="phone"]').click();
 await p.frameLocator('iframe').locator('.ecCharcoal b').filter({hasText:'+150'}).waitFor();
await p.goto(base+'/cards?card=suminoko#catalog');
 const card=p.locator('[data-card-id="suminoko"]');await card.waitFor();assert.equal(await card.locator('.game-card__cost').innerText(),'85G');
 await p.locator('[data-card-dialog][open]').waitFor();await p.locator('[data-dialog-mode="evolution"]').click();assert.equal(await p.locator('[data-dialog-card] .game-card__cost').innerText(),'100G');await p.screenshot({path:path.join(out,'catalog.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log('PASS Suminoko: 36 actual board/phone states, art, stats, layout and evolution cost');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
