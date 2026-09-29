const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=process.cwd(),out=path.join(root,'output/summoner-selection-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,broadcast};')(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const post=async(url,data)=>{const r=await fetch(base+url,{method:'POST',body:JSON.stringify(data)});assert(r.ok,await r.clone().text());return r.json();};
 browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 for(const width of [844,667]){
  const page=await browser.newPage({viewport:{width,height:375},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  const created=await post('/api/create',{mode:'normal'}),room=created.code;
  await page.goto(base+'/phone?guide=done&room='+room);await page.locator('#nameIn').fill('選択テスト');await page.locator('#joinBtn').click();
  await page.waitForFunction(()=>!!pid);const id=await page.evaluate(()=>pid);
  const second=await post('/api/join',{room,name:'他のプレイヤー'});
  await post('/api/action',{room,type:'start_select'});
  await page.locator('#phoneSummoners .summonerTile').first().waitFor();
  assert.equal(await page.locator('#phoneSummoners .summonerTile').count(),8);
  await page.locator('[data-filter=neutral]').click();assert.equal(await page.locator('#phoneSummoners .summonerTile').count(),0);assert(await page.locator('.rosterEmpty').isVisible());
  assert(await page.locator('[data-filter=neutral]').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
  await page.locator('[data-filter=all]').click();
  for(const el of ['fire','water','earth','wind']){await page.locator(`[data-filter=${el}]`).click();assert.equal(await page.locator('#phoneSummoners .summonerTile').count(),2);}await page.locator('[data-filter=all]').click();
  await page.waitForTimeout(650);await page.screenshot({path:path.join(out,`list-${width}.png`)});
  await page.locator('[data-id=redani]').click();await page.waitForTimeout(750);
  for(let i=0;i<8;i++){
   const name=await page.locator('.detailHeading h1').innerText();
   assert.match(await page.locator('.affinityBenefit').innerText(),/同属性の領地 強化費用 20％OFF/);
   assert.equal(await page.locator('img.ornateArrow').count(),3);
   assert.equal(await page.locator('#phoneSummoners .starterCard').count(),12);
   const check=await page.evaluate(async()=>{const root=document.querySelector('#phoneSummoners');await Promise.all([...root.querySelectorAll('img')].map(i=>i.decode().catch(()=>{})));return {broken:[...root.querySelectorAll('img')].filter(i=>!i.naturalWidth).map(i=>i.src),fit:[...root.querySelectorAll('.starterCard')].every(e=>{const b=e.getBoundingClientRect();return b.height>24&&b.bottom<innerHeight;})};});
   assert.deepEqual(check.broken,[],name);assert(check.fit,name);
   const portrait=await page.locator('.portrait').boundingBox();assert(portrait.x>0&&portrait.x+portrait.width<width*.5,'portrait stays in the approved left composition');
   assert.match(await page.locator('.portrait').evaluate(e=>getComputedStyle(e).maskImage),/to right/);
   if(name==='リーア'){assert.match(await page.locator('.ultimateInfo').innerText(),/10ダメージ/);assert.match(await page.locator('.ultimateInfo').innerText(),/AT\+10/);}
   if(name==='ヴィラ')assert.doesNotMatch(await page.locator('.ultimateInfo').innerText(),/その後ダイス/);
   await page.locator('.next').click();await page.waitForTimeout(750);
  }
  // Repeated SSE updates must not reset the current detail or recreate its cards.
  await page.evaluate(()=>window.savedCard=document.querySelector('.starterCard'));G.broadcast(G.rooms.get(room));await page.waitForTimeout(100);
  assert(await page.evaluate(()=>savedCard===document.querySelector('.starterCard')));
  await page.locator('.starterCard').first().click();assert(await page.locator('.starterZoom').isVisible());await page.locator('.zoomClose').click();
  // A failed selection remains retryable; double taps send one request.
  let calls=0;await page.route('**/api/action',async route=>{const data=route.request().postDataJSON();if(data.type==='choose'){calls++;if(calls===1){await new Promise(r=>setTimeout(r,150));return route.fulfill({status:500,body:'{}'});}}return route.continue();});
  await page.locator('.chooseSummoner').evaluate(e=>{e.click();e.click();});await page.locator('.selectionFeedback').waitFor();assert.equal(calls,1);assert(await page.locator('.chooseSummoner').isEnabled());
  await page.locator('.chooseSummoner').click();await page.waitForFunction(()=>me().confirmed);await page.waitForFunction(()=>document.querySelector('.chooseSummoner')?.textContent==='選び直す');
  assert.equal(G.rooms.get(room).players.find(p=>p.id===id).charId,'redani');
  await page.locator('.chooseSummoner').click();await page.waitForFunction(()=>!me().confirmed);await page.waitForFunction(()=>document.querySelector('.chooseSummoner')?.textContent.includes('この召喚士'));
  // Another participant takes the currently viewed summoner; live UI prevents selection.
  await post('/api/action',{room,type:'choose',playerId:second.playerId,optionId:'redani'});
  await page.waitForFunction(()=>document.querySelector('.chooseSummoner')?.disabled);assert.match(await page.locator('.chooseSummoner').innerText(),/選択できません/);
  await page.locator('.next').click();await page.waitForTimeout(750);assert(await page.locator('.chooseSummoner').isEnabled());
  await page.screenshot({path:path.join(out,`detail-${width}.png`)});
  await page.locator('.chooseSummoner').click();await page.waitForFunction(()=>me().confirmed);
  // Resume retains the server-confirmed selection, and the server starts the actual game.
  await page.reload();await page.locator('.reselectSummoner').waitFor();assert.match(await page.locator('.selectionStatus').innerText(),/リンネイ/);
  await post('/api/action',{room,type:'start_game',token:created.boardToken});await page.waitForFunction(()=>state?.phase==='playing');assert(await page.locator('#phoneSummoners').isHidden());assert(await page.locator('#handWrap').isVisible());
  await page.close();console.log('PASS real phone/API selection, retry, concurrent selection, resume and game start',width);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({passed:true,sizes:[844,667],errors},null,2));
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
