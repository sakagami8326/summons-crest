// v1.05 BOT戦: 専用ルーム、判断、保存復元、完走の回帰テスト
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const load = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { makeRoom, startSelect, startGame, handleChoose, publicState, serializeRoom, restoreRoom,' +
  ' botChooseOption, clearBotTimer, resolveUltSequence, rooms, CHARS };');
const G = load(require, __dirname, process, console, () => {});

function makeBotGame(humanChar = 'redani') {
  const r = G.makeRoom('bot');
  const human = { id: 'human', name: 'プレイヤー', isBot: false };
  r.players.push(human);
  G.startSelect(r);
  assert.equal(r.players.length, 4, 'BOT戦は人間1+BOT3');
  assert.equal(r.players.filter(p => p.isBot).length, 3);
  assert(r.pending.human && r.pending.human.type === 'select_char');
  assert(r.players.filter(p => p.isBot).every(p => !r.pending[p.id]), 'BOTに召喚士選択を要求しない');
  G.handleChoose(r, human.id, humanChar);
  const chars = r.players.map(p => p.charId);
  assert.equal(new Set(chars).size, 4, '召喚士は重複しない');
  assert(r.players.filter(p => p.isBot).every(p => p.name === G.CHARS[p.charId].name));
  assert.equal(G.publicState(r, human.id).botMode, true);
  assert.equal(G.publicState(r, human.id).players.filter(p => p.isBot).length, 3);
  G.startGame(r);
  G.clearBotTimer(r);
  return { r, human };
}

{
  const { r, human } = makeBotGame();
  const save = G.serializeRoom(r);
  assert.equal(save.room.botMode, true);
  assert.equal(save.room.players.filter(p => p.isBot).length, 3);
  assert(!('botTimer' in save.room) && !('botActionSeq' in save.room));
  G.rooms.delete(r.code);
  const out = G.restoreRoom(JSON.parse(JSON.stringify(save)));
  assert(!out.error, out.error);
  assert.equal(out.room.botMode, true);
  assert.equal(out.room.players.filter(p => p.isBot).length, 3);
  G.clearBotTimer(out.room);
  G.rooms.delete(out.room.code);
}

// 固定局面: 戦力不足なら補充し、実在する防衛クリーチャーに対して支援を評価する。
{
  const { r } = makeBotGame('linnei');
  const bot = r.players.find(p => p.isBot);
  bot.hand = ['gecko', 'weapon', 'shield']; bot.gold = 300;
  bot.deck = []; bot.discard = []; bot.charId = 'redani';
  let pick = G.botChooseOption(r, bot, { type: 'pick_draw', options: [
    { id: 'pd:0', card: 'gecko' }, { id: 'pd:1', card: 'sp_gold' },
  ] });
  assert.equal(pick, 'pd:0', '戦力になるクリーチャーを優先する');
  r.owners[1] = { player:'human', creature:'gaston', level:1, dmg:20 };
  r.players.find(p => p.id === 'human').hand = [];
  r.battle = { attacker: bot.id, defender: 'human', tile: 1, atkCreature: 'gecko', supports: {} };
  pick = G.botChooseOption(r, bot, { type: 'support', options: [
    { id: 'sup:s:weapon' }, { id: 'sup:s:shield' }, { id: 'sup:none' },
  ] });
  assert(['sup:s:weapon', 'sup:none'].includes(pick), '攻撃支援は武器か節約を選ぶ');
  G.clearBotTimer(r); G.rooms.delete(r.code);
}

// 人間も同じ合法選択器で代行し、BOT戦固有の編成でゲーム終了まで進む。
for (let game = 0; game < 2; game++) {
  const { r } = makeBotGame(game ? 'adel' : 'mio');
  let steps = 0;
  while (!r.winner && steps < 80000) {
    const entries = Object.entries(r.pending);
    assert(entries.length, `pendingなしで停止 turn=${r.turn}`);
    for (const [pid, pend] of entries) {
      if (pend.type === 'ult_resolve') { G.resolveUltSequence(r); steps++; continue; }
      if (!pend.options || !pend.options.length) continue;
      const p = r.players.find(q => q.id === pid);
      const optionId = G.botChooseOption(r, p, pend);
      assert(pend.options.some(o => o.id === optionId), `${pend.type}: 不正な選択 ${optionId}`);
      G.handleChoose(r, pid, optionId);
      steps++;
      if (r.winner) break;
    }
  }
  assert(r.winner, 'BOT戦が完走しない');
  G.clearBotTimer(r); G.rooms.delete(r.code);
  console.log(`BOT MODE GAME${game + 1}: ${steps}選択で完走`);
}

async function httpChecks() {
  const port = 3195;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(port) }, stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(base + '/api/fixture')).ok) break; } catch (e) {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const created = await (await fetch(base + '/api/create', { method: 'POST', body: JSON.stringify({ mode: 'bot' }) })).json();
    const joined = await (await fetch(base + '/api/join', { method: 'POST', body: JSON.stringify({ room: created.code, name: '人間' }) })).json();
    const second = await fetch(base + '/api/join', { method: 'POST', body: JSON.stringify({ room: created.code, name: '二人目' }) });
    assert.equal(second.status, 400, 'BOT戦への人間2人目を拒否');
    await fetch(base + '/api/action', { method: 'POST', body: JSON.stringify({ room: created.code, type: 'start_select' }) });
    await fetch(base + '/api/action', { method: 'POST', body: JSON.stringify({ room: created.code, type: 'choose', playerId: joined.playerId, optionId: 'redani' }) });
    const save = await (await fetch(`${base}/api/save?room=${created.code}&token=${created.boardToken}`)).json();
    const bot = save.room.players.find(p => p.isBot);
    const hijack = await fetch(base + '/api/action', { method: 'POST', body: JSON.stringify({
      room: created.code, type: 'choose', playerId: bot.id, optionId: 'unpick',
    }) });
    assert.equal(hijack.status, 403, '外部からのBOT操作を拒否');
    await fetch(base + '/api/close', { method: 'POST', body: JSON.stringify({ room: created.code, token: created.boardToken }) });
  } finally {
    child.kill();
  }
}

httpChecks().then(() => console.log('BOT MODE TESTS PASSED')).catch(e => {
  console.error(e); process.exitCode = 1;
});
