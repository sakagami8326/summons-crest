'use strict';
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {makeFixtureRoom,askUpgrade,handleChoose,publicState,landUpgradeUi,landDefenseStats,tollOf,upCostRange,serializeRoom};')(require,__dirname,()=>0,()=>0);
function fixture(creature='poponga',level=1,char='mio',element='wind',gold=3000){
 const r=G.makeFixtureRoom(),p=r.players[0];r.turn=0;r.turnEpoch=12;r.pending={};r.turnReadyAt=0;r.turnTransition=null;r.phase='playing';r.owners.fill(null);r.tileFx={};r.curses={};r.barrier={};r.lastUpgrade=null;
 Object.assign(p,{charId:char,gold,hand:['cleo'],pos:21,bankrupt:false});r.elemOv[21]=element;r.owners[21]={player:p.id,creature,level,dmg:7};return {r,p};
}
let checks=0;
for(const [char,element,discount] of [['mio','wind',.2],['mio','fire',0],['noir','earth',.1]])for(const creature of ['poponga','poponga_f','weapon']){
 // Weapons cannot own land; use a non-evolving creature in that slot.
 const {r,p}=fixture(creature==='weapon'?'mimic':creature,1,char,element);
 const original=JSON.stringify(r.owners),d=G.landUpgradeUi(r,p,21);
 assert.equal(JSON.stringify(r.owners),original,'projection never changes the live owner');assert.equal(d.discount,discount);
 for(const t of d.levels){assert.equal(t.cost,G.upCostRange(r,p,21,t.level));r.owners[21].level=t.level;assert.equal(t.total,G.landDefenseStats(r,21).total);assert.equal(t.toll,G.tollOf(r,21));r.owners[21].level=1;checks++;}
 G.askUpgrade(r,p,'自領地');G.handleChoose(r,p.id,'up:21');assert.deepEqual(r.pending[p.id].upgrade,d);
 const pending=G.publicState(r,p.id).pending[p.id];assert.equal(pending.upgrade.before.hp,d.before.hp);
 delete r.pending[p.id].upgrade;assert.deepEqual(G.publicState(r,p.id).pending[p.id].upgrade,d,'old saved level-selection prompts receive the new screen');
 G.handleChoose(r,p.id,'ul:21:4');assert.equal(p.gold,3000-d.levels[2].cost);assert.equal(r.owners[21].level,4);assert.equal(r.lastUpgrade.before.level,1);assert.equal(r.lastUpgrade.target,4);
 assert(!('lastUpgrade' in G.serializeRoom(r).room),'a restored game does not replay old upgrade effects');checks++;
}
for(const command of ['ul:back','ul:cancel']){const {r,p}=fixture();G.askUpgrade(r,p,'自領地');G.handleChoose(r,p.id,'up:21');G.handleChoose(r,p.id,command);assert.equal(p.gold,3000);assert.equal(r.owners[21].level,1);assert(!r.lastUpgrade);checks++;}
{const {r,p}=fixture('poponga',1,'mio','wind',80);G.askUpgrade(r,p,'自領地');G.handleChoose(r,p.id,'up:21');const pd=r.pending[p.id];assert.deepEqual(pd.options.filter(o=>o.id.startsWith('ul:21:')).map(o=>o.id),['ul:21:2']);assert.equal(pd.upgrade.levels.filter(t=>t.canPay).length,1);checks++;}
{const {r,p}=fixture('joma');p.deck=['shield'];p.discard=[];r.boardSeen=true;G.askUpgrade(r,p,'自領地');G.handleChoose(r,p.id,'up:21');G.handleChoose(r,p.id,'ul:21:3');assert(r.turnReadyAt>Date.now());assert.equal(r.pending[p.id]?.type,'card_search');assert.equal(r.pending[p.id].availableAt,r.turnReadyAt,'evolution placement choices wait for the board cinematic');checks++;}
console.log('PASS upgrade projection, discounts, actual payment, cancellation, affordability, runtime persistence and evolution gating:',checks);
