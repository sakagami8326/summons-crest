const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=process.cwd(),out=path.join(root,'output/sale-route-fix');fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,rooms,makeFixtureRoom,settleAll,landValue,TILES,publicState};')(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
(async()=>{let browser;try{
await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
for(const [width,mode] of [[844,'recover'],[667,'bankrupt'],[844,'retry'],[667,'sse'],[844,'stale']]){
 const r=G.makeFixtureRoom(),p=r.players[0];r.code=('SELL'+width+mode).toUpperCase();r.turn=0;r.turnReadyAt=0;r.pending={};r.turnTransition=r.windSupply=r.shopVisit=null;r.owners.fill(null);r.tileFx={};r.curses={};r.titles={conqueror:null,pilgrim:null};
 for(const key of Object.keys(r))if(key.startsWith('last'))r[key]=null;
 r.players.forEach(q=>{q.gold=1000;q.bankrupt=false;});p.hand=['nome'];p.deck=['weapon','shield'];
 const lands=G.TILES.map((t,i)=>t.e?i:-1).filter(i=>i>=0).slice(0,2);for(const i of lands)r.owners[i]={player:p.id,creature:'nome',level:1};
 const first=Math.round(G.landValue(r,lands[0])*.7);r.owners[lands[0]]=null;const second=Math.round(G.landValue(r,lands[1])*.7);r.owners[lands[0]]={player:p.id,creature:'nome',level:1};
 p.gold=-(first+(mode==='bankrupt'?second+100:Math.ceil(second/2)));G.settleAll(r);G.rooms.set(r.code,r);
 const page=await browser.newPage({viewport:{width,height:390},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/phone?guide=done');await page.evaluate(code=>{room=code;pid='fx0';$('join').style.display='none';document.body.classList.add('ingame');['hdr','msg','action','handWrap'].forEach(id=>$(id).style.display='');connect();},r.code);
 await page.locator('#mapOv.on .mmT.pickable').first().waitFor();if(mode!=='sse')await page.evaluate(()=>es.close());
 if(mode==='sse')await page.route('**/api/action',async route=>{const old=route.request().postDataJSON()?.promptId;const res=await route.fetch();await page.waitForFunction(old=>pend()?.promptId!==old,old);await route.fulfill({response:res});});
 let fail=mode==='retry';if(fail)await page.route('**/api/action',route=>{if(fail&&route.request().postDataJSON()?.type==='choose'){fail=false;return route.fulfill({status:503,body:'unavailable'});}return route.continue();});
 let stale=mode==='stale';if(stale)await page.route('**/api/action',async route=>{if(stale&&route.request().postDataJSON()?.type==='choose'){stale=false;const body=route.request().postDataJSON();body.promptId='outdated';const res=await route.fetch({postData:body});assert.equal(res.status(),409);return route.fulfill({response:res});}return route.continue();});
 const sell=async()=>{await page.locator('#mapOv.on .mmT.pickable').first().tap();await page.getByRole('button',{name:'ここに決定',exact:true}).tap();await page.waitForFunction(()=>!mapChoiceLock);};
 if(mode==='retry'){const money=p.gold;await sell();assert.equal(p.gold,money);assert(await page.locator('#mapOv').isVisible());assert.match(await page.locator('#mapOvSel').innerText(),/通信/);}
 if(mode==='stale'){const money=p.gold;await sell();assert.equal(p.gold,money);assert(await page.locator('#mapOv').isVisible());assert.equal(await page.locator('#mapOv .mmT.pickable').count(),2);}
 const old=r.pending[p.id].promptId;await sell();assert(p.gold<0);assert.notEqual(r.pending[p.id].promptId,old);assert.equal(r.pending[p.id].type,'sell');assert.equal(r.owners[lands[0]],null);
 assert(await page.locator('#mapOv').isVisible(),'next sale map must stay visible after action response');assert.equal(await page.locator('#mapOv .mmT.pickable').count(),1);
 await page.screenshot({path:path.join(out,'second-sale-'+mode+'-'+width+'.png')});await sell();assert.equal(r.owners[lands[1]],null);
 assert.equal(p.bankrupt,mode==='bankrupt');if(mode!=='bankrupt')assert(p.gold>=0);
 assert.notEqual(r.pending[p.id]?.type,'sell');assert(!await page.locator('#mapOv').isVisible());await page.close();console.log('PASS consecutive sale',mode,width);
}
assert.deepEqual(errors,[]);
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exit(1)});
