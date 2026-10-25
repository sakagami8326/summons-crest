const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+`;return {makeRoom,startGame,resolveTile,askRoll,handleChoose,askSupports,startBattle,resolveBattle,consumeBattleSupport,continuePostBattle,CREATURES,SPELLS,SUPPORTS,effectiveSpellCost,advancePassiveResolution,serializeRoom,restoreRoom,standardBot,publicState,TILES};`)(require,__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++},ok=(a,m)=>{assert.ok(a,m);checks++};
function game(char='redani'){
 const r=G.makeRoom();r.players=[{id:'a',name:'甲',charId:char},{id:'d',name:'乙',charId:'adel'}];G.startGame(r);r.players.sort((a,b)=>a.id.localeCompare(b.id));r.turn=0;r.pending={};r.turnTransition=null;r.turnReadyAt=0;r.owners.fill(null);r.tileFx={};r.curses={};r.barrier={};r.elemOv={};r.effectQueue=[];
 for(const p of r.players)Object.assign(p,{gold:3000,hand:[],deck:['weapon','shield'],discard:[],exile:[],spellCount:0,spellCast:false,lap:2,pos:1,dir:1});return{r,p:r.players[0],d:r.players[1]};
}
const choose=(g,id)=>G.handleChoose(g.r,g.p.id,id);
function spell(sid,{discount=0,noir=false}={}){
 const g=game(noir?'noir':'redani'),{r,p,d}=g;p.hand=[sid,'gecko','nome','qbaby'];d.hand=['gecko','nome'];
 r.owners[1]={player:p.id,creature:'nome',level:2,dmg:10};r.owners[3]={player:p.id,creature:'gecko',level:1};r.owners[7]={player:d.id,creature:'gecko',level:3};
 r.elemOv[1]='water';r.elemOv[3]='fire';r.elemOv[7]='fire';
 for(let n=0;n<discount;n++)r.owners[10+n]={player:p.id,creature:'trooper_f',level:1};
 if(noir){p.spellCount=1;p.spellCast=true;}
 G.askRoll(r,p);return g;
}
function advanceSpell(g,sid){let extra=0,steps=0;choose(g,'sp:'+sid);
 while(g.p.hand.includes(sid)&&steps++<15){const pd=g.r.pending[g.p.id];ok(pd,'spell pending '+sid);if(pd.type==='passive_resolve'){G.advancePassiveResolution(g.r,Infinity);continue;}
  const o=pd.options.find(o=>o.id==='sd:2')||pd.options.find(o=>!/:cancel$/.test(o.id)&&!['back','pass','roll','ult'].includes(o.id));ok(o,'spell commit option '+sid+' '+pd.type);
  if(pd.type==='swap_pick')extra=G.CREATURES[o.id.slice(4)].cost;choose(g,o.id);
 }
 ok(!g.p.hand.includes(sid),'spell committed '+sid);return extra;
}
for(const sid of Object.keys(G.SPELLS))for(const mode of [{},{discount:1},{discount:16},{noir:true}]){
 const g=spell(sid,mode),before=g.p.gold,fee=G.effectiveSpellCost(g.r,g.p,sid);
 ok(g.r.pending[g.p.id].options.some(o=>o.id==='sp:'+sid),'eligible '+sid+JSON.stringify(mode));
 const extra=advanceSpell(g,sid),gain=['sp_gold','sp_chain_gold'].includes(sid)?g.r.lastSpellFx.display.gold:0;
 eq(g.p.gold,before-fee-extra+gain,'exact spell payment '+sid+JSON.stringify(mode));
 eq(g.p.spellCount,mode.noir?2:1,'spell count once '+sid);
}
for(const sid of Object.keys(G.SPELLS)){
 const g=spell(sid),fee=G.effectiveSpellCost(g.r,g.p,sid);
 if(fee){g.p.gold=fee-1;G.askRoll(g.r,g.p);ok(!g.r.pending[g.p.id].options.some(o=>o.id==='sp:'+sid),'spell unavailable without funds '+sid);}
 const h=spell(sid);choose(h,'sp:'+sid);const pd=h.r.pending[h.p.id],cancel=pd?.options.find(o=>/:cancel$/.test(o.id));
 if(cancel&&h.p.hand.includes(sid)){const gold=h.p.gold,hand=h.p.hand.slice();choose(h,cancel.id);eq(h.p.gold,gold,'cancel free '+sid);eq(h.p.hand,hand,'cancel preserves cards '+sid);eq(h.p.spellCount,0,'cancel preserves spell use '+sid);}
}
for(const [id,c]of Object.entries(G.CREATURES)){
 const g=game();g.p.hand=[id];g.p.gold=c.cost;G.resolveTile(g.r,g.p);ok(g.r.pending[g.p.id].options.some(o=>o.id==='summon:'+id),'summon exact balance '+id);choose(g,'summon:'+id);eq(g.p.gold,0,'summon cost '+id);eq(g.r.owners[1].creature,id,'summon placement '+id);choose(g,'summon:'+id);eq(g.p.gold,0,'summon no double charge '+id);
 const h=game();h.p.hand=[id];h.p.gold=c.cost-1;G.resolveTile(h.r,h.p);ok(!h.r.pending[h.p.id].options.some(o=>o.id==='summon:'+id),'summon needs funds '+id);
 const inv=game();inv.p.pos=7;inv.p.hand=[id];inv.p.gold=c.cost;inv.r.owners[7]={player:inv.d.id,creature:'nome',level:1};G.startBattle(inv.r,inv.p,7);eq(inv.r.pending[inv.p.id].options[0].cost,c.cost,'invasion price '+id);choose(inv,'atk:'+id);eq(inv.p.gold,0,'hand invasion cost '+id);choose(inv,'atk:'+id);eq(inv.p.gold,0,'invasion replay no charge '+id);
}
for(const [id,c]of Object.entries(G.SUPPORTS))for(const defense of [false,true]){
 const g=game(),{r,p,d}=g;const user=defense?d:p;p.hand=['gecko',...(defense?[]:[id])];d.hand=defense?[id]:[];r.owners[7]={player:d.id,creature:'nome',level:1};p.pos=7;
 G.startBattle(r,p,7);choose(g,'atk:gecko');eq(p.gold,3000-G.CREATURES.gecko.cost,'paid hand invasion');
 const before=user.gold;G.handleChoose(r,user.id,'sup:s:'+id);eq(user.gold,before,'secret support not charged early');
 const saved=G.serializeRoom(r),rest=G.restoreRoom(saved).room;ok(rest,'secret choice restore '+id);const rival=defense?p.id:d.id;G.handleChoose(rest,rival,'sup:none');
 const payment=rest.lastBattle.supportPayments.find(x=>x.player===user.id);eq(payment.amount,c.cost,'weapon fee '+id);eq([payment.beforeGold,payment.afterGold],[before,before-c.cost],'exact payment '+id);const after=rest.players.find(x=>x.id===user.id).gold;G.handleChoose(rest,user.id,'sup:s:'+id);eq(rest.players.find(x=>x.id===user.id).gold,after,'weapon replay no charge '+id);
}
{
 const g=game();g.p.hand=['gecko','gweapon'];g.p.gold=G.CREATURES.gecko.cost+G.SUPPORTS.gweapon.cost-1;g.r.owners[7]={player:g.d.id,creature:'nome',level:1};g.p.pos=7;G.startBattle(g.r,g.p,7);choose(g,'atk:gecko');ok(!g.r.pending[g.p.id].options.some(o=>o.card==='gweapon'),'weapon eligibility uses remaining cash');
 g.p.gold=120;G.askSupports(g.r);choose(g,'sup:s:gweapon');g.p.gold=119;G.handleChoose(g.r,g.d.id,'sup:none');eq(g.r.pending[g.p.id].type,'support','revalidate selected weapon before resolving');eq(g.p.gold,119,'failed payment does not consume money');ok(g.p.hand.includes('gweapon'),'failed payment preserves card');ok(!g.r.battle.supports[g.p.id],'invalid choice cleared');choose(g,'sup:none');ok(g.r.lastBattle,'battle can continue after retry');
}
{
 const g=game();g.p.hand=['onitsugi'];g.p.gold=79;G.consumeBattleSupport(g.r,g.p.id,'onitsugi');eq(g.p.gold,79,'no partial weapon charge');eq(g.p.hand,['onitsugi'],'no free weapon consumption');
}
{
 const g=game();g.p.hand=['gecko'];g.p.gold=G.CREATURES.gecko.cost-1;g.r.owners[1]={player:g.d.id,creature:'nome',level:1};G.resolveTile(g.r,g.p);ok(!g.r.pending[g.p.id].options.some(o=>o.id==='invade'),'cannot enter unfunded hand invasion');
}
{
 const g=game();g.p.hand=['sp_step'];g.r.owners[1]={player:g.p.id,creature:'jaki_f',level:1};g.r.owners[2]={player:g.d.id,creature:'gecko',level:1};g.r.elemOv[2]='earth';G.askRoll(g.r,g.p);const before=g.p.gold;choose(g,'sp:sp_step');choose(g,'st:1');choose(g,'sd:2');eq(g.p.gold,before-G.SPELLS.sp_step.cost,'move invasion pays spell only');ok(g.r.battle.moveFrom===1,'move invasion enters battle directly');choose(g,'sup:none');G.handleChoose(g.r,g.d.id,'sup:none');ok(!g.r.lastBattle.summonPayment,'no duplicate summon payment for existing creature');
}
{
 const g=game();g.p.pos=7;g.p.hand=['gecko','onitsugi','nome'];g.d.hand=['jinx'];g.r.owners[7]={player:g.d.id,creature:'gecko',level:1,dmg:G.CREATURES.gecko.hp-1};g.r.elemOv[7]='earth';G.startBattle(g.r,g.p,7);choose(g,'atk:gecko');const before=g.p.gold;choose(g,'sup:s:onitsugi');G.handleChoose(g.r,g.d.id,'sup:s:jinx');ok(g.r.lastBattle.win,'disabled weapon user still wins');eq(g.p.gold,before-80,'invalidated weapon still costs 80G');eq(g.d.gold,2900,'Disarm costs 100G');eq(g.r.pending[g.p.id].type,'draft','disabled sword does not grant replacement');
}
console.log('PASS payment audit: '+checks+' checks; all creatures, all 28 spells/base/discount/free-floor/Noir, all 6 weapons/both roles, cancellation, remaining budget, retry, duplicate and save/restore');
