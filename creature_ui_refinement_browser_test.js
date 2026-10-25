'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/creature-ui-refinement');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,askUpgrade,handleChoose,publicState,broadcast,CREATURES};')(require,root,()=>0,()=>0);
function fixture(code){const r=G.makeFixtureRoom(),p=r.players[0];Object.assign(r,{code,turn:0,turnEpoch:12,turnReadyAt:0,turnTransition:null,pending:{},windSupply:null,shopVisit:null,tileFx:{},curses:{},barrier:{},elemOv:{},titles:{conqueror:null,pilgrim:null}});r.owners.fill(null);for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;r.players.forEach(q=>{q.gold=2000;q.bankrupt=false;});G.rooms.set(code,r);return{r,p};}
const pairs={nome:['+10','+20'],qbaby:['+10','+20'],kbaby:['1.5倍','2倍'],barbaro:['30G','50G'],bonerex:['+10','+20'],morbill:['-10','-20']};
(async()=>{let browser;const errors=[];try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
 const watch=page=>page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height]of[[844,390],[667,375]]){
  const{r,p}=fixture('MARLOW'+width);p.pos=21;r.owners[21]={player:p.id,creature:'nome',level:1};r.owners[7]={player:p.id,creature:'marlow',level:2};r.owners[9]={player:p.id,creature:'marlow',level:1};r.owners[10]={player:r.players[1].id,creature:'marlow',level:1};
  G.askUpgrade(r,p,'自領地');G.handleChoose(r,p.id,'marlow:move');
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});watch(page);
  await page.goto(base+'/phone?guide=done');await page.evaluate(({code,id})=>{room=code;pid=id;enterGame();},{code:r.code,id:p.id});await page.locator('#phoneLand:not([hidden])').waitFor();
  async function targets(){return page.locator('#phoneLand .tile.eligible').evaluateAll(es=>es.map(e=>+e.dataset.tile));}
  async function assertGuidance(){assert(await page.locator('#phoneLand .tile:not(.eligible)').evaluateAll(es=>es.every(e=>e.classList.contains('muted')&&e.disabled)));assert.equal(await page.locator('#phoneLand .playerHighlight').count(),0);assert.equal(await page.locator('#phoneLand .playerFilter:not(:disabled)').count(),0);}
  assert.deepEqual(await targets(),[7,9]);await assertGuidance();await page.screenshot({path:path.join(out,'marlow-source-'+width+'.png')});
  await page.locator('#phoneLand [data-tile="7"]').tap();await page.locator('#phoneLand [data-land-action="ms:7"]').tap();
  await page.waitForFunction(()=>pend()?.type==='marlow_dest'&&!mapChoiceLock);
  const destinations=r.pending[p.id].options.filter(o=>/^md:\d+$/.test(o.id)).map(o=>+o.id.split(':')[1]);assert(destinations.length);assert(destinations.every(i=>r.owners[i]==null&&G.publicState(r,p.id).tiles[i].e==='wind'));
  assert.deepEqual(await targets(),destinations);await assertGuidance();await page.screenshot({path:path.join(out,'marlow-destination-'+width+'.png')});
  await page.getByRole('button',{name:'やめる',exact:true}).tap();await page.waitForFunction(()=>pend()?.type==='upgrade'&&!mapChoiceLock);assert.equal(r.owners[7].creature,'marlow');
  await page.getByRole('button',{name:'風渡り',exact:true}).tap();await page.waitForFunction(()=>pend()?.type==='marlow_src'&&!mapChoiceLock);
  await page.locator('#phoneLand [data-tile="9"]').tap();await page.locator('#phoneLand [data-land-action="ms:9"]').tap();await page.waitForFunction(()=>pend()?.type==='marlow_dest'&&!mapChoiceLock);
  const dest=destinations[0];await page.locator('#phoneLand [data-tile="'+dest+'"]').tap();await page.locator('#phoneLand [data-land-action="md:'+dest+'"]').tap();await page.waitForFunction(()=>!mapChoiceLock&&state.turn!==0);assert.equal(r.owners[9],null);assert.equal(r.owners[dest].creature,'marlow');
  // Both the physical card face and its readable detail use the same form-specific text.
  for(const[id,[normal,evolved]]of Object.entries(pairs)){
   await page.evaluate(id=>{galleryEvo=false;galleryIds=[];openGalleryDetail(id);},id);
   assert((await page.locator('#galZoomCard').innerText()).includes(normal));assert((await page.locator('#galZoomInfo .galAbilityText').innerText()).includes(normal));assert(!/進化[+後-]/.test(await page.locator('#galZoomCard').innerText()));
   await page.locator('#galZoomInfo [data-mode="evo"]').tap();assert((await page.locator('#galZoomCard').innerText()).includes(evolved));assert((await page.locator('#galZoomInfo .galAbilityText').innerText()).includes(evolved));
   if(id==='qbaby')await page.screenshot({path:path.join(out,'phone-queen-'+width+'.png')});await page.evaluate(()=>$('galZoom').classList.remove('on'));
  }
  await page.close();console.log('PASS Marlow source/destination highlights, cancel/move, six card families on phone',width);
 }
 const site=await browser.newPage({viewport:{width:1440,height:900}});watch(site);await site.goto(base+'/cards');await site.locator('.site-audio-gate [data-audio="off"]').click();
 for(const[id,[normal,evolved]]of Object.entries(pairs)){
  await site.locator('[name="query"]').fill(G.CREATURES[id].name);const card=site.locator('[data-card-id="'+id+'"]');await card.waitFor();
  if(await card.locator('[data-evolution="base"]').getAttribute('aria-pressed')!=='true')await card.locator('[data-evolution="base"]').click();assert((await card.textContent()).includes(normal),id+': '+await card.textContent());assert(!(await card.textContent()).includes('進化+'));
  await card.locator('[data-evolution="evolution"]').click();assert((await card.textContent()).includes(evolved),id+': '+await card.textContent());
 }
 await site.screenshot({path:path.join(out,'site-evolved.png')});await site.close();console.log('PASS six card families on homepage');
 for(const mode of ['phaser']){
  const{r,p}=fixture('SUMMON'+mode.toUpperCase());p.pos=21;r.players[1].pos=21;r.players[2].pos=2;r.players[3].pos=3;r.owners[21]={player:p.id,creature:'qbaby',level:1};
  const page=await browser.newPage({viewport:{width:1440,height:900}});watch(page);
  await page.goto(base+'/play?guide=done');await page.evaluate(({code,token})=>{$('titleOv').classList.remove('on');enterRoom(code,location.origin+'/phone?room='+code,token);},{code:r.code,token:r.boardToken});
  await page.waitForFunction(()=>state?.catalog&&boardPresentationIdle()&&(renderModeActive!=='phaser'||PW.isReady()),null,{timeout:60000});
  for(const[id,[normal,evolved]]of Object.entries(pairs))assert(await page.evaluate(({id,normal,evolved})=>summonCardHTML(id).includes(normal)&&summonCardHTML(id+'_f').includes(evolved),{id,normal,evolved}));
  await page.evaluate(()=>{window.summonDone=false;window.summonError='';playSummonPresentation(21,state.owners[21],structuredClone(state)).catch(e=>summonError=e.message).finally(()=>summonDone=true);});
  await page.waitForFunction(()=>summonPawnMask?.ids.length===2,null,{timeout:20000});
  assert(await page.evaluate(()=>boardPawnAlpha('fx0')===.015&&boardPawnAlpha('fx1')===.015&&boardPawnAlpha('fx2')===1));
  await page.evaluate(()=>{render();renderPawns();});
  assert(await page.evaluate(()=>{const s=PW._debugScene();return s.children.list.filter(o=>['pw_'+state.players[0].charId,'pw_'+state.players[1].charId].includes(o.texture?.key)&&o.alpha===.015).length>=2;}));
  await page.waitForFunction(()=>summonPawnMask&&!placementHiddenTiles.has(21)&&PW._debugScene().children.list.some(o=>o.texture?.key==='pwCre_c_qbaby'&&o.visible&&o.alpha>.8),null,{timeout:15000});
  await page.screenshot({path:path.join(out,'summon-'+mode+'.png')});
  await page.waitForFunction(()=>summonDone,null,{timeout:30000});assert.equal(await page.evaluate(()=>summonError),'');assert(await page.evaluate(()=>summonPawnMask===null&&state.players.every(p=>boardPawnAlpha(p.id)===1)));
  // A camera interruption must also restore opacity.
  await page.evaluate(()=>{window.summonDone=false;playSummonPresentation(21,state.owners[21],structuredClone(state)).finally(()=>summonDone=true);});await page.waitForFunction(()=>!!summonPawnMask,null,{timeout:20000});await page.setViewportSize({width:1280,height:720});await page.waitForFunction(()=>summonDone,null,{timeout:30000});assert(await page.evaluate(()=>summonPawnMask===null&&boardPawnAlpha('fx0')===1));
  await page.close();console.log('PASS summon overlapping pawns, redraw, completion/interruption restore and form-specific board cards',mode);
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1);});
