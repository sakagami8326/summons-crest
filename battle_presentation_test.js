'use strict';
const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {server,makeFixtureRoom,calculateBattle,resolveBattle,landDefenseStats,publicBattle,publicState,rooms};')(require,__dirname,()=>0,()=>0);
function fixture(mode='pick',scenario='swordgear'){
 const r=G.makeFixtureRoom();r.turn=0;r.phase='playing';r.pending={};r.turnTransition=r.windSupply=r.shopVisit=null;r.owners.fill(null);r.elemOv={21:'fire'};r.curses={};r.tileFx={};r.barrier={};r.botMode=false;
 for(const k of Object.keys(r))if(k.startsWith('last'))r[k]=null;
 const a=r.players[0],d=r.players[1];a.charId='redani';d.charId='adel';a.gold=d.gold=2000;
 const cid=scenario==='dead'?'nome':scenario==='survive'?'orphe':'swordgear';a.hand=[cid,'weapon'];d.hand=['shield'];a.blade=true;
 r.owners[21]={player:d.id,creature:scenario==='dead'?'magado':'suminoko',level:3,dmg:0,...(scenario==='swordgear'?{charcoalDf:15}:{})};
 r.battle={tile:21,attacker:a.id,defender:d.id,atkCreature:mode==='pick'?null:cid,supports:mode==='result'?{[a.id]:{kind:'support',cardId:'weapon'},[d.id]:{kind:'support',cardId:'shield'}}:{},startedAt:100};
 const baseline=G.landDefenseStats(r,21),state=G.publicState(r,null);
 let result=null;if(mode==='result'){G.resolveBattle(r);result=r.lastBattle;}
 G.rooms.delete(r.code);return {state,result,baseline};
}
if(require.main===module){
 let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++};
 const r=G.makeFixtureRoom();r.owners.fill(null);r.elemOv={21:'fire'};r.tileFx={21:{uplift:true,vortex:true}};r.curses={};r.players[0].charId='redani';r.players[1].charId='adel';
 r.players[0].hand=['swordgear','weapon'];r.players[1].hand=['shield'];r.players[0].blade=true;r.owners[21]={player:r.players[1].id,creature:'suminoko',level:3,charcoalDf:55};
 r.battle={tile:21,attacker:r.players[0].id,defender:r.players[1].id,atkCreature:null,supports:{},startedAt:101};
 eq(G.publicBattle(r).previewStats.defender,G.landDefenseStats(r,21),'unselected defender starts with all land effects');eq(G.publicBattle(r).previewStats.attacker,null,'unknown attacker has no fabricated stats');
 r.battle.atkCreature='swordgear';const before=G.calculateBattle(r);r.battle.supports={[r.players[0].id]:{kind:'support',cardId:'weapon'},[r.players[1].id]:{kind:'support',cardId:'shield'}};const after=G.calculateBattle(r);
 G.resolveBattle(r);const b=r.lastBattle;
 eq([b.atkPreAt,b.atkPreDf,b.defPreAt,b.defPreDf],[before.atkDmg,before.atkDF,before.defSt,before.defDF],'all nonweapon effects included at start');
 eq([b.atkPostAt,b.atkPostDf,b.defPostAt,b.defPostDf],[after.atkDmg,after.atkDF,after.defSt,after.defDF],'revealed numbers equal real combat');
 eq(b.atkPostAt-b.atkPreAt,40,'weapon +20, mastery +10, Redani weapon passive +10 deferred together');G.rooms.delete(r.code);
 const board=fs.readFileSync(__dirname+'/public/board.html','utf8');
 assert(board.indexOf("await revealBattleSupport(b, 'def')")<board.indexOf('await applyBattleWeaponStats(b)'));count++;
 assert(!board.includes("pop('bAtk', '帰還(全快)'"));count++;
 const outcome=new Function(board.slice(board.indexOf('function battleOutcomeText(b)'),board.indexOf('async function showBattleOutcome'))+';return battleOutcomeText;')();
 eq(outcome({win:true,atkCreature:'gecko'}),null,'successful invader is not reported in hand');
 eq(outcome({win:false,atkSurvived:true,atkCreature:'gecko'}).body,'侵略したクリーチャーはHPが残ったため手札に残った','ordinary survivor message');
 eq(outcome({win:false,atkSurvived:false,atkCreature:'gecko'}).body,'侵略したクリーチャーはHPが無くなったため捨て札に移動した','destroyed message');
 assert(outcome({win:false,atkSurvived:true,atkCreature:'gecko',moveFrom:0}).body.includes('元の領地'));count++;
 assert(outcome({win:false,atkSurvived:false,atkCreature:'gaston_f'}).body.includes('旋風'));count++;
 console.log('PASS battle presentation '+count+' checks');
}
module.exports={G,fixture};
