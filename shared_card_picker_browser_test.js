const fs=require('fs'),assert=require('assert/strict'),path=require('path'),{chromium}=require('playwright');
const root=process.cwd();const src=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+`;return {server,rooms,makeFixtureRoom,publicState,ask,handleChoose,askMandatoryHandExile,askForge,askGreaseUlt,startVillaRecovery,askSpellEvolve,startPickDraw,startDraft,continuePostBattle,askMarket,makeShopVisit,endTurn,resolveBattle,publicBattle,battleExternalModifiers,calculateBattle,serializeRoom,restoreRoom};`)(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
(async()=>{let browser;try{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});let errors=[];
 const r=G.makeFixtureRoom();r.code='UIPK';r.pending={};r.turn=0;r.lastEvent=null;r.lastUlt=null;r.lastBattle=null;r.lastDraw=null;r.lastGain=null;r.turnTransition=null;r.owners.fill(null);r.tileFx={};r.players[0].hand=['nome','nome','samurai_saga','night_jelly_f','sp_step','sp_evolve','weapon','shield','sp_gold'];r.players[0].gold=1000;G.rooms.set(r.code,r);G.endTurn(r);
 const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
 await page.goto(base+'/phone?guide=done');await page.evaluate(()=>{room='UIPK';pid='fx0';$('join').style.display='none';document.body.classList.add('ingame');connect();});
 await page.waitForSelector('#uxRail .card');await page.screenshot({path:'output/ui-integration/overflow.png'});
 assert.equal(await page.locator('#uxClose').isVisible(),false);await page.locator('#uxRail .card').first().tap();await page.waitForSelector('#uxPickDialog[open]');assert.equal(r.players[0].hand.length,9);await page.screenshot({path:'output/ui-integration/detail.png'});await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>me().hand.length===8);assert.equal(r.players[0].hand.length,8);await page.locator('#uxRail .card').first().tap();await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>me().hand.length===7);assert(await page.locator('#uxPicker').isHidden());assert.deepEqual(errors,[]);
 console.log('PASS real API repeated overflow + confirmation');
 await page.close();

 const reports=[];
 function fixture(type){const r=G.makeFixtureRoom();r.code='PICK';r.turn=0;r.turnTransition=null;r.pending={};r.lastEvent=r.lastUlt=r.lastBattle=r.lastDraw=r.lastGain=null;r.owners.fill(null);r.tileFx={};r.curses={};const p=r.players[0];p.hand=['nome','nome','jaki_f','sp_evolve','weapon'];p.exile=['weapon','shield','weapon','sp_quake'];p.gold=1000;p.charId='grease';r.owners[1]={player:p.id,creature:'jaki',level:1};G.rooms.set(r.code,r);
 if(type==='spell_evolve')G.askSpellEvolve(r,p);
 if(type==='forge')G.askForge(r,p);
 if(type==='gaust_exile'||type==='fatal_exile')G.askMandatoryHandExile(r,p,type,'廃棄',{after:'swap'});
 if(type==='ult_grease')G.askGreaseUlt(r,p);
 if(type==='ult_villa_recover')G.startVillaRecovery(r,p);
 if(type==='frontline_swap'||type==='daitekkan_recover'){if(type==='daitekkan_recover')r.owners[1].creature='kamadoma_f';r.battleAfter={winner:p.id,attacker:'fx1',defender:p.id,tile:1,invasionWon:false,mermaidDone:true,recoveryDone:type==='frontline_swap'};G.continuePostBattle(r);}
 if(type==='swap_pick'){p.hand.push('sp_swap');G.ask(r,p.id,'swap_land','土地',[{id:'sw:1'}]);G.handleChoose(r,p.id,'sw:1');}
 if(type==='pick_draw'){p.deck=['weapon','nome','sp_gold'];G.startPickDraw(r,p);}
 if(type==='draft'){r.deck=['samurai_saga'];G.startDraft(r,p,'battle');}
 if(type==='market'||type==='forget'){G.makeShopVisit(r,p);G.askMarket(r,p);if(type==='forget'){const remove=r.shopVisit.items.find(x=>x.kind==='remove');G.handleChoose(r,p.id,'buy:'+remove.slotId);}}
 return {r,p};}
 for(const width of [844,667]){
 const pg=await browser.newPage({viewport:{width,height:375},isMobile:true,hasTouch:true});pg.on('pageerror',e=>errors.push(e.message));
 await pg.goto(base+'/phone?guide=done');
 for(const type of ['frontline_swap','overflow','spell_evolve','forge','gaust_exile','fatal_exile','ult_grease','ult_villa_recover','daitekkan_recover','swap_pick','pick_draw','draft','market','forget']){
 const f=fixture(type);if(type==='overflow'){f.p.hand.push('shield','gshield','sp_step','sp_gold');G.endTurn(f.r);}
 await pg.evaluate(s=>{es?.close();room='PICK';pid='fx0';state=s;$('join').style.display='none';document.body.classList.add('ingame');render();connect();},G.publicState(f.r,'fx0'));
 if(type==='market'){
 await pg.waitForSelector('#shopScene.on .shopProduct');assert(await pg.locator('#uxPicker').isHidden());
 const item=f.r.shopVisit.items.find(x=>x.card==='weapon'),money=f.p.gold;
 await pg.locator('.shopProduct[data-slot="'+item.slotId+'"]').tap();await pg.waitForSelector('#shopDetail.on');await pg.screenshot({path:'output/ui-integration/shop-'+width+'.png'});
 await pg.locator('#shopBuy').tap();await pg.waitForFunction(()=>state.shopVisit.items.find(x=>x.card==='weapon').sold);assert.equal(f.p.gold,money-item.price);
 await pg.evaluate(()=>{clearTimeout(revealT);revealQueue=[];revealCurrent=null;$('drawModal').classList.remove('on');});
 await pg.locator('#shopExit').tap();await pg.waitForFunction(()=>pend()?.type!=='market');reports.push({width,type,passed:true});console.log('PASS',width,'original shop purchase and exit');continue;
 }
 await pg.waitForSelector('#uxRail .card');
 if(type==='pick_draw'||type==='draft'){
 await pg.waitForTimeout(100);
 const gap=await pg.locator('#uxRail').evaluate(rail=>{const cards=[...rail.children],a=cards[0].getBoundingClientRect(),b=cards.at(-1).getBoundingClientRect(),r=rail.getBoundingClientRect();return Math.abs((a.left-r.left)-(r.right-b.right));});assert(gap<2,'draw cards centered: '+gap);
 await pg.screenshot({path:'output/ui-integration/'+type+'-'+width+'.png'});
 }
 const shape=await pg.locator('#uxRail .face.front').evaluateAll(es=>es.map(e=>getComputedStyle(e).getPropertyValue('--card-info-top')));assert(shape.every(s=>s==='70.8%'));
 assert(await pg.locator('#uxPicker').evaluate(e=>e.clientHeight===e.scrollHeight));
 const hasCancel=!!f.r.pending.fx0.options.find(o=>/cancel|^done$|^back$|^skip$/.test(o.id));assert.equal(await pg.locator('#uxClose').isVisible(),hasCancel);
 const candidate=pg.locator('#uxRail .card[data-option-id]').first();const option=await candidate.getAttribute('data-option-id');await candidate.tap();await pg.waitForSelector('#uxPickDialog[open]');assert.equal(await pg.locator('#uxPickEffect').isVisible(),true);
 if(type==='frontline_swap'){assert.match(await pg.locator('#uxPickCost').innerText(),/50/);const money=f.p.gold;await pg.locator('#uxConfirm').tap();await pg.waitForFunction(()=>pend()?.type!=='frontline_swap');assert.equal(f.p.gold,money-50);assert.equal(f.r.owners[1].creature,'nome');}
 else if(type==='spell_evolve'){const money=f.p.gold;await pg.locator('#uxConfirm').tap();await pg.waitForFunction(()=>me().hand.includes('nome_f'));assert.equal(f.p.gold,money-150);assert(f.p.discard.includes('sp_evolve'));}
 else if(type==='forge'){await pg.locator('#uxConfirm').tap();await pg.waitForFunction(()=>me().hand.includes('nome_f'));}
 else if(type==='ult_grease'){
 await pg.locator('#uxConfirm').tap();await pg.waitForFunction(()=>pend().selected?.length===1);await pg.locator('#uxZones button').nth(1).tap();await pg.locator('#uxRail .card').first().tap();await pg.locator('#uxConfirm').tap();await pg.waitForFunction(()=>pend().selected?.length===2);assert.equal(await pg.locator('#uxZones button[aria-pressed=true]').innerText(),'自分の領地 1');await pg.locator('#uxBatch').tap();await pg.waitForFunction(()=>pend()?.type!=='ult_grease');assert.equal(f.r.ultSequence.data.targets.length,2);
 }else if(type==='ult_villa_recover'){
 await pg.locator('#uxConfirm').tap();await pg.waitForFunction(()=>pend().selected?.length===1);await pg.locator('#uxRail .card').nth(2).tap();await pg.locator('#uxConfirm').tap();await pg.waitForFunction(()=>pend().selected?.length===2);await pg.locator('#uxBatch').tap();await pg.waitForFunction(()=>pend()?.type!=='ult_villa_recover');assert.equal(f.p.exile.filter(c=>c==='weapon').length,0);
 }else if(type==='draft'){
 assert.equal(await pg.locator('#uxRail .rarity-UR .urShine').count(),f.r.pending.fx0.options.filter(o=>o.id.startsWith('take:') && G.publicState(f.r,'fx0').catalog.CREATURES[o.id.slice(5)]?.rarity==='UR').length);await pg.locator('#uxConfirm').tap();await pg.waitForFunction(()=>pend()?.type!=='draft');assert(f.p.cardsCollected>0);
 }else {await pg.locator('#uxBack').tap();assert(!await pg.locator('#uxPickDialog').evaluate(e=>e.open));}
 // Close any reveal / ultimate animation before loading the next scenario.
 await pg.evaluate(()=>{clearTimeout(revealT);revealQueue=[];revealCurrent=null;$('drawModal').classList.remove('on');clearTimeout(phoneUltT);$('phoneUlt').classList.remove('on');if(window.UltFxWorld)UltFxWorld.stop();});
 reports.push({width,type,passed:true});console.log('PASS',width,type);
 }
 await pg.close();}

 const retry=await browser.newPage({viewport:{width:667,height:375}});retry.on('pageerror',e=>errors.push(e.message));
 const ev=fixture('spell_evolve');await retry.goto(base+'/phone?guide=done');await retry.evaluate(s=>{room='PICK';pid='fx0';state=s;$('join').style.display='none';document.body.classList.add('ingame');render();connect();},G.publicState(ev.r,'fx0'));
 await retry.locator('#uxRail .card').first().click();const before=ev.p.gold;await retry.locator('#uxBack').click();assert.equal(ev.p.gold,before);await retry.locator('#uxClose').click();await retry.waitForFunction(()=>pend()?.type!=='spell_evolve');assert.equal(ev.p.gold,before);
 const shop=fixture('market');shop.p.gold=1;await retry.evaluate(s=>{es.close();state=s;render();connect();},G.publicState(shop.r,'fx0'));await retry.locator('#shopShelf .shopProduct:not(.sold)').first().click();assert(await retry.locator('#shopBuy').isDisabled());await retry.locator('#shopCancel').click();
 const reconnect=fixture('frontline_swap');await retry.evaluate(s=>{es.close();state=s;render();connect();},G.publicState(reconnect.r,'fx0'));await retry.locator('#uxRail .card').first().click();
 let actionCount=0;await retry.route('**/api/action',async route=>{const b=route.request().postDataJSON();if(b?.type==='choose'){actionCount++;if(actionCount===1)return route.fulfill({status:503,body:'unavailable'});}return route.continue();});
 await retry.locator('#uxConfirm').click();await retry.waitForFunction(()=>!sharedCardPicker.busy);assert.equal(reconnect.p.gold,1000);assert(await retry.locator('#uxPickDialog').evaluate(e=>e.open));assert.match(await retry.locator('#uxPickEffect').innerText(),/通信/);await retry.locator('#uxConfirm').click();await retry.waitForFunction(()=>pend()?.type!=='frontline_swap');assert.equal(reconnect.p.gold,950);assert.equal(actionCount,2);
 // Same prompt after reconnection preserves the available choices; a new prompt closes stale detail.
 const rec=fixture('spell_evolve');await retry.evaluate(s=>{es.close();state=s;render();connect();},G.publicState(rec.r,'fx0'));await retry.locator('#uxRail .card').first().click();await retry.evaluate(()=>{es.close();connect();});await retry.waitForTimeout(200);assert(await retry.locator('#uxPickDialog').evaluate(e=>e.open));
 G.handleChoose(rec.r,'fx0','ev:cancel');await retry.evaluate(s=>{state=s;render();},G.publicState(rec.r,'fx0'));assert(await retry.locator('#uxPicker').isHidden());assert(!await retry.locator('#uxPickDialog').evaluate(e=>e.open));await retry.close();console.log('PASS cancel, insufficient funds, retry and reconnect');
 fs.writeFileSync('output/ui-integration/picker-verification.json',JSON.stringify(reports,null,2));console.log('PASS 14 card-selection flows at two landscape sizes');
 const board=await browser.newPage({viewport:{width:1600,height:900}});board.on('pageerror',e=>errors.push(e.message));await board.goto(base+'/play?fixture=1&guide=done');await board.waitForFunction(()=>state?.catalog);
 const rr=G.makeFixtureRoom();rr.pending={};rr.owners.fill(null);rr.tileFx={};rr.players[0].blade=true;rr.owners[3]={player:'fx1',creature:'nome',level:1};rr.elemOv[3]='fire';rr.owners[4]={player:'fx1',creature:'qbaby',level:3};rr.owners[3].iceWard=true;rr.tileFx[3]={vortex:true,uplift:true};rr.battle={attacker:'fx0',defender:'fx1',tile:3,atkCreature:'gecko',mioUlt:true,supports:{},startedAt:123};
 const bp=G.publicBattle(rr);assert.equal(bp.externalModifiers.attacker.length,3);assert.equal(bp.externalModifiers.defender.length,3);
 await board.evaluate(({bp,s})=>{state=s;activeBattleKey=null;battlePlayingKey=null;renderBattlePreview(bp);$('battle').classList.add('on');},{bp,s:G.publicState(rr,null)});await board.waitForTimeout(1100);await board.screenshot({path:'output/ui-integration/battle.png'});assert.equal(await board.locator('.battleExternalBonus').count(),6);assert.equal(await board.locator('.battleExternalBonus[title="バーンゲッコー"]').count(),0);assert.deepEqual(errors,[]);
 for(const width of [1600,1280]){await board.setViewportSize({width,height:width===1600?900:720});await board.evaluate(()=>{for(const id of ['bAtkDetail','bDefDetail'])$(id).querySelector('.bdMods').innerHTML=Array.from({length:7},()=>'<span>戦闘補正の確認用メッセージ</span>').join('');});await board.waitForTimeout(100);const bounds=await board.locator('.battleExternalRack').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),d=e.closest('.battleTeam').querySelector('.battleDetail').getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&(r.right<=d.left||r.left>=d.right||r.bottom<=d.top||r.top>=d.bottom);}));assert(bounds.every(Boolean));}await board.emulateMedia({reducedMotion:'reduce'});assert.equal(await board.locator('.battleExternalBonus').first().evaluate(e=>getComputedStyle(e).animationName),'none');console.log('PASS external only battle sources and board layout');
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
