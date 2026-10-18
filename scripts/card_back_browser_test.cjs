'use strict';
const {chromium}=require('playwright'),assert=require('assert/strict'),fs=require('fs'),path=require('path');
const out=path.resolve(__dirname,'../output/card-back-approved-20261019');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));const report=[];
 for(const size of [{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080},{width:1024,height:768}]){
  await p.setViewportSize(size);await p.goto('http://127.0.0.1:4374/play?fixture=1&guide=done&battle-flow=pick');await p.waitForFunction(()=>window.battleFlowReady);
  const dims=await p.evaluate(()=>{
   const stage=document.createElement('div');stage.className='supportRevealStage';stage.style.visibility='hidden';stage.innerHTML=supportBackHTML('',{kind:'support',cardId:'weapon'});document.body.append(stage);
   const fly=document.createElement('div');fly.className='cardFlyBack';fly.style.visibility='hidden';document.body.append(fly);
   const result=[document.querySelector('.battleCardBack'),document.querySelector('.supportSlot .scardB'),stage.querySelector('.scardB'),fly].map(e=>{const s=getComputedStyle(e),face=e.querySelector('.sbackB')||e;return {width:parseFloat(s.width),height:parseFloat(s.height),background:getComputedStyle(face).backgroundImage}});
   stage.remove();fly.remove();return result;
  });
  for(const d of dims){assert(Math.abs(d.width/d.height-300/470)<.002);assert(d.background.includes('card-back-v1.webp'));}report.push({size,dims});
  await p.waitForFunction(()=>!document.querySelector('#battleCutin').classList.contains('on'));if(size.width===1280)await p.screenshot({path:path.join(out,'battle-card-backs.png')});
 }
 await p.setViewportSize({width:1280,height:720});await p.evaluate(()=>{document.querySelector('#battle').classList.remove('on');BoardNotice.effect(BoardNext.rare(state.players[0]),state,{ms:n=>n*5});});
 await p.waitForSelector('#boardNotice .rareHand');await p.waitForFunction(()=>[...document.querySelectorAll('.rareHand img')].every(e=>e.complete&&e.naturalWidth===900));assert.equal(await p.locator('.rareHand img').count(),3);
 const ratios=await p.locator('.rareHand img').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return parseFloat(s.width)/parseFloat(s.height)}));assert(ratios.every(r=>Math.abs(r-300/470)<.002));await p.waitForTimeout(1300);await p.screenshot({path:path.join(out,'rare-card-backs.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log('PASS shared card back: four viewports, battle/weapon/reveal/fly ratios and rare fan');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
