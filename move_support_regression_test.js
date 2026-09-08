// Regressions: pre-roll Move invasion continuation and evolved creature weapon art.
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\nreturn { makeRoom, startGame, startBattle, askRoll, endTurn, handleChoose, CREATURES, SUPPORTS, supportStats, creatureSupportEnabled, serializeRoom, restoreRoom, publicState, rooms };')(
  require, __dirname, process, console, () => {});
let checks = 0;
const failures = [];
function ok(value, label) { checks++; if (!value) failures.push(label); }
function setup(mapId) {
  const r = G.makeRoom('normal', mapId);
  r.players = [{id:'p0',name:'A',charId:'mio',confirmed:true}, {id:'p1',name:'B',charId:'adel',confirmed:true}];
  G.startGame(r);
  r.pending = {}; r.owners.fill(null);
  for (const p of r.players) { p.hand = []; p.gold = 1000; p.pickCards = []; }
  return r;
}
function finishChoices(r, take = false) {
  for (let n = 0; n < 15; n++) {
    const entry = Object.entries(r.pending).find(([,p]) => ['draft','mermaid_heal','abyss_mark','samurai_elem','daitekkan_recover','sell'].includes(p.type));
    if (!entry) return;
    const [pid,p] = entry;
    G.handleChoose(r,pid,(!take && p.options.find(o => o.id === 'skip')?.id) || p.options[0].id);
  }
  throw new Error('post-battle choices did not finish');
}
function restored(r) {
  const out = G.restoreRoom(G.serializeRoom(r));
  if (!out.room) throw new Error(JSON.stringify(out));
  return out.room;
}
for (const mapId of ['starting_corridor','twin_gate_cavern']) {
  for (const outcome of ['empty','win','lose','counter','cancel']) {
    for (const restore of [false,true]) {
      let r = setup(mapId);
      let a = r.players[0], d = r.players[1]; const aid = a.id;
      a.hand = ['sp_step'];
      r.owners[1] = {player:a.id,creature:outcome === 'win' ? 'magado_f' : 'nome',level:1};
      if (!['empty','cancel'].includes(outcome)) r.owners[2] = {player:d.id,creature:outcome === 'counter' ? 'magado_f' : outcome === 'win' ? 'cleo' : 'bedebero',level:1};
      G.askRoll(r,a);
      G.handleChoose(r,a.id,'sp:sp_step'); G.handleChoose(r,a.id,'st:1');
      ok(r.pending[a.id]?.type === 'step_b', `${mapId} ${outcome}: destination prompt`);
      if (restore) { r = restored(r); a = r.players.find(p=>p.id===aid); d = r.players.find(p=>p.id!==aid); }
      G.handleChoose(r,a.id,outcome === 'cancel' ? 'sd:cancel' : 'sd:2');
      if (r.battle) {
        if (restore) { r = restored(r); a = r.players.find(p=>p.id===aid); d = r.players.find(p=>p.id!==aid); }
        G.handleChoose(r,a.id,'sup:none'); G.handleChoose(r,d.id,'sup:none');
        ok(r.lastBattle.win === (outcome === 'win'), `${mapId} ${outcome}: battle result`);
        if (outcome === 'counter') ok(!r.lastBattle.atkSurvived, 'counter kills moving creature');
        if (restore) { r = restored(r); a = r.players.find(p=>p.id===aid); }
        finishChoices(r, restore);
      }
      ok(r.players[r.turn].id === aid && r.pending[aid]?.type === 'roll', `${mapId} ${outcome} restore=${restore}: Move returns to same player's dice`);
      ok(a.gold === (outcome === 'cancel' ? 1000 : 960), `${outcome}: charge spell once, no toll`);
      ok(!a.bonusRollPending, `${outcome}: continuation consumed`);
      if (r.pending[aid]?.type === 'roll') {
        ok(outcome === 'cancel' || !r.pending[aid].options.some(o=>o.id.startsWith('sp:')), 'Move does not permit a second spell');
        const before = r.pending[aid].promptId;
        G.handleChoose(r,aid,'sd:2');
        ok(r.pending[aid].promptId === before, 'duplicate destination cannot apply Move again');
        G.handleChoose(r,aid,'roll');
        ok(r.pending[aid]?.type === (mapId === 'twin_gate_cavern' ? 'route_choice' : 'direction') || !!r.lastDice,
          `${mapId}: dice action is accepted after Move`);
      }
      G.rooms.delete(r.code);
    }
  }
}
// Additional placement/heal/recovery prompts and forced liquidation must all resume the pre-roll turn.
for (const creature of ['mermaid','night_jelly','samurai_saga','kamadoma_f','nome']) {
  const r = setup('starting_corridor'), a = r.players[0], d = r.players[1];
  a.hand = ['sp_step']; a.exile = ['shield'];
  r.owners[1] = {player:a.id,creature,level:1};
  r.owners[2] = {player:d.id,creature:creature === 'nome' ? 'barbaro' : 'cleo',level:1,dmg:29};
  r.owners[3] = {player:a.id,creature:'orphe',level:1,dmg:20};
  if (creature === 'nome') { a.gold = 40; r.owners[2].dmg = 0; }
  G.askRoll(r,a); G.handleChoose(r,a.id,'sp:sp_step'); G.handleChoose(r,a.id,'st:1'); G.handleChoose(r,a.id,'sd:2');
  G.handleChoose(r,a.id,'sup:none'); G.handleChoose(r,d.id,'sup:none');
  const promptType = Object.values(r.pending)[0]?.type;
  if (creature === 'mermaid') ok(promptType === 'mermaid_heal','Move triggers heal choice');
  if (creature === 'night_jelly') ok(promptType === 'abyss_mark','Move triggers mark choice');
  if (creature === 'kamadoma_f') ok(promptType === 'daitekkan_recover','Move triggers weapon recovery');
  finishChoices(r,true);
  ok(r.players[r.turn].id === a.id && r.pending[a.id]?.type === 'roll', `${creature}: all post-battle effects resume roll`);
  ok(!a.bonusRollPending, `${creature}: roll continuation cleared`);
  if (creature === 'nome') ok(a.gold >= 0, 'bankruptcy settlement completes before rolling');
  r.pending = {}; G.endTurn(r);
  ok(r.players[r.turn].id !== a.id, `${creature}: following normal turn end does not grant extra roll`);
  G.rooms.delete(r.code);
}
const board = fs.readFileSync(path.join(__dirname,'public/board.html'),'utf8');
const renderSupport = new Function('state', board.slice(board.indexOf('const supportCardId ='), board.indexOf('function battleCreatureHTML(')) + '\nreturn supportBackHTML;')({catalog:{CREATURES:G.CREATURES,SUPPORTS:G.SUPPORTS}});
const supportUsers = Object.keys(G.CREATURES).filter(G.creatureSupportEnabled);
ok(JSON.stringify(supportUsers.slice().sort()) === JSON.stringify(['survey','survey_f','shuterio','shuterio_f'].sort()), 'all four support ability forms audited');
for (const user of supportUsers) {
  const r = setup('starting_corridor'), a = r.players[0], d = r.players[1];
  a.hand = [user,'nome_f']; d.hand = ['gecko_f'];
  r.owners[2] = {player:d.id,creature:user,level:1};
  G.startBattle(r,a,2); G.handleChoose(r,a.id,'atk:'+user);
  ok(r.pending[a.id].options.some(o=>o.id==='sup:c:nome_f'), `${user}: attack accepts evolved weapon`);
  ok(r.pending[d.id].options.some(o=>o.id==='sup:c:gecko_f'), `${user}: defense accepts evolved weapon`);
  G.handleChoose(r,a.id,'sup:c:nome_f'); G.handleChoose(r,d.id,'sup:c:gecko_f');
  for (const [side,cid] of [['atk','nome_f'],['def','gecko_f']]) {
    const sup = r.lastBattle[side+'Support'];
    ok(sup.cardId === cid && renderSupport('公開',sup).includes(`/e_${cid.replace(/_f$/,'')}.webp`), `${user} ${side}: actual battle payload renders evolution`);
  }
  finishChoices(r);
  ok(r.players[r.turn].id !== a.id, `${user}: normal invasion still ends turn`);
  G.rooms.delete(r.code);
}
for (const cid of Object.keys(G.CREATURES)) {
  const sup = G.supportStats({kind:'creature',cardId:cid});
  const html = renderSupport('公開',sup);
  const expected = `/assets/cards/${cid.endsWith('_f') ? 'e_' : 'c_'}${cid.replace(/_f$/,'')}.webp`;
  ok(html.includes(`src="${expected}"`), `${cid}: correct weapon image path`);
  ok(fs.existsSync(path.join(__dirname,'public',expected)), `${cid}: actual image exists`);
  ok(html.includes(G.CREATURES[cid].name), `${cid}: correct accessible name`);
  ok(sup.st === G.CREATURES[cid].st && sup.hp === G.CREATURES[cid].hp, `${cid}: stats unchanged`);
}
for (const cid of Object.keys(G.SUPPORTS)) {
  const html = renderSupport('公開',G.supportStats(cid));
  ok(html.includes('/assets/cards/support-'), `${cid}: normal weapon art preserved`);
}
if (failures.length) throw new Error(`${failures.length}/${checks} failed:\n${failures.join('\n')}`);
console.log(`MOVE / CREATURE SUPPORT ALL ${checks} CHECKS PASSED`);
