'use strict';
const fs = require('fs'), assert = require('assert/strict');
const source = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
function loadGame(timer=(fn,delay)=>({fn,delay})) {return new Function('require', '__dirname', 'setInterval', 'setTimeout', source + `;return {server,rooms,makeRoom,startSelect,handleChoose,isSelectionReady,startSelectionDraw,advanceSelectionDraw,startGame,serializeRoom,validateSave,restoreRoom,publicState,askRoll,scheduleBotAction,CHARS,clearBotTimer,clearSelectionDrawTimer,clearUltTimer,clearTurnTransitionTimer};`)(require, __dirname, () => 0, timer);}
const G=loadGame();
function finishSelection(r){if(r.selectionDraw){G.startSelectionDraw(r);G.advanceSelectionDraw(r,Math.max(...r.selectionDraw.targets.map(t=>t.stopAt))+1);}}
function lobby(n, mode = 'normal', game=G) {
  const r = game.makeRoom(mode);
  for (let i = 0; i < n; i++) r.players.push({ id: 'human' + i, name: '参加者' + (i + 1) });
  return r;
}
function chooseHumans(r) {
  for (const human of r.players.filter(p => !p.isBot)) {
    const taken = new Set(r.players.filter(p => p.confirmed).map(p => p.charId));
    const option = r.pending[human.id].options.find(o => !taken.has(o.id));
    G.handleChoose(r, human.id, option.id);
  }
}
async function run() {
  for (const n of [2, 3]) {
    const r = lobby(n); r.botMode = true; G.startSelect(r);
    assert.equal(r.players.filter(p => p.isBot).length, 4 - n);
    const humans = r.players.filter(p => !p.isBot), bots = r.players.filter(p => p.isBot);
    G.handleChoose(r, humans[0].id, 'redani');
    assert(bots.every(p => !p.confirmed), 'BOT waits for all humans');
    for (const p of humans.slice(1)) G.handleChoose(r, p.id, r.pending[p.id].options.find(o => !r.players.some(q => q.confirmed && q.charId === o.id)).id);
    assert(!G.isSelectionReady(r),'wait for random/BOT presentation'); finishSelection(r); assert(G.isSelectionReady(r));
    assert.equal(new Set(r.players.map(p => p.charId)).size, 4);
    G.handleChoose(r, humans[0].id, 'unpick');
    assert(bots.every(p => !p.confirmed && !p.charId));
    G.handleChoose(r, humans[0].id, r.pending[humans[0].id].options[0].id);
    finishSelection(r); assert(G.isSelectionReady(r));
    G.startGame(r);
    const saved = G.serializeRoom(r), loaded = G.restoreRoom(JSON.parse(JSON.stringify(saved)));
    assert(!loaded.error, loaded.error);
    assert.equal(loaded.room.players.filter(p => p.isBot).length, 4 - n);
    assert(loaded.room.botMode);
    const bot = r.players.find(p => p.isBot);
    r.turn = r.players.indexOf(bot); r.turnTransition = null; r.pending = {}; bot.hand = []; bot.ultUsed = true; bot.fixedDice = 1;
    G.askRoll(r, bot); G.scheduleBotAction(r);
    assert.equal(typeof r.botTimer?.fn, 'function');
    r.botTimer.fn();
    assert.equal(r.lastDice?.player, bot.id, 'mixed-game BOT actually rolls');
  }
  const duplicate = lobby(2); duplicate.botMode = true; G.startSelect(duplicate);
  G.handleChoose(duplicate, 'human0', 'redani'); G.handleChoose(duplicate, 'human1', 'redani');
  assert(duplicate.duel);
  assert(duplicate.players.filter(p => p.isBot).every(p => !p.confirmed));
  const loser = duplicate.players.find(p => !p.isBot && !p.confirmed);
  G.handleChoose(duplicate, loser.id, duplicate.pending[loser.id].options[0].id);
  finishSelection(duplicate); assert(G.isSelectionReady(duplicate));
  const single = lobby(1, 'bot'); G.startSelect(single); chooseHumans(single);
  finishSelection(single); assert(G.isSelectionReady(single)); assert.equal(single.players.length, 4);
  for (const n of [2, 3, 4]) {
    const r = lobby(n); G.startSelect(r); chooseHumans(r);
    assert.equal(r.players.length, n); assert(G.isSelectionReady(r));
  }
  await new Promise(resolve => G.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + G.server.address().port;
  const request = async (r, extra) => {
    const res = await fetch(base + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: r.code, type: 'start_select', ...extra }) });
    return { status: res.status, body: await res.json() };
  };
  try {
    const r = lobby(2), fields = { fillBots: true, expectedHumanCount: 2, token: r.boardToken };
    assert.equal((await request(r, { ...fields, token: 'wrong' })).status, 403);
    assert.equal((await request(r, { ...fields, fillBots: 'yes' })).status, 400);
    assert.equal((await request(r, { ...fields, expectedHumanCount: 3 })).status, 409);
    assert.equal(r.phase, 'lobby'); assert.equal(r.players.length, 2);
    assert.equal((await request(r, fields)).status, 200); assert.equal(r.players.length, 4);
    assert.equal((await request(r, fields)).status, 200); assert.equal(r.players.length, 4);
    const joining = lobby(2), old = { fillBots: true, expectedHumanCount: 2, token: joining.boardToken };
    joining.players.push({ id: 'third', name: '3人目' });
    assert.equal((await request(joining, old)).status, 409); assert.equal(joining.players.length, 3);
    assert.equal((await request(joining, { ...old, expectedHumanCount: 3 })).status, 200);
    assert.equal(joining.players.filter(p => p.isBot).length, 1);
    for (const n of [2, 3, 4]) {
      const humanOnly = lobby(n);
      assert.equal((await request(humanOnly, { fillBots: false, expectedHumanCount: n, token: humanOnly.boardToken })).status, 200);
      assert.equal(humanOnly.players.length, n); assert.equal(humanOnly.botMode, false);
    }
    for (const [n, mode] of [[2, 'normal'], [1, 'bot']]) {
      const legacy = lobby(n, mode); assert.equal((await request(legacy, {})).status, 200);
      assert.equal(legacy.phase, 'select'); assert.equal(legacy.players.length, mode === 'bot' ? 4 : n);
    }
    console.log('PASS mixed BOT: 2/3 humans, all-human 2/3/4, single BOT mode, character conflict/reselect, actual BOT roll, save/restore and HTTP safety/compatibility');
  } finally { G.server.closeAllConnections(); G.server.close(); }
}
if (require.main === module) run().catch(error => { console.error(error); process.exit(1); });
module.exports = { G, lobby, chooseHumans, loadGame };
