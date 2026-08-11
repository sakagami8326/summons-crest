// v1.09 regression: cinematic ultimate cut-in and delayed server resolution.
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require','__dirname','process','console','setInterval',
  src + '\n;return {VERSION,TILES,makeRoom,handleChoose,resolveUltSequence,publicState,serializeRoom};')(
  require,__dirname,process,console,()=>{});
let pass = 0;
const ok = (v,n) => { if (!v) throw new Error('FAIL: '+n); pass++; };
const eq = (a,b,n) => ok(JSON.stringify(a)===JSON.stringify(b),`${n} (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);
eq(G.VERSION,'1.09','version');
function roomFor(charId) {
  const r=G.makeRoom(); r.phase='playing'; r.pending={}; r.log=[]; r.turn=0;
  const p={id:'p1',name:'P1',charId,gold:500,pos:0,dir:1,lap:1,hand:[],deck:[],discard:[],exile:[],
    battleWins:0,shrineVisits:0,ultUsed:false,spellCast:false,bankrupt:false};
  r.players=[p]; r.pending[p.id]={type:'roll',options:[{id:'ult'}]}; return {r,p};
}
{
  const {r,p}=roomFor('grease');
  G.handleChoose(r,p.id,'ult');
  ok(p.ultUsed && r.ultSequence && !r.ultSequence.resolved,'activation creates unresolved sequence');
  eq(r.pending[p.id].type,'ult_resolve','input is locked during cut-in');
  ok(!r.barrier[p.id],'effect is not applied before cut-in ends');
  ok(r.ultSequence.resolveAt-r.ultSequence.startedAt===3500,'cut-in lasts 3.5 seconds');
  const pub=G.publicState(r,p.id).ultSequence;
  ok(pub && !('data' in pub),'private resolution payload is not public');
  ok(G.serializeRoom(r).room.ultSequence.id===r.ultSequence.id,'sequence is saved');
  G.resolveUltSequence(r);
  ok(r.barrier[p.id] && !r.ultSequence,'effect resolves once after cut-in');
}
{
  const {r,p}=roomFor('adel');
  r.owners[1]={player:p.id,level:1,creature:'survey',dmg:20};
  G.handleChoose(r,p.id,'ult');
  eq(r.owners[1].dmg,20,'Adele healing is delayed');
  G.resolveUltSequence(r);
  ok(r.owners[1].dmg===0 && r.owners[1].iceWard,'Adele resolves healing and ward');
}
const board=fs.readFileSync(path.join(__dirname,'public','board.html'),'utf8');
const phone=fs.readFileSync(path.join(__dirname,'public','phone.html'),'utf8');
ok(board.includes("'/assets/ult_' + u.charId + '.webp'") && board.includes('se_ult_cutin.mp3'),'TV uses new art and sound');
ok(board.includes('UltFxWorld.play') && phone.includes('UltFxWorld.play'),'TV and phone use Phaser sparkles');
for(const id of ['redani','linnei','grease','mio','adel','lia'])
  ok(fs.existsSync(path.join(__dirname,'public','assets',`ult_${id}.webp`)),`${id} cut-in asset exists`);
ok(fs.existsSync(path.join(__dirname,'public','assets','se_ult_cutin.mp3')),'cut-in sound exists');
console.log(`V1.09 ULT CUT-IN ALL ${pass} CHECKS PASSED`);
