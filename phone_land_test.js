const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {makeFixtureRoom,publicState,landDefenseStats,landValue,askUpgrade,askLiaUlt,askNerasioUlt,handleChoose,settleAll};')(require,__dirname,()=>0,()=>0);
const box={window:{}};vm.runInNewContext(fs.readFileSync('public/phone-land.js','utf8'),box);const UI=box.window.PhoneLandUI;
function fixture(){const r=G.makeFixtureRoom(),p=r.players[0];r.pending={};r.turn=0;r.turnReadyAt=0;r.turnTransition=null;r.windSupply=null;r.barrier={};r.tileFx={};r.curses={};r.players.forEach(p=>{p.gold=1600;p.bankrupt=false;});return {r,p};}
function model(r,p,tile){const s=G.publicState(r,p.id);return UI.decisionModel(s,p.id,s.pending[p.id],tile);}
function choosePrimary(r,p,tile){const a=model(r,p,tile).actions[0];assert(!a.disabled);G.handleChoose(r,p.id,a.id);}
{
 const {r,p}=fixture();for(const [card,level] of [['nome',1],['nome',3],['nome_f',1],['beruf',2]]){
  r.owners[1]={player:p.id,creature:card,level,dmg:5};r.curses[1]={hp:10};
  const s=G.publicState(r,p.id),expected={...G.landDefenseStats(r,1),saleValue:Math.round(G.landValue(r,1)*.7)};
  assert.deepEqual(s.landStats[1],expected,'details use the shared battle calculation');
 }
 const s=G.publicState(r,p.id);assert.equal(s.landRules.gateBonus,200);
 for(const q of s.players.filter(q=>q.id!==p.id)){assert.deepEqual(q.hand,[]);assert.equal(q.inventoryList,undefined);assert.equal(q.deckList,undefined);}
 assert.deepEqual(Array.from(UI.decisionModel(s,p.id,null,1).actions),[],'inspection has no choice actions');
 r.mapId='twin_gate_cavern';r.owners=Array(33).fill(null);assert.equal(G.publicState(r,p.id).landRules.gateBonus,100);
}
{
 const {r,p}=fixture();G.askUpgrade(r,p,'自領地');const target=+Object.keys(UI.tileTargets(r.pending[p.id]))[0];
 assert(model(r,p,0).actions[0].disabled,'events cannot accidentally submit a land choice');
 choosePrimary(r,p,target);assert.equal(r.pending[p.id].type,'upgrade_lv');
 const option=r.pending[p.id].options.find(o=>o.id.startsWith('ul:'));assert(option);G.handleChoose(r,p.id,option.id);
 assert.equal(r.owners[target].level,+option.id.split(':')[2]);
}
for(const [char,type,start,prefix,max] of [['lia','ult_lia',G.askLiaUlt,'lu',3],['nerasio','ult_nerasio_land',G.askNerasioUlt,'nu',2]]){
 const {r,p}=fixture();p.charId=char;start(r,p,[]);const tiles=Object.keys(UI.tileTargets(r.pending[p.id])).map(Number);
 for(const i of tiles.slice(0,max))choosePrimary(r,p,i);
 assert.equal(r.pending[p.id].selected.length,max);assert(model(r,p,tiles[max]).actions[0].disabled);
 choosePrimary(r,p,tiles[0]);assert.equal(r.pending[p.id].selected.length,max-1);
 const confirm=model(r,p,tiles[1]).actions.find(a=>a.id===prefix+':confirm');assert(confirm);G.handleChoose(r,p.id,confirm.id);
 assert.notEqual(r.pending[p.id]?.type,type);
}
{
 const {r,p}=fixture();r.owners.fill(null);r.titles={conqueror:null,pilgrim:null};
 r.owners[1]={player:p.id,creature:'nome',level:1};r.owners[2]={player:p.id,creature:'nome',level:1};p.gold=-150;G.settleAll(r);
 assert.equal(r.pending[p.id].type,'sell');assert.equal(model(r,p,1).actions.length,1,'forced sale offers no cancel');
 choosePrimary(r,p,1);assert.equal(r.pending[p.id].type,'sell');assert(p.gold<0);assert.equal(r.owners[1],null);
 choosePrimary(r,p,2);assert.equal(p.gold,18);assert.notEqual(r.pending[p.id]?.type,'sell');
}
{
 const {r,p}=fixture();r.owners[7]={player:p.id,creature:'marlow',level:1};r.owners[9]=null;G.askUpgrade(r,p,'自領地');
 const move=model(r,p,7).actions.find(a=>a.id==='marlow:move');assert(move);G.handleChoose(r,p.id,move.id);
 assert.equal(r.pending[p.id].type,'marlow_src');choosePrimary(r,p,7);assert.equal(r.pending[p.id].type,'marlow_dest');
 const dest=+Object.keys(UI.tileTargets(r.pending[p.id]))[0];choosePrimary(r,p,dest);
 assert.equal(r.owners[7],null);assert.equal(r.owners[dest].creature,'marlow');
}
console.log('PASS phone land: authoritative stats, evolution, privacy, map rules, upgrade, multi-selection, continuous sale and Marlow movement');
