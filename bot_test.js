// BOT回帰テスト: 3人でフル1局を回し、winner確定までをassertする(在プロセス実行)
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
// listen部を除去(ポートを占有しない)
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const load = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { makeRoom, startSelect, handleChoose, publicState, rooms, CHARS };');
const G = load(require, __dirname, process, console, () => {}); // GCタイマーは無効化

function runGame(seed) {
  const r = G.makeRoom();
  const names = ['ボットA', 'ボットB', 'ボットC', 'ボットD'];  // 4人=全キャラ別デッキを網羅
  const pids = names.map((n, i) => {
    const id = 'bot' + i;
    r.players.push({ id, name: n });
    return id;
  });
  G.startSelect(r);
  const chars = Object.keys(G.CHARS);
  pids.forEach((pid, i) => G.handleChoose(r, pid, chars[i % chars.length]));

  let steps = 0;
  const seen = new Set();
  const totals = {};
  while (!r.winner && steps < 60000) {
    const keys = Object.keys(r.pending);
    if (keys.length === 0) throw new Error('スタック: pendingなし・winnerなし (turn=' + r.turn + ')');
    for (const pid of keys) {
      const view = G.publicState(r, pid); // 本人視点(ドラフト秘匿の検証も兼ねる)
      const pend = view.pending[pid];
      if (!pend) continue;
      seen.add(pend.type);
      if (!pend.options || pend.options.length === 0)
        throw new Error('本人視点でoptionsが空: type=' + pend.type);
      // 他人視点でドラフトが秘匿されているか
      if (pend.type === 'draft') {
        const other = pids.find(x => x !== pid);
        const spy = G.publicState(r, other).pending[pid];
        if (spy && spy.options.length !== 0) throw new Error('ドラフト秘匿が破れている');
      }
      let opt = pend.options[Math.floor(Math.random() * pend.options.length)];
      // 「キャラを選び直す」は稀にだけ選ぶ(ランダムBOTのライブロック回避。実プレイヤーは任意)
      if (opt.id === 'unpick' && Math.random() < 0.9) {
        const alt = pend.options.filter(o => o.id !== 'unpick');
        if (alt.length) opt = alt[Math.floor(Math.random() * alt.length)];
        else continue;  // 選択肢がunpickのみ=確定済みの待機。9割は何もしない
      }
      G.handleChoose(r, pid, opt.id);
      if (r.lastEvent) seen.add('EV:' + r.lastEvent.type + (r.lastEvent.choice ? ':' + r.lastEvent.choice : ''));
      // カード保存則: (山札+手札+捨て札+廃棄+盤面)は獲得でしか増えず、決して減らない
      if (r.phase === 'playing') {
        for (const q of r.players) {
          const board = r.owners.filter(o => o && o.player === q.id).length;
          // 風の回廊: 解決時点で移動元が空き地になるため、戦闘確定までのクリーチャーは「戦闘中ゾーン」として数える
          const inBattle = r.battle && r.battle.corridor && r.battle.attacker === q.id ? 1 : 0;
          const total = (q.deck || []).length + (q.hand || []).length +
                        (q.discard || []).length + (q.exile || []).length + board + inBattle;
          if (totals[q.id] !== undefined && total < totals[q.id])
            throw new Error(`カード消滅検出: ${q.name} ${totals[q.id]}→${total} (直前の選択: ${opt.id})`);
          totals[q.id] = total;
        }
      }
      steps++;
      if (r.winner) break;
    }
  }
  if (!r.winner) throw new Error('60000手以内に決着せず');
  const w = r.players.find(p => p.id === r.winner);
  return { steps, round: r.round, winner: w ? w.name : r.winner, seen: [...seen].sort() };
}

let allSeen = new Set();
for (let g = 1; g <= 5; g++) {
  const res = runGame(g);
  res.seen.forEach(t => allSeen.add(t));
  console.log(`GAME${g}: 完走 ✓  ${res.steps}手 / ${res.round}周目 / 勝者=${res.winner}`);
}
console.log('発火したpending種別:', [...allSeen].sort().join(', '));
console.log('ALL GAMES PASSED');
