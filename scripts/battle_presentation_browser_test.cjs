'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const base='http://127.0.0.1:4374',out=path.resolve(__dirname,'../output/battle-presentation');fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const go=async(mode,scenario='swordgear')=>{await p.goto(base+'/play?fixture=1&guide=done&battle-flow='+mode+'&scenario='+scenario);await p.waitForFunction(()=>window.battleFlowReady===true)};
 await go('support');assert.notEqual(await p.locator('#bCmpAtkAtBar').innerHTML(),'');
 await p.evaluate(()=>{state.battlePreview.atkCreature=null;state.battlePreview.phase='pick_attacker';state.battlePreview.previewStats.attacker=null;activeBattleKey=null;renderBattlePreview(state.battlePreview)});
 assert.equal(await p.locator('#bCmpAtkAtBar').innerHTML(),'');assert.equal(await p.locator('#bCmpAtkHpBar').innerHTML(),'');assert.equal(await p.locator('#bCmpAtkHp').innerText(),'―');
 const landing=await p.evaluate(()=>state.battlePreview.previewStats.defender);assert.equal(await p.locator('#bCmpDefHp').innerText(),''+(landing.hp+landing.df));
 await p.waitForFunction(()=>!document.querySelector('#battleCutin').classList.contains('on'));await p.screenshot({path:path.join(out,'unselected.png')});
 await go('result');const result=await p.evaluate(()=>activeBattleData);
 assert.equal(await p.locator('#bAtk').evaluate(e=>e.closest('.battleFighter').querySelectorAll('.battleExternalBonus').length),1,'weapon-dependent passive remains hidden');
 assert.equal(await p.locator('#bCmpAtkAt').innerText(),''+result.atkPreAt);assert.equal(await p.locator('#bCmpDefHp').innerText(),''+(result.defPreHp+result.defPreDf));
 await p.waitForFunction(()=>document.querySelector('#bAtkSupport').dataset.revealed==='true'&&document.querySelector('#bDefSupport').dataset.revealed!=='true');
 assert.equal(await p.locator('#bCmpAtkAt').innerText(),''+result.atkPreAt,'first weapon reveal must not update stats yet');
 await p.waitForFunction(v=>document.querySelector('#bCmpAtkAt').textContent===String(v),result.atkPostAt);
 assert.equal(result.atkPostAt-result.atkPreAt,40);await p.screenshot({path:path.join(out,'weapons-revealed.png')});
 await p.locator('#battleOutcome:not([hidden])').waitFor({timeout:30000});assert.equal(await p.locator('#battleOutcome h2').innerText(),'侵略したクリーチャーは生還した');
 assert.equal(await p.locator('#battleOutcome p').innerText(),'侵略したクリーチャーはHPが残ったため手札に残った');await p.screenshot({path:path.join(out,'survived.png')});
 await p.waitForFunction(()=>window.battleFlowDone===true,{},{timeout:30000});assert.equal(await p.locator('#battleOutcome').isVisible(),false);
 await go('result','dead');await p.locator('#battleOutcome:not([hidden])').waitFor({timeout:30000});assert.equal(await p.locator('#battleOutcome h2').innerText(),'侵略したクリーチャーは破壊された');assert.equal(await p.locator('#battleOutcome p').innerText(),'侵略したクリーチャーはHPが無くなったため捨て札に移動した');await p.screenshot({path:path.join(out,'destroyed.png')});
 for(const size of [{width:1366,height:768},{width:1920,height:1080}]){await p.setViewportSize(size);const box=await p.locator('#battleOutcome').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height);}
 assert.deepEqual(errors,[]);console.log('PASS actual battle: empty unselected bars, initial bonuses, both weapons then mastery, survival/destruction notices and viewports');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
