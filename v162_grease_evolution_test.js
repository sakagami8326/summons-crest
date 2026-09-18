const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+`
return {makeRoom,startGame,askRoll,handleChoose,resolveUltSequence,publicState,serializeRoom,restoreRoom,
 CREATURES,ULTS,standardBot,rooms,tollOf,continuePostBattle};`)(require,__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(x,m)=>{assert.ok(x,m);checks++;};
function game(hand=['jaki','nome','nome']) {
 const r=G.makeRoom();r.players=[{id:'p1',name:'甲',charId:'grease'},{id:'p2',name:'乙',charId:'adel'}];
 G.startGame(r);r.pending={};r.turn=0;r.turnTransition=null;r.turnReadyAt=0;
 const p=r.players[0],q=r.players[1];p.charId='grease';p.hand=hand.slice();p.gold=500;p.spellCast=false;
 r.owners[1]={player:p.id,creature:'jaki',level:1,dmg:12,shade:4,iceWard:true};
 r.owners[2]={player:q.id,creature:'nome',level:1,dmg:0};r.elemOv[1]='earth';
 G.askRoll(r,p);return {r,p,q};
}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id),pending=g=>g.r.pending[g.p.id];
const begin=g=>choose(g,'ult');
eq(G.ULTS.grease.name,'進化の胎動','approved name');
ok(fs.existsSync(__dirname+'/public'+G.ULTS.grease.art),'versioned cut-in exists');
{
 const g=game();begin(g);eq(pending(g).type,'ult_grease','selector opens');
 ok(!pending(g).options.some(o=>o.id==='gu:confirm'),'cannot confirm zero targets');
 choose(g,'gh:0');choose(g,'gh:1');eq(pending(g).selected,['gh:1'],'same zone replaces selection');
 choose(g,'gh:1');eq(pending(g).selected,[],'tap again clears');
 choose(g,'gl:1');choose(g,'gu:cancel');eq([g.p.ultUsed,g.p.hand[0],g.r.owners[1].creature],[false,'jaki','jaki'],'cancel consumes nothing');
}
for(const ids of [['gh:2'],['gl:1'],['gh:2','gl:1']]) {
 const g=game();const landBefore={...g.r.owners[1]},toll=G.tollOf(g.r,1);
 begin(g);for(const id of ids)choose(g,id);
 eq(g.p.ultUsed,false,'selection does not consume ultimate');
 choose(g,'gu:confirm');eq(g.p.ultUsed,true,'confirmation consumes once');
 eq([g.p.hand,g.r.owners[1]],[['jaki','nome','nome'],landBefore],'no evolution during cut-in');
 eq(pending(g).type,'ult_resolve','input locked');
 choose(g,'gu:confirm');G.resolveUltSequence(g.r);G.resolveUltSequence(g.r);
 eq(g.p.hand,ids.includes('gh:2')?['jaki','nome','nome_f']:['jaki','nome','nome'],'exact hand copy evolves');
 eq(g.r.owners[1],{...landBefore,creature:ids.includes('gl:1')?'jaki_f':'jaki'},'only land creature identity changes');
 eq([g.p.gold,g.p.spellCast,G.tollOf(g.r,1),g.r.elemOv[1]],[500,false,toll,'earth'],'no cost, cast trigger, land level/terrain/toll change');
 ok(!g.r.barrier[g.p.id],'does not grant obsolete barrier');
 eq(pending(g).type,'roll','returns to pre-roll');
 ok(!pending(g).options.some(o=>o.id==='ult'),'once per game');
}
{
 const noEvo=Object.keys(G.CREATURES).find(id=>!id.endsWith('_f')&&!G.CREATURES[id].evo);
 const g=game(['nome_f',noEvo,'sp_gold']);g.r.owners[1].level=3;G.askRoll(g.r,g.p);
 ok(!pending(g).options.some(o=>o.id==='ult'),'enemy/evolved/no-evolution cards are excluded');
 g.r.owners[1].level=1;g.r.owners[1].creature='jaki_f';G.askRoll(g.r,g.p);
 ok(!pending(g).options.some(o=>o.id==='ult'),'permanent evolved land excluded');
}
for(const mutate of [g=>g.p.hand[0]='nome',g=>g.p.hand.splice(0,1)]) {
 const g=game();begin(g);choose(g,'gh:0');mutate(g);choose(g,'gu:confirm');
 ok(!g.p.ultUsed && !g.r.ultSequence,'stale hand snapshot cannot evolve replacement');
}
for(const mutate of [g=>g.r.owners[1].player=g.q.id,g=>g.r.owners[1].level=3,g=>g.r.owners[1].creature='nome']) {
 const g=game();begin(g);choose(g,'gl:1');mutate(g);choose(g,'gu:confirm');
 ok(!g.p.ultUsed && !g.r.ultSequence,'stale land snapshot cannot activate');
}
{
 const g=game();begin(g);choose(g,'gh:0');choose(g,'gl:1');choose(g,'gu:confirm');
 g.p.hand[0]='nome';g.r.owners[1].player=g.q.id;G.resolveUltSequence(g.r);
 eq([g.p.hand[0],g.r.owners[1].creature],['nome','jaki'],'targets rechecked after cut-in');
}
{
 const g=game();begin(g);choose(g,'gh:0');choose(g,'gl:1');
 for(const viewer of [g.q.id,null]) {
  const pd=G.publicState(g.r,viewer).pending[g.p.id];eq(pd.options,[],'private candidates');
  ok(!pd.targets&&!pd.selected,'private selected identities');
 }
 const restored=G.restoreRoom(G.serializeRoom(g.r));ok(restored.room,'selection restores');
 const r=restored.room,p=r.players.find(p=>p.id===g.p.id);G.handleChoose(r,p.id,'gu:confirm');
 const pub=G.publicState(r,null);ok(!pub.ultSequence.data,'cut-in snapshots not public');
 const saved=G.restoreRoom(G.serializeRoom(r));ok(saved.room,'cut-in restores');
 G.resolveUltSequence(saved.room);const rp=saved.room.players.find(q=>q.id===p.id);
 eq(rp.hand[0],'jaki_f','restored cut-in evolves');
 eq(saved.room.owners[1].creature,'jaki_f','restored land evolves');
 ok(!JSON.stringify(saved.room.lastSpellFx).includes('gh:'),'effect event has no hand target');
 ok(!JSON.stringify(saved.room.log).includes('アシュラカン'),'log does not disclose hand identity');
}
{
 const g=game(['bunnyhop','jaki']);begin(g);
 for(let i=0;i<5&&pending(g).type==='ult_grease';i++) {
  const decision=G.standardBot.choose(g.r,g.p,pending(g));ok(decision.id,'BOT chooses');choose(g,decision.id);
 }
 eq(pending(g).type,'ult_resolve','BOT completes both-zone selection without loop');
 G.resolveUltSequence(g.r);eq(g.p.hand[0],'bunnyhop_f','BOT evolves strongest hand gain');
 eq(g.r.owners[1].creature,'jaki_f','BOT also evolves own land');
}
{
 const g=game(['nome']);begin(g);choose(g,'gl:1');choose(g,'gu:confirm');G.resolveUltSequence(g.r);
 g.r.battleAfter={winner:g.p.id,attacker:g.q.id,defender:g.p.id,tile:1,invasionWon:false,mermaidDone:true,recoveryDone:true};
 G.continuePostBattle(g.r);const option=pending(g).options.find(o=>o.card==='nome');ok(option,'evolved Jaki retains frontline swap');
 choose(g,option.id);ok(g.p.hand.includes('jaki_f'),'permanent evolution persists when returned to hand');
}
G.rooms.clear();console.log(`v1.62 Grease evolution: ${checks} checks passed`);
