'use strict';
const assert=require('assert/strict');
const {G,lobby}=require('./mixed_bot_test');
function finish(r){G.startSelectionDraw(r);G.advanceSelectionDraw(r,Math.max(...r.selectionDraw.targets.map(t=>t.stopAt))+1);}
for(const n of [1,2,3,4])for(const random of [false,true]){
 const r=lobby(n);r.botMode=n<4;G.startSelect(r);
 const humans=r.players.filter(p=>!p.isBot);
 for(const [i,p]of humans.entries()){
  assert(r.pending[p.id].options.some(o=>o.id==='random'));
  const taken=new Set(r.players.filter(q=>q.confirmed&&!q.randomSelection).map(q=>q.charId));
  const option=random?'random':r.pending[p.id].options.find(o=>o.id!=='random'&&!taken.has(o.id)).id;
  G.handleChoose(r,p.id,option);
  if(i<humans.length-1){assert.equal(r.selectionDraw,null);if(random)assert.equal(p.charId,null);}
 }
 if(!random&&n===4){assert(G.isSelectionReady(r));assert.equal(r.selectionDraw,null);continue;}
 const draw=r.selectionDraw;
 assert.equal(draw.phase,'preparing');assert(!G.isSelectionReady(r));
 assert.equal(new Set(r.players.map(p=>p.charId)).size,4);
 assert.equal(draw.targets.length,random?4:4-n);
 const before=G.publicState(r,humans[0].id);
 for(const t of draw.targets){assert.equal(before.players.find(p=>p.id===t.playerId).charId,null);assert.equal(t.sequence.at(-1),t.charId);}
 assert(before.players.filter(p=>p.isBot).every(p=>/^BOT /.test(p.name)));
 const save=G.serializeRoom(r);assert.equal(G.validateSave(save),null);
 const restored=G.restoreRoom(structuredClone(save));assert(!restored.error,restored.error);assert.deepEqual(restored.room.selectionDraw,draw);
 G.startSelectionDraw(r);const started=draw.startedAt;G.startSelectionDraw(r);assert.equal(draw.startedAt,started);
 G.advanceSelectionDraw(r,draw.targets[0].stopAt);
 const partial=G.publicState(r,humans[0].id);assert.equal(partial.players.find(p=>p.id===draw.targets[0].playerId).charId,draw.targets[0].charId);
 if(draw.targets.length>1){assert(!G.isSelectionReady(r));assert.equal(partial.players.find(p=>p.id===draw.targets[1].playerId).charId,null);}
 const midway=G.serializeRoom(r);assert.equal(G.validateSave(midway),null);assert(!G.restoreRoom(midway).error);
 G.advanceSelectionDraw(r,draw.targets.at(-1).stopAt+1);assert(G.isSelectionReady(r));
 assert(r.players.filter(p=>!p.isBot).every(p=>r.pending[p.id].options.some(o=>o.id==='unpick')));
 const old=draw.id;G.handleChoose(r,humans[0].id,'unpick');assert.equal(r.selectionDraw,null);assert(!humans[0].randomSelection);
 assert(r.players.filter(p=>p.isBot||p.randomSelection).every(p=>!p.charId));
 G.handleChoose(r,humans[0].id,'random');assert.notEqual(r.selectionDraw.id,old);finish(r);assert(G.isSelectionReady(r));
 const bad=G.serializeRoom(r);bad.room.selectionDraw.targets[0].charId='not-selectable';assert(G.validateSave(bad));
}
// A manually contested choice resolves before the remaining random/BOT slots draw.
const conflict=lobby(3);conflict.botMode=true;G.startSelect(conflict);
G.handleChoose(conflict,'human0','redani');G.handleChoose(conflict,'human1','redani');G.handleChoose(conflict,'human2','random');
assert(conflict.duel);assert.equal(conflict.selectionDraw,null);
const loser=conflict.players.find(p=>!p.isBot&&!p.confirmed);
G.handleChoose(conflict,loser.id,'random');assert(conflict.selectionDraw);assert(conflict.selectionDraw.targets.every(t=>t.charId!=='redani'));
console.log('PASS summoner random: 1–4 humans, all-random/manual/BOT, conflict, hidden/staggered results, readiness, selection reset, save/restore and validation');
(async()=>{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 const r=lobby(1,'bot');G.startSelect(r);G.handleChoose(r,'human0','random');
 const action=async(body)=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({room:r.code,...body})});return {status:res.status,body:await res.json()};};
 try{
  assert.equal((await action({type:'start_game',token:r.boardToken})).status,409);
  const ack={type:'selection_draw_ready',drawId:r.selectionDraw.id,token:r.boardToken,reducedMotion:true};
  assert.equal((await action({...ack,token:'wrong'})).status,403);assert.equal((await action({...ack,drawId:'stale'})).status,409);
  assert.equal((await action({...ack,reducedMotion:'yes'})).status,400);
  assert.equal((await action(ack)).status,200);const start=r.selectionDraw.startedAt;
  assert.equal((await action(ack)).status,200);assert.equal(r.selectionDraw.startedAt,start);
  assert(r.selectionDraw.targets.at(-1).stopAt-start<=500);
  assert.equal((await action({type:'choose',playerId:'human0',optionId:'unpick'})).status,409);
  G.advanceSelectionDraw(r,r.selectionDraw.targets.at(-1).stopAt+1);
  assert.equal((await action({type:'choose',playerId:'human0',optionId:'unpick',promptId:'old',turnEpoch:0})).status,409);
  assert.equal((await action({type:'start_game',token:r.boardToken})).status,200);assert.equal(r.selectionDraw,null);
  console.log('PASS summoner random HTTP: board authorization, stale keys/prompts, idempotent ready, early-start lock and reduced-motion timing');
 }finally{G.server.closeAllConnections();G.server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
