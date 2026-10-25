'use strict';
const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {makeRoom,startGame,askRoll,handleChoose,publicState,serializeRoom,restoreRoom,CREATURES,SPELLS};')(require,__dirname,()=>0,()=>0);
function fixture(map='starting_corridor',old='suminoko',level=3,incoming='nome'){
 const r=G.makeRoom('normal',map);r.players=[{id:'p1',name:'甲',charId:'linnei'},{id:'p2',name:'乙',charId:'adel'}];G.startGame(r);
 r.pending={};r.turn=0;r.turnTransition=null;r.turnReadyAt=0;r.owners.fill(null);r.tileFx={};r.curses={};r.effectQueue=[];r.windSupply=null;
 const p=r.players[0];Object.assign(p,{hand:['sp_swap',incoming,incoming],deck:[],discard:[],exile:[],gold:2000,spellCast:false});
 r.owners[1]={player:p.id,creature:old,level,dmg:7,shade:3,charcoalDf:25,iceWard:true,evolutionAbilityUsed:true};r.elemOv[1]='water';
 G.askRoll(r,p);return{r,p};
}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id);
function begin(g){choose(g,'sp:sp_swap');assert.equal(g.r.pending[g.p.id].type,'swap_land');choose(g,'sw:1');assert.equal(g.r.pending[g.p.id].type,'swap_pick');}
let cases=0;
for(const map of ['starting_corridor','twin_gate_cavern'])for(const[old,level,incoming]of[['suminoko',3,'nome'],['jaki_f',1,'nome_f'],['jaki',3,'jaki'],['nome',1,'nome']])for(const restore of [false,true]){
 let g=fixture(map,old,level,incoming);begin(g);
 if(restore){const actor=g.p.id,result=G.restoreRoom(G.serializeRoom(g.r));assert(!result.error,result.error);g={r:result.room,p:result.room.players.find(p=>p.id===actor)};}
 const before=g.p.gold;choose(g,'sp2:'+incoming);
 assert.deepEqual(g.p.hand,[incoming,old],'return exact original card, including forged vs land-only evolution');
 assert.deepEqual(g.p.discard,['sp_swap'],'only the spell enters the discard pile');
 assert.equal(g.p.gold,before-G.SPELLS.sp_swap.cost-G.CREATURES[incoming].cost);
 const owner=g.r.owners[1];assert.equal(owner.creature,incoming);assert.equal(owner.level,level);assert.equal(g.r.elemOv[1],'water');
 assert.equal(owner.dmg,0);assert.equal(owner.shade,0);assert(!owner.charcoalDf&&!owner.iceWard);
 const snapshot=JSON.stringify([g.p.hand,g.p.gold,g.p.discard,owner]);choose(g,'sp2:'+incoming);assert.equal(JSON.stringify([g.p.hand,g.p.gold,g.p.discard,owner]),snapshot,'repeat packet cannot duplicate returned card');
 const other=g.r.players.find(p=>p.id!==g.p.id);assert.deepEqual(G.publicState(g.r,other.id).players.find(p=>p.id===g.p.id).hand,[],'returned hand card stays private');cases++;
}
for(const step of ['land','creature']){
 const g=fixture(),before=JSON.stringify([g.p.hand,g.p.gold,g.p.discard,g.r.owners[1]]);choose(g,'sp:sp_swap');
 if(step==='creature')choose(g,'sw:1');choose(g,step==='land'?'sw:cancel':'sp2:cancel');
 assert.equal(JSON.stringify([g.p.hand,g.p.gold,g.p.discard,g.r.owners[1]]),before,'cancel leaves source on land and spends nothing');cases++;
}
{
 const g=fixture('starting_corridor','jaki',1,'fugorm');begin(g);choose(g,'sp2:fugorm');
 assert(g.p.hand.includes('jaki'));assert.deepEqual(g.p.deck,['weapon'],'replacement placement ability still runs');cases++;
}
assert.match(G.SPELLS.sp_swap.desc,/元のクリーチャーは手札へ戻る/);
console.log('PASS Change return:',cases,'cases: both maps, duplicate/same cards, evolution forms, full heal/buff reset, cost, cancel, privacy, repeat, placement and save/restore');
