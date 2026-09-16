const fs=require('fs'),path=require('path'),assert=require('assert/strict');
function loadGame(){
 const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
 return new Function('require','__dirname','setInterval','setTimeout',src+`\nreturn {server,rooms,makeRoom,startGame,ask,askRoll,askUpgrade,startDraft,handleChoose,publicState,broadcast,serializeRoom,restoreRoom,standardBot,upCostRange};`)(require,__dirname,()=>{},()=>0);
}
function game(G){const r=G.makeRoom();r.players=[{id:'p0',name:'テスト',charId:'redani'},{id:'p1',name:'相手',charId:'adel'}];G.startGame(r);r.pending={};r.turnTransition=null;r.turnReadyAt=0;r.turn=0;r.boardSeen=true;const p=r.players[0];p.gold=1600;r.owners[1]={player:p.id,creature:'gaston',level:1};r.owners[2]={player:p.id,creature:'pakawata',level:1};return {r,p};}
function checks(G){
 for(const where of ['城','自領地','門']){
  const {r,p}=game(G);G.askUpgrade(r,p,where);G.handleChoose(r,p.id,'up:1');
  assert.equal(r.pending[p.id].where,where);const before={gold:p.gold,owners:JSON.stringify(r.owners),turn:r.turn,epoch:r.turnEpoch},oldId=r.pending[p.id].promptId;
  assert.ok(r.pending[p.id].options.some(o=>o.id==='ul:back'));
  const restored=G.restoreRoom(G.serializeRoom(r));assert.equal(restored.room.pending[p.id].where,where);
  assert.notEqual(G.standardBot.choose(r,p,r.pending[p.id]).id,'ul:back');
  G.handleChoose(r,p.id,'ul:back');assert.equal(r.pending[p.id].type,'upgrade');assert.equal(r.pending[p.id].where,where);
  assert.notEqual(r.pending[p.id].promptId,oldId);assert.deepEqual({gold:p.gold,owners:JSON.stringify(r.owners),turn:r.turn,epoch:r.turnEpoch},before);
  G.handleChoose(r,p.id,'up:2');const cost=G.upCostRange(r,p,2,2);G.handleChoose(r,p.id,'ul:2:2');
  assert.equal(r.owners[1].level,1);assert.equal(r.owners[2].level,2);assert.equal(p.gold,before.gold-cost);
 }
 {const {r,p}=game(G);G.askUpgrade(r,p,'城');G.handleChoose(r,p.id,'up:1');const gold=p.gold;G.handleChoose(r,p.id,'ul:cancel');assert.equal(p.gold,gold);assert.equal(r.owners[1].level,1);assert.notEqual(r.pending[p.id]?.type,'upgrade_lv');}
 {const {r,p}=game(G);G.askUpgrade(r,p,'門');G.handleChoose(r,p.id,'up:1');p.gold=0;G.handleChoose(r,p.id,'ul:back');assert.notEqual(r.pending[p.id]?.type,'upgrade_lv');assert.equal(p.gold,0);}
 console.log('Feedback UI: territory reselect, origin, restore, costs, pass and BOT checks passed');
}
module.exports={loadGame,game,checks};if(require.main===module)checks(loadGame());
