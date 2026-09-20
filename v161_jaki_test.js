const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+`
return {CREATURES,CHAR_DECKS,makeRoom,startGame,resolveBattle,continuePostBattle,handleChoose,publicState,
 serializeRoom,restoreRoom,makeDeck,shopRandomPool,publicCardCatalog,standardBot,rooms};`)(require,__dirname,()=>0,()=>0);
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
function game(){const r=G.makeRoom();r.players=[{id:'p1',name:'甲',charId:'grease'},{id:'p2',name:'乙',charId:'adel'}];
 G.startGame(r);r.pending={};r.turn=0;r.turnTransition=null;
 for(const p of r.players){p.hand=[];p.gold=1000;p.discard=[];p.exile=[];p.battleWins=0;}
 return r;
}
function battle({defense=false,form='jaki',hand=['nome'],level=1,move=false,win=true}={}){
 const r=game(),a=r.players[0],d=r.players[1],p=defense?d:a;
 const ac=defense?(win?'orphe':'avalanche_f'):form,dc=defense?form:(win?'gecko':'avalanche_f');
 a.hand=[ac,...(defense?[]:hand)];d.hand=defense?hand.slice():[];r.elemOv[21]='earth';
 r.owners[21]={player:d.id,level,creature:dc};
 if(move){a.hand=hand.slice();r.owners[22]={player:a.id,level:1,creature:form,dmg:3};}
 r.battle={tile:21,attacker:a.id,defender:d.id,atkCreature:ac,startedAt:1,
   supports:{[a.id]:{kind:'none'},[d.id]:{kind:'none'}},...(move?{moveFrom:22}:{})};
 G.resolveBattle(r);return {r,p,a,d};
}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id);
const pick=(g,card)=>{const o=g.r.pending[g.p.id].options.find(o=>o.card===card);assert.ok(o,card+' selectable');choose(g,o.id);};
const j=G.CREATURES.jaki;
eq([j.name,j.evo,j.elem,j.rarity,j.cost,j.st,j.hp,j.evoSt,j.evoHp],['ジャキ','アシュラカン','earth','R',90,45,30,60,60],'approved definition');
eq(G.CREATURES.jaki_f.fx,j.fx,'ability shared by both forms');
for(const pool of [G.makeDeck(),G.shopRandomPool()])eq([pool.filter(c=>c==='jaki').length,pool.includes('jaki_f')],[2,false],'two base cards only');
eq(G.makeDeck().length,152,'common deck total');
eq(G.publicCardCatalog().counts,{total:77,creatures:47,evolutions:40,spells:25,weapons:5},'public counts');
eq(G.CHAR_DECKS.grease,['nome','nome','nome','jaki','jaki','cleo','sp_gold','sp_insight','sp_evolve','shield','shield','jinx'],'approved starter');
for(const form of ['jaki','jaki_f'])for(const defense of [false,true]){
 const g=battle({form,defense,hand:['nome','nome']});
 eq(g.r.pending[g.p.id].type,'frontline_swap','victor can swap in either role');
 eq(g.r.lastBattle.win,!defense,'expected winner');
 eq(g.r.lastBattle.effectStates[defense?'defender':'attacker'].state,'active','victory UI marks ability active');
 const costBefore=g.p.gold,handBefore=g.p.hand.length,option=g.r.pending[g.p.id].options.filter(o=>o.card==='nome')[1];
 choose(g,option.id);
 eq(g.r.owners[21],{player:g.p.id,level:1,creature:'nome'},'replacement starts fresh on same land');
 eq(g.p.hand,['nome',form],'only chosen duplicate leaves; Jaki returns to hand');
 eq(g.p.gold,costBefore-G.CREATURES.nome.cost,'pay exactly replacement summon cost');
 eq(g.p.hand.length,handBefore,'swap preserves hand size');
 ok(!g.p.discard.includes(form),'return is not discard');
 eq(g.r.pending[g.p.id].type,'draft','winner receives reward after swap');
 eq(g.p.battleWins,1,'one victory recorded');
 choose(g,option.id);eq(g.p.gold,costBefore-G.CREATURES.nome.cost,'duplicate packet cannot charge again');
}
{
 const g=battle({defense:true,hand:['nome_f'],level:3});
 g.r.owners[21].shade=20;g.r.owners[21].iceWard=true;
 pick(g,'nome_f');eq(g.r.owners[21],{player:g.p.id,level:3,creature:'nome_f'},'land level preserved, creature buffs cleared');
 eq(g.r.elemOv[21],'earth','land element preserved');eq(g.p.hand,['jaki'],'level evolution ends on return');
}
{
 const g=battle({move:true});ok(!g.r.owners[22],'move invasion vacates source');pick(g,'nome');
 eq(g.r.owners[21].creature,'nome','move invasion victory supports swapping');
}
for(const defense of [false,true]){
 const g=battle({defense});const before=JSON.stringify([g.p,g.r.owners[21]]);choose(g,'fl:cancel');
 eq(JSON.stringify([g.p,g.r.owners[21]]),before,'cancel has no cost or card effect');
 eq(g.r.pending[g.p.id].type,'draft','cancel continues battle reward');
}
for(const hand of [[],['sp_gold','shield']]){const g=battle({hand});eq(g.r.pending[g.p.id].type,'draft','no creature skips choice');}
{
 const g=battle({hand:['jaki']});pick(g,'jaki');eq(g.r.pending[g.p.id].type,'draft','another Jaki cannot retrigger same victory');
}
for(const defense of [false,true]){const g=battle({defense,win:false});ok(!Object.values(g.r.pending).some(p=>p.type==='frontline_swap'),'losing Jaki cannot swap');}
for(const mutate of [g=>g.p.gold=0,g=>g.p.hand[0]='sp_gold',g=>g.r.owners[21]=null,g=>g.r.owners[21].player=g.d.id]){
 const g=battle();const id=g.r.pending[g.p.id].options.find(o=>o.card==='nome').id;
 mutate(g);const before=JSON.stringify([g.p,g.r.owners[21]]);choose(g,id);
 eq(JSON.stringify([g.p,g.r.owners[21]]),before,'stale state rejected without spending');
}
{
 const g=battle();const before=JSON.stringify(g.r.pending);choose(g,'fl:999');
 eq(JSON.stringify(g.r.pending),before,'forged index retains valid prompt');
 eq(G.publicState(g.r,g.d.id).pending[g.p.id].options,[],'enemy cannot inspect candidates');
 eq(G.publicState(g.r,null).pending[g.p.id].options,[],'TV cannot inspect candidates');
 const saved=G.serializeRoom(g.r),restored=G.restoreRoom(saved);ok(restored.room,'pending survives save');
 g.r=restored.room;g.p=g.r.players.find(p=>p.id===g.p.id);pick(g,'nome');
 eq(g.r.pending[g.p.id].type,'draft','restored swap resumes reward');
}
// The new arrival gets placement abilities, but did not win the preceding battle.
for(const [card,type,id]of [['samurai_saga','samurai_elem','se:none'],['night_jelly','abyss_mark','am:21']]){
 const g=battle({hand:[card]});pick(g,card);eq(g.r.pending[g.p.id].type,type,'placement ability opens');
 choose(g,id);eq(g.r.pending[g.p.id].type,'draft','placement choice returns to reward');
}
{
 const g=battle({hand:['gaust']});g.p.deck=['sp_gold'];pick(g,'gaust');
 eq(g.r.pending[g.p.id].type,'gaust_exile','Gaust placement draw/exile works');
 choose(g,g.r.pending[g.p.id].options[0].id);eq(g.r.pending[g.p.id].type,'draft','Gaust resumes battle');
}
{
 const g=battle({hand:['mermaid']});g.r.owners[22]={player:g.p.id,creature:'nome',level:1,dmg:10};
 pick(g,'mermaid');eq(g.r.owners[22].dmg,10,'replacement Mermaid does not trigger victory healing');
 eq(g.r.pending[g.p.id].type,'draft','no replacement victory choice');
}
{
 const g=battle({hand:['kamadoma_f']});g.p.exile=['gshield'];pick(g,'kamadoma_f');
 ok(g.p.hand.includes('weapon'),'replacement Daitekkan placement gives sword');
 eq(g.p.exile,['gshield'],'replacement Daitekkan cannot claim victory recovery');
}
{
 const g=battle({hand:['komao']});g.r.elemOv[21]='water';pick(g,'komao');eq(g.r.elemOv[21],'earth','replacement land conversion fires');
}
{
 const g=battle({defense:true,hand:['nome_f']});g.r.owners[21].dmg=25;
 eq(G.standardBot.choose(g.r,g.p,g.r.pending[g.p.id]).id,'fl:0','BOT replaces wounded fighter with stronger defense');
 g.p.gold=0;eq(G.standardBot.choose(g.r,g.p,g.r.pending[g.p.id]).id,'fl:cancel','BOT declines unaffordable swap');
}
for(const prefix of ['c','e']){
 const data=fs.readFileSync(`${__dirname}/public/assets/${prefix}_jaki.png`);
 eq([data.readUInt32BE(16),data.readUInt32BE(20),data[25]],[300,300,6],'RGBA board asset');
 const webp=fs.readFileSync(`${__dirname}/public/assets/cards/${prefix}_jaki.webp`);
 eq(webp.toString('ascii',8,12),'WEBP','card asset');
}
G.rooms.clear();console.log(`v1.61 Jaki: ${checks} checks passed`);
