const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setTimeout','setInterval',src+`;return {rooms,makeFixtureRoom,makeRoom,beginTurn,askRoll,handleChoose,calculateBattle,battleExternalModifiers,exileCard,doRoll,adoptDice,resolveTile,liaTargets,earthCounts,rewardEarthGrowth,finishGreaseReward,serializeRoom,restoreRoom,publicState,advancePassiveResolution,upCostRange,askMarket,CHARS,CREATURES,resolveBattle,tilesOf,effectiveSpellCost};`)(require,__dirname,()=>0,()=>0);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++},ok=(x,m)=>{assert(x,m);checks++};
function fixture(char='noir'){
 const r=G.makeFixtureRoom(),p=r.players[0],d=r.players[1];
 Object.assign(r,{phase:'playing',turn:0,pending:{},turnReadyAt:0,turnTransition:null,boardSeen:false,elemOv:{},tileFx:{},curses:{},barrier:{},passiveNotices:[]});r.owners.fill(null);
 for(const x of r.players)Object.assign(x,{lap:1,gold:2000,hand:['gecko','weapon','shield','sp_gold','sp_gold'],deck:['cleo','gecko','weapon'],discard:[],exile:[],spellCount:0,spellCast:false,bankrupt:false,charId:'linnei'});
 p.charId=char;p.pos=1;p.dir=1;d.pos=10;return {r,p,d};
}
function choose(g,id){G.handleChoose(g.r,g.p.id,id)}
{const g=fixture();G.askRoll(g.r,g.p);choose(g,'sp:sp_gold');eq(g.p.spellCount,1,'first spell commits');eq(g.p.gold,2100,'free gold spell');ok(g.r.pending[g.p.id].options.some(o=>o.id==='sp:sp_gold'),'second spell available');choose(g,'sp:sp_gold');eq(g.r.pending[g.p.id].type,'passive_resolve','notice before second effect');eq(g.p.gold,2100,'not resolved during notice');eq(g.p.hand.filter(c=>c==='sp_gold').length,1,'card stays until resolution');
 const save=G.serializeRoom(g.r);G.rooms.delete(save.room.code);const restored=G.restoreRoom(save);ok(!restored.error,'deferred spell survives save: '+restored.error);g.r=restored.room;g.p=g.r.players.find(p=>p.id===g.p.id);G.advancePassiveResolution(g.r,Date.now()+5000);eq(g.p.gold,2100,'second zero-cost spell pays 100 then gains 100');eq(g.p.spellCount,2,'second committed once');G.advancePassiveResolution(g.r,Date.now()+9000);eq(g.p.spellCount,2,'cannot replay');ok(!g.r.pending[g.p.id].options.some(o=>o.id.startsWith('sp:')),'third spell forbidden');}
{const g=fixture();g.p.hand=['sp_censor'];g.p.spellCount=1;g.p.spellCast=true;G.askRoll(g.r,g.p);choose(g,'sp:sp_censor');choose(g,'censor:cancel');eq(g.p.spellCount,1,'cancel does not consume');eq(g.r.passiveNotices.length,0,'cancel has no activation');}
for(const side of ['attacker','defender'])for(const invalid of [false,true]){
 const g=fixture(side==='attacker'?'redani':'linnei');g.d.charId=side==='defender'?'redani':'linnei';g.r.owners[1]={player:g.d.id,creature:'gecko',level:1,dmg:0};
 const support={kind:'support',cardId:'shield'},jinx={kind:'support',cardId:'jinx'};
 const b={tile:1,attacker:g.p.id,defender:g.d.id,atkCreature:'gecko',supports:{[g.p.id]:side==='attacker'?support:invalid?jinx:{kind:'none'},[g.d.id]:side==='defender'?support:invalid?jinx:{kind:'none'}}};
 const actual=G.calculateBattle(g.r,b);g.r.passiveVersion=0;const old=G.calculateBattle(g.r,b);g.r.passiveVersion=1;
 eq(actual[side==='attacker'?'atkDmg':'defSt']-old[side==='attacker'?'atkDmg':'defSt'],invalid?0:10,'Redani '+side+' invalid='+invalid);
 eq(G.battleExternalModifiers(g.r,b)[side].filter(x=>x.passive).length,0,'unrevealed weapon private');eq(G.battleExternalModifiers(g.r,b,true)[side].filter(x=>x.passive).length,invalid?0:1,'revealed modifier');
}
for(const dmg of [0,1]){const g=fixture();g.d.charId='adel';g.r.owners[1]={player:g.d.id,creature:'gecko',level:1,dmg};const b={tile:1,attacker:g.p.id,defender:g.d.id,atkCreature:'avalanche',supports:{}};const x=G.calculateBattle(g.r,b);g.r.passiveVersion=0;eq(x.defDF-G.calculateBattle(g.r,b).defDF,dmg?0:10,'Adel full HP snapshot');}
for(const multi of [false,true]){const g=fixture('mio');g.p.gale=multi;const pos=g.p.pos;G.doRoll(g.r,g.p);eq(g.p.pos,pos,'Mio waits before move');eq(g.r.pending[g.p.id].dice.length,multi?2:1,'Mio dice count');choose(g,'dice:reroll');eq(g.p.passiveRerolled,true,'Mio spent reroll');ok(g.r.pending[g.p.id]?.type!=='passive_mio','reroll cannot loop');}
{const g=fixture('lia');const target=2;g.r.owners[target]={player:g.d.id,creature:'gecko',level:1,dmg:1};ok(G.liaTargets(g.r,g.p).includes(target),'wounded neighbor eligible');g.p.passiveLiaLanding=true;G.resolveTile(g.r,g.p);eq(g.r.pending[g.p.id].type,'passive_lia','Lia before original landing');choose(g,'lia:'+target);eq(g.p.pos,target,'Lia moves');eq(g.r.pending[g.p.id].type,'pick_creature','normal invasion follows');}
{const g=fixture('grease');g.r.owners[1]={player:g.p.id,creature:'gecko_f',level:1,dmg:0};g.r.owners[2]={player:g.p.id,creature:'gecko',level:1,dmg:0};g.p.passiveGreaseTile=1;G.finishGreaseReward(g.r,g.p);const pd=g.r.pending[g.p.id];eq(pd.type,'upgrade_lv','Grease directly chooses level');ok(pd.options.every(o=>o.id==='ul:cancel'||o.id.startsWith('ul:1:')),'only captured tile');choose(g,'ul:1:2');eq(g.p.gold,1900,'normal undiscounted fee');eq(g.r.owners[2].level,1,'other land unchanged');}
{const g=fixture('villa');G.exileCard(g.r,g.p,'weapon');G.exileCard(g.r,g.p,'shield');g.p.exile=[];G.beginTurn(g.r);eq(g.r.lastGain.reason,'passive_villa','exile recovery does not clear trigger');eq(g.r.lastGain.n,1,'multiple exile gives one');eq(g.p.passiveExiled,false,'history consumed');ok(!G.publicState(g.r,g.d.id).lastGain.cards,'private gained card');}
{const g=fixture('nerasio');let before=G.earthCounts(g.r);for(const tile of [1,2,3,4,5,6]){g.r.owners[tile]={player:g.p.id,creature:'gecko',level:1};g.r.elemOv[tile]='earth';}G.rewardEarthGrowth(g.r,before);eq(g.p.gold,3000,'0 to 6 grants 1000');g.r.owners[6]=null;before=G.earthCounts(g.r);g.r.owners[6]={player:g.p.id,creature:'gecko',level:1};G.rewardEarthGrowth(g.r,before);eq(g.p.gold,3200,'regain uncapped sixth');}
{const g=fixture('noir');g.r.passiveVersion=0;g.r.owners[1]={player:g.p.id,creature:'gecko',level:1};eq(G.upCostRange(g.r,g.p,1,2),90,'legacy turn discount');g.p.passiveExiled=true;G.beginTurn(g.r);eq(G.upCostRange(g.r,g.p,1,2),100,'next turn migrates');eq(g.p.passiveExiled,false,'no retroactive reward');}
for(const ultimate of [false,true]) {
 const g=fixture('linnei');g.p.ultUsed=ultimate;g.p.spellCount=1;g.p.spellCast=true;
 if(ultimate)g.r.halfMarket=g.p.id;
 G.askMarket(g.r,g.p);const item=g.r.shopVisit.items.find(x=>x.card),count=g.p.hand.length;
 choose(g,'buy:'+item.slotId);eq(g.p.hand.length,count+1,'Linnei direct hand');ok(g.p.hand.includes(item.card),'purchased card in hand');
 choose(g,'buy:'+item.slotId);eq(g.p.hand.length,count+1,'purchase cannot duplicate');choose(g,'done');
 if(ultimate){eq(g.r.pending[g.p.id].type,'roll','ultimate resumes action');eq(g.p.spellCount,1,'resume retains spell count');eq(g.p.ultUsed,true,'ultimate stays used');}
 else ok(g.r.pending[g.p.id]?.type!=='market','normal shop exits');
}
for(const mapId of ['starting_corridor','twin_gate_cavern']) {
 const g=fixture('mio');g.r.mapId=mapId;g.r.players.forEach(p=>{p.gatesVisited=[];p.seal=false;p.previousTile=null;p.reverseNext=false;});g.r.owners=G.tilesOf(g.r).map(()=>null);G.doRoll(g.r,g.p);
 const save=G.serializeRoom(g.r);G.rooms.delete(save.room.code);const restored=G.restoreRoom(save);ok(!restored.error,'Mio save '+mapId+': '+restored.error);
 const pos=g.p.pos;g.r=restored.room;g.p=g.r.players.find(x=>x.id===g.p.id);choose(g,'dice:accept');ok(g.r.pending[g.p.id]?.type!=='passive_mio','adoption resumes '+mapId);
}
{const g=fixture('lia');g.r.owners[2]={player:g.d.id,creature:'gecko',level:1,dmg:0};eq(G.liaTargets(g.r,g.p),[],'full HP excluded');g.r.curses[2]={by:g.p.id,hp:10};ok(G.liaTargets(g.r,g.p).includes(2),'curse qualifies');g.r.barrier[g.d.id]=true;eq(G.liaTargets(g.r,g.p),[],'barrier excludes');delete g.r.barrier[g.d.id];g.p.hand=[];eq(G.liaTargets(g.r,g.p),[],'no invading card excludes');}
{const g=fixture('nerasio');g.r.owners[3]={player:g.p.id,creature:'gecko',level:1};g.r.elemOv[3]='earth';g.p.pos=2;g.r.elemOv[2]='water';g.p.hand=['komao'];g.r.pending[g.p.id]={type:'tile',options:[{id:'summon:komao'}]};const before=g.p.gold;choose(g,'summon:komao');eq(g.p.gold,before-G.CREATURES.komao.cost+200,'placement and earth conversion pay exactly once');}
{const g=fixture('villa');g.p.discard.push('weapon');G.beginTurn(g.r);ok(g.r.lastGain?.reason!=='passive_villa','ordinary discard gives no reward');}
for(const level of [1,3])for(const evolved of [false,true]) {
 const g=fixture('grease');g.p.pos=21;g.p.hand=[evolved?'joma_f':'joma'];g.p.deck=[];g.r.deck=['shield','weapon','sp_gold','cleo'];g.r.owners[21]={player:g.d.id,creature:'gecko',level,dmg:35};g.r.elemOv[21]='wind';
 g.r.battle={tile:21,attacker:g.p.id,defender:g.d.id,atkCreature:g.p.hand[0],supports:{}};G.resolveBattle(g.r);
 eq(g.r.lastBattle.win,true,'Grease invasion succeeds');
 eq(g.p.passiveGreaseTile,evolved?21:undefined,'only evolved before invasion qualifies');
 eq(g.r.pending[g.p.id].type,'draft','reward precedes Grease upgrade');choose(g,'take:shield');
 if(evolved||level>=3){eq(g.r.pending[g.p.id].type,'card_search','reward search before upgrade');choose(g,g.r.pending[g.p.id].options[0].id);}
 if(evolved){eq(g.r.pending[g.p.id].type,'upgrade_lv','upgrade after reward and search');const gold=g.p.gold;choose(g,'ul:cancel');eq(g.p.gold,gold,'declining upgrade free');}
 else ok(g.r.pending[g.p.id]?.type!=='upgrade_lv','evolving on capture grants no upgrade');
}
for(const reason of ['max','poor','lost']){const g=fixture('grease');g.p.passiveGreaseTile=1;g.r.owners[1]={player:reason==='lost'?g.d.id:g.p.id,creature:'gecko_f',level:reason==='max'?4:1};if(reason==='poor')g.p.gold=0;G.finishGreaseReward(g.r,g.p);ok(g.r.pending[g.p.id]?.type!=='upgrade_lv','skip Grease '+reason);}
{const g=fixture('noir');g.p.spellCount=1;g.r.owners[2]={player:g.p.id,creature:'grigor',level:1};eq(G.effectiveSpellCost(g.r,g.p,'sp_gold'),100,'reduction cannot reduce surcharge');g.p.gold=99;G.askRoll(g.r,g.p);ok(!g.r.pending[g.p.id].options.some(o=>o.id==='sp:sp_gold'),'second spell needs additional funds');}
{const g=fixture('villa');G.exileCard(g.r,g.p,'weapon');G.beginTurn(g.r);const before=g.p.hand.length,deadline=g.r.pending[g.p.id].availableAt;ok(g.r.lastGain.availableAt>g.r.turnReadyAt,'card reveal follows turn and ability notice');G.advancePassiveResolution(g.r,deadline-1);eq(g.r.pending[g.p.id].type,'passive_reward','normal draw waits for reveal');G.advancePassiveResolution(g.r,deadline+1);ok(g.r.pending[g.p.id].type!=='passive_reward','normal draw resumes');G.advancePassiveResolution(g.r,deadline+2);eq(g.p.hand.length,before,'timer cannot award duplicate card');}
{const g=fixture('noir');G.askRoll(g.r,g.p);for(const viewer of [null,g.d.id])eq(G.publicState(g.r,viewer).pending[g.p.id].options,[],'private hand-derived choices are owner only');ok(G.publicState(g.r,g.p.id).pending[g.p.id].options.some(o=>o.id==='sp:sp_gold'),'owner receives spell choices');}
console.log('PASS summoner passives:',checks);
