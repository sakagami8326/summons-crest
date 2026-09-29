const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {makeRoom,startGame,startBattle,resolveBattle,evolutionPrayerProviders,serializeRoom,restoreRoom,publicState,tollOf};')(require,__dirname,()=>0,()=>0);
function setup({atk='orphe',def='nome_f',move=false,providers=[],blade=false}={}){
 const r=G.makeRoom();r.players=[{id:'a',name:'甲',charId:'redani'},{id:'d',name:'乙',charId:'mio'}];G.startGame(r);r.pending={};r.turn=0;r.turnTransition=null;r.owners.fill(null);r.tileFx={};r.curses={};
 const[a,d]=r.players;for(const p of r.players){p.gold=20;p.hand=[];p.discard=[];p.exile=[];p.battleWins=0;}
 a.hand=[atk];a.blade=blade;r.owners[21]={player:d.id,level:1,creature:def};r.elemOv[21]='earth';
 providers.forEach((c,i)=>r.owners[i+1]={player:a.id,level:1,creature:c});if(move){r.owners[22]={player:a.id,level:1,creature:atk};a.hand=[];}
 G.startBattle(r,a,21);Object.assign(r.battle,{atkCreature:atk,supports:{a:{kind:'none'},d:{kind:'none'}},...(move?{moveFrom:22}:{})});r.pending={};return{r,a,d};
}
function verify(g){const before=g.r.players.map(p=>p.gold);G.resolveBattle(g.r);const b=g.r.lastBattle,balances={a:before[0],d:before[1]};for(const e of b.moneyEvents){assert(e.amount>0);if(e.from){assert.equal(e.fromBefore,balances[e.from]);assert.equal(e.fromAfter,e.fromBefore-e.amount);balances[e.from]=e.fromAfter;}assert.equal(e.toBefore,balances[e.to]);assert.equal(e.toAfter,e.toBefore+e.amount);balances[e.to]=e.toAfter;}g.r.players.forEach(p=>assert.equal(balances[p.id],p.gold));assert.deepEqual(G.publicState(g.r,null).lastBattle.moneyEvents,b.moneyEvents);const restored=G.restoreRoom(G.serializeRoom(g.r));assert(!restored.error,restored.error);assert.deepEqual(restored.room.lastBattle.moneyEvents,b.moneyEvents);return b;}
{
 const g=setup(),expected=G.tollOf(g.r,21),b=verify(g);assert.equal(b.win,false);assert.equal(b.moneyEvents[0].amount,expected);assert.equal(b.moneyEvents[0].reason,'toll');assert(g.a.gold<0,'negative cash is preserved, not capped');
}
{
 const b=verify(setup({move:true}));assert.equal(b.win,false);assert.equal(b.tollWaived,true);assert.deepEqual(b.moneyEvents,[]);
}
{
 const b=verify(setup({def:'barbaro_f'}));assert.equal(b.win,false);assert.deepEqual(b.moneyEvents.map(e=>e.reason),['toll','rage']);assert.equal(b.moneyEvents[1].amount,50);
}
{
 const g=setup({atk:'zati_f',def:'gecko',providers:['evol','evol_f'],blade:true});g.r.players[0].hand.push('gweapon');g.r.battle.supports.a={kind:'support',cardId:'gweapon'};const b=verify(g);assert(b.win);assert.deepEqual(b.moneyEvents.map(e=>e.reason),['plunder','bloodstained_blade','evolution_prayer']);assert.equal(b.moneyEvents[2].amount,400);assert.equal(b.moneyEvents[2].from,null);assert.equal(b.moneyEvents[2].providers.length,2);
}
console.log('PASS battle money: toll, negative cash, movement exemption, rage, plunder, blade, stacked prayer, ordered balances, public payload and save/restore');
