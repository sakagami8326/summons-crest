const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),out=path.join(root,'output/new-cards-integration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,makeFixtureRoom,rooms,askRoll,handleChoose,broadcast,resolveBattle};')(require('module').createRequire(path.join(root,'server.js')),root,()=>0,()=>0);
function fixture(code){const r=G.makeFixtureRoom(),p=r.players[0];Object.assign(r,{code,turn:0,turnEpoch:12,turnReadyAt:0,turnTransition:null,pending:{},windSupply:null,shopVisit:null,tileFx:{},curses:{},barrier:{},elemOv:{},titles:{conqueror:null,pilgrim:null}});r.owners.fill(null);for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;r.players.forEach(q=>{q.gold=2000;q.bankrupt=false;q.spellCount=0;q.spellCast=false});G.rooms.set(code,r);return {r,p};}
(async()=>{let browser;const errors=[];try{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
 const watch=page=>page.on('pageerror',e=>errors.push(e.message));
 const site=await browser.newPage({viewport:{width:1440,height:900}});watch(site);await site.goto(base+'/cards');await site.locator('.site-audio-gate [data-audio="off"]').click();
 for(const[id,name]of[['sp_chain_gold','チェインゴールド'],['sp_mana_forge','マナフォージ'],['onitsugi','鬼継ノ太刀']]){
  await site.locator('[name=query]').fill(name);const card=site.locator('[data-card-id="'+id+'"]');await card.waitFor();await site.waitForFunction(id=>[...document.querySelectorAll('[data-card-id="'+id+'"] img')].every(e=>e.complete&&e.naturalWidth>0),id);
  await card.locator('[data-open-card]').click();await site.locator('dialog[open]').waitFor();await site.evaluate(()=>Promise.all(document.querySelector('.card-dialog').getAnimations().map(a=>a.finished)));await site.waitForFunction(()=>getComputedStyle(document.querySelector('.card-dialog')).opacity==='1');await site.screenshot({path:path.join(out,'site-'+id+'.png')});await site.locator('[data-dialog-close]').click();
 }
 await site.close();
 for(const[width,height]of[[844,390],[667,375]]){
  const{r,p}=fixture('NEW'+width);p.hand=['sp_chain_gold','sp_mana_forge','onitsugi','nome'];r.owners[21]={player:p.id,creature:'nome',level:1};G.askRoll(r,p);
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});watch(page);await page.goto(base+'/phone?guide=done');await page.evaluate(({code,id})=>{room=code;pid=id;enterGame();},{code:r.code,id:p.id});await page.waitForFunction(()=>state?.catalog?.SUPPORTS?.onitsugi);
  for(const id of ['sp_chain_gold','sp_mana_forge','onitsugi']){
   await page.evaluate(id=>{const old=document.querySelector('#qaCard');old?.remove();const host=document.createElement('div');host.id='qaCard';host.style='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#101521';host.innerHTML='<div style="position:relative;height:92dvh;aspect-ratio:300/470">'+bigCardHTML(id)+'</div>';document.body.append(host);fitCreatureNames(host);},id);
   await page.waitForFunction(()=>[...document.querySelectorAll('#qaCard img')].every(e=>e.complete&&e.naturalWidth));
   assert(!await page.locator('#qaCard .face').evaluate(e=>cardTextOverflows(e)),id+' text fits '+width);
   if(id==='onitsugi'){
    const bounds=await page.locator('#qaCard .face').evaluate(face=>{const img=face.querySelector('.suArt img'),f=face.getBoundingClientRect(),i=img.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(img).transform);return {s:m.a,angle:m.b,l:(i.left-f.left+i.width*102/1024)/f.width,r:(i.left-f.left+i.width*924/1024)/f.width,t:(i.top-f.top+i.height*182/1536)/f.height,b:(i.top-f.top+i.height*1318/1536)/f.height,art:+getComputedStyle(img.parentElement).zIndex,text:+getComputedStyle(face.querySelector('.suText')).zIndex}});
    assert.equal(bounds.s,1.5);assert.equal(bounds.angle,0);assert(bounds.l>0&&bounds.r<1&&bounds.t>0&&bounds.b<1,JSON.stringify(bounds));assert(bounds.text>bounds.art);
   }
   await page.screenshot({path:path.join(out,'phone-'+id+'-'+width+'.png')});
  }
  await page.locator('#qaCard').evaluate(e=>e.remove());await page.evaluate(()=>choose('sp:sp_mana_forge'));await page.waitForFunction(()=>pend()?.type==='mana_forge');await page.locator('#uxPicker').waitFor({state:'visible'});await page.screenshot({path:path.join(out,'phone-mana-choice-'+width+'.png')});
  await page.locator('#uxClose').click();await page.waitForFunction(()=>pend()?.type==='roll');
  await page.evaluate(()=>choose('sp:sp_mana_forge'));await page.waitForFunction(()=>pend()?.type==='mana_forge');await page.locator('#uxRail [data-option-id]').first().click();await page.locator('#uxConfirm').click();await page.waitForFunction(()=>pend()?.type==='roll');assert(p.deck.includes('weapon')&&p.deck.includes('shield'));assert(p.exile.includes('nome'));await page.close();
 }
 const{r,p}=fixture('NEWBOARD');const board=await browser.newPage({viewport:{width:1440,height:900}});watch(board);await board.goto(base+'/play?guide=done');await board.evaluate(({code,token})=>{$('titleOv').classList.remove('on');enterRoom(code,location.origin+'/phone?room='+code,token)},{code:r.code,token:r.boardToken});await board.waitForFunction(()=>state?.catalog?.SUPPORTS?.onitsugi);
 await board.evaluate(()=>{mountExistingGameCards(state);const el=document.createElement('div');el.id='qaBoard';el.style='position:fixed;inset:0;z-index:99999;display:flex;gap:30px;align-items:center;justify-content:center;background:#101521';el.innerHTML=['sp_chain_gold','sp_mana_forge','onitsugi'].map(id=>'<review-game-card style="width:300px;height:470px" card-id="'+id+'"></review-game-card>').join('');document.body.append(el)});
 await board.waitForFunction(()=>[...document.querySelectorAll('#qaBoard review-game-card')].every(e=>e.shadowRoot?.querySelector('img')?.complete));await board.screenshot({path:path.join(out,'board-three-cards.png')});assert.equal(await board.locator('#qaBoard review-game-card').count(),3);await board.close();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,checks:['native phone text and saved art bounds at 844/667','mana sacrifice/cancel through normal API','site three card details','board shared cards','no JS errors']},null,2));console.log('PASS new cards browser: phone 844/667, selection/cancel/cast, website, board shared cards, art bounds and text layers');
}finally{await browser?.close();await new Promise(resolve=>G.server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1});
