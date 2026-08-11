// BOT回帰テスト: 3人でフル1局を回し、winner確定までをassertする(在プロセス実行)
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
// listen部を除去(ポートを占有しない)
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const load = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { makeRoom, startSelect, handleChoose, publicState, startGame, rooms, CHARS };');
const G = load(require, __dirname, process, console, () => {}); // GCタイマーは無効化

function runGame(seed) {
  const r = G.makeRoom();
  const names = ['ボットA', 'ボットB', 'ボットC', 'ボットD'];
  const pids = names.map((n, i) => {
    const id = 'bot' + i;
    r.players.push({ id, name: n });
    return id;
  });
  G.startSelect(r);
  const chars = Object.entries(G.CHARS).filter(([, c]) => c.selectable !== false).map(([id]) => id);
  // ゲームごとに開始位置をずらし、6召喚士すべての初期デッキとBot経路を網羅する。
  pids.forEach((pid, i) => G.handleChoose(r, pid, chars[(i + seed - 1) % chars.length]));
  G.startGame(r); // テレビの「ゲーム開始」操作を再現

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
      if (pend.type === 'pick_creature' || pend.type === 'support') {
        const bp = view.battlePreview;
        if (!bp) throw new Error(`${pend.type}中にbattlePreviewが公開されていない`);
        if (pend.type === 'pick_creature' && (bp.phase !== 'pick_attacker' || bp.atkCreature !== null))
          throw new Error('侵略直後の攻撃側カード裏面状態が不正');
        if (pend.type === 'support' && (bp.phase !== 'support' || !bp.atkCreature))
          throw new Error('支援選択中の攻撃クリーチャー公開状態が不正');
        if ('supports' in bp || 'atkSupport' in bp || 'defSupport' in bp)
          throw new Error('支援選択内容がbattlePreviewへ漏洩している');
        if (typeof bp.supportReady.attacker !== 'boolean' || typeof bp.supportReady.defender !== 'boolean')
          throw new Error('支援選択完了フラグが真偽値でない');
      }
      if (!pend.options || pend.options.length === 0)
        throw new Error('本人視点でoptionsが空: type=' + pend.type);
      // 他人視点でドラフト/選択ドローが秘匿されているか
      if (pend.type === 'draft' || pend.type === 'pick_draw') {
        const other = pids.find(x => x !== pid);
        const spy = G.publicState(r, other).pending[pid];
        if (spy && spy.options.length !== 0) throw new Error(pend.type + 'の秘匿が破れている');
      }
      let opt = pend.options[Math.floor(Math.random() * pend.options.length)];
      // 紅蓮の方程式は再選択で解除できるため、ランダム往復によるライブロックを避ける。
      if (pend.type === 'ult_lia') {
        opt = pend.options.find(o => o.id === 'lu:confirm') ||
              pend.options.find(o => /^lu:\d+$/.test(o.id)) ||
              pend.options.find(o => o.id === 'lu:cancel') || opt;
      }
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
          // 旧セーブ互換: 移動元が先に空き地になる戦闘はクリーチャーを「戦闘中ゾーン」として数える
          const inBattle = r.battle && r.battle.corridor && r.battle.attacker === q.id ? 1 : 0;
          const total = (q.deck || []).length + (q.hand || []).length +
                        (q.discard || []).length + (q.exile || []).length + board + inBattle +
                        (q.pickCards || []).length;  // v0.61: 選択ドロー中の候補もカードとして数える
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
