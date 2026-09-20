const fs = require('fs'), assert = require('assert/strict');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'setInterval', 'setTimeout', src + `
return { makeRoom,startGame,askRoll,handleChoose,resolveUltSequence,resolveTile,startBattle,
 calculateBattle,resolveBattle,publicState,serializeRoom,restoreRoom,performMove,cavernTeleport,
 castleLandBonus,CREATURES,CHAR_DECKS,MAPS,standardBot,rooms };`)(require, __dirname, () => 0, () => 0);
let checks = 0;
const eq = (a,b,msg) => { assert.deepEqual(a,b,msg); checks++; };
const ok = (a,msg) => { assert.ok(a,msg); checks++; };
function game(mapId='starting_corridor') {
 const r=G.makeRoom('normal',mapId);
 r.players=[{id:'p1',name:'甲',charId:'mio'},{id:'p2',name:'乙',charId:'adel'}];
 G.startGame(r);r.players.sort((a,b)=>a.id.localeCompare(b.id));r.pending={};r.turn=0;r.turnTransition=null;r.turnReadyAt=0;
 const [p,q]=r.players; p.hand=['cleo','weapon'];p.gold=1000;p.dir=1;
 r.owners.fill(null);r.owners[1]={player:q.id,creature:'cleo',level:1};r.elemOv[1]='water';
 return {r,p,q};
}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id);
function ultimate(g,target=1) {
 G.askRoll(g.r,g.p);choose(g,'ult');choose(g,'mt:'+target);G.resolveUltSequence(g.r);
}
function restore(g) {
 const saved=G.restoreRoom(G.serializeRoom(g.r));ok(saved.room,'save restores');
 g.r=saved.room;g.p=g.r.players.find(p=>p.id==='p1');g.q=g.r.players.find(p=>p.id==='p2');
}
eq(G.CHAR_DECKS.adel.slice(0,6),['survey','survey','palecoral','mermaid','orphe','cleo'],'Adel approved replacement');
eq(G.CHAR_DECKS.mio,['gaston','gaston','marlow','marlow','garble','poponga','sp_gold','sp_insight','sp_step','weapon','weapon','jinx'],'Mio replaces Cleo with Poponga, keeping Garble, Double Draw and one Move');
eq(G.CHAR_DECKS.nerasio.filter(c=>c==='komao').length,2,'Nerasio keeps partner');
eq([G.CREATURES.komao.cost,G.CREATURES.komao.st,G.CREATURES.komao.hp],[90,20,30],'Komao base');
eq([G.CREATURES.komao_f.cost,G.CREATURES.komao_f.st,G.CREATURES.komao_f.hp],[90,30,50],'evolved AT preserved');
for(const [lands,expected] of [[0,100],[105,111],[1000,200],[5000,600]])eq(G.castleLandBonus(lands),expected,'fixed income and rounding '+lands);
for(const mapId of Object.keys(G.MAPS)) {
 const g=game(mapId);ultimate(g);eq(g.p.pos,1,'Mio reaches target '+mapId);
 ok(g.r.pending[g.p.id].options.some(o=>o.id==='invade'&&o.label.includes('AT+20')),'prompt shows buff');
 restore(g);choose(g,'invade');choose(g,'atk:cleo');restore(g);
 const b=g.r.battle;b.supports={p1:'weapon',p2:'jinx'};
 const buffed=G.calculateBattle(g.r),normal=G.calculateBattle(g.r,{...b,mioUlt:false});
 eq(buffed.atkDmg-normal.atkDmg,20,'bonus survives Disarm '+mapId);
 eq(buffed.defSt,normal.defSt,'defense AT does not receive bonus');
 ok(G.publicState(g.r,null).battlePreview.mioUlt,'public preview carries bonus');
 const view=G.standardBot.view(g.r,g.p,g.r.pending[g.p.id]);
 ok(view.r.battle.mioUlt,'BOT view retains public buff');
 G.resolveBattle(g.r);eq(g.r.lastBattle.atkPostAt,50,'actual battle applies base30 + ultimate20 with weapon disarmed');
 ok(g.r.lastBattle.notes.some(n=>n.includes('追い風の導き')),'battle explains bonus');
 G.startBattle(g.r,g.p,1);g.r.battle.atkCreature='cleo';
 ok(!g.r.battle.mioUlt,'subsequent ordinary invasion has no buff');
}
for(const action of ['toll','empty','own','barrier']) {
 const g=game();
 if(action==='empty')g.r.owners[1]=null;
 if(action==='own')g.r.owners[1].player=g.p.id;
 if(action==='barrier')g.r.barrier[g.q.id]=true;
 ultimate(g);
 if(action==='toll'||action==='barrier')choose(g,'toll');
 else ok(!g.r.pending[g.p.id].mioUlt,'non-enemy destination has no buff');
 g.r.owners[2]={player:g.q.id,creature:'cleo',level:1};g.p.pos=2;
 G.resolveTile(g.r,g.p);choose(g,'invade');
 ok(!g.r.battle.mioUlt,'bonus not carried from '+action);
}
for(const mapId of Object.keys(G.MAPS))for(const eligible of [true,false]) {
 const g=game(mapId),map=G.MAPS[mapId];g.r.owners.fill(null);g.p.gold=1000;
 if(mapId==='twin_gate_cavern') {
  g.p.gatesVisited=eligible?map.gates.slice():[];G.cavernTeleport(g.r,g.p,map.castle);
 } else {
  g.p.pos=(map.castle+map.tiles.length-1)%map.tiles.length;g.p.seal=eligible;
  G.performMove(g.r,g.p,1,{value:1},'1歩');
 }
 eq(g.p.gold,eligible?1200:1000,'zero-land castle payout '+mapId+' '+eligible);
 if(eligible)eq([g.r.lastDice.castle.landFixedBonus,g.r.lastDice.castle.landRate,g.r.lastDice.castle.total],[100,.1,200],'castle breakdown');
}
G.rooms.clear();console.log(`Mobility balance: ${checks} checks passed`);
