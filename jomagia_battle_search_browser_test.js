'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,rooms,makeFixtureRoom,resolveBattle};')(require,__dirname,()=>0,()=>0);
const out=path.join(__dirname,'output/jomagia-battle-search');fs.mkdirSync(out,{recursive:true});
(async()=>{let browser;const errors=[];try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [844,667]){
  const r=G.makeFixtureRoom(),[p,q]=r.players;
  Object.assign(r,{code:'JMG'+width,turn:0,turnEpoch:12,phase:'playing',pending:{},turnReadyAt:0,turnTransition:null,boardSeen:false,deck:['shield','weapon','sp_gold','cleo'],tileFx:{},curses:{},barrier:{},effectQueue:[],effectResume:null});r.owners.fill(null);
  for(const player of r.players)Object.assign(player,{gold:1000,hand:[],deck:[],discard:[],exile:[],battleWins:0,bankrupt:false,cardsCollected:0});
  Object.assign(p,{hand:['joma_f'],pos:21,charId:'noir'});r.elemOv[21]='wind';r.owners[21]={player:q.id,creature:'gecko',level:1,dmg:20};
  r.battle={tile:21,attacker:p.id,defender:q.id,atkCreature:'joma_f',startedAt:1,supports:{[p.id]:{kind:'none'},[q.id]:{kind:'none'}}};
  G.resolveBattle(r);assert.equal(r.pending[p.id].type,'draft');G.rooms.set(r.code,r);
  const page=await browser.newPage({viewport:{width,height:375},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/phone?guide=done');
  await page.evaluate(code=>{room=code;pid='fx0';$('join').style.display='none';document.body.classList.add('ingame');connect();},r.code);
  await page.locator('#uxRail .card[data-option-id="take:shield"]').tap();await page.locator('#uxConfirm').tap();
  await page.waitForFunction(()=>pend()?.type==='card_search');
  const weapon=page.locator('#uxRail .card[data-option-id^="search:deck:"]');await weapon.waitFor({state:'visible'});
  assert.equal(await weapon.count(),1);assert.equal(await weapon.getAttribute('data-c'),'shield');
  assert.equal(p.cardsCollected,1);assert.deepEqual(p.deck,['shield']);
  await page.screenshot({path:path.join(out,'search-'+width+'.png')});
  await weapon.tap();await page.locator('#uxPickDialog[open]').waitFor();
  assert.match(await page.locator('#uxPickName').innerText(),/シールド/);
  await page.locator('#uxConfirm').tap();await page.waitForFunction(()=>me().hand.includes('shield'));
  assert.deepEqual(p.hand,['shield']);assert.deepEqual(p.deck,[]);assert.equal(p.cardsCollected,1);
  assert(!r.draft,'reward only once');assert.equal(await page.evaluate(()=>me().inventoryList.filter(c=>c==='shield').length),1);
  await page.close();console.log('PASS phone battle reward → weapon search → hand, actual API/SSE:',width);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({passed:true,widths:[844,667],errors},null,2));
}finally{await browser?.close();G.server.closeAllConnections();G.server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
