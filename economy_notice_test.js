const fs=require('fs'),assert=require('assert/strict'),GT=require('./public/game_timing');
const source=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {makeRoom,startGame,performMove,handleChoose,publicState,serializeRoom,restoreRoom,rooms};')(require,__dirname,()=>0,()=>0);
function game(map='starting_corridor'){
 const r=G.makeRoom('normal',map);r.players=[{id:'p1',name:'甲',charId:'mio'},{id:'p2',name:'乙',charId:'adel'}];G.startGame(r);r.players.sort((a,b)=>a.id.localeCompare(b.id));r.turn=0;r.pending={};r.turnTransition=null;r.turnReadyAt=0;r.owners.fill(null);const p=r.players[0];p.gold=100;p.dir=1;p.pos=27;p.seal=true;return {r,p};
}
for(const count of [0,2,6,12,24]){
 const {r,p}=game();for(let i=0;i<count;i++)r.owners[i+1]={player:p.id,creature:i?'poponga':'poponga_f',level:1,dmg:i%2?6:13};
 G.performMove(r,p,1,{value:1},'test');const e=r.lastDice.castle;
 assert.equal(e.healed.length,count);assert.equal(e.beforeGold,100);assert.equal(e.afterGold,100+e.total);assert.equal(e.afterGold,p.gold);
 assert(e.healed.every(h=>h.amount===h.before-h.after&&h.amount<=10));if(count)assert.equal(e.healed[0].creatureId,'poponga_f');
 assert.equal(r.pending[p.id].availableAt,e.availableAt);
 assert.equal(e.availableAt-r.lastDice.at,GT.moveStartDelay+GT.stepMs+GT.castleZoom+GT.castleDuration(e));
 assert(GT.castleDuration(e)>=Math.max(0,GT.healPageFirst+(Math.ceil(count/3)-2)*GT.healPageInterval+1800));
 assert.deepEqual(G.publicState(r,null).lastDice.castle,e);
 const restored=G.restoreRoom(G.serializeRoom(r)).room;assert.deepEqual(restored.lastDice.castle,e);
}
{
 const {r,p}=game();p.seal=false;G.performMove(r,p,1,{value:1},'test');assert(!r.lastDice.castle.usedSeal);assert.equal(p.gold,100);assert.equal(GT.castleDuration(r.lastDice.castle),4000);
}
{
 const {r,p}=game();p.pos=13;p.seal=false;G.performMove(r,p,2,{value:2},'test');
 const e=r.lastDice.gateEvents[0];assert.equal(e.step,2);assert.equal(e.beforeGold,100);assert.equal(e.afterGold,300);assert.equal(e.gold,200);assert.equal(e.tile,15);
 assert(r.pending[p.id].availableAt>=r.lastDice.at+GT.moveStartDelay+2*GT.stepMs+GT.gateNotice);
}
for(const tile of [12,22]){
 const {r,p}=game('twin_gate_cavern');p.pos=tile-1;p.previousTile=tile-2;p.gatesVisited=tile===12?[]:[12];G.performMove(r,p,1,{value:1},'test');
 const e=r.lastDice.segment.events.find(e=>e.type==='gate');assert.equal(e.beforeGold,100);assert.equal(e.afterGold,200);assert.deepEqual(e.gatesVisited,tile===12?[12]:[12,22]);
 assert.equal(r.lastDice.segment.availableAt-r.lastDice.segment.startAt,GT.stepMs+GT.gateNotice);
}
{
 const {r,p}=game('twin_gate_cavern');p.pos=16;p.previousTile=15;p.gatesVisited=[12,22];for(let i=0;i<12;i++)r.owners[i]={player:p.id,creature:'poponga',level:i?1:3,dmg:16};
 G.performMove(r,p,1,{value:1},'test');const e=r.lastDice.castle;
 assert.equal(e.healed[0].creatureId,'poponga_f');assert.equal(e.healed.length,12);assert.equal(e.beforeGold,100);assert.equal(e.afterGold,100+e.total);
 assert.equal(e.availableAt-r.lastDice.segment.startAt,GT.stepMs+GT.castleZoom+GT.castleDuration(e));
 assert.equal(r.pending[p.id].availableAt,e.availableAt);
}
console.log('PASS economy authoritative cash/healing, evolved art IDs, 0/2/6/12/24 territories, both maps, selection lock, save/restore');
