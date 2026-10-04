'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {CHARS,RULES,makeFixtureRoom,tilesOf,upCost,upCostTo,upCostRange,askUpgrade,handleChoose};')(require,__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
G.CHARS.future_neutral={...G.CHARS.noir,elem:'neutral'};
for(const map of ['starting_corridor','twin_gate_cavern']){
 const r=G.makeFixtureRoom();r.mapId=map;r.owners=G.tilesOf(r).map(()=>null);r.elemOv={};
 const p=r.players[0];p.charId='noir';
 for(const element of ['fire','water','earth','wind','neutral']){
  const i=G.tilesOf(r).findIndex(t=>t.t==='land');r.elemOv[i]=element;r.owners[i]={player:p.id,creature:'cleo',level:1,dmg:0};
  for(const id of ['noir','future_neutral']){p.charId=id;eq([2,3,4].map(l=>G.upCostTo(r,p,i,l)),[90,405,855],id+' every level, '+element);eq(G.upCost(r,p,i),90,'next level');eq(G.upCostRange(r,p,i,4),1350,'multi-level total');r.owners[i].level=2;eq(G.upCostRange(r,p,i,4),1260,'Lv2→4');r.owners[i].level=1;}
  for(const id of ['redani','linnei','grease','mio','lia','adel','villa','nerasio']){p.charId=id;const matched=element===G.CHARS[id].elem;eq([2,3,4].map(l=>G.upCostTo(r,p,i,l)),matched?[80,360,760]:[100,450,950],id+' existing affinity preserved');}
 }
}
for(const gold of [89,90,1350]){
 const r=G.makeFixtureRoom(),p=r.players[0],i=G.tilesOf(r).findIndex(t=>t.t==='land');r.phase='playing';r.turn=0;r.turnEpoch=1;r.turnReadyAt=0;r.pending={};r.owners.fill(null);p.charId='noir';p.gold=gold;p.bankrupt=false;r.owners[i]={player:p.id,creature:'cleo',level:1,dmg:0};
 G.askUpgrade(r,p,'自領地');const option=r.pending[p.id]?.options.find(o=>o.id==='up:'+i);
 eq(!!option,gold>=90,'affordability boundary '+gold);
 if(option){assert.match(option.label,/無属性-10%/);G.handleChoose(r,p.id,option.id);assert.match(r.pending[p.id].options.find(o=>o.id==='ul:'+i+':2').label,/90G/);G.handleChoose(r,p.id,'ul:'+i+':'+(gold===1350?4:2));eq(p.gold,0,'actual deduction');eq(r.owners[i].level,gold===1350?4:2,'actual level');}
}
console.log('PASS neutral 10% across both maps, all levels/elements, future summoners, affinity preservation, affordability and actual choices:',checks);
