const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const timers=[];
const G=new Function('require','__dirname','setInterval','setTimeout',src+`
return {CREATURES,CHAR_DECKS,makeRoom,startGame,beginTurn,handleChoose,moveMarlow,marlowDests,stepDests,tilesOf,
windSupplyProviders,grantWindSupply,pauseWindSupply,startWindSupply,acknowledgeWindSupply,finishWindSupply,
publicState,serializeRoom,restoreRoom,startBattle,resolveBattle,makeDeck,shopRandomPool,publicCardCatalog,rooms,botCardScore};`)
(require,__dirname,()=>0,(fn,ms)=>{timers.push({fn,ms});return 0;});
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
function game(mapId='starting_corridor') {
 const r=G.makeRoom('normal',mapId);r.players=[{id:'a',name:'甲',charId:'mio'},{id:'d',name:'乙',charId:'adel'}];G.startGame(r);r.players.sort((a,b)=>a.id.localeCompare(b.id));
 r.pending={};r.turn=0;r.turnTransition=null;r.owners.fill(null);r.boardSeen=false;r.turnEpoch=10;
 for(const p of r.players){p.hand=['weapon'];p.gold=2000;p.deck=['sp_gold','garble'];p.discard=[];p.exile=[];p.battleWins=0;p.bankrupt=false;}
 const [p,d]=r.players;
 const lands=G.tilesOf(r).flatMap((t,i)=>t.t==='land'?[i]:[]);
 const put=(i,c='poponga',owner=p.id,level=1)=>r.owners[i]={player:owner,level,creature:c,dmg:0};
 return {r,p,d,lands,put};
}
function grant(g,src,dst) {const before=G.windSupplyProviders(g.r,g.p);g.r.owners[dst]=g.r.owners[src];g.r.owners[src]=null;return G.grantWindSupply(g.r,g.p,before,[{from:src,to:dst}]);}
eq([G.CREATURES.poponga.cost,G.CREATURES.poponga.st,G.CREATURES.poponga.hp],[80,20,40],'base');
eq([G.CREATURES.poponga_f.cost,G.CREATURES.poponga_f.st,G.CREATURES.poponga_f.hp],[80,35,60],'evolved');
for(const pool of [G.makeDeck(),G.shopRandomPool()])eq([pool.filter(x=>x==='poponga').length,pool.includes('poponga_f')],[2,false],'two R base copies');
eq(G.publicCardCatalog().counts,{total:77,creatures:47,evolutions:40,spells:25,weapons:5},'catalog');
eq(Object.entries(G.CHAR_DECKS).filter(([,deck])=>deck.includes('poponga')).map(([id,deck])=>[id,deck.filter(c=>c==='poponga').length]),[['mio',1]],'one Poponga in Mio starter only');
for(const map of ['starting_corridor','twin_gate_cavern']){
 const g=game(map),[a,b,c]=g.lands;g.put(a);g.put(b,'marlow');
 const dest=G.marlowDests(g.r).find(i=>i!==a&&i!==b);ok(dest!=null,'wind destination');
 ok(G.moveMarlow(g.r,g.p,b,dest),'Marlow move');eq(g.p.hand,['weapon','garble'],'exactly top card');
 eq(g.r.windSupply.source,{tile:a,creature:'poponga'},'provider');
 const second=G.marlowDests(g.r).find(i=>i!==a&&i!==dest);G.moveMarlow(g.r,g.p,dest,second);eq(g.p.hand.length,2,'once per own turn');
 g.r.owners[a].creature='poponga_f';g.r.turnEpoch++;G.moveMarlow(g.r,g.p,second,dest);eq(g.p.hand.length,3,'new turn restores quota');
 eq(g.r.windSupply.source.creature,'poponga_f','evolved art');
}
{
 const g=game(),[a,b,c,d]=g.lands;g.put(a);eq(grant(g,a,b),false,'sole provider moving itself');
 g.put(c);eq(grant(g,b,d),true,'other provider responds even same ID');
 eq(g.r.windSupply.source.tile,c,'stationary provider chosen');
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a,'poponga',g.p.id,3);g.put(b,'poponga_f');g.put(c,'marlow');
 const before=G.windSupplyProviders(g.r,g.p);[g.r.owners[a].creature,g.r.owners[c].creature]=[g.r.owners[c].creature,g.r.owners[a].creature];
 ok(G.grantWindSupply(g.r,g.p,before,[{from:a,to:c},{from:c,to:a}]),'switch provider may respond to the other mover');
 eq(g.p.hand.length,2,'switch once');eq(g.r.windSupply.source.tile,b,'lowest surviving destination provider');
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a,'poponga',g.p.id,3);g.put(b,'marlow');grant(g,b,c);
 eq(g.r.windSupply.source.creature,'poponga_f','land evolution art');
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a);g.put(b,'marlow');g.r.turn=1;
 eq(grant(g,b,c),false,'not on enemy turn');eq(g.p.hand.length,1,'no draw');
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a,'poponga',g.d.id);g.put(b,'marlow');eq(grant(g,b,c),false,'enemy provider');
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a);g.put(b,'marlow');g.p.deck=[];g.p.discard=[];
 eq(grant(g,b,c),false,'empty draw');eq(g.p.windSupplyEpoch,undefined,'empty does not consume quota');
 eq(G.publicState(g.r,null).windSupply,null,'empty notice private');
 g.p.discard=['sp_gold'];ok(grant(g,c,b),'recycle discard');eq(g.p.hand.at(-1),'sp_gold','recycled draw');
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a);g.put(b,'marlow');
 const before=G.windSupplyProviders(g.r,g.p);g.r.owners[a]=null;g.r.owners[c]=g.r.owners[b];g.r.owners[b]=null;
 eq(G.grantWindSupply(g.r,g.p,before,[{from:b,to:c}]),false,'removed provider');
}
function choose(g,type,options,extra={}) {g.r.pending[g.p.id]={type,options:options.map(id=>({id})),...extra};G.handleChoose(g.r,g.p.id,options[0]);}
for(const map of ['starting_corridor','twin_gate_cavern']){
 const g=game(map),a=g.lands[0];g.put(a);
 const b=g.lands.find(i=>i!==a&&G.stepDests(g.r,g.p,i).some(j=>!g.r.owners[j]));
 g.put(b,'marlow');g.p.hand=['sp_step'];g.p.stepI=b;
 const dest=G.stepDests(g.r,g.p,b).find(i=>!g.r.owners[i]);ok(dest!=null,'step destination');
 choose(g,'step_b',['sd:'+dest]);eq(g.p.hand,['garble'],'Move consumes spell and draws');eq(g.r.pending.a.type,'roll','Move returns to roll');
 G.handleChoose(g.r,'a','sd:'+dest);eq(g.p.hand,['garble'],'duplicate choose ignored');
}
{
 const g=game(),[a,b]=g.lands;g.put(a);g.put(b,'marlow');g.p.hand=['sp_move'];g.p.moveA=a;
 choose(g,'move_b',['mb:'+b]);eq(g.p.hand,['garble'],'Switch draws once');eq(g.r.pending.a.type,'roll','switch resumes');
}
for(const win of [true,false]){
 const g=game();g.put(1);g.put(22,win?'jaki_f':'orphe');g.put(21,win?'gecko':'nome_f',g.d.id,1);g.r.elemOv[21]='earth';
 G.startBattle(g.r,g.p,21);Object.assign(g.r.battle,{atkCreature:win?'jaki_f':'orphe',moveFrom:22,supports:{a:{kind:'none'},d:{kind:'none'}}});g.r.pending={};
 G.resolveBattle(g.r);eq(g.r.lastBattle.win,win,'expected battle result');
 eq(g.p.hand.length,win?2:1,'draw only for committed invasion');
 if(win){eq(g.r.pending.a.type,'frontline_swap','frontline offered after draw');ok(g.r.pending.a.options.some(o=>o.card==='garble'),'draw can supply replacement');}
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a);g.put(b,'marlow');g.p.hand=Array(7).fill('weapon');
 g.r.clients=new Set([{viewerId:null},{viewerId:'a'}]);grant(g,b,c);ok(G.pauseWindSupply(g.r,{type:'end',player:'a'}),'connected surfaces gate');
 const e=g.r.windSupply;eq(g.p.hand.length,8,'draw committed before presentation');eq(g.r.pending.a.type,'creature_effect','no action during presentation');
 eq(G.publicState(g.r,null).windSupply.card,undefined,'board cannot see card');eq(G.publicState(g.r,'d').windSupply.card,undefined,'opponent cannot see card');eq(G.publicState(g.r,'a').windSupply.card,'garble','owner can see card');
 G.startWindSupply(g.r);G.acknowledgeWindSupply(g.r,e.id,'board');ok(e.active,'early ack rejected');
 e.startedAt=Date.now()-4000;G.acknowledgeWindSupply(g.r,'wrong','phone');ok(e.active,'stale ack ignored');
 G.acknowledgeWindSupply(g.r,e.id,'board');ok(e.active,'wait for phone');
 const saved=G.serializeRoom(g.r);g.r.clients=new Set();const timerCount=timers.length,restored=G.restoreRoom(saved).room;
 ok(timers.length>timerCount,'restore rearms the timeout');
 ok(restored?.windSupply.active,'pending presentation restored');eq(restored.players[0].hand.length,8,'no redraw on restore');
 G.acknowledgeWindSupply(restored,e.id,'phone');eq(restored.pending.a.type,'overflow','normal end turn handles overflow');
 G.finishWindSupply(restored,e.id);eq(restored.players[0].hand.length,8,'completion idempotent');
 eq(restored.players[0].windSupplyEpoch,10,'quota persisted');
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a);g.put(b,'marlow');g.r.clients=new Set([{viewerId:'a'}]);grant(g,b,c);
 G.pauseWindSupply(g.r,{type:'roll',player:'a'});ok(g.r.windSupply.startedAt,'phone-only starts directly');
 timers.at(-1).fn();eq(g.r.pending.a.type,'roll','timeout resumes disconnected client');eq(g.p.hand.length,2,'timeout no redraw');
}
{
 const g=game();g.put(1);g.put(22,'jaki_f');g.put(21,'gecko',g.d.id);g.r.elemOv[21]='earth';g.r.clients=new Set([{viewerId:null}]);
 G.startBattle(g.r,g.p,21);Object.assign(g.r.battle,{atkCreature:'jaki_f',moveFrom:22,supports:{a:{kind:'none'},d:{kind:'none'}}});g.r.pending={};
 G.resolveBattle(g.r);eq(g.r.pending.a.type,'creature_effect','battle draw presentation precedes frontline');
 const id=g.r.windSupply.id;G.finishWindSupply(g.r,id);eq(g.r.pending.a.type,'frontline_swap','battle continuation after presentation');
 eq(g.p.hand.length,2,'battle resumed without second draw');
}
{
 const g=game(),[a,b,c]=g.lands;g.put(a);g.put(b,'marlow');g.r.clients=new Set([{viewerId:'a'}]);grant(g,b,c);
 G.pauseWindSupply(g.r,{type:'roll',player:'a'});const saved=G.serializeRoom(g.r);saved.room.windSupply.deadline=Date.now()-1;g.r.clients=new Set();
 const restored=G.restoreRoom(saved).room;eq(timers.at(-1).ms,0,'expired saved presentation resumes immediately');timers.at(-1).fn();
 eq(restored.pending.a.type,'roll','expired restore does not deadlock');
 const bad=G.serializeRoom(g.r);delete bad.room.windSupply.resume;ok(G.restoreRoom(bad).error,'corrupt continuation rejected');
}
for(const pre of ['c','e']){const b=fs.readFileSync(`${__dirname}/public/assets/${pre}_poponga.png`);eq([b.readUInt32BE(16),b.readUInt32BE(20),b[25]],[300,300,6],'board asset');}
G.rooms.clear();console.log(`Poponga / Wataranga: ${checks} checks passed`);
