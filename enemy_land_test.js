const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {makeFixtureRoom,resolveTile,publicState,landDefenseStats,calculateBattle,CREATURES};')(require,__dirname,()=>0,()=>0);
const r=G.makeFixtureRoom();r.turn=0;r.phase='playing';r.owners.fill(null);r.curses={};r.tileFx={};r.barrier={};r.elemOv={};r.pending={};r.players[0].pos=21;r.players[0].hand=['gecko'];r.players[0].blade=true;r.players[1].exile=['sp_gold','sp_gold','sp_gold','sp_gold'];
let cases=0;
for(const cid of Object.keys(G.CREATURES))for(const level of [1,3])for(const elem of ['fire','water','earth','wind']){
 r.owners[21]={player:'fx1',creature:cid,level,dmg:7,shade:2,iceWard:true};r.elemOv[21]=elem;r.tileFx[21]={vortex:true,uplift:true};r.owners[22]={player:'fx1',creature:'qbaby',level:3,dmg:0};r.elemOv[22]='earth';
 const base=G.landDefenseStats(r,21),battle=G.calculateBattle(r,{tile:21,attacker:'fx0',defender:'fx1',atkCreature:'gecko',supports:{}});
 assert.equal(base.df,battle.defDF,cid+' DF');if(cid.replace(/_f$/,'')!=='mimic')assert.equal(base.hp,battle.effHp,cid+' HP');assert.equal(base.total,base.hp+base.df);cases++;
}
r.owners[21]={player:'fx1',creature:'alter',level:3,dmg:30};r.owners[22]=null;r.elemOv[21]='wind';r.tileFx[21]={vortex:true,vortexSource:{charId:'lia'},uplift:true};G.resolveTile(r,r.players[0],true);
let s=G.publicState(r,null);assert.deepEqual(s.enemyLand.stats,{maxHp:50,hp:20,df:60,total:80,at:40});assert.equal(s.enemyLand.externalModifiers.attacker.length,3);assert.equal(s.enemyLand.externalModifiers.attacker[1].charId,'mio');assert.equal(s.enemyLand.externalModifiers.attacker[2].charId,'lia');
const before=JSON.stringify(r);G.publicState(r,null);assert.equal(JSON.stringify(r),before,'read only');
assert(s.players.every(p=>p.hand.length===0&&!p.inventoryList),'public inspection does not expose hands');
r.barrier.fx1=true;G.resolveTile(r,r.players[0]);s=G.publicState(r,null);assert(s.enemyLand.barrier);assert(!s.enemyLand.canInvade);assert(!r.pending.fx0.options.some(x=>x.id==='invade'));
r.barrier={};r.players[0].hand=[];G.resolveTile(r,r.players[0]);s=G.publicState(r,null);assert(!s.enemyLand.barrier&&!s.enemyLand.canInvade,'no creature is not a barrier');
r.pending={};assert.equal(G.publicState(r,null).enemyLand,null);r.owners[21].player='fx0';G.resolveTile(r,r.players[0]);assert.equal(G.publicState(r,null).enemyLand,null);
console.log('PASS enemy land: '+cases+' creature/level/element baselines, battle parity, role sources, barrier, secrecy, read-only');
