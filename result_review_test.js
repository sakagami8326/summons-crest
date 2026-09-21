const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','console',source+`;return {makeFixtureRoom,startGame,gainToDeck,drawCards,onCreatureSummoned,payToll,payTo,finalDeckSnapshot,initMatchAnalytics,buildMatchResult,publicState,publicCardCatalog,serializeRoom,validateSave,restoreRoom,startDraft,handleChoose,CREATURES};`)(require,__dirname,()=>{}, {log(){},error:console.error});
const r=G.makeFixtureRoom(),p=r.players[0],q=r.players[1];G.startGame(r);assert.equal(p.cardsCollected,0);assert.equal(p.tollCollected,0);
G.gainToDeck(r,p,['weapon','gecko'],'market');assert.equal(p.cardsCollected,2);G.drawCards(r,p,2);assert.equal(p.cardsCollected,2);
G.onCreatureSummoned(r,p,'kamadoma','summon',0);assert.equal(p.cardsCollected,3);assert.ok(p.hand.includes('weapon'));
G.onCreatureSummoned(r,p,'cresteria','summon',0);assert.equal(p.cardsCollected,4);
G.payToll(r,q,p,320);G.payToll(r,q,p,100);assert.equal(p.tollCollected,420);G.payTo(r,q,p,80);assert.equal(p.tollCollected,420);
const draft=G.makeFixtureRoom(),d=draft.players[0];draft.pending={};draft.deck=['samurai_saga','gecko','sp_gold'];G.startDraft(draft,d,'battle');const visible=G.publicState(draft,null);assert.equal(visible.pending[d.id].aura,'UR');assert.equal(visible.catalog.CREATURES.samurai_saga.rarity,'UR');assert.equal(G.CREATURES.samurai_saga.rarity,'L');
const inv=G.makeFixtureRoom(),i=inv.players[0];inv.owners.fill(null);i.deck=['gecko','gecko'];i.hand=['weapon'];i.discard=['sp_gold'];i.resolving=['sp_fatal_reward'];i.pickCards=['gaston'];i.exile=['gshield'];inv.owners[3]={player:i.id,creature:'poponga',level:4};inv.owners[4]={player:inv.players[1].id,creature:'nome',level:1};
const expected=['gecko','gecko','weapon','sp_gold','sp_fatal_reward','gaston','poponga_f'];assert.deepEqual(G.finalDeckSnapshot(inv,i),expected);
G.initMatchAnalytics(inv);assert.equal(G.publicState(inv,null).matchResult,null);inv.phase='ended';inv.winner=i.id;const result=G.buildMatchResult(inv);const entry=result.rankings.find(x=>x.id===i.id);assert.deepEqual(entry.finalDeck,expected);i.hand.push('shield');assert.deepEqual(entry.finalDeck,expected,'snapshot is immutable');
const save=G.serializeRoom(inv);assert.equal(G.validateSave(save),null);const restored=G.restoreRoom(save).room;assert.deepEqual(restored.matchResult.rankings.find(x=>x.id===i.id).finalDeck,expected);
const counted=G.serializeRoom(r);counted.room.code="CT01";assert.equal(G.validateSave(counted),null);const restoredCounts=G.restoreRoom(counted).room.players.find(x=>x.id===p.id);assert.equal(restoredCounts.cardsCollected,4);assert.equal(restoredCounts.tollCollected,420);
const bad=structuredClone(save);bad.room.matchResult.rankings[0].finalDeck=['made-up-card'];assert.ok(G.validateSave(bad));const badCount=structuredClone(save);badCount.room.players[0].cardsCollected=-1;assert.ok(G.validateSave(badCount));
const legacy=structuredClone(save);legacy.room.players.forEach(x=>{delete x.cardsCollected;delete x.tollCollected;});delete legacy.room.matchResult;delete legacy.room.resultReview;const old=G.restoreRoom(legacy).room;G.gainToDeck(old,old.players[0],['gecko']);assert.equal(old.players[0].cardsCollected,null,'legacy totals stay unknown rather than misleading partial totals');
// Returning to the castle wins even when another player owns more assets.
for(let winnerIndex=0;winnerIndex<4;winnerIndex++){
 const match=G.makeFixtureRoom();match.owners.fill(null);match.titles={};
 match.players.forEach((player,index)=>{player.gold=[9500,8200,9000,9000][index];});
 match.phase='ended';match.winner=match.players[winnerIndex].id;G.initMatchAnalytics(match);
 const ranked=G.buildMatchResult(match).rankings;
 assert.equal(ranked[0].id,match.winner,'declared winner is always first');
 assert.deepEqual(ranked.slice(1).map(row=>row.id),match.players.filter(player=>player.id!==match.winner).sort((a,b)=>b.gold-a.gold).map(player=>player.id));
 assert.deepEqual(ranked.map(row=>row.rank),[1,2,3,4]);
 const saved=G.serializeRoom(match);saved.room.code='RK0'+winnerIndex;
 // Previously saved results used asset order; restoring must fix the ranks without changing snapshots.
 saved.room.matchResult.rankings.sort((a,b)=>b.assets.total-a.assets.total).forEach((row,index)=>row.rank=index+1);
 const loaded=G.restoreRoom(saved);assert.equal(loaded.error,undefined);
 assert.deepEqual(loaded.room.matchResult.rankings,ranked,'saved ranks corrected, assets and decks preserved');
}
const catalog=G.publicCardCatalog();assert.ok(!JSON.stringify(catalog).includes('"rarity":"L"'));
console.log('Result review: new acquisitions, draw exclusion, toll-only totals, inventory zones, evolution, privacy, snapshots, save/restore, legacy and UR presentation passed.');
