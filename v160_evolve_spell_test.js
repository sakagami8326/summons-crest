const fs=require('fs'), assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+`
return {makeRoom,startGame,askRoll,askForge,handleChoose,publicState,serializeRoom,restoreRoom,
 SPELLS,CREATURES,CHAR_DECKS,makeDeck,shopRandomPool,publicCardCatalog,standardBot,rooms};`)(require,__dirname,()=>0,()=>0);
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(x,m)=>{assert.ok(x,m);checks++;};
function game(hand=['sp_evolve','nome']) {
 const r=G.makeRoom();r.players=[{id:'p1',name:'甲',charId:'grease'},{id:'p2',name:'乙',charId:'adel'}];
 G.startGame(r);r.pending={};r.turn=0;r.turnTransition=null;
 const p=r.players[0],q=r.players[1];p.hand=hand.slice();p.gold=500;p.spellCast=false;p.discard=[];p.exile=[];
 G.askRoll(r,p);return {r,p,q};
}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id);
const begin=g=>choose(g,'sp:sp_evolve');
eq([G.SPELLS.sp_evolve.cost,G.SPELLS.sp_evolve.rarity,!!G.SPELLS.sp_evolve.exileAfterUse],[150,'R',false],'150G rare reusable spell');
eq(G.makeDeck().filter(c=>c==='sp_evolve').length,2,'two copies in common deck');
eq(G.shopRandomPool().filter(c=>c==='sp_evolve').length,2,'available in shop');
eq(G.publicCardCatalog().counts.spells,25,'catalog includes new spell');
eq(G.CHAR_DECKS.grease,['nome','nome','nome','jaki','jaki','cleo','sp_gold','sp_insight','sp_evolve','shield','shield','jinx'],'current starter keeps three Gnomes and two Jaki');
for(const [hand,index,after]of [
 [['sp_evolve','nome','nome'],2,['nome','nome_f']],
 [['nome','sp_evolve','gecko'],0,['nome_f','gecko']],
 [['nome','sp_evolve','sp_evolve'],0,['nome_f','sp_evolve']],
]){
 const g=game(hand);begin(g);
 eq(g.r.pending[g.p.id].type,'spell_evolve','opens selector');
 eq(g.p.gold,500,'opening is free');
 choose(g,'ev:'+index);
 eq(g.p.hand,after,'only selected copy evolves regardless of spell index');
 eq([g.p.gold,g.p.discard,g.p.exile,g.p.spellCast],[350,['sp_evolve'],[],true],'pay once and discard');
 eq(g.r.pending[g.p.id].type,'roll','resume before dice');
 ok(!g.r.pending[g.p.id].options.some(o=>o.id.startsWith('sp:')),'one spell per turn');
 choose(g,'ev:'+index);eq(g.p.gold,350,'repeated input does not charge twice');
}
{
 const g=game();begin(g);choose(g,'ev:cancel');
 eq([g.p.hand,g.p.gold,g.p.discard,g.p.spellCast],[['sp_evolve','nome'],500,[],false],'cancel consumes nothing');
 ok(g.r.pending[g.p.id].options.some(o=>o.id==='sp:sp_evolve'),'can retry after cancel');
}
for(const mutate of [g=>g.p.gold=149,g=>g.p.hand=['sp_evolve','nome_f'],
 g=>g.p.hand=['sp_evolve','gecko'],g=>g.p.hand=['sp_gold','nome'],g=>g.p.spellCast=true]){
 const g=game();begin(g);mutate(g);const before=JSON.stringify(g.p);choose(g,'ev:1');
 eq(JSON.stringify(g.p),before,'stale target/resources do not consume anything');
 eq(g.r.pending[g.p.id].type,'roll','invalid choice safely resumes roll');
}
{
 const noEvo=Object.keys(G.CREATURES).find(id=>!id.endsWith('_f')&&!G.CREATURES[id].evo);
 for(const hand of [['sp_evolve'],['sp_evolve','nome_f',noEvo,'weapon']]){
  const g=game(hand);ok(!g.r.pending[g.p.id].options.some(o=>o.id==='sp:sp_evolve'),'no valid target hides cast');
 }
 const g=game();g.p.gold=149;G.askRoll(g.r,g.p);
 ok(!g.r.pending[g.p.id].options.some(o=>o.id==='sp:sp_evolve'),'unaffordable spell hidden');
}
{
 const g=game();g.r.owners[1]={player:g.p.id,creature:'trooper_f',level:1};g.p.gold=130;
 G.askRoll(g.r,g.p);begin(g);choose(g,'ev:1');
 eq([g.p.gold,g.p.hand],[0,['nome_f']],'Grigor discount applies');
}
{
 const g=game();g.r.owners[1]={player:g.p.id,creature:'bunnyhop_f',level:1};
 begin(g);choose(g,'ev:1');eq(g.p.gold,450,'Roadbump receives exactly one cast trigger');
}
{
 const g=game();begin(g);
 eq(G.publicState(g.r,g.q.id).pending[g.p.id].options,[],'opponent cannot inspect hand candidates');
 eq(G.publicState(g.r,null).pending[g.p.id].options,[],'board cannot inspect hand candidates');
 ok(G.publicState(g.r,g.p.id).pending[g.p.id].options.some(o=>o.card==='nome'),'owner sees candidates');
 const restored=G.restoreRoom(G.serializeRoom(g.r));ok(restored.room,'save restores');
 const r=restored.room,p=r.players.find(p=>p.id===g.p.id);
 G.handleChoose(r,p.id,'ev:1');eq(p.hand,['nome_f'],'selection works after reload');
 ok(!JSON.stringify([r.lastEvent,r.lastSpellFx,r.log]).includes(G.CREATURES.nome.evo),'public events keep evolved card private');
}
{
 const g=game(['nome']);G.askForge(g.r,g.p);choose(g,'fg:0');
 eq([g.p.hand,g.p.gold],[['nome_f'],350],'gate forge still evolves and costs 150G');
}
{
 const g=game(['sp_evolve','bunnyhop','nome']);g.p.gold=2000;
 G.askRoll(g.r,g.p);
 eq(G.standardBot.choose(g.r,g.p,g.r.pending[g.p.id]).id,'sp:sp_evolve','BOT casts when evolution is worth its cost');
 begin(g);
 eq(G.standardBot.choose(g.r,g.p,g.r.pending[g.p.id]).id,'ev:1','BOT selects larger improvement');
 choose(g,'ev:1');eq(g.p.hand,['bunnyhop_f','nome'],'BOT choice executes');
}
G.rooms.clear();console.log(`v1.60 evolve spell: ${checks} checks passed`);
