const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+`;return {makeRoom,startGame,askRoll,handleChoose,resolveBattle,CREATURES,SPELLS,SUPPORTS,publicState,serializeRoom,restoreRoom,standardBot,makeDeck,publicCardCatalog};`)(require('./test_helpers/default-rarity-require.cjs'),__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++},ok=(a,m)=>{assert.ok(a,m);checks++};
function game(char='grease'){const r=G.makeRoom();r.players=[{id:'a',name:'甲',charId:char},{id:'d',name:'乙',charId:'adel'}];G.startGame(r);r.pending={};r.turn=0;r.turnTransition=null;r.owners.fill(null);r.effectQueue=[];for(const p of r.players){p.hand=[];p.gold=1000;p.discard=[];p.exile=[];p.deck=[];p.spellCount=0;p.spellCast=false;}r.turn=r.players.findIndex(p=>p.id==='a');return {r,p:r.players.find(p=>p.id==='a'),d:r.players.find(p=>p.id==='d')};}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id);
const offers=(g,id)=>g.r.pending[g.p.id].options.some(o=>o.id===id);
eq([G.SPELLS.sp_chain_gold.cost,G.SPELLS.sp_chain_gold.rarity,G.SPELLS.sp_mana_forge.cost,G.SPELLS.sp_mana_forge.rarity,G.SUPPORTS.onitsugi.cost,G.SUPPORTS.onitsugi.rarity,G.SUPPORTS.onitsugi.st],[0,'N',70,'R',80,'R',10],'approved numbers');
eq(G.makeDeck().length,179,'weighted deck includes seven new cards');
eq(G.publicCardCatalog().counts,{total:87,creatures:53,evolutions:46,spells:28,weapons:6},'catalog counts');
{
 const g=game();g.p.hand=['sp_chain_gold'];G.askRoll(g.r,g.p);ok(!offers(g,'sp:sp_chain_gold'),'unavailable without land');
 g.r.pending[g.p.id].options.push({id:'sp:sp_chain_gold'});choose(g,'sp:sp_chain_gold');eq(g.p.hand,['sp_chain_gold'],'server rechecks land');
 for(let i=0;i<9;i++){g.r.owners[i]={player:g.p.id,creature:'gecko',level:1};g.r.elemOv[i]=i<7?'water':'fire';}
 G.askRoll(g.r,g.p);const before=g.p.gold;choose(g,'sp:sp_chain_gold');eq(g.p.gold,before+700,'unbounded maximum chain, not sum');eq(g.p.spellCount,1,'normal spell hook');
}
{
 const g=game();g.p.hand=['sp_mana_forge'];G.askRoll(g.r,g.p);ok(!offers(g,'sp:sp_mana_forge'),'requires creature');
 g.p.hand=['nome','sp_mana_forge','nome','shield'];G.askRoll(g.r,g.p);choose(g,'sp:sp_mana_forge');
 eq(g.r.pending[g.p.id].options.filter(o=>o.card).map(o=>o.index),[0,2],'creatures only, duplicate indices');
 eq(G.publicState(g.r,g.d.id).pending[g.p.id].options,[],'selection private');
 choose(g,'mf:cancel');eq([g.p.gold,g.p.hand.length,g.p.exile.length,g.p.deck.length],[1000,4,0,0],'cancel free');
 choose(g,'sp:sp_mana_forge');const saved=G.serializeRoom(g.r),rest=G.restoreRoom(saved);ok(rest.room,'save during selection');
 G.handleChoose(rest.room,g.p.id,'mf:2');const p=rest.room.players.find(p=>p.id===g.p.id);
 eq(p.hand,['nome','shield'],'exact selected slot consumed');eq(p.gold,930,'cost once');eq(p.exile,['nome'],'exile not discard');eq(p.discard,['sp_mana_forge'],'spell discard');eq(p.deck.slice().sort(),['shield','weapon'],'outputs deck only');
 G.handleChoose(rest.room,g.p.id,'mf:2');eq(p.deck.length,2,'replayed request cannot duplicate');
}
{
 const g=game('villa');g.p.hand=['sp_mana_forge','nome'];g.r.owners[21]={player:g.p.id,creature:'toxy',level:1};g.d.hand=['gecko'];G.askRoll(g.r,g.p);choose(g,'sp:sp_mana_forge');choose(g,'mf:1');
 ok(g.p.passiveExiled,'Villa exile combo');ok(g.d.hand.length===0||Object.values(g.r.pending).some(p=>p.type==='toxy_target'),'Toxy combo resolves');eq(g.p.deck.length,2,'generation once with combo');
}
{
 const g=game('noir');g.p.hand=['sp_mana_forge','nome'];g.p.spellCount=1;g.p.spellCast=true;g.p.gold=169;G.askRoll(g.r,g.p);ok(!offers(g,'sp:sp_mana_forge'),'Noir second spell extra fee');
}
function battle({defense=false,jinx=false,ludi=false,jaki=false,lose=false}={}){const g=game(),a=g.p,d=g.d,winner=defense?d:a;
 const ac=defense?'orphe':jaki?'jaki':'avalanche_f',dc=defense?(ludi?'ludi_f':jaki?'jaki':'nome_f'):(lose?'nome_f':'gecko');
 a.hand=[ac,...(!defense?['onitsugi','nome']:jinx?['jinx']:[])];d.hand=defense?['onitsugi','nome']:jinx?['jinx']:[];
 g.r.elemOv[21]='earth';g.r.owners[21]={player:d.id,creature:dc,level:3,dmg:0};
 g.r.battle={tile:21,attacker:a.id,defender:d.id,atkCreature:ac,startedAt:1,supports:{[a.id]:!defense?{kind:'support',cardId:'onitsugi'}:jinx?{kind:'support',cardId:'jinx'}:{kind:'none'},[d.id]:defense?{kind:'support',cardId:'onitsugi'}:jinx?{kind:'support',cardId:'jinx'}:{kind:'none'}}};G.resolveBattle(g.r);g.p=winner;return g;}
for(const defense of [false,true]){
 const g=battle({defense});eq(g.r.pending[g.p.id].type,'frontline_swap','both roles can replace');ok(g.p.exile.includes('onitsugi'),'weapon consumed');
 const restored=G.restoreRoom(G.serializeRoom(g.r)).room;ok(restored,'weapon authorization saved');g.r=restored;g.p=restored.players.find(p=>p.id===g.p.id);
 const old=g.r.owners[21].creature,level=g.r.owners[21].level,cost=g.p.gold,option=g.r.pending[g.p.id].options.find(o=>o.card==='nome');
 choose(g,option.id);eq(g.r.owners[21].level,level,'land level preserved');eq(g.r.elemOv[21],'earth','land element preserved');ok(!g.r.owners[21].dmg,'HP reset');ok(g.p.hand.includes(old),'winner returns hand');eq(g.p.gold,cost-G.CREATURES.nome.cost,'summon cost');eq(g.r.pending[g.p.id].type,'draft','only one replacement');
}
for(const defense of [false,true]){const g=battle({defense,jinx:true});eq(g.r.lastBattle.win,!defense,'sword user still wins despite Disarm');ok(g.r.pending[g.p.id]?.type!=='frontline_swap','Disarm removes weapon ability');ok(!g.r.battleAfter?.weaponFrontline,'no replacement authorization from disabled weapon');}
{
 const g=battle({lose:true});ok(!g.r.lastBattle.win,'invasion fails');ok(g.r.pending[g.p.id]?.type!=='frontline_swap','surviving losing invader cannot replace');
}
{
 const g=battle({jaki:true});eq(g.r.pending[g.p.id].type,'frontline_swap','Jaki and sword share choice');choose(g,'fl:cancel');eq(g.r.pending[g.p.id].type,'draft','decline once');
}
{
 const g=game();g.p.hand=['sp_chain_gold'];g.r.owners[21]={player:g.p.id,creature:'nome',level:1};G.askRoll(g.r,g.p);eq(G.standardBot.choose(g.r,g.p,g.r.pending[g.p.id]).id,'sp:sp_chain_gold','BOT uses profitable chain gold');
 g.p.hand=['sp_mana_forge','gecko'];G.askRoll(g.r,g.p);choose(g,'sp:sp_mana_forge');ok(G.standardBot.choose(g.r,g.p,g.r.pending[g.p.id]),'BOT handles sacrifice prompt');
}
console.log('new cards: '+checks+' checks passed');
