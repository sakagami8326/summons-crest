'use strict';
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {rooms,makeFixtureRoom,resolveBattle,handleChoose,publicState,serializeRoom,restoreRoom,ownedCardSnapshot,onCreatureSummoned};')(require,__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert(a,m);checks++;};
function battle({card='joma_f',level=1,defense=false,lose=false,move=false,corridor=false,deck=[],discard=[]}={}){
 const r=G.makeFixtureRoom(),a=r.players[0],d=r.players[1];Object.assign(r,{turn:0,turnEpoch:12,phase:'playing',pending:{},turnReadyAt:0,turnTransition:null,boardSeen:false,battleAfter:null,deck:['shield','weapon','sp_gold','cleo'],tileFx:{},curses:{},barrier:{},effectQueue:[],effectResume:null});r.owners.fill(null);
 for(const p of r.players)Object.assign(p,{gold:1000,hand:[],deck:[],discard:[],exile:[],battleWins:0,bankrupt:false,cardsCollected:0});
 a.hand=[defense?'orphe':card];a.deck=deck.slice();a.discard=discard.slice();a.pos=21;d.pos=1;
 r.elemOv[21]='wind';r.owners[21]={player:d.id,creature:defense?card:lose?'avalanche_f':'gecko',level,dmg:defense||lose?0:level>=3?35:20};
 r.battle={tile:21,attacker:a.id,defender:d.id,atkCreature:a.hand[0],startedAt:1,supports:{[a.id]:{kind:'none'},[d.id]:{kind:'none'}}};
 if(move){r.owners[22]={player:a.id,creature:card,level:1};a.hand=[];r.battle.moveFrom=22;}
 if(corridor){a.hand=[];r.battle.corridor=true;}
 G.resolveBattle(r);return {r,a,d,p:defense?d:a};
}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id);
for(const [card,level] of [['joma_f',1],['joma',3]]){
 const g=battle({card,level});eq(g.r.lastBattle.win,true,'invasion succeeds');eq(g.r.pending[g.p.id].type,'draft','reward comes before the search even with no existing weapons');
 eq(g.r.draft.rewardSearch,{tile:21},'search resumes after reward');choose(g,'take:shield');eq(g.r.pending[g.p.id].type,'card_search','newly acquired weapon opens search');
 eq(g.r.pending[g.p.id].after,'battle_reward','cannot start another battle reward');eq(g.r.pending[g.p.id].options.map(o=>o.card),['shield'],'new weapon eligible');eq(g.p.cardsCollected,1,'acquired once');
 for(const viewer of [null,g.d.id])eq(G.publicState(g.r,viewer).pending[g.p.id].options,[],'search candidates remain private');
 const option=g.r.pending[g.p.id].options[0],before=G.ownedCardSnapshot(g.r,g.p).length;choose(g,option.id);
 eq(g.p.hand,['shield'],'chosen weapon enters the hand');eq(g.p.deck,[],'moved, not copied');eq(G.ownedCardSnapshot(g.r,g.p).length,before,'search conserves inventory');eq(g.p.cardsCollected,1,'search does not count another acquisition');
 ok(g.r.pending[g.p.id]?.type!=='draft','no second reward');choose(g,option.id);eq(g.p.hand,['shield'],'stale selection cannot duplicate weapon');
}
for(const reward of ['take:shield','take:sp_gold','skip']){
 const g=battle({deck:['weapon','cleo'],discard:['jinx']});eq(g.r.pending[g.p.id].type,'draft','existing candidates do not trigger early search');choose(g,reward);
 eq(g.r.pending[g.p.id].type,'card_search','search follows accepted or skipped reward');
 const cards=g.r.pending[g.p.id].options.map(o=>o.card).sort();eq(cards,reward==='take:shield'?['jinx','shield','weapon']:['jinx','weapon'],'unselected common cards excluded, original deck/discard included');
 const original=g.r.pending[g.p.id].options.find(o=>o.card==='jinx');choose(g,original.id);eq(g.p.hand,['jinx'],'can choose original discard instead');
}
for(const reward of ['take:sp_gold','skip']){const g=battle();choose(g,reward);ok(g.r.pending[g.p.id]?.type!=='card_search','no weapon skips without blocking');eq(g.p.hand,[],'no free weapon');}
{const g=battle({card:'joma',deck:['weapon']});eq(g.r.pending[g.p.id].type,'card_search','base Joma retains placement timing');choose(g,g.r.pending[g.p.id].options[0].id);eq(g.r.pending[g.p.id].type,'draft','base placement search resumes reward');ok(!g.r.draft.rewardSearch,'base gets no deferred second search');}
for(const config of [{defense:true},{lose:true}]){const g=battle(config);eq(g.r.lastBattle.win,false,'defender wins');eq(g.r.pending[g.d.id]?.type,'draft','winner receives normal reward');ok(!g.r.draft.rewardSearch,'defense and defeated invasions do not gain this search');}
for(const stage of ['draft','search']){
 const g=battle();if(stage==='search')choose(g,'take:shield');const save=G.serializeRoom(g.r),restored=G.restoreRoom(save);ok(!restored.error,'restore '+stage+': '+restored.error);
 g.r=restored.room;g.p=g.r.players.find(p=>p.id===g.p.id);
 if(stage==='draft')choose(g,'take:shield');eq(g.r.pending[g.p.id].type,'card_search','restored deferred search');choose(g,g.r.pending[g.p.id].options[0].id);eq(g.p.hand,['shield'],'restored result');
 G.rooms.delete(g.r.code);
}
{const g=battle();const save=G.serializeRoom(g.r);save.room.draft.rewardSearch.tile=999;ok(G.restoreRoom(save).error,'invalid deferred search rejected');}
{const g=battle();choose(g,'take:shield');const pending=g.r.pending[g.p.id];g.p.deck[0]='weapon';choose(g,pending.options[0].id);eq(g.p.hand,[],'stale candidate cannot move a different card');}
for(const config of [{move:true},{corridor:true}]){const g=battle(config);eq(g.r.lastBattle.win,true,'movement invasion succeeds');eq(g.r.pending[g.p.id]?.type,'draft','movement keeps normal reward');ok(!g.r.draft.rewardSearch,'moving an existing creature does not trigger placement search');}
{const g=battle();g.p.hand=Array(7).fill('cleo');choose(g,'take:shield');eq(g.r.pending[g.p.id].type,'card_search','search before hand limit');choose(g,g.r.pending[g.p.id].options[0].id);eq(g.r.pending[g.p.id].type,'overflow','hand overflow resumes normally');choose(g,'ov:cleo');eq(g.p.hand.length,7,'hand limit enforced after search');}
{const g=battle();g.p.gold=-1;choose(g,'take:shield');eq(g.r.pending[g.p.id].type,'card_search','search before settlement');choose(g,g.r.pending[g.p.id].options[0].id);eq(g.r.pending[g.p.id].type,'sell','debt settlement resumes after search');}
console.log('PASS Jomagia post-reward search, real battles, inventory, privacy, skips, unchanged base/defense, save/restore and stale requests:',checks);
