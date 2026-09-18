const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+`
return {CREATURES,CHAR_DECKS,makeRoom,startGame,startBattle,resolveBattle,continuePostBattle,handleChoose,publicState,
 serializeRoom,restoreRoom,makeDeck,shopRandomPool,publicCardCatalog,botCardScore,evolutionPrayerProviders,terrainBreakdown,rooms};`)(require,__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
function game({defense=false,creature='gecko_f',level=1,providers=['evol'],move=false,old=false}={}){
 const r=G.makeRoom();r.players=[{id:'a',name:'甲',charId:'grease'},{id:'d',name:'乙',charId:'adel'}];G.startGame(r);
 r.pending={};r.turn=0;r.turnTransition=null;r.owners.fill(null);
 const [a,d]=r.players,p=defense?d:a;
 for(const p of r.players){p.hand=[];p.gold=2000;p.discard=[];p.exile=[];p.battleWins=0;}
 providers.forEach((c,i)=>r.owners[i+1]={player:p.id,level:1,creature:c});
 r.owners[21]={player:d.id,level,creature:defense?creature:'gecko'};r.elemOv[21]='earth';
 a.hand=[defense?'orphe':creature];
 if(move){r.owners[22]={player:a.id,level,creature};a.hand=[];}
 G.startBattle(r,a,21);
 Object.assign(r.battle,{atkCreature:defense?'orphe':creature,supports:{a:{kind:'none'},d:{kind:'none'}},...(move?{moveFrom:22}:{})});
 if(old)delete r.battle.evolutionPrayerProviders;
 r.pending={};return {r,a,d,p};
}
function finish(g){G.resolveBattle(g.r);return g.r.lastBattle.evolutionPrayer;}
const c=G.CREATURES.evol,e=G.CREATURES.evol_f;
eq([c.name,c.evo,c.elem,c.rarity,c.cost,c.st,c.hp,c.evoSt,c.evoHp],['エヴォル','アセンシア',null,'R',120,20,40,40,70],'approved stats');
eq([e.cost,e.st,e.hp,e.elem],[120,40,70,null],'evolved summon stats');
ok(c.fx.includes('100G')&&e.fx.includes('300G')&&e.fx.includes('重複'),'ability text');
for(const pool of [G.makeDeck(),G.shopRandomPool()])eq([pool.filter(x=>x==='evol').length,pool.includes('evol_f')],[2,false],'R two base copies');
eq(G.makeDeck().length,150,'deck total');eq(G.publicCardCatalog().counts,{total:76,creatures:46,evolutions:39,spells:25,weapons:5},'catalog counts');
ok(!Object.values(G.CHAR_DECKS).some(deck=>deck.includes('evol')),'starter decks unchanged');
for(const defense of [false,true])for(const [providers,total] of [[['evol'],100],[['evol_f'],300],[['evol','evol_f'],400],[['evol_f','evol_f'],600],[['evol','evol','evol_f'],500]]){
 const g=game({defense,providers,creature:defense?'nome_f':'gecko_f'}),reward=finish(g);
 eq(reward.gold,total,'stack all providers on either victory');eq(g.r.lastBattle.win,!defense,'expected victor');
 eq(reward.afterGold-reward.beforeGold,total,'exact income');
 eq(reward.providers.length,providers.length,'all sources retained');
 const gold=g.p.gold;G.continuePostBattle(g.r);eq(g.p.gold,gold,'post-battle continuation never repeats reward');
 const restored=G.restoreRoom(G.serializeRoom(g.r)).room;ok(restored,'restore completed reward');
 eq(restored.players.find(p=>p.id===g.p.id).gold,gold,'income preserved after restore');
 eq(G.publicState(g.r,null).lastBattle.evolutionPrayer.gold,total,'public result carries amount');
}
{
 const g=game({defense:true,creature:'evol_f',providers:['evol']});eq(finish(g).gold,400,'Ascensia own defense includes herself');
 eq(G.terrainBreakdown(g.r,21).appliedBonus,0,'no neutral affinity bonus');
}
{
 const g=game({defense:true,creature:'evol',level:3,providers:[]});eq(finish(g).gold,300,'land evolution counts for winner and provider');
}
{
 const g=game({creature:'evol_f',providers:[]});eq(finish(g),undefined,'hand invasion newly places Ascensia without self reward');
}
{
 const g=game({creature:'evol_f',move:true,providers:['evol']});eq(finish(g).gold,400,'already-placed moving Ascensia includes herself');
}
{
 const g=game({creature:'gecko',move:true,level:3});eq(finish(g).gold,100,'moving level-evolved attacker qualifies');
}
{
 const g=game({creature:'jaki',level:3});g.a.hand.push('gweapon');g.r.battle.supports[g.a.id]={kind:'support',cardId:'gweapon'};
 eq(finish(g),undefined,'evolving only after taking level3 land gives no reward');ok(g.r.lastBattle.win,'unevolved attacker did win');
}
for(const defense of [false,true]){const g=game({defense,creature:defense?'beruf':'gecko'});eq(finish(g),undefined,'unevolved victory is ineligible');}
{
 const g=game({providers:[]});g.r.owners[1]={player:g.d.id,level:1,creature:'evol_f'};
 g.r.battle.evolutionPrayerProviders=G.evolutionPrayerProviders(g.r);eq(finish(g),undefined,'enemy providers do not pay winner');
}
{
 const g=game({providers:[]});g.r.owners[1]={player:g.a.id,level:1,creature:'evol_f'};
 eq(finish(g),undefined,'new provider after battle start excluded');
}
{
 const g=game({old:true});eq(finish(g).gold,100,'old saved battle fallback snapshots before resolution');
}
{
 const g=game({providers:[]});g.r.owners[1]=null;
 g.r.battle.evolutionPrayerProviders=G.evolutionPrayerProviders(g.r);eq(finish(g),undefined,'removed provider earns no later battle income');
}
{
 const g=game({creature:'mimic',providers:['evol_f']});g.r.owners[21].creature='gecko_f';g.r.battle.supports[g.a.id]={kind:'support',cardId:'gweapon'};g.a.hand.push('gweapon');
 eq(finish(g),undefined,'Mimic copying evolved stats is not evolved');ok(g.r.lastBattle.win,'copying attacker won');
}
{
 const g=game({providers:['evol','evol_f']});const restored=G.restoreRoom(G.serializeRoom(g.r)).room;
 g.r=restored;eq(finish(g).gold,400,'battle-start snapshot survives save/restore');
}
{
 const g=game({creature:'jaki_f',providers:[]});g.a.hand.push('evol_f');finish(g);
 const opt=g.r.pending[g.a.id].options.find(o=>o.card==='evol_f');G.handleChoose(g.r,g.a.id,opt.id);
 eq(g.a.gold,1880,'frontline arrival costs120 and earns no prior victory income');eq(g.r.lastBattle.evolutionPrayer,undefined,'no retroactive reward');
}
{
 const g=game({creature:'jaki_f',providers:['evol_f']});g.a.gold=0;g.a.hand.push('evol');finish(g);
 ok(g.r.pending[g.a.id].options.some(o=>o.card==='evol'),'reward can fund frontline swap');
 const opt=g.r.pending[g.a.id].options.find(o=>o.card==='evol');G.handleChoose(g.r,g.a.id,opt.id);eq(g.a.gold,180,'reward paid exactly once before swap cost');
 G.handleChoose(g.r,g.a.id,opt.id);eq(g.a.gold,180,'duplicate request cannot repeat payment');
}
{
 const g=game(),grease={...g.a,charId:'grease'},other={...g.a,charId:'redani'};ok(G.botCardScore(g.r,grease,'evol')>G.botCardScore(g.r,other,'evol'),'Grease BOT values evolution support');
}
for(const prefix of ['c','e']){const data=fs.readFileSync(`${__dirname}/public/assets/${prefix}_evol.png`);eq([data.readUInt32BE(16),data.readUInt32BE(20),data[25]],[300,300,6],'RGBA board asset');}
G.rooms.clear();console.log(`Evol / Ascensia: ${checks} checks passed`);
