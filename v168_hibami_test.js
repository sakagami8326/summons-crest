'use strict';
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+`;return {VERSION,CREATURES,CHAR_DECKS,MARKET_POOL,makeDeck,shopRandomPool,publicCardCatalog,makeRoom,startGame,tilesOf,calculateBattle,resolveBattle,landCombatUi,landDefenseStats,creatureEffectUi,resolveTile,publicState,publicBattle,serializeRoom,restoreRoom,rooms,botChooseOption};`)(require('./test_helpers/default-rarity-require.cjs'),__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++},ok=(a,m)=>{assert.ok(a,m);checks++};
function game(map='starting_corridor',cid='hibami',level=1,attacker='magado'){
 const r=G.makeRoom('normal',map);r.players=[{id:'a',name:'侵略者',charId:'adel'},{id:'d',name:'防衛者',charId:'linnei'}];G.startGame(r);r.players.sort((a,b)=>a.id.localeCompare(b.id));
 r.pending={};r.turn=0;r.turnTransition=null;r.owners.fill(null);r.tileFx={};r.curses={};r.elemOv={};r.barrier={};
 for(const p of r.players){p.hand=['magado','weapon'];p.gold=2000;p.deck=['sp_gold'];p.discard=[];p.exile=[];}
 const tile=G.tilesOf(r).findIndex(t=>t.t==='land');r.elemOv[tile]='water';r.owners[tile]={player:'d',creature:cid,level,dmg:0};r.players[0].pos=tile;
 r.battle={attacker:'a',defender:'d',tile,atkCreature:attacker,supports:{},startedAt:Date.now()};
 return {r,tile};
}
eq(G.VERSION,'1.70','version');
eq([G.CREATURES.hibami.name,G.CREATURES.hibami_f.name,G.CREATURES.hibami.elem,G.CREATURES.hibami.rarity],['ヒバミ','エンラージャ','fire','R'],'identity');
eq([G.CREATURES.hibami.st,G.CREATURES.hibami.hp,G.CREATURES.hibami.cost,G.CREATURES.hibami_f.st,G.CREATURES.hibami_f.hp,G.CREATURES.hibami_f.cost],[20,40,80,30,60,80],'stats');
for(const pool of [G.makeDeck(),G.shopRandomPool()])eq([pool.filter(x=>x==='hibami').length,pool.includes('hibami_f')],[2,false],'R pool; no evolved cards');
eq([G.MARKET_POOL.length,G.makeDeck().length],[48,179],'pool totals');
eq(G.publicCardCatalog().counts,{total:87,creatures:53,evolutions:46,spells:28,weapons:6},'catalog counts');
ok(G.publicCardCatalog().cards.find(c=>c.id==='hibami'),'public card');
ok(Object.values(G.CHAR_DECKS).every(deck=>!deck.includes('hibami')),'starter decks unchanged');
for(const map of ['starting_corridor','twin_gate_cavern'])for(const [cid,level,loss,at,hp] of [['hibami',1,10,20,40],['hibami',3,20,30,60],['hibami_f',1,20,30,60]]){
 const {r,tile}=game(map,cid,level),before=JSON.stringify(r),b=G.calculateBattle(r);
 eq(b.atkDmg,55-loss,'defending debuff: '+map+cid+level);eq([b.defSt,b.effHp,b.defDF],[at,hp,0],'counter/HP/DF unchanged on off-element land');
 eq(b.intimidation,loss,'amount');eq(JSON.stringify(r),before,'pure battle calculation');
 eq(G.landCombatUi(r,tile).attackReduction,loss,'landing uses same amount');
 eq(G.creatureEffectUi(r,cid,tile,'attacker').state,'inactive','defense only');
 eq(G.publicBattle(r).previewStats.attacker.at,55-loss,'public prediction parity');
 r.battle.supports.a={kind:'support',cardId:'weapon'};r.players[0].blade=true;r.tileFx[tile]={vortex:true};r.battle.mioUlt=true;
 eq(G.calculateBattle(r).atkDmg,55+20+10+10+20-loss,'all AT bonuses then reduction');
 eq(G.publicBattle(r).previewStats.attacker.at,55+10+10+20-loss,'hidden weapon excluded');
 G.rooms.delete(r.code);
}
{
 const {r,tile}=game('starting_corridor','hibami',3,'nome'),b=G.calculateBattle(r);eq([b.atkDmg,b.intimidationApplied],[0,10],'AT floor and actual reduction');
 r.battle.supports.a={kind:'support',cardId:'weapon'};G.resolveBattle(r);
 eq([r.lastBattle.atkPreAt,r.lastBattle.atkPostAt,r.lastBattle.intimidationApplied],[0,10,20],'weapon presentation does not produce negative or inflated AT');
 ok(r.lastBattle.notes.some(n=>n.includes('【炎威】')&&n.includes('20')),'resolved log');G.rooms.delete(r.code);
}
{
 const {r}=game('starting_corridor','hibami',3,'avalanche'),b=G.calculateBattle(r);
 eq([b.hitsDone,b.dealt],[2,2*b.atkDmg],'double hit applies reduced AT per hit');G.rooms.delete(r.code);
}
{
 const {r,tile}=game('starting_corridor','magado',1,'hibami');eq(G.calculateBattle(r).atkDmg,20,'no debuff when invading');
 r.owners[tile+1]={player:'d',creature:'hibami',level:3,dmg:0};eq(G.calculateBattle(r).atkDmg,20,'no adjacent aura');G.rooms.delete(r.code);
}
{
 const {r,tile}=game();r.battle=null;G.resolveTile(r,r.players[0]);
 const pub=G.publicState(r,null),privateState=G.publicState(r,'a');
 eq(pub.landCombat[tile].attackReduction,10,'landing before invade');eq(pub.enemyLand.stats.at,20,'landing counter is defender AT');
 ok(pub.players.every(p=>p.hand.length===0),'public landing hides all hands');ok(privateState.players[0].hand.length>0,'phone receives own hand');
 eq(G.publicState(r,null).enemyLand.stats,G.landDefenseStats(r,tile),'landing stat parity');
 const snapshot=G.serializeRoom(r);snapshot.gameVer='1.67';const restored=G.restoreRoom(snapshot);
 ok(restored.room,'old version restore accepted');eq(G.landCombatUi(restored.room,tile).attackReduction,10,'restore reconstructs ability without new saved fields');
 const chosen=G.botChooseOption(r,r.players[0],r.pending.a);ok(r.pending.a.options.some(o=>o.id===chosen),'BOT has a legal landing choice');
 G.rooms.delete(r.code);G.rooms.delete(restored.room.code);
}
console.log('PASS Hibami: '+checks+' checks (defense, both evolutions/maps, weapons, secrecy, floor, double hit, save/BOT)');
