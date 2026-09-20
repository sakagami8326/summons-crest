const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=__dirname,src=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval',src+';return {server,makeFixtureRoom,publicState,CHARS};')(require,root,()=>0);
(async()=>{let browser;try{
await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/deck-overview-integration',{recursive:true});
const errors=[];
for(const width of [844,667]){
const page=await browser.newPage({viewport:{width,height:390},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/phone?guide=done');
const r=G.makeFixtureRoom(),p=r.players[0];r.lastEvent=r.lastBattle=r.lastUlt=r.lastGain=r.lastDraw=null;r.pending={};r.owners.fill(null);p.resolving=[];p.pickCards=[];p.charId='grease';p.hand=['nome','nome','jaki_f','sp_gold','weapon'];p.deck=Array(18).fill('shield');p.discard=['nome','sp_evolve'];p.exile=['sp_quake','jinx'];
await page.evaluate(s=>{room='DECK';pid='fx0';state=s;$('join').style.display='none';['hdr','msg','action','handWrap'].forEach(id => document.getElementById(id).style.display = '');document.body.classList.add('ingame');syncHasArt();render();},G.publicState(r,p.id));
await page.locator('#deckBtn').tap();await page.waitForSelector('#deckOv.on .overviewCard');await page.waitForTimeout(300);
assert.equal(await page.locator('#deckOv .overviewCard').count(),27);assert.equal(await page.locator('#deckOv [data-card="nome"]').count(),3);assert.equal(await page.locator('#deckOv .copyCount').count(),0);assert.equal(await page.locator('.overviewExile .overviewCard').count(),2);
assert.deepEqual(await page.locator('#deckOv .kindCounts b').allTextContents(),['4','2','19','2']);
assert.deepEqual(await page.locator('#deckOv img').evaluateAll(imgs=>imgs.filter(x=>!x.complete||!x.naturalWidth).map(x=>x.src)),[]);
assert(await page.locator('#deckOv .overviewHeader').evaluate(e=>e.scrollWidth<=e.clientWidth));
assert(await page.locator('#deckScroll').evaluate(e=>e.scrollWidth===e.clientWidth));
await page.screenshot({path:`output/deck-overview-integration/deck-${width}.png`});
await page.locator('.overviewExile').scrollIntoViewIfNeeded();await page.screenshot({path:'output/deck-overview-integration/exile-'+width+'.png'});await page.locator('.overviewExile .overviewCard').first().tap();assert(await page.locator('#cardZoomAction').isHidden());await page.locator('#cardZoomClose').tap();
await page.locator('#deckOv [data-card="jaki_f"]').tap();assert(await page.locator('#cardZoomAction').isHidden());assert.match(await page.locator('#cardZoomDetail').innerText(),/アシュラカン/);await page.locator('#cardZoomClose').tap();assert(await page.locator('#deckOv').isVisible());
await page.locator('#deckScroll').evaluate(e=>e.scrollTop=120);const scroll=await page.locator('#deckScroll').evaluate(e=>e.scrollTop);await page.evaluate(()=>render());assert.equal(await page.locator('#deckScroll').evaluate(e=>e.scrollTop),scroll);
p.hand.push('sp_gold');p.exile.push('weapon');await page.evaluate(s=>{state=s;render();},G.publicState(r,p.id));assert.equal(await page.locator('#deckOv .overviewCard').count(),29);assert.deepEqual(await page.locator('#deckOv .kindCounts b').allTextContents(),['4','3','19','3']);
// Moving existing cards among hand, board, draw candidates and resolving must not change totals.
const before=await page.locator('#deckOv .overviewCard').count();
p.hand.splice(p.hand.indexOf('nome'),1);r.owners[1]={player:p.id,creature:'nome',level:1};
await page.evaluate(s=>{state=s;render();},G.publicState(r,p.id));assert.equal(await page.locator('#deckOv .overviewCard').count(),before);
r.owners[1]=null;p.discard.push('nome');await page.evaluate(s=>{state=s;render();},G.publicState(r,p.id));assert.equal(await page.locator('#deckOv .overviewCard').count(),before);
p.pickCards=p.deck.splice(0,2);p.resolving=[p.hand.splice(p.hand.indexOf('sp_gold'),1)[0]];await page.evaluate(s=>{state=s;render();},G.publicState(r,p.id));assert.equal(await page.locator('#deckOv .overviewCard').count(),before);
assert.equal(G.publicState(r,r.players[1].id).players.find(x=>x.id===p.id).inventoryList,undefined);assert.equal(G.publicState(r,null).players.find(x=>x.id===p.id).inventoryList,undefined);
p.discard.push(...p.pickCards,...p.resolving);p.pickCards=[];p.resolving=[];
await page.evaluate(s=>{state=s;render();},G.publicState(r,p.id));assert.equal(await page.locator('#deckOv .overviewCard').count(),before);
await page.locator('#deckClose').tap();assert(await page.locator('#deckOv').isHidden());await page.evaluate(()=>openCardZoom('sp_gold'));assert.equal(await page.locator('#cardZoom').getAttribute('data-read-only'),'false');assert(await page.locator('#cardZoomAction').isVisible());await page.locator('#cardZoomClose').tap();
await page.locator('#deckBtn').tap();for(const char of Object.keys(G.CHARS).filter(id=>fs.existsSync(path.join(root,'public/assets/hud_'+id+'.png')))){p.charId=char;await page.evaluate(s=>{state=s;render();},G.publicState(r,p.id));await page.locator('#deckOv .summonerCrop img').evaluate(img=>img.decode());}
p.hand=[];p.deck=[];p.discard=[];p.exile=[];await page.evaluate(s=>{state=s;render();},G.publicState(r,p.id));assert.equal(await page.locator('#deckOv .overviewCard').count(),0);assert.deepEqual(await page.locator('#deckOv .kindCounts b').allTextContents(),['0','0','0','0']);await page.locator('#deckClose').tap();await page.close();console.log('PASS deck overview',width,'duplicates, exile, evolved detail, refresh, close, hand action, portraits, empty');
}
assert.deepEqual(errors,[]);
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
