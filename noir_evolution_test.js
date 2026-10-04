'use strict';
const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+`;return {CREATURES,SPELLS,CHARS,ULTS,CHAR_DECKS,makeRoom,startGame,handleChoose,onCreatureSummoned,askRoll,queueLandEvolution,processPlacementQueue,ownedCardSnapshot,publicState,serializeRoom,restoreRoom,rooms,resolveUltSequence,beginUltSequence,performMove,resolveTile,cavernGate,cavernTeleport,calculateBattle,makeDeck,shopRandomPool,publicCardCatalog,tilesOf,mapOf,botStandard:standardBot};`)(require,__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
function game(map='starting_corridor'){
 const r=G.makeRoom('normal',map);r.players=[{id:'a',name:'使用者',charId:'noir'},{id:'b',name:'対戦相手',charId:'grease'}];G.startGame(r);r.players.sort((a,b)=>a.id.localeCompare(b.id));
 r.phase='playing';r.turn=0;r.turnEpoch=10;r.pending={};r.turnTransition=null;r.turnReadyAt=0;r.owners.fill(null);r.clients=new Set();r.boardSeen=false;r.effectQueue=[];r.effectResume=null;
 for(const p of r.players)Object.assign(p,{hand:[],deck:[],discard:[],exile:[],gold:2000,bankrupt:false,spellCast:false,ultUsed:false,dir:1,cardsCollected:0});
 const [p,q]=r.players,lands=G.tilesOf(r).flatMap((t,i)=>t.t==='land'?[i]:[]);p.pos=lands[0];
 const put=(card,level=1,tile=lands[0])=>r.owners[tile]={player:p.id,creature:card,level,dmg:0};
 return {r,p,q,lands,put};
}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id);
const counts=list=>list.reduce((out,c)=>(out[c]=(out[c]||0)+1,out),{});
for(const invalid of ['marker','queue tile','queue card','resume','gate epoch']) {
 const g=game();g.put('joma');const save=G.serializeRoom(g.r);
 if(invalid==='marker')save.room.owners[g.lands[0]].evolutionAbilityUsed='yes';
 if(invalid==='queue tile')save.room.placementQueue=[{player:'a',tile:999,creature:'joma_f'}];
 if(invalid==='queue card')save.room.placementQueue=[{player:'a',tile:g.lands[0],creature:'unknown'}];
 if(invalid==='resume')save.room.placementResume={player:'a',type:'summon'};
 if(invalid==='gate epoch')save.room.players[0].gateEvolutionEpoch=-1;
 ok(G.restoreRoom(save).error,'invalid save rejected: '+invalid);
}
eq(G.CHARS.noir.elem,null,'neutral summoner');eq(G.CHAR_DECKS.noir.length,12,'12-card deck');
eq(counts(G.CHAR_DECKS.noir),{cleo:2,inkcrow:1,joma:1,yomiga:1,kagetsuzuri:1,sp_gold:1,sp_insight:1,sp_censor:1,shield:2,jinx:1},'approved starter counts');
eq(G.publicCardCatalog().counts,{total:82,creatures:51,evolutions:44,spells:26,weapons:5},'catalog');
for(const pool of [G.makeDeck(),G.shopRandomPool()])for(const id of ['inkcrow','joma','yomiga','kagetsuzuri']){eq(pool.filter(c=>c===id).length,2,'R copies');ok(!pool.includes(id+'_f'),'no evolved market copies');}
for(const [id,cost,st,hp,est,ehp] of [['inkcrow',80,20,40,40,80],['joma',90,10,40,30,90],['yomiga',100,20,35,40,80],['kagetsuzuri',110,30,45,60,75]]){
 eq([G.CREATURES[id].cost,G.CREATURES[id].st,G.CREATURES[id].hp,G.CREATURES[id+'_f'].st,G.CREATURES[id+'_f'].hp],[cost,st,hp,est,ehp],id+' stats');
 for(const prefix of ['c','e'])for(const extension of ['png','webp'])ok(fs.existsSync(__dirname+'/public/assets/'+(extension==='webp'?'cards/':'')+prefix+'_'+id+'.'+extension),'asset '+id);
}
for(const [id,candidates] of [['joma',['shield','shield','gweapon']],['yomiga',['sp_gold','sp_insight','sp_censor']]])for(const reason of ['summon','swap','battle','frontline']){
 const g=game();g.put(id);g.p.deck=[candidates[0],'cleo'];g.p.discard=[candidates[1],candidates[2]];g.p.exile=[candidates[0]];g.p.hand=[candidates[2]];
 const before=counts(G.ownedCardSnapshot(g.r,g.p));ok(G.onCreatureSummoned(g.r,g.p,id,reason,g.lands[0]),'search pauses');
 eq(g.r.pending.a.options.map(o=>o.card),candidates,'deck and discard candidates; duplicates preserved');
 for(const viewer of [null,'b']){const state=G.publicState(g.r,viewer);eq(state.pending.a.options,[],'search private');eq(state.players.find(p=>p.id==='a').hand,[],'enemy hand private');}
 const selected=g.r.pending.a.options[1];choose(g,selected.id);eq(g.p.hand.at(-1),selected.card,'selected moved');eq(counts(G.ownedCardSnapshot(g.r,g.p)),before,'inventory unchanged by search');eq(g.p.cardsCollected,0,'not acquisition');
 const hand=[...g.p.hand];choose(g,selected.id);eq(g.p.hand,hand,'duplicate ignored');
}
for(const id of ['joma','yomiga']){const g=game();g.put(id);eq(G.onCreatureSummoned(g.r,g.p,id,'summon',g.lands[0]),false,'zero candidates skips');}
for(const id of ['inkcrow','inkcrow_f']){
 const g=game();g.put(id);g.p.deck=['sp_gold','shield','sp_insight'];const before=counts(G.ownedCardSnapshot(g.r,g.p));
 ok(G.onCreatureSummoned(g.r,g.p,id,'swap',g.lands[0]),'draw selection');eq(g.p.hand.length,id.endsWith('_f')?3:2,'draw amount');
 eq(G.publicState(g.r,'b').pending.a.options,[],'discard selection private');const option=g.r.pending.a.options[0];choose(g,option.id);eq(g.p.discard,[option.card],'normal discard');eq(g.p.exile,[],'not exile');eq(counts(G.ownedCardSnapshot(g.r,g.p)),before,'draw and discard conserve IDs');
}
for(const n of [0,1,2,5]){
 const g=game();g.p.hand=['sp_censor'];g.p.deck=['sp_insight'];g.q.hand=Array(n).fill('shield');G.askRoll(g.r,g.p);
 eq(g.r.pending.a.options.some(o=>o.id==='sp:sp_censor'),n>0,'empty targets excluded');if(!n)continue;
 choose(g,'sp:sp_censor');eq(g.p.gold,2000,'target selection unpaid');choose(g,'censor:b');eq(g.p.gold,1880,'paid before reveal');eq(g.p.discard,['sp_censor'],'spent spell');
 eq(g.r.pending.a.options.length,Math.min(2,n),'reveal max2');eq(G.publicState(g.r,'b').pending.a.options,[],'target cannot see candidates');eq(G.publicState(g.r,null).pending.a.options,[],'board cannot see candidates');
 ok(!g.r.pending.a.options.some(o=>o.id.includes('cancel')),'cannot cancel after reveal');
 const restored=G.restoreRoom(G.serializeRoom(g.r));ok(!restored.error,'save during reveal');eq(restored.room.pending.a.options,g.r.pending.a.options,'same snapshots after restore');
 const selected=g.r.pending.a.options[0];choose(g,selected.id);eq(g.q.hand.length,n-1,'discard one');eq(g.q.discard,['shield'],'target normal discard');eq(g.p.hand,['sp_insight'],'caster draws one');eq(g.p.gold,1880,'one payment');
 choose(g,selected.id);eq(g.q.hand.length,n-1,'no double discard');eq(g.p.gold,1880,'no double payment');
 ok(!g.r.log.some(l=>String(l).includes('シールド')),'hidden card not logged');
}
{
 const g=game();g.q.hand=['shield'];g.p.deck=['shield','sp_gold','sp_insight'];G.beginUltSequence(g.r,g.p);G.resolveUltSequence(g.r);eq(g.p.ultUsed,true,'once per match');eq(g.q.hand,[],'ultimate discards');eq(g.q.discard,['shield'],'ultimate normal discard');eq(g.p.hand.length,3,'ultimate draws3');eq(G.publicState(g.r,null).cardEffectNotices[0].count,1,'public counts only');
}
for(const id of ['trooper','fugorm','kamadoma','inkcrow','joma','yomiga','night_jelly']){
 const g=game(),o=g.put(id,2);g.p.deck=['shield','sp_gold','sp_insight'];const weapons=g.p.deck.filter(c=>c==='weapon').length;
 o.level=3;G.queueLandEvolution(g.r,g.p,g.lands[0]);G.processPlacementQueue(g.r,{type:'roll',player:g.p.id});eq(o.evolutionAbilityUsed,true,'evolution marker '+id);
 if(id==='trooper')ok(!g.p.deck.includes('sp_flame_vortex'),'evolved Trooper does not generate');
 if(id==='fugorm')eq(g.p.deck.filter(c=>c==='weapon').length,weapons+1,'evolved Fugorm generates');
 if(id==='kamadoma')ok(!g.p.hand.includes('weapon'),'evolved Kamadoma does not generate');
 if(['joma','yomiga'].includes(id))eq(g.r.pending.a.type,'card_search','evolution search');
 const before=JSON.stringify(G.ownedCardSnapshot(g.r,g.p));G.queueLandEvolution(g.r,g.p,g.lands[0]);eq((g.r.placementQueue||[]).length,0,'only once');eq(JSON.stringify(G.ownedCardSnapshot(g.r,g.p)),before,'no duplicate effect');
 const result=G.restoreRoom(G.serializeRoom(g.r));ok(!result.error,'restore evolved ability '+id);eq(result.room.owners[g.lands[0]].evolutionAbilityUsed,true,'marker saved');
}
for(const id of ['inkcrow','joma','yomiga']){const g=game();g.put(id+'_f');g.p.deck=['sp_gold','shield'];G.onCreatureSummoned(g.r,g.p,id+'_f','swap',g.lands[0]);G.queueLandEvolution(g.r,g.p,g.lands[0]);eq((g.r.placementQueue||[]).length,0,'forged placement cannot retrigger');}
{
 const g=game();g.put('joma',3);const restored=G.restoreRoom(G.serializeRoom(g.r));ok(!restored.error,'old save without marker restores');eq(restored.room.owners[g.lands[0]].evolutionAbilityUsed,true,'old evolved placement marked complete');G.queueLandEvolution(restored.room,restored.room.players[0],g.lands[0]);eq(restored.room.placementQueue.length,0,'restore cannot replay evolved placement');
}
{
 const g=game('twin_gate_cavern');g.p.hand=['joma'];g.p.gatesVisited=[];G.cavernTeleport(g.r,g.p,G.mapOf(g.r).gates[0]);ok(g.p.gateEvolutionEpoch!==g.r.turnEpoch,'teleport does not earn pass evolution');ok(g.r.pending.a?.type!=='gate_pass_evolve','gate teleport uses landing choices only');
 const other=game('twin_gate_cavern');other.p.hand=['joma'];other.p.gatesVisited=[];other.p.pos=G.mapOf(other.r).gates[0];G.cavernGate(other.r,other.p,[]);eq(other.p.gateEvolutionEpoch,other.r.turnEpoch,'cavern path grants pass entitlement');G.cavernGate(other.r,other.p,[]);eq(other.p.gatesVisited.length,1,'repeat gate cannot grant new seal');
}
for(const map of ['starting_corridor','twin_gate_cavern']){
 const g=game(map);g.p.hand=['joma'];g.p.gateEvolutionEpoch=g.r.turnEpoch;G.resolveTile(g.r,g.p);eq(g.r.pending.a.type,'gate_pass_evolve','pass evolution '+map);
 const saved=G.restoreRoom(G.serializeRoom(g.r));ok(!saved.error,'save evolution choice');
 choose(g,'gp:0');eq(g.p.hand,['joma_f'],'evolves selected card');eq(g.p.gold,1850,'150G');ok(g.r.pending.a.type!=='gate_pass_evolve','continues landing');choose(g,'gp:0');eq(g.p.gold,1850,'no duplicate charge');
}
for(const state of ['poor','no card','already used','gate stop','stale turn']){
 const g=game();g.p.hand=['joma'];g.p.gateEvolutionEpoch=g.r.turnEpoch;
 if(state==='poor')g.p.gold=149;if(state==='no card')g.p.hand=['shield'];if(state==='already used')g.p.gateEvolutionUsedEpoch=g.r.turnEpoch;if(state==='gate stop')g.p.pos=G.tilesOf(g.r).findIndex(t=>t.t==='gate');if(state==='stale turn')g.p.gateEvolutionEpoch--;
 G.resolveTile(g.r,g.p);ok(g.r.pending.a?.type!=='gate_pass_evolve','skip '+state);
}
{
 const g=game();g.p.pos=G.tilesOf(g.r).findIndex(t=>t.t==='gate')-1;g.p.seal=false;g.p.hand=['joma'];G.performMove(g.r,g.p,2,{value:2},'2');eq(g.p.gateEvolutionEpoch,g.r.turnEpoch,'real gate path entitlement');eq(g.r.pending.a.type,'gate_pass_evolve','pass before stop');
}
for(const id of ['kagetsuzuri','kagetsuzuri_f'])for(const n of [1,3,10]){
 const g=game();g.put('magado',1);g.r.owners[g.lands[0]].player=g.q.id;g.p.hand=[id,...Array(n).fill('shield')];
 const b={tile:g.lands[0],attacker:'a',defender:'b',atkCreature:id,supports:{a:{kind:'support',cardId:'shield'},b:{kind:'none'}}};
 const result=G.calculateBattle(g.r,b);eq(result.atkDmg,G.CREATURES[id].st+Math.min(id.endsWith('_f')?30:20,(n-1)*5),'remaining hand after creature and weapon');
}
for(const type of ['card_search','inkcrow_discard','censor_pick','censor_target','gate_pass_evolve'])ok(G.botStandard.handledPending.has(type),'BOT handles '+type);
console.log('PASS Noir/evolution:',checks,'checks');
