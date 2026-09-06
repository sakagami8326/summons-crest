// Map geometry, resumable movement, save compatibility and seeded BOT games.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','process','console','setInterval','setTimeout',src+'\nreturn {MAPS,makeRoom,startGame,performMove,handleChoose,cavernTeleport,cavernNeighbors,cavernRouteProjection,askRoll,publicState,serializeRoom,restoreRoom,validateSave,rooms,botChooseOption,resolveUltSequence,completeTurnTransition,stepDests};')(require,__dirname,process,console,()=>{},()=>({unref(){}}));
let checks=0;
const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
const ok=(a,msg)=>{assert.ok(a,msg);checks++;};
const copy=o=>JSON.parse(JSON.stringify(o));
function game(n=2,mapId='twin_gate_cavern'){
 const r=G.makeRoom('normal',mapId);
 r.players=Array.from({length:n},(_,i)=>({id:'p'+i,name:'P'+i,charId:['redani','adel','villa','mio'][i],confirmed:true}));
 G.startGame(r);r.boardSeen=true;r.pending={};r.players.forEach(p=>p.gold=1000);return r;
}
function move(r,n,next){const p=r.players[r.turn];G.performMove(r,p,n,{value:n},`${n}歩`);if(next!=null)choose(r,'route:'+next);return p;}
function choose(r,id){G.handleChoose(r,r.players[r.turn].id,id);}
const map=G.MAPS.twin_gate_cavern;
eq(map.tiles.length,33,'33 tiles');
for(const e of ['fire','water','earth','wind'])eq(map.tiles.filter(t=>t.e===e).length,6,e+' six');
for(const [t,n] of [['shrine',4],['market',2],['castle',1],['gate',2]])eq(map.tiles.filter(v=>v.t===t).length,n,t);
eq([map.castle,...map.gates],[17,12,22],'facility IDs');
map.neighbors.forEach((ns,i)=>{eq(ns.length,[10,24].includes(i)?3:2,'degree '+i);ns.forEach(j=>ok(map.neighbors[j].includes(i),'symmetric'));});
{
 const r=game(),p=r.players[0];move(r,8);eq(r.pending[p.id].type,'route_choice','initial choice');eq(p.pos,17,'no move before selection');
 choose(r,'route:18');eq(p.pos,24,'pause at A');eq(r.movement.remaining,1,'seven steps used');eq(p.gatesVisited,[22],'west gate');eq(p.gold,1100,'gate 100G');
 eq(r.pending[p.id].options.map(o=>o.tile),[25,28],'no reverse at A');
 choose(r,'route:28');eq(p.pos,28,'resume');eq(r.movement,null,'finish');eq(p.previousTile,24,'direction persists');eq(r.lastDice.segment.path,[28],'new segment path');
 r.pending={};move(r,1);eq(p.pos,29,'next turn no reverse');
 const old=game(2,'starting_corridor');eq(old.owners.length,28,'simultaneous legacy room');eq(G.publicState(r,p.id).tiles.length,33,'new public tiles');
}
for(const short of [false,true]){
 const r=game(),p=r.players[0];move(r,short?20:28,18);
 eq(p.pos,24,'A reached');choose(r,'route:'+(short?28:25));
 eq(p.pos,10,'B reached');eq(r.movement.remaining,7,'seven steps home');choose(r,'route:11');
 eq([p.pos,p.lap,p.gold],[17,2,1300],'lap and payouts');eq(p.gatesVisited,[],'gates reset');eq(r.pending[p.id].type,'draft','castle draft');
 choose(r,'skip');eq(r.movement,null,'exact castle ends move');
}
{
 const r=game(),p=r.players[0];p.pos=16;p.previousTile=15;p.gatesVisited=[12];move(r,1);
 eq([p.pos,p.lap,p.gold],[17,1,1000],'missing west no reward');eq(p.gatesVisited,[12],'partial seal retained');ok(r.pending[p.id]?.type!=='draft','no return draft');
 p.gatesVisited=[12,22];p.pos=16;p.previousTile=15;r.pending={};move(r,4);
 eq([p.pos,r.movement.remaining],[17,3],'castle pauses movement');choose(r,'skip');eq(p.pos,20,'remaining steps resume');eq(p.lap,2,'only one lap');
}
{
 const r=game(),p=r.players[0];p.pos=24;p.previousTile=23;move(r,1);eq(r.pending[p.id].options.map(o=>o.tile),[25,28],'starting on branch');
 p.reverseNext=true;eq(G.cavernNeighbors(r,p),[23],'reverse forces incoming edge');
 r.pending={};move(r,2);eq(p.pos,22,'reverse then usual path');eq(p.reverseNext,false,'reverse consumed');
}
{
 const r=game(),p=r.players[0];p.pos=23;p.previousTile=22;r.owners[24]={player:r.players[1].id,creature:'mist_jelly',level:1};
 move(r,6);eq(p.pos,24,'anchor before route choice');eq(r.movement,null,'stopped');eq(r.lastDice.resolvedSteps,1,'actual steps');ok(r.lastDice.forcedStop,'anchor flag');
 p.pos=23;p.previousTile=22;r.pending={};move(r,1);ok(!r.lastDice.forcedStop,'exact arrival not forced');
 eq(G.cavernRouteProjection(r,p,28,1).destinations[0].forcedStop,false,'preview exact arrival');
 p.pos=23;p.previousTile=22;r.owners[24].player=p.id;r.pending={};move(r,6);eq(r.pending[p.id].type,'route_choice','own anchor ignored');
}
{
 const r=game(),p=r.players[0];G.cavernTeleport(r,p,22);eq([p.pos,p.previousTile,p.dir],[22,null,0],'teleport resets direction');eq(p.gatesVisited,[22],'teleported gate');
 G.cavernTeleport(r,p,22);eq(p.gold,1100,'same gate no second payout');G.cavernTeleport(r,p,12);eq(p.gold,1200,'other gate');
 G.cavernTeleport(r,p,17);eq(p.lap,2,'teleported castle lap');choose(r,'skip');
 G.cavernTeleport(r,p,24);r.pending={};move(r,2);eq(r.pending[p.id].options.length,3,'teleported branch three directions');
}
{
 const r=game(),p=r.players[0];p.pos=16;p.previousTile=15;p.gatesVisited=[12,22];p.gold=7900;move(r,10);
 eq(r.winner,p.id,'8000G castle win');eq(p.pos,17,'victory cancels remainder');eq(r.movement,null,'no movement after win');
}
{
 const r=game(),p=r.players[0];move(r,20,18);r.routePreview={player:p.id,optionId:'route:28'};
 const save=G.serializeRoom(r);eq(G.validateSave(save),null,'branch save valid');ok(!save.room.routePreview,'preview not saved');
 const rr=G.restoreRoom(save);ok(!rr.error,'restore branch');const restored=G.rooms.get(r.code);eq(restored.players[0].gold,p.gold,'no gate replay');eq(restored.routePreview,null,'no stale preview');
 choose(restored,'route:28');choose(restored,'route:11');const cs=G.serializeRoom(restored);eq(G.validateSave(cs),null,'castle save valid');
 G.restoreRoom(cs);const cr=G.rooms.get(r.code);choose(cr,'skip');eq(cr.players[0].lap,2,'castle not replayed');
 for(const mutate of [d=>d.mapId='bad',d=>d.players[0].previousTile=0,d=>d.movement.remaining=-1,d=>d.players[0].gatesVisited=[22,22],d=>d.lastDice.segment.path=[32],d=>d.pending[p.id].options=[]]){
   const bad=copy(save);mutate(bad.room);ok(G.validateSave(bad),'invalid save rejected');
 }
 const legacy=G.serializeRoom(game(2,'starting_corridor'));delete legacy.room.mapId;eq(G.validateSave(legacy),null,'legacy map omission');
 ok(!G.restoreRoom(legacy).error,'legacy restore');
}
// Pure previews may reveal only public terrain and route data, and match resolved endpoints.
{
 const r=game(),p=r.players[0];p.pos=16;p.previousTile=15;p.gatesVisited=[12,22];p.gold=7900;
 const projection=G.cavernRouteProjection(r,p,17,6);eq(projection.destinations.map(d=>d.tile),[17],'preview stops at winning castle');ok(projection.destinations[0].victory,'preview victory');
}
{
 const r=game(),p=r.players[0];p.pos=24;p.previousTile=23;r.owners[24]={player:p.id,creature:'marlow',level:2,dmg:10};
 eq(G.stepDests(r,p,24).sort((a,b)=>a-b),[23,25,28],'Move on fork has three neighbors');
 p.hand.push('sp_wind_shift');p.previousTile=null;G.askRoll(r,p);
 ok(!r.pending[p.id].options.some(o=>o.id==='sp:sp_wind_shift'),'unknown direction cannot cast');
}
{
 const r=game(),p=r.players[0];move(r,40,18);choose(r,'route:28');choose(r,'route:11');
 eq(r.movement.remaining,20,'two-lap move pauses first castle');choose(r,'skip');choose(r,'route:28');choose(r,'route:11');
 eq([p.lap,p.gold],[3,1700],'two laps and per-lap gates');choose(r,'skip');eq(r.movement,null,'two-lap move completes');
}
{
 const r=game(),p=r.players[0];p.pos=16;p.previousTile=15;p.gatesVisited=[12,22];
 r.owners[18]={player:p.id,creature:'wakatama',level:1,dmg:13};
 G.performMove(r,p,3,{value:3,villaUlt:true,presentation:'villa_move',moveSteps:3},'ヴィラ移動');
 eq(r.owners[18].dmg,3,'castle healing');ok(r.lastHeal.reward.gold===10,'healing gold uses shared effect');
 const take=r.pending[p.id].options.find(o=>o.id.startsWith('take:'));choose(r,take.id);
 eq(p.pos,19,'Villa resumes after taking castle card');eq(r.pending[p.id].type,'ult_villa_recover','Villa follow-up preserved');
}
{
 const r=game(),p=r.players[0];p.pos=24;p.previousTile=23;move(r,12);
 const pd=G.publicState(r,null).pending[p.id];ok(pd.options.every(o=>o.destinations.length>0),'public endpoints');
 ok(!JSON.stringify(pd).includes('hand'),'no private hand');
 for(const o of pd.options){const seen=new Set();const walk=(from,tile,left)=>{if(!left){seen.add(tile);return;}map.neighbors[tile].filter(n=>n!==from).forEach(n=>walk(tile,n,left-1));};walk(p.pos,o.tile,11);eq(o.destinations.map(d=>d.tile),[...seen].sort((a,b)=>a-b),'preview exhaustive');}
}
// Fixed-seed production BOT evaluator, 2/3/4 players, all the way to a winner.
const random=Math.random;
try{
 for(const n of [2,3,4]){
  let seed=158+n;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const r=game(n);G.askRoll(r,r.players[r.turn]);let actions=0;
  while(!r.winner&&actions++<20000){
   if(r.turnTransition){G.completeTurnTransition(r,r.turnTransition.id,'board');continue;}
   if(r.ultSequence){G.resolveUltSequence(r);continue;}
   const entry=Object.entries(r.pending).find(([,p])=>p.options.length);
   ok(entry,'BOT has pending');const [id,pd]=entry,actor=r.players.find(p=>p.id===id);
   const idChoice=G.botChooseOption(r,actor,pd);ok(pd.options.some(o=>o.id===idChoice),'BOT legal');G.handleChoose(r,id,idChoice);
  }
  ok(r.winner,`${n} player BOT completes`);console.log(`cavern BOT ${n} players: ${actions} actions`);
 }
}finally{Math.random=random;G.rooms.clear();}
console.log(`v1.58 maps: ${checks} checks passed`);
