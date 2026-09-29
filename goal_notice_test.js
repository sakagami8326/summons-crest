const fs=require('fs'),assert=require('assert/strict'),vm=require('vm');
const src=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {makeFixtureRoom,points,broadcast,publicState,serializeRoom,restoreRoom,validateSave,handleChoose,askRoll};')(require,__dirname,()=>0,()=>0);
function game(){const r=G.makeFixtureRoom();r.code='GOAL';r.owners.fill(null);r.titles={conqueror:null,pilgrim:null};r.curses={};r.pending={};r.players.forEach(p=>p.gold=1000);return r;}
function set(r,i,n){r.players[i].gold+=n-G.points(r,r.players[i]);G.broadcast(r);}
const r=game();set(r,0,6999);assert.equal(r.goalNotices.length,0);set(r,0,7000);assert.deepEqual(r.goalNotices.map(e=>e.stage),['near']);set(r,0,7999);set(r,0,8000);assert.deepEqual(r.goalNotices.map(e=>e.stage),['near','ready']);
for(const n of [6000,7000,8500,1000,8000])set(r,0,n);assert.equal(r.goalNotices.length,2);
set(r,1,8500);assert.equal(r.goalNotices.at(-1).stage,'ready');assert.equal(r.goalNotices.filter(e=>e.player==='fx1').length,1);set(r,1,7000);assert.equal(r.goalNotices.length,3);
set(r,2,7000);set(r,2,8000);r.players[3].bankrupt=true;set(r,3,9000);assert.equal(r.goalNotices.length,5);
const before=JSON.stringify(r.goalNotices);G.publicState(r,null);G.publicState(r,'fx0');assert.equal(JSON.stringify(r.goalNotices),before);
const save=G.serializeRoom(r);assert.equal(G.validateSave(save),null);const restored=G.restoreRoom(save);assert(!restored.error,restored.error);set(restored.room,0,6000);set(restored.room,0,8000);assert.equal(restored.room.goalNotices.length,5);
const old=structuredClone(save);delete old.room.goalProgress;delete old.room.goalNotices;const legacy=G.restoreRoom(old);assert(!legacy.error,legacy.error);G.broadcast(legacy.room);assert.equal(legacy.room.goalNotices.length,0);set(legacy.room,0,6000);set(legacy.room,0,8500);assert.equal(legacy.room.goalNotices.length,0);set(legacy.room,1,8000);assert.equal(legacy.room.goalNotices.at(-1).stage,'ready');
const bad=structuredClone(save);bad.room.goalNotices.push(bad.room.goalNotices[0]);assert(G.validateSave(bad));
const t=game(),p=t.players[0];p.gold=6900;p.hand=['sp_gold'];p.lap=1;G.askRoll(t,p);G.handleChoose(t,p.id,'sp:sp_gold');G.broadcast(t);assert.equal(t.goalNotices[0].points,7000);assert.equal(p.hand.length,0);
// Land and title gains use total assets, not just cash.
const land=game();land.players[0].gold=6900;land.owners[1]={player:'fx0',level:1,creature:'gecko',dmg:0};G.broadcast(land);assert.equal(land.goalNotices[0].points,G.points(land,land.players[0]));
const title=game();title.players[0].gold=6700;title.titles.conqueror='fx0';G.broadcast(title);assert.equal(title.goalNotices[0].points,7200);
const end=game();end.phase='ended';set(end,0,9000);assert.equal(end.goalNotices.length,0);
// The board skips historical entries at startup, deduplicates updates, and discards stale queued notices.
const ctx={window:{},structuredClone};vm.runInNewContext(fs.readFileSync('public/board-goal-notice.js','utf8'),ctx);const B=ctx.window.BoardGoal;
let current=G.publicState(game(),null),queued=[];const options={queue:(pri,run,opt)=>queued.push({pri,run,...opt}),current:()=>current};B.observe(current,options);
current={...current,players:G.publicState(r,null).players,goalNotices:r.goalNotices.slice(0,1)};B.observe(current,options);B.observe(current,options);assert.equal(queued.length,1);
current.goalNotices=r.goalNotices.slice(0,2);B.observe(current,options);assert.equal(queued.length,2);assert(queued[0].stale());assert(!queued[1].stale());current.players[0].points=7999;assert(queued[1].stale());current.players[0].points=8000;current.phase='ended';assert(queued[1].stale());
current={...current,stateInstanceId:'restored',phase:'playing'};B.observe(current,options);assert.equal(queued.length,2);
assert(!B.model(r.goalNotices[0],G.publicState(r,null)).html.includes('勝利'));
assert(B.model(r.goalNotices[1],G.publicState(r,null)).html.includes('城へ戻れば勝利'));
console.log('PASS goal thresholds, direct jump, per-player once, assets, spell choice, save/legacy restore, validation, read-only snapshot, stale and duplicate events');
