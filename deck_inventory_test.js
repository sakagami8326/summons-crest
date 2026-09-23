const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {makeFixtureRoom,ownedCardSnapshot,publicState,askRoll,askSpellEvolve,handleChoose,startPickDraw,drawCards,startDraft,resolveTile,continuePostBattle,consumeBattleSupport,spellDamage,startVillaRecovery,makeShopVisit,askMarket,resolveBattle,TILES,serializeRoom,restoreRoom};')(require,__dirname,()=>0,()=>0);
let checks=0;
function fixture(){const r=G.makeFixtureRoom();r.owners.fill(null);r.pending={};r.turn=0;r.turnTransition=null;r.tileFx={};r.curses={};r.barrier={};r.effectQueue=[];r.windSupply=null;const p=r.players[0];Object.assign(p,{hand:[],deck:[],discard:[],exile:[],resolving:[],pickCards:[],gold:2000,spellCast:false});return {r,p};}
function inventory(r,p,expected,exile=[]){const s=G.publicState(r,p.id).players.find(q=>q.id===p.id);assert.deepEqual(s.inventoryList.slice().sort(),expected.slice().sort());assert.deepEqual(s.exileList.slice().sort(),exile.slice().sort());assert.deepEqual(G.ownedCardSnapshot(r,p).slice().sort(),expected.slice().sort());checks++;}
{
 const {r,p}=fixture();p.deck=['nome','nome'];p.hand=['weapon'];p.discard=['sp_gold'];p.resolving=['sp_fatal_reward'];p.pickCards=['shield'];r.owners[1]={player:p.id,creature:'jaki',level:3};r.owners[2]={player:'fx1',creature:'gecko',level:1};p.exile=['jinx'];
 const all=['nome','nome','weapon','sp_gold','sp_fatal_reward','shield','jaki_f'];inventory(r,p,all,['jinx']);
 r.battle={attacker:p.id,defender:'fx1',tile:2,atkCreature:'nome',supports:{}};
 assert.deepEqual(G.ownedCardSnapshot(r,p).sort(),all.sort(),'combat references do not duplicate hand or land');checks++;
 r.battle.corridor=true;r.battle.atkCreature='gaston';assert.deepEqual(G.ownedCardSnapshot(r,p).sort(),[...all,'gaston'].sort());checks++;
}
{
 const {r,p}=fixture();p.deck=['nome','weapon','sp_gold'];G.startPickDraw(r,p);inventory(r,p,['nome','weapon','sp_gold']);
 G.handleChoose(r,p.id,'pd:1');inventory(r,p,['nome','weapon','sp_gold']);
 G.drawCards(r,p,3);inventory(r,p,['nome','weapon','sp_gold']);
 r.deck=['jaki','jaki','sp_evolve'];G.startDraft(r,p,'end');inventory(r,p,['nome','weapon','sp_gold']);
 G.handleChoose(r,p.id,'take:jaki');inventory(r,p,['nome','weapon','sp_gold','jaki']);
 r.turnTransition=null;r.deck=['jaki','sp_evolve','shield'];G.startDraft(r,p,'end');G.handleChoose(r,p.id,'skip');inventory(r,p,['nome','weapon','sp_gold','jaki']);
}
{
 const {r,p}=fixture();p.hand=['nome','sp_evolve'];G.askSpellEvolve(r,p);G.handleChoose(r,p.id,'ev:0');inventory(r,p,['nome_f','sp_evolve']);
 p.pos=G.TILES.findIndex(t=>t.t==='land');G.resolveTile(r,p);G.handleChoose(r,p.id,'summon:nome_f');inventory(r,p,['nome_f','sp_evolve']);
 G.spellDamage(r,p.pos,999,'test');inventory(r,p,['nome_f','sp_evolve']);
}
{
 const {r,p}=fixture();p.hand=['nome'];r.owners[1]={player:p.id,creature:'jaki',level:1};
 r.battleAfter={winner:p.id,attacker:p.id,defender:'fx1',tile:1,invasionWon:true,mermaidDone:true,recoveryDone:true};G.continuePostBattle(r);
 assert.equal(r.pending[p.id].type,'frontline_swap');G.handleChoose(r,p.id,'fl:0');inventory(r,p,['nome','jaki']);
}
{
 const {r,p}=fixture();p.hand=['sp_step','shield'];r.owners[1]={player:p.id,creature:'jaki',level:3};r.owners[2]={player:'fx1',creature:'gecko',level:1};
 G.askRoll(r,p);G.handleChoose(r,p.id,'sp:sp_step');G.handleChoose(r,p.id,'st:1');G.handleChoose(r,p.id,'sd:2');
 assert(r.battle,'move invasion started');inventory(r,p,['sp_step','shield','jaki_f']);
 G.resolveBattle(r);inventory(r,p,['sp_step','shield','jaki_f']);
}
{
 const {r,p}=fixture();p.hand=['sp_gold','weapon'];G.askRoll(r,p);G.handleChoose(r,p.id,'sp:sp_gold');inventory(r,p,['sp_gold','weapon']);
 G.consumeBattleSupport(r,p.id,{kind:'support',cardId:'weapon'});inventory(r,p,['sp_gold'],['weapon']);
 G.startVillaRecovery(r,p);G.handleChoose(r,p.id,'vr:0');G.handleChoose(r,p.id,'vr:confirm');inventory(r,p,['sp_gold','weapon']);
}
{
 const {r,p}=fixture();p.hand=['fugorm'];p.pos=G.TILES.findIndex(t=>t.t==='land');G.resolveTile(r,p);G.handleChoose(r,p.id,'summon:fugorm');inventory(r,p,['fugorm','weapon']);
 r.turnTransition=null;G.makeShopVisit(r,p);G.askMarket(r,p);const item=r.shopVisit.items.find(x=>x.card==='weapon');G.handleChoose(r,p.id,'buy:'+item.slotId);inventory(r,p,['fugorm','weapon','weapon']);
 const save=G.serializeRoom(r);assert(!Object.hasOwn(save.room,'stateInstanceId'));const restored=G.restoreRoom(save);assert(!restored.error,restored.error);assert.notEqual(restored.room.stateInstanceId,r.stateInstanceId);inventory(restored.room,restored.room.players[0],['fugorm','weapon','weapon']);
}
console.log('PASS',checks,'inventory multisets: zones, duplicates, combat references, random/pick draws, summon, evolution, destruction, frontline swap, move invasion, spells, exile/recovery, effect gain, shop and save/restore');
