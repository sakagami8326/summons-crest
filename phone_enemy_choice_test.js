const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const server=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',server+';return {makeFixtureRoom,resolveTile,publicState,handleChoose};')(require,__dirname,()=>0,()=>0);
function element(){
 const classes=new Set(),error={textContent:''};return {hidden:true,inert:false,disabled:false,dataset:{},classList:{add(...x){x.forEach(c=>classes.add(c));},remove(...x){x.forEach(c=>classes.delete(c));},toggle(c,on){on?classes.add(c):classes.delete(c);},contains:c=>classes.has(c)},setAttribute(){},focus(){},append(){},
 set innerHTML(s){this.html=s;this.buttons=[...s.matchAll(/data-action="([^"]+)"/g)].map(m=>({dataset:{action:m[1]},disabled:false}));},get innerHTML(){return this.html;},querySelectorAll(){return this.buttons||[];},querySelector(){return error;}};
}
const doc={body:element(),createElement:element},sandbox={window:{},document:doc};
vm.runInNewContext(fs.readFileSync('public/phone-enemy-choice.js','utf8'),sandbox);const View=sandbox.window.PhoneEnemyChoice;
const room=G.makeFixtureRoom(),p=room.players[0],owner=room.players[1];
room.turn=0;room.pending={};room.turnTransition=null;room.owners.fill(null);room.tileFx={};room.curses={};room.barrier={};p.pos=1;p.gold=650;p.hand=['nome','weapon'];owner.name='<所有者名>';room.owners[1]={player:owner.id,creature:'nome',level:2};room.elemOv[1]='earth';
G.resolveTile(room,p);let state=G.publicState(room,p.id);
let m=View.model(state,p.id);assert.equal(m.stats.total,state.enemyLand.stats.total);assert.equal(m.remaining,650-state.tolls[1]);assert(m.allowed);assert.equal(m.owner.id,owner.id);
assert.equal(View.model(state,owner.id),null,'other players never get the active choice');
for(const [level,card,expected] of [[3,'nome','アースゴーレム'],[1,'nome_f','アースゴーレム']]){room.owners[1].level=level;room.owners[1].creature=card;G.resolveTile(room,p);m=View.model(G.publicState(room,p.id),p.id);assert.equal(m.name,expected);assert.equal(m.art,'/assets/e_nome.png');}
room.owners[1].creature='nome';room.owners[1].level=2;room.barrier[owner.id]=true;G.resolveTile(room,p);
m=View.model(G.publicState(room,p.id),p.id);assert(!m.allowed);assert.match(m.reason,/結界/);
room.barrier={};p.hand=['weapon'];G.resolveTile(room,p);m=View.model(G.publicState(room,p.id),p.id);assert(!m.allowed);assert.match(m.reason,/手札/);
p.hand=['nome'];p.gold=0;G.resolveTile(room,p);m=View.model(G.publicState(room,p.id),p.id);assert(m.remaining<0);assert(m.p.options.some(x=>x.id==='toll'),'insufficient funds still permits server-managed sale/bankruptcy');
p.gold=650;G.resolveTile(room,p);state=G.publicState(room,p.id);
let blocked=false,calls=0,resolveAction,ready=true;
const view=new View({state:()=>state,playerId:()=>p.id,ready:()=>ready,cancelGesture(){},closeHandDetail(){},handAccess:b=>blocked=b,renderHand(){},choose:()=>{calls++;return new Promise(r=>resolveAction=r);}});
(async()=>{
 view.show();assert(view.active&&blocked);assert(view.host.innerHTML.includes('&lt;所有者名&gt;'));
 view.peek(true);assert(view.handView&&!blocked);
 state={...state,stateRev:state.stateRev+1};view.sync();view.show();assert(view.handView,'SSE does not reset hand browsing');
 await view.submit('toll');assert.equal(calls,0,'no action while browsing');view.peek(false);
 const pending=view.submit('toll');view.submit('toll');assert.equal(calls,1,'double taps send once');assert(view.busy&&view.toggle.disabled);
 resolveAction({ok:false});await pending;assert(!view.busy);assert.match(view.host.querySelector('.ecError').textContent,/送信できません/);
 const old=view.submit('toll');state={...state,stateInstanceId:'restored'};view.sync();view.show();resolveAction({ok:false});await old;assert(!view.busy,'old responses do not alter restored context');
 view.peek(true);state={...state,pending:{}};view.sync();assert(!view.active&&!blocked);assert(!doc.body.classList.contains('enemyChoiceActive'));
 G.resolveTile(room,p);state=G.publicState(room,p.id);ready=false;assert.equal(view.show(),false,'wait for board presentation');ready=true;view.show();
 const success=view.submit('invade');resolveAction({ok:true});await success;assert(view.busy,'lock stays until current state arrives');G.handleChoose(room,p.id,'invade');state=G.publicState(room,p.id);view.sync();assert.equal(state.pending[p.id].type,'pick_creature');assert(!view.active&&!blocked);
 G.resolveTile(room,p);state=G.publicState(room,p.id);const gold=p.gold,toll=state.tolls[1];view.show();G.handleChoose(room,p.id,'toll');state=G.publicState(room,p.id);view.sync();assert.equal(p.gold,gold-toll);assert(!view.active);
 console.log('PASS phone enemy choice: owner, stats, evolved art, privacy, barrier, no creatures, insufficient funds, hand continuity, duplicate/stale submissions, retry, timing, invasion and toll transitions');
})().catch(e=>{console.error(e);process.exitCode=1;});
