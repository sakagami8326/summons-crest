const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const timing=require('./public/game_timing.js'),timers=[];
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {makeFixtureRoom,beginUltSequence,armUltSequence,publicState,startDraft,serializeRoom};')(require,__dirname,()=>0,(fn,ms)=>{timers.push({fn,ms});return 0});
for(const [botMode,isBot,speed,expected] of [[false,false,1,7000],[true,true,2,3500],[true,false,2,7000]]){
 const r=G.makeFixtureRoom(),p=r.players[0];r.botMode=botMode;p.isBot=isBot;r.presentationSpeed=speed;p.ultUsed=false;p.charId='adel';
 G.beginUltSequence(r,p,{privateTarget:12});assert.equal(r.ultSequence.resolveAt-r.ultSequence.startedAt,expected);assert.equal(r.pending[p.id].type,'ult_resolve');assert.deepEqual(r.pending[p.id].options,[]);assert(timers.at(-1).ms<=expected&&timers.at(-1).ms>expected-100);
 assert(!('data' in G.publicState(r,null).ultSequence));assert(!('data' in G.publicState(r,r.players[1].id).ultSequence));
 const saved=G.serializeRoom(r);assert.equal(saved.room.ultSequence.resolveAt,r.ultSequence.resolveAt);
 r.ultSequence.resolveAt=Date.now()+1800;G.armUltSequence(r);assert(timers.at(-1).ms>1700&&timers.at(-1).ms<=1800,'resume uses remaining time, not a fresh seven seconds');
}
{
 const r=G.makeFixtureRoom(),p=r.players[0];r.deck=['qbaby','gecko','nome',...r.deck];G.startDraft(r,p,'end');const first=G.publicState(r,null).pending[p.id];
 assert.equal(first.aura,'UR');assert(first.promptId);assert.deepEqual(first.options,[]);assert(!('cards' in first));assert(G.publicState(r,p.id).pending[p.id].options.some(o=>o.id==='take:qbaby'));
 G.startDraft(r,p,'end');assert.notEqual(G.publicState(r,null).pending[p.id].promptId,first.promptId);
}
const ctx={window:{},GAME_TIMING:timing,ELEM:{fire:'',wind:'',earth:'',water:''},addEventListener(){}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/public/board-next-notices.js','utf8'),ctx);
const p={id:'test'};
for(const [before,after]of [[2,3],[3,2],[2,0],[5,8]]){
 const m=ctx.window.BoardNext.chain(p,{before,after,element:'wind'});assert.equal(m.duration,4400);assert(m.html.includes('<span>'+before+'</span>'));assert(m.html.includes('<strong>'+after+'</strong>'));
 if(after===8)assert(m.html.includes('chainMore">+3'));if(after===0)assert(m.html.includes('<b>—</b>'));
}
const r=G.makeFixtureRoom(),s=G.publicState(r,null);for(const charId of Object.keys(s.catalog.CHARS)){
 const m=ctx.window.BoardNext.ultimate(s,{id:'test',charId});assert.equal(m.duration,6000);assert(!m.html.includes('undefined'));
 if(charId==='adel')assert(!m.html.includes('+20'));if(charId==='lia')assert(!m.html.includes('nextArrow'));
}
console.log('PASS notice timing, BOT speed, pending lock, restored deadline, public draft identity without cards, all ultimate models and chain zero/overflow');
