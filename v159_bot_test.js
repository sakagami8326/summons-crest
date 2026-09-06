const fs=require('fs'), path=require('path'), assert=require('assert/strict');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const reference=fs.readFileSync(path.join(__dirname,'test/fixtures/v158-battle-reference.txt'),'utf8').replace('function resolveBattle(r)','function referenceBattle(r)');
const legacy=fs.readFileSync(path.join(__dirname,'test/fixtures/v158-bot-reference.txt'),'utf8').replace(/\bbot(?=[A-Z])/g,'legacyBot').replace(/\bBOT_CANCEL_IDS\b/g,'LEGACY_CANCEL_IDS');
let captureTimers=false,timers=[];
const G=new Function('require','__dirname','setInterval','setTimeout',source+'\n'+reference+'\n'+legacy+`
return {standardBot,calculateBattle,referenceBattle,resolveBattle,botChooseOption,legacyBotChooseOption,makeRoom,startGame,
 askRoll,askUpgrade,askSupports,performMove,handleChoose,completeTurnTransition,resolveUltSequence,
 CREATURES,SPELLS,SUPPORTS,MAPS,CHARS,rooms,publicState,ask,scheduleBotAction,serializeRoom,restoreRoom};`)(require,__dirname,()=>{},fn=>{if(captureTimers)timers.push(fn);return 0;});
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const copy=x=>JSON.parse(JSON.stringify(x));
function game(map='starting_corridor',n=2,offset=0){
 const r=G.makeRoom('normal',map);r.players=Array.from({length:n},(_,i)=>({id:'p'+i,name:'BOT'+i,charId:Object.keys(G.CHARS)[(i+offset)%Object.keys(G.CHARS).length]}));
 G.startGame(r);r.boardSeen=true;r.pending={};r.turn=0;
 return {r,p:r.players[0],enemy:r.players[1]};
}
const decide=(g,pd)=>G.standardBot.choose(g.r,g.p,pd);
const pd=(type,ids)=>({type,options:ids.map(id=>({id}))});
const originalRandom=Math.random,originalNow=Date.now;
let seed=159;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
Math.random=random;Date.now=()=>1800000000000;
try {
 // Differential fixture is frozen before the extraction, not another call to the new calculator.
 const base=game();base.p.gold=base.enemy.gold=3000;
 const forms=Object.keys(G.CREATURES), opponents=['gaston','pakawata','avalanche','ludi','mimic','valk_f','beruf_f'];
 for(const [cid,defender] of forms.flatMap(c=>opponents.flatMap(d=>[[c,d],[d,c]])))for(const level of [1,3]) {
   const r=copy(base.r),p=r.players[0],enemy=r.players[1];
   p.hand=[cid,'weapon','gshield'];enemy.hand=[defender,'shield','jinx'];
   p.exile=['weapon','shield'];enemy.exile=['weapon'];
   r.owners[1]={player:enemy.id,creature:defender,level,dmg:7,shade:2,iceWard:true};
   r.owners[2]={player:p.id,creature:cid,level:3,dmg:5,shade:3};r.elemOv[2]='earth';
   r.owners[3]={player:enemy.id,creature:'qbaby_f',level:3};r.elemOv[3]='earth';
   r.tileFx[1]={vortex:true,uplift:true};p.blade=true;
   r.battle={tile:1,attacker:p.id,defender:enemy.id,atkCreature:cid,startedAt:1,
     supports:{[p.id]:{kind:'support',cardId:level===1?'weapon':'gshield'},[enemy.id]:{kind:'support',cardId:level===1?'shield':'jinx'}}};
   if(level===3)r.battle.moveFrom=2;
   const before=JSON.stringify(r), q=G.calculateBattle(r);
   eq(JSON.stringify(r),before,'calculator has no side effects');
   const old=copy(r),next=copy(r);seed=10;G.referenceBattle(old);seed=10;G.resolveBattle(next);
   eq(next,old,`full combat unchanged: ${cid}/${defender}/Lv${level}`);
   for(const [a,b] of [['atkDmg','st'],['effHp','hp'],['defDF','df'],['dealt','dealt'],['win','win'],['atkSurvived','atkSurvived'],['counterDealt','counterDealt']])eq(q[a],next.lastBattle[b],'prediction matches actual '+b);
 }
 {
   const g=game();g.p.hand=['gaston'];g.p.gold=180;
   g.r.owners[1]={player:g.p.id,creature:'gaston',level:1};
   eq(decide(g,pd('upgrade',['up:1','pass'])).id,'pass','do not enter unaffordable upgrade');
   eq(decide(g,pd('upgrade_lv',['ul:1:2','ul:cancel'])).id,'ul:cancel','never fall back to unaffordable minimum');
 }
 {
   const g=game();g.p.gold=100;g.p.hand=['gaston'];g.enemy.hand=[];
   g.p.pos=1;g.r.owners[1]={player:g.enemy.id,creature:'valk_f',level:4};
   eq(decide(g,pd('tile',['invade','toll'])).id,'toll','hopeless expensive invasion is not useful');
 }
 {
   const g=game();g.p.hand=['gecko','weapon'];g.p.gold=300;g.enemy.hand=[];
   g.r.owners[1]={player:g.enemy.id,creature:'gaston',level:1,dmg:20};g.r.elemOv[1]='fire';
   g.r.battle={tile:1,attacker:g.p.id,defender:g.enemy.id,atkCreature:'gecko',supports:{}};
   eq(decide(g,pd('support',['sup:s:weapon','sup:none'])).id,'sup:none','do not waste weapon on already won combat');
   g.r.owners[1].creature='ludi';g.r.owners[1].dmg=0;
   eq(decide(g,pd('support',['sup:s:weapon','sup:none'])).id,'sup:none','invalidated weapon is not useful');
 }
 {
   const g=game();g.p.hand=['shield'];g.p.gold=300;g.enemy.hand=['gecko'];
   g.r.owners[1]={player:g.p.id,creature:'gaston',level:1,dmg:10};g.r.elemOv[1]='fire';
   g.r.battle={tile:1,attacker:g.enemy.id,defender:g.p.id,atkCreature:'gecko',supports:{}};
   eq(decide(g,pd('support',['sup:s:shield','sup:none'])).id,'sup:s:shield','save a defensible land instead of random no-support');
 }
 {
   const g=game();g.p.gold=1000;g.p.charId='adel';g.p.hand=['sp_bedrock_uplift'];
   eq(decide(g,pd('roll',['roll','ult','sp:sp_bedrock_uplift'])).id,'roll','no useless recovery or ultimate');
   g.p.charId='grease';eq(decide(g,pd('roll',['roll','ult'])).id,'roll','no empty-land barrier');
 }
 {
   const g=game('twin_gate_cavern');g.p.pos=24;g.p.previousTile=23;g.p.gatesVisited=[22];
   G.performMove(g.r,g.p,2,{value:2},'test');const pending=g.r.pending[g.p.id];
   const before=JSON.stringify(g.r),decision=decide(g,pending);
   eq(JSON.stringify(g.r),before,'decision does not mutate actual state');
   g.enemy.hand=['gweapon','gshield','jinx'];const a=decide(g,pending);
   g.enemy.hand=['gaston','gecko','sp_gold'];eq(decide(g,pending),a,'same public counts, different secrets');
   g.p.deck.reverse();eq(decide(g,pending),a,'own deck order not predictive');
   g.r.battle={tile:1,attacker:g.p.id,defender:g.enemy.id,atkCreature:'gaston',supports:{[g.enemy.id]:'jinx'}};
   const safe=G.standardBot.view(g.r,g.p,pending);eq(safe.r.battle.supports,{},'submitted support is secret');
   for(const k of ['hand','deck','discard','exile']){g.enemy[k+'Count']=g.enemy[k].length;Object.defineProperty(g.enemy,k,{get(){throw Error('secret read '+k);}});}
   ok(decide(g,pending).id,'no access to hidden card content');
 }
 ok(Math.abs([...G.standardBot.diceDistribution(2)].find(([s])=>s===7)[1]-6/36)<1e-12,'two dice use actual distribution');
 {
   const types=[...source.matchAll(/ask\(r,\s*[^,]+,\s*'([^']+)'/g)].map(x=>x[1]);
   for(const type of [...new Set(types), 'gaust_exile','fatal_exile'])ok(G.standardBot.handledPending.has(type),'explicit pending coverage: '+type);
   eq(decide(game(),null).id,null,'empty pending is safe');
 }
 {
   const g=game('twin_gate_cavern');g.p.gold=7950;g.p.pos=20;g.p.previousTile=21;g.p.gatesVisited=[12,22];g.p.hand=['sp_dice_3'];
   const pending=pd('roll',['roll','sp:sp_dice_3']);
   eq(decide(g,pending).id,'sp:sp_dice_3','fixed die secures an affordable winning castle');
   g.p.gold=7910;
   ok(!decide(g,pending).candidates.find(x=>x.id==='sp:sp_dice_3').priority,'subtract spell fee before predicting victory');
 }
 for(const map of Object.keys(G.MAPS))for(const steps of [1,3,6,18,58]) {
   const g=game(map);g.p.gold=1000;g.p.dir=1;g.p.lap=2;
   if(map==='twin_gate_cavern'){g.p.pos=16;g.p.previousTile=15;g.p.gatesVisited=[12,22];}
   else {g.p.pos=27;g.p.seal=true;}
   g.r.owners[2]={player:g.p.id,creature:'wakatama',level:1,dmg:30};
   const before=g.p.gold, v=G.standardBot.view(g.r,g.p,pd('roll',['roll']));
   const projected=G.standardBot.walkOutcomes(v.r,v.p,steps);
   G.performMove(g.r,g.p,steps,{value:steps},'projection test');
   let guard=0;
   while(g.r.movement&&guard++<20){const current=g.r.pending[g.p.id];ok(current,'movement remains actionable');
     G.handleChoose(g.r,g.p.id,current.type==='draft'?'skip':current.options[0].id);}
   ok(projected.some(x=>x.tile===g.p.pos&&x.goldGain===g.p.gold-before),'projected gate/castle reward matches '+map+'/'+steps);
   ok(projected.some(x=>x.tile===g.p.pos&&x.goldGain===g.p.gold-before&&Math.max(0,30-x.returns*10)===g.r.owners[2].dmg),'projected return healing matches '+map+'/'+steps);
 }
 {
   const g=game();g.p.hand=['gecko'];g.p.gold=0;g.enemy.hand=[];g.p.pos=1;
   g.r.owners[1]={player:g.enemy.id,creature:'gaston',level:1,dmg:20};g.r.elemOv[1]='fire';
   eq(decide(g,pd('tile',['invade','toll'])).id,'invade','free invasion does not invent a summon fee or reserve');
 }
 {
   const g=game();g.p.charId='mio';g.p.gold=2000;g.p.hand=['sp_bedrock_uplift','gaston'];
   g.r.owners[1]={player:g.p.id,creature:'wakatama',level:1,dmg:20};
   g.r.owners[2]={player:g.p.id,creature:'gaston',level:1,dmg:5};
   g.enemy.pos=2;g.enemy.dir=-1;
   eq(decide(g,{type:'spell_target',options:[{id:'tg:1'},{id:'tg:2'},{id:'tg:cancel'}]}).id,'tg:cancel','missing source spell cancels safely');
   g.p.pendSpell='sp_bedrock_uplift';
   eq(decide(g,{type:'spell_target',options:[{id:'tg:1'},{id:'tg:2'},{id:'tg:cancel'}]}).id,'tg:1','prefer actual healing and wakatama income');
   const v=G.standardBot.view(g.r,g.p,pd('roll',['roll'])),saved=JSON.stringify(v);
   for(const sid of Object.keys(G.SPELLS))G.standardBot.spellPlans(v.r,v.p,sid);
   for(const charId of Object.keys(G.CHARS))G.standardBot.ultimatePlan(v.r,{...v.p,charId});
   eq(JSON.stringify(v),saved,'all spell and ultimate previews are pure');
 }
 {
   const g=game('twin_gate_cavern');g.p.pos=24;g.p.previousTile=23;g.p.gatesVisited=[22];
   G.performMove(g.r,g.p,3,{value:3},'restore');
   const before=decide(g,g.r.pending[g.p.id]).id;
   const restored=G.restoreRoom(G.serializeRoom(g.r));ok(!restored.error,'route choice restores');
   const p=restored.room.players.find(x=>x.id===g.p.id);
   eq(G.botChooseOption(restored.room,p,restored.room.pending[p.id]),before,'restored route remains consistent');
 }
 {
   const g=game();g.r.botMode=true;g.p.isBot=true;g.r.botActionSeq=0;
   G.ask(g.r,g.p.id,'roll','first',[{id:'roll'}]);captureTimers=true;timers=[];G.scheduleBotAction(g.r);
   const stale=timers[0];G.ask(g.r,g.p.id,'roll','replacement',[{id:'roll'}]);
   const prompt=g.r.pending[g.p.id].promptId,position=g.p.pos;stale();
   eq(g.r.pending[g.p.id].promptId,prompt,'stale timer cannot consume replacement prompt');eq(g.p.pos,position,'stale timer does not move');
   eq(timers.length,2,'stale callback reschedules the current prompt once');captureTimers=false;
 }
 const report=[];
 for(const map of Object.keys(G.MAPS))for(const n of [2,3,4])for(let trial=0;trial<10;trial++)for(const policy of ['before','after']) {
   seed=15900+trial;const g=game(map,n,trial),r=g.r;G.askRoll(r,g.p);
   let actions=0,buys=0,invades=0,failures=0,supports=0,outer=0,maxMs=0;const times=[],types=new Set();
   while(!r.winner&&actions++<20000){
     if(r.turnTransition){G.completeTurnTransition(r,r.turnTransition.id,'board');continue;}
     if(r.ultSequence){G.resolveUltSequence(r);continue;}
     const entry=Object.entries(r.pending).find(([,pd])=>pd.options?.length);ok(entry,'game retains actionable pending');
     const [id,pending]=entry,p=r.players.find(x=>x.id===id),t=performance.now();
     ok(G.standardBot.handledPending.has(pending.type),'all encountered pending types are covered');
     const selected=(policy==='before'?G.legacyBotChooseOption:G.botChooseOption)(r,p,pending);
     const ms=performance.now()-t;times.push(ms);maxMs=Math.max(ms,maxMs);types.add(pending.type);
     ok(pending.options.some(o=>o.id===selected),'legal selection');
     if(pending.type==='market'&&selected.startsWith('buy:'))buys++;
     if(selected==='invade')invades++;
     if(pending.type==='support'&&selected!=='sup:none')supports++;
     if(pending.type==='route_choice'&&(p.pos===24&&selected==='route:25'||p.pos===10&&selected==='route:9'))outer++;
     const last=r.lastBattle;G.handleChoose(r,id,selected);if(r.lastBattle!==last&&!r.lastBattle.win)failures++;
   }
   ok(r.winner,`${policy} ${map}/${n}/${trial} finishes (pending ${JSON.stringify(r.pending)})`);
   times.sort((a,b)=>a-b);report.push({policy,map,n,trial,actions,buys,invades,failures,supports,outer,bankrupt:r.players.filter(p=>p.bankrupt).length,p95ms:times[Math.floor(times.length*.95)],maxMs,types:[...types].sort()});
 }
 for(const policy of ['before','after']) {
   const rows=report.filter(r=>r.policy===policy),summary={policy,games:rows.length};
   for(const key of ['actions','buys','invades','failures','supports','outer','bankrupt'])summary[key]=rows.reduce((n,r)=>n+r[key],0);
   summary.worstP95ms=Math.max(...rows.map(r=>r.p95ms));summary.maxMs=Math.max(...rows.map(r=>r.maxMs));
   console.log(JSON.stringify(summary));
 }
 console.log('Covered pending: '+[...new Set(report.filter(r=>r.policy==='after').flatMap(r=>r.types))].sort().join(', '));
 console.log(`v1.59 BOT: ${checks} checks passed`);
} finally {Math.random=originalRandom;Date.now=originalNow;G.rooms.clear();}
