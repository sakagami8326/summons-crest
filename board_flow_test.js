const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),GT=require('./public/game_timing');
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {makeFixtureRoom,makeRoom,startGame,beginTurn,spellDamage,publicState,serializeRoom,validateSave,CREATURES};')(require,__dirname,()=>0,()=>0);
const context={window:{},GAME_TIMING:GT,EnemyLand:{landIcon:e=>'<i>'+e+'</i>'},SummonsMapUI:{esc:s=>s},addEventListener(){}};vm.createContext(context);
for(const f of ['board-flow-notices','board-route'])vm.runInContext(fs.readFileSync('public/'+f+'.js','utf8'),context);
const r=G.makeFixtureRoom();r.lastRuin=null;r.owners.fill(null);
for(const [i,cid,level]of [[1,'gecko',1],[2,'gecko',3],[3,'gecko_f',1]]){
 r.owners[i]={player:r.players[1].id,creature:cid,level,dmg:0};assert(G.spellDamage(r,i,1000,'検証用の原因名'));
 assert.equal(r.owners[i],null);assert.equal(r.lastRuin.evolved,i!==1);assert.equal(r.lastRuin.level,level);
 const s=G.publicState(r,null),m=context.window.BoardFlow.ruinModel(r.lastRuin,s);
 assert(m.html.includes('/'+(i===1?'c':'e')+'_gecko.webp'));assert(!m.html.includes('検証用'));assert(m.html.includes('空き地へ'));
}
assert.equal(r.lastRuin.events.length,3);assert.equal(new Set(r.lastRuin.events.map(e=>e.at)).size,3);
assert.equal(G.serializeRoom(r).room.lastRuin.events.length,3);assert.equal(G.validateSave(G.serializeRoom(r)),null);
for(const [bot,speed]of [[false,1],[true,2]]){
 const room=G.makeRoom();room.players=[{id:'a',name:'甲',charId:'mio',isBot:bot},{id:'b',name:'乙',charId:'redani',isBot:bot}];room.botMode=bot;room.presentationSpeed=speed;
 const before=Date.now();G.startGame(room);const p=room.players[0];
 const expected=GT.gameEntryReturn+GT.gameEntryCameraReturn+GT.scaled(GT.gameNotice+GT.startNoticeGap+GT.turnNotice+GT.turnNoticeBuffer,speed);
 assert(Math.abs(room.pending[p.id].availableAt-before-expected)<100,'first input waits for entry and both messages');
 const next=Date.now();G.beginTurn(room);assert(Math.abs(room.pending[p.id].availableAt-next-GT.scaled(GT.turnNotice+GT.turnNoticeBuffer,speed))<100);
 const s=G.publicState(room,null);for(const charId of Object.keys(s.catalog.CHARS)){s.players[0].charId=charId;s.players[0].name='<八文字のテスト>';
  const m=context.window.BoardFlow.startModel('turn',s,p.id);assert(m.html.includes('&lt;八文字のテスト&gt;のターン'));assert.equal(m.duration,3300);
 }
}
// Endpoint tips follow the final edge, even after a long path or split. Elevated land does not alter the plane.
const p={id:'a',pos:0},pd={options:[{id:'route:1',number:1,tile:1,edges:[[0,1],[1,2],[2,3],[2,4]],destinations:[{tile:3},{tile:4}]}]},point=i=>({x:i*100,y:i*40});
const result=context.window.BoardRoute.draw({},p,pd,'route:1',point);
assert(result.html.includes('data-from="2" data-tile="3"'));assert(result.html.includes('data-from="2" data-tile="4"'));
assert(!result.html.includes('gdDestination'));assert(result.html.includes('M0 0 L100 40 L200 80 L300 120'));
assert(!result.html.includes('gdRouteShadow'));console.log('PASS ruin snapshots/multiple losses/evolution/save, shared intro input deadlines and BOT speed, all summoners, route endpoints');
