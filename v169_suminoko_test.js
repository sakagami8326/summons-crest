'use strict';
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+`;return {VERSION,CREATURES,CHAR_DECKS,makeDeck,shopRandomPool,publicCardCatalog,makeRoom,startGame,tilesOf,calculateBattle,resolveBattle,landDefenseStats,resolveTile,publicState,publicBattle,serializeRoom,restoreRoom,rooms,handleChoose,ask,spellDamage,reconcileCharcoalArmor,creatureEffectUi};`)(require('./test_helpers/default-rarity-require.cjs'),__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++},ok=(a,m)=>{assert.ok(a,m);checks++};
function game(map='starting_corridor',level=1,attacker='nome'){
 const r=G.makeRoom('normal',map);r.players=[{id:'a',name:'侵略者',charId:'linnei'},{id:'d',name:'防衛者',charId:'linnei'}];G.startGame(r);r.players.sort((a,b)=>a.id.localeCompare(b.id));
 r.pending={};r.turn=0;r.turnTransition=null;r.owners.fill(null);r.tileFx={};r.curses={};r.elemOv={};r.barrier={};
 for(const p of r.players){p.hand=[attacker,'weapon','sp_step','sp_move','sp_swap','gecko'];p.gold=2000;p.deck=['sp_gold'];p.discard=[];p.exile=[];}
 const tiles=G.tilesOf(r).flatMap((t,i)=>t.t==='land'?[i]:[]),tile=tiles[0];r.elemOv[tile]='water';r.owners[tile]={player:'d',creature:'suminoko',level,dmg:0};r.players[0].pos=tile;
 r.battle={attacker:'a',defender:'d',tile,atkCreature:attacker,supports:{},startedAt:Date.now()};return {r,tile,tiles};
}
eq(G.VERSION,'1.70','version');
eq([G.CREATURES.suminoko.st,G.CREATURES.suminoko.hp,G.CREATURES.suminoko.cost,G.CREATURES.suminoko_f.st,G.CREATURES.suminoko_f.hp,G.CREATURES.suminoko_f.cost],[10,50,85,20,70,100],'approved stats and separate evolution cost');
for(const pool of [G.makeDeck(),G.shopRandomPool()])eq([pool.filter(x=>x==='suminoko').length,pool.includes('suminoko_f')],[2,false],'pool');
eq(G.makeDeck().length,179,'deck count');eq(G.publicCardCatalog().counts,{total:87,creatures:53,evolutions:46,spells:28,weapons:6},'catalog counts');
eq(G.publicCardCatalog().cards.find(c=>c.id==='suminoko').evolution.cost,100,'catalog evolution cost');
ok(Object.values(G.CHAR_DECKS).every(d=>!d.includes('suminoko')),'no starter additions');
for(const map of ['starting_corridor','twin_gate_cavern'])for(const level of [1,3]){
 const {r,tile}=game(map,level);const gain=level===1?5:10;r.owners[tile].charcoalDf=100;
 const before=JSON.stringify(r),q=G.calculateBattle(r);eq(q.defDF,100,'uncapped baseline');eq(JSON.stringify(r),before,'pure calculation');
 eq(G.publicBattle(r).previewStats.defender.df,100,'public prediction');G.resolveBattle(r);
 eq(r.owners[tile].charcoalDf,100+gain,'one growth after zero-damage defense');eq(r.lastBattle.df,100,'growth not retroactive');eq(r.lastBattle.charcoalGrowth.gain,gain,'growth event');
 eq(G.landDefenseStats(r,tile).df,100+gain,'next defense gets new DF');
 r.battle={attacker:'a',defender:'d',tile,atkCreature:'avalanche',supports:{}};G.resolveBattle(r);eq(r.owners[tile].charcoalDf,100+2*gain,'double-hit grows once');
 r.owners[tile].level=3;eq(G.landDefenseStats(r,tile).df,100+2*gain,'evolution preserves accumulated amount');
 const saved=G.serializeRoom(r);saved.gameVer='1.68';const restored=G.restoreRoom(saved);ok(restored.room,'old version restore');eq(restored.room.owners[tile].charcoalDf,100+2*gain,'restore accumulated');G.rooms.delete(restored.room.code);
 const old=G.serializeRoom(r);delete old.room.owners[tile].charcoalDf;const legacy=G.restoreRoom(old);ok(legacy.room,'legacy no field');eq(G.landDefenseStats(legacy.room,tile).df,0,'legacy zero');G.rooms.delete(legacy.room.code);
 const val=r.owners[tile].charcoalDf;G.spellDamage(r,tile,1,'test');eq(r.owners[tile].charcoalDf,val,'spell no growth');
 r.battle=null;r.pending={};G.resolveTile(r,r.players[0]);eq(r.owners[tile].charcoalDf,val,'landing no growth');ok(G.publicState(r,null).players.every(p=>!p.hand.length),'hands private');G.rooms.delete(r.code);
}
{
 const {r,tile}=game('starting_corridor',1,'magado');r.owners[tile].dmg=49;G.resolveBattle(r);eq(r.owners[tile].creature,'magado','defeated replaced');eq(r.owners[tile].charcoalDf,undefined,'no defeated armor inherited');G.rooms.delete(r.code);
}
{
 const {r,tile,tiles}=game();const src=tiles[1];r.owners[src]={player:'a',creature:'suminoko',level:3,charcoalDf:100};r.owners[tile]={player:'d',creature:'nome',level:1,dmg:30};r.battle.atkCreature='suminoko_f';r.battle.moveFrom=src;
 const q=G.calculateBattle(r);eq(q.atkDF,100,'moving invader carries armor');eq(G.publicBattle(r).previewStats.attacker.df,100,'invading preview');G.resolveBattle(r);eq(r.owners[tile].charcoalDf,100,'moving conquest retains armor');eq(r.owners[src],null,'source vacated');G.rooms.delete(r.code);
}
{
 const {r,tile,tiles}=game();const other=tiles[1];r.battle=null;r.owners[tile].player='a';r.owners[tile].charcoalDf=55;r.owners[other]={player:'a',creature:'gecko',level:1};r.players[0].moveA=tile;
 G.ask(r,'a','move_b','test',[{id:'mb:'+other}]);G.handleChoose(r,'a','mb:'+other);
 eq([r.owners[other].creature,r.owners[other].charcoalDf,r.owners[tile].charcoalDf],['suminoko',55,undefined],'land swap moves armor with creature');G.rooms.delete(r.code);
}
{
 const {r,tile}=game();r.battle=null;r.owners[tile].player='a';r.owners[tile].charcoalDf=35;r.players[0].swapI=tile;
 G.ask(r,'a','swap_pick','test',[{id:'sp2:gecko'}]);G.handleChoose(r,'a','sp2:gecko');eq(r.owners[tile].charcoalDf,undefined,'replacement clears');G.rooms.delete(r.code);
}
{
 const {r,tile}=game();r.owners[tile].charcoalDf=-5;G.reconcileCharcoalArmor(r);eq(r.owners[tile].charcoalDf,undefined,'invalid removed');r.owners[tile].creature='gecko';r.owners[tile].charcoalDf=50;G.reconcileCharcoalArmor(r);eq(r.owners[tile].charcoalDf,undefined,'unrelated creature stale field removed');G.rooms.delete(r.code);
}
{
 const {r,tile}=game();r.battle=null;r.owners[tile].player='a';r.owners[tile].charcoalDf=65;
 const adjacent=G.tilesOf(r).findIndex((t,i)=>t.t==='land'&&i!==tile&&!r.owners[i]);
 // Use the actual legal destination generator via the same server source.
 const stepDests=new Function('require','__dirname','setInterval','setTimeout',source+';return stepDests;')(require,__dirname,()=>0,()=>0);
 const dest=stepDests(r,r.players[0],tile).find(i=>!r.owners[i]);ok(dest!==undefined,'legal empty destination');r.players[0].stepI=tile;
 G.ask(r,'a','step_b','test',[{id:'sd:'+dest}]);G.handleChoose(r,'a','sd:'+dest);
 eq(r.owners[dest].charcoalDf,65,'empty-land move retains armor');eq(r.owners[tile],null,'move source vacated');G.rooms.delete(r.code);
}
{
 const {r,tile}=game();r.owners[tile].charcoalDf=500;r.battle.atkCreature='suminoko';
 eq(G.calculateBattle(r).atkDF,0,'hand attacker cannot borrow defender armor');eq(G.creatureEffectUi(r,'suminoko',tile,'attacker').state,'inactive','hand attacker effect inactive');
 const saved=G.serializeRoom(r);saved.room.owners[tile].charcoalDf=-1;ok(G.restoreRoom(saved).error,'invalid save field rejected');G.rooms.delete(r.code);
}
console.log('PASS Suminoko '+checks+' checks');
