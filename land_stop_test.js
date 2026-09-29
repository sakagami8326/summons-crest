const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {makeFixtureRoom,resolveTile,publicState,handleChoose,landDefenseStats};')(require,__dirname,()=>0,()=>0);
function setup(){const r=G.makeFixtureRoom();r.turn=0;r.phase='playing';r.pending={};r.owners.fill(null);r.curses={};r.tileFx={};r.barrier={};r.elemOv={};r.turnTransition=null;const p=r.players[0];p.pos=21;p.hand=['gecko'];p.gold=2400;return {r,p}}
for(const elem of ['water','fire','wind','earth']){
 const {r,p}=setup();r.elemOv[21]=elem;G.resolveTile(r,p);let s=G.publicState(r,null);assert.equal(s.landStop.element,elem);assert.equal(s.landStop.kind,'empty');assert(s.landStop.canSummon);assert.equal(s.enemyLand,null);
 assert(s.players.every(p=>p.hand.length===0&&!p.inventoryList));assert(!JSON.stringify(s.landStop).includes('gecko'));const before=JSON.stringify(r);G.publicState(r,null);assert.equal(JSON.stringify(r),before);
 p.hand=[];G.resolveTile(r,p);assert(!G.publicState(r,null).landStop.canSummon);
}
{
 const {r,p}=setup();r.owners[21]={player:p.id,creature:'poponga',level:4,dmg:10};r.owners[22]={player:p.id,creature:'nome',level:1};G.resolveTile(r,p);
 let s=G.publicState(r,null);assert.equal(s.landStop.kind,'own');assert(s.landStop.canUpgrade);assert.equal(s.landStop.maxLevel,4);assert.deepEqual(s.landStop.stats,G.landDefenseStats(r,21));
 G.handleChoose(r,p.id,'up:22');assert.equal(G.publicState(r,null).landStop,null,'selected other territory moves to existing level picker');const gold=p.gold;G.handleChoose(r,p.id,'ul:22:2');assert.equal(r.owners[22].level,2);assert.equal(r.owners[21].level,4);assert(p.gold<gold);
}
{
 const {r,p}=setup();p.gold=0;r.owners[21]={player:p.id,creature:'marlow',level:1};r.elemOv[22]='wind';G.resolveTile(r,p);const d=G.publicState(r,null).landStop;assert(d&&!d.canUpgrade&&d.canMove,'Marlow-only choice does not claim upgrading is available');
}
{
 const {r,p}=setup();r.owners[21]={player:p.id,creature:'poponga',level:4};G.resolveTile(r,p);assert.equal(G.publicState(r,null).landStop,null,'no legal choices ends turn, does not stall for a notice');
 r.turn=0;r.pending={};r.owners[21]={player:r.players[1].id,creature:'nome',level:1};G.resolveTile(r,p);const s=G.publicState(r,null);assert(s.enemyLand);assert.equal(s.landStop,null);
 r.phase='ended';assert.equal(G.publicState(r,null).landStop,null);
}
console.log('PASS land-stop states: four elements, empty/no-card, own/max/other territory upgrade, Marlow-only, no actions, privacy and read-only');
