const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{createRequire}=require('module'),{chromium}=require('playwright');
const root=__dirname,out=path.join(root,'output/image-loading-20261016');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,makeFixtureRoom,publicState,MAPS,resolveTile};')(createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
function fixture(mapId='twin_gate_cavern'){
 const r=G.makeFixtureRoom(),map=G.MAPS[mapId];Object.assign(r,{mapId,owners:map.tiles.map(()=>null),pending:{},tolls:[],titles:{},curses:{},tileFx:{},barrier:{},turn:0,turnReadyAt:0,turnTransition:null,passiveNotices:[]});
 for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;r.players.forEach(p=>p.pos=map.castle);return r;
}
const handlers=G.server.listeners('request');G.server.removeAllListeners('request');
G.server.on('request',(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/fixture'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(G.publicState(fixture(u.searchParams.get('map')||undefined),null)));}
 handlers.forEach(fn=>fn(req,res));
});
(async()=>{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base=process.env.ASSET_LOADING_TEST_URL||'http://127.0.0.1:'+G.server.address().port,prefix=process.env.ASSET_LOADING_TEST_URL?'production-':'',b=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
 try{
  for(const scenario of ['normal','late','optimized-error','all-error']){
   const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
   // Live verification uses public assets and a browser-local fixture only.
   // Do not create, join or operate any production room.
   if(process.env.ASSET_LOADING_TEST_URL){
    await p.route('**/*',r=>r.request().method()==='GET'?r.continue():r.abort());
    await p.route('**/api/fixture*',r=>r.fulfill({json:G.publicState(fixture(),null)}));
   }
   if(scenario==='late')await p.route('**/assets/tiles/land-lv4-render-v1.webp',async r=>{await new Promise(done=>setTimeout(done,11500));await r.continue();});
   if(scenario==='optimized-error')await p.route('**/assets/tiles/land-lv4-render-v1.webp',r=>r.abort());
   if(scenario==='all-error')await p.route('**/assets/tiles/land-lv4*',r=>r.abort());
   await p.goto(base+'/play?fixture=1&guide=done',{waitUntil:'domcontentloaded'});
   let fallbackTexture=null;
   if(scenario==='late'){
    assert.equal(await p.evaluate(()=>BoardTiles.ready),false,'bounded initial wait expires');
    await p.waitForFunction(()=>PW.cameraState().ready);assert.equal(await p.evaluate(()=>BoardTiles.loaded),false);
    await p.waitForFunction(()=>PW._debugScene().children.list.some(x=>/^pwTile/.test(x.texture?.key||'')));
    fallbackTexture=await p.evaluate(()=>PW._debugScene().children.list.find(x=>/^pwTile/.test(x.texture?.key||''))?.texture.key);
   }
   await p.waitForFunction(()=>PW.cameraState().ready&&PW._debugScene().children.list.filter(x=>/^pwTile/.test(x.texture?.key||'')).length===33,null,{timeout:20000});
   if(scenario!=='all-error')await p.waitForFunction(()=>BoardTiles.loaded,null,{timeout:20000});
   if(fallbackTexture)await p.waitForFunction(key=>!PW._debugScene().children.list.some(x=>x.texture?.key===key)&&PW._debugScene().children.list.filter(x=>/^pwTile/.test(x.texture?.key||'')).length===33,fallbackTexture,{timeout:10000});
   const checked=await p.evaluate(async()=>{
    await renderBoard();renderBoardDom();
    return {loaded:BoardTiles.loaded,revision:BoardTiles.revision,domRaster:document.querySelectorAll('#stage [data-tile-logo]').length,landCount:state.tiles.filter(t=>t.t==='land').length,textureCount:PW._debugScene().children.list.filter(x=>/^pwTile/.test(x.texture?.key||'')).length};
   });
   assert.equal(checked.loaded,scenario!=='all-error');assert.equal(checked.domRaster,scenario==='all-error'?0:checked.landCount);assert.equal(checked.textureCount,33);assert.deepEqual(errors,[]);
   if(scenario==='late')await p.screenshot({path:path.join(out,prefix+'cavern-late-recovered.png')});
   console.log('PASS tile loading',scenario,JSON.stringify(checked));await p.close();
  }
  for(const [mapId,width,height] of [['starting_corridor',844,390],['twin_gate_cavern',667,375]]){
   const r=fixture(mapId),pl=r.players[0],enemy=r.players[1];pl.charId='lia';pl.pos=mapId==='starting_corridor'?2:15;pl.hand=['gecko'];pl.gold=2000;pl.passiveLiaLanding=true;
   const [healthy,wounded]=G.MAPS[mapId].neighbors[pl.pos];r.owners[healthy]={player:enemy.id,creature:'gecko',level:1,dmg:0};r.owners[wounded]={player:enemy.id,creature:'gecko',level:1,dmg:10};G.resolveTile(r,pl);
   const s=G.publicState(r,pl.id),p=await b.newPage({viewport:{width,height}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.setContent(`<base href="${base}"><link rel="stylesheet" href="/phone-land.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}</style><script src="/map-definitions.js"></script><script src="/phone-land.js"></script>`);
   await p.evaluate(({s,pid})=>{window.landTest=PhoneLandUI.create(document.body,{submit(){},close(){}});landTest.show(s,pid,s.pending[pid]);},{s,pid:pl.id});
   assert(await p.locator(`[data-tile="${healthy}"]`).isDisabled());assert(!(await p.locator(`[data-tile="${wounded}"]`).isDisabled()));
   await p.locator(`[data-tile="${healthy}"]`).evaluate(el=>{el.click();el.onclick();});
   assert.equal(await p.locator('.tile.selected').getAttribute('data-tile'),String(wounded),'invalid tile cannot replace the eligible detail');
   await p.locator(`[data-player="${enemy.id}"]`).click();assert.equal(await p.locator('.tile.selected').getAttribute('data-tile'),String(wounded),'filter selects an eligible land, not its first healthy land');
   assert(await p.locator(`[data-player="${pl.id}"]`).isDisabled());assert(!(await p.getByRole('button',{name:'侵略する',exact:true}).isDisabled()));
   await p.screenshot({path:path.join(out,`${prefix}lia-eligible-only-${width}.png`)});
   await p.evaluate(({s,pid})=>landTest.show(s,pid,null),{s,pid:pl.id});
   assert(!(await p.locator(`[data-tile="${healthy}"]`).isDisabled()));await p.locator(`[data-tile="${healthy}"]`).click();assert.equal(await p.locator('.tile.selected').getAttribute('data-tile'),String(healthy),'ordinary inspection still shows all lands');
   assert.deepEqual(errors,[]);await p.close();console.log('PASS Lia target-only selection and ordinary inspection',mapId,width);
  }
 }finally{await b.close();G.server.closeAllConnections();await new Promise(r=>G.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
