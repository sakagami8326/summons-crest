'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4372',out=path.resolve(__dirname,'../output/hibami-v168');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const report=[];
 for(const stage of ['base','evolved']){
  for(const size of [{width:1440,height:900},{width:1280,height:720},{width:1024,height:768}]){
   await p.setViewportSize(size);await p.goto(base+'/play?fixture=1&guide=done&hibami-preview=1&stage='+stage);
   const panel=p.locator('#boardNotice[data-flow=inspection].elAnchoredVisible:not([hidden])');await panel.waitFor({timeout:45000});
   assert.equal(await p.locator('.elIntimidation b').innerText(),stage==='base'?'−10':'−20');
   assert.equal(await p.locator('.elAt b').innerText(),stage==='base'?'20':'30');
   await p.waitForFunction(()=>Array.from(document.querySelectorAll('#boardNotice img')).every(e=>e.complete&&e.naturalWidth>0));
   const box=await p.locator('#boardNotice .messageWindow').boundingBox();assert(box.y>=0&&box.y+box.height<=size.height+1);
   await p.screenshot({path:path.join(out,'board-'+stage+'-'+size.width+'.png')});report.push({view:'board',stage,...size,panel:box});
  }
  for(const size of [{width:844,height:390},{width:667,height:375},{width:915,height:412}]){
   await p.setViewportSize(size);await p.goto(base+'/phone?fixture=result&hibami-preview=1&stage='+stage);
   await p.waitForSelector('#phoneEnemyChoice:not([hidden])');
   assert.equal(await p.locator('.ecIntimidation b').innerText(),stage==='base'?'−10':'−20');
   assert.equal(await p.locator('.ecCounter').innerText(),stage==='base'?'20':'30');
   assert(await p.locator('.ecArt img').evaluate(e=>e.complete&&e.naturalWidth===300));
   const box=await p.locator('.ecIntimidation').boundingBox();assert(box.x>=0&&box.y+box.height<size.height);
   assert(await p.locator('.ecIntimidation').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await p.screenshot({path:path.join(out,'phone-'+stage+'-'+size.width+'.png')});report.push({view:'phone',stage,...size,ability:box});
  }
 }
 await p.setViewportSize({width:1440,height:1000});await p.goto(base+'/cards?card=hibami#catalog');
 await p.waitForSelector('[data-card-id="hibami"], [data-card="hibami"], review-game-card[card-id="hibami"]',{timeout:20000});
 await p.screenshot({path:path.join(out,'catalog.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));
 console.log('PASS Hibami board/phone: both stages × three viewports; actual components, images, AT and layout; catalog');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
