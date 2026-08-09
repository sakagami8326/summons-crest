// save_test.js ─ v0.62 セーブ/再開の回帰テスト(docs/plan_save_v0.62.md §7準拠)
// Part A: in-processでの直列化・検証・復元・分類表・途中復元フルゲーム
// Part B: 実サーバー(子プロセス)でのAPI認可・名前復帰
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { makeRoom, startSelect, handleChoose, publicState, startGame, rooms, CHARS,' +
  ' serializeRoom, restoreRoom, validateSave,' +
  ' ROOM_PERSIST_KEYS, ROOM_RUNTIME_KEYS, SAVE_VER };')(
  require, __dirname, process, console, () => {});

let pass = 0;
function ok(cond, name) {
  if (!cond) throw new Error('FAIL: ' + name);
  pass++;
}
const clone = o => JSON.parse(JSON.stringify(o));
// 復元で変わってよい部分(log追記・pick_drawのuntil張り直し)を除いて正規化
function normalizeForDiff(saveObj) {
  const d = clone(saveObj.room);
  delete d.log;
  for (const v of Object.values(d.pending || {})) if (v && v.type === 'pick_draw') delete v.until;
  return d;
}
function setupGame() {
  const r = G.makeRoom();
  ['ボットA', 'ボットB', 'ボットC', 'ボットD'].forEach((n, i) => r.players.push({ id: 'bot' + i, name: n }));
  G.startSelect(r);
  const chars = Object.entries(G.CHARS).filter(([, c]) => c.selectable !== false).map(([id]) => id);
  r.players.forEach((p, i) => G.handleChoose(r, p.id, chars[i % chars.length]));
  G.startGame(r); // テレビの「ゲーム開始」操作を再現
  return r;
}

// ===== A-0: アーデルが正式公開され、選択候補へ入る =====
{
  const r = G.makeRoom();
  const p = { id: 'preview-test', name: '予告確認' };
  r.players.push(p);
  G.startSelect(r);
  ok(G.CHARS.adel && !G.CHARS.adel.upcoming && G.CHARS.adel.selectable !== false,
    'A-0: アーデルが正式な選択可能召喚士として公開される');
  ok(r.pending[p.id].options.some(o => o.id === 'adel'), 'A-0: アーデルが選択候補へ入る');
  G.handleChoose(r, p.id, 'adel');
  ok(p.charId === 'adel' && p.confirmed, 'A-0: アーデルを選択して確定できる');
  G.rooms.delete(r.code);
}

// ===== A-1: フィールド分類表(未分類キーの検出)+ 途中復元しながらフルゲーム完走 =====
{
  let r = setupGame();
  const totals = {};
  let steps = 0, restores = 0;
  while (!r.winner && steps < 60000) {
    // 分類表: ルームに現れた全キーがどちらかに分類されていること
    for (const k of Object.keys(r))
      if (!G.ROOM_PERSIST_KEYS.has(k) && !G.ROOM_RUNTIME_KEYS.has(k))
        throw new Error(`未分類のルームフィールド: ${k} ─ server.jsの分類表(ROOM_PERSIST/RUNTIME_KEYS)に追加すること`);
    // 40手ごとに「セーブ→復元」して同じゲームを続行(あらゆるpending状態での往復を網羅)
    if (steps > 0 && steps % 40 === 0) {
      const sv = G.serializeRoom(r);
      const before = normalizeForDiff(sv);
      const out = G.restoreRoom(clone(sv));  // 同一コード+同一トークン → 差し替え復元
      if (out.error) throw new Error('復元失敗: ' + out.error + ' (step' + steps + ')');
      r = out.room;
      const after = normalizeForDiff(G.serializeRoom(r));
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error('往復で状態が変化した (step' + steps + ')');
      restores++;
    }
    const keys = Object.keys(r.pending);
    if (!keys.length) throw new Error('スタック: pendingなし');
    for (const pid of keys) {
      const pend = r.pending[pid];
      if (!pend) continue;
      let opt = pend.options[Math.floor(Math.random() * pend.options.length)];
      if (pend.type === 'ult_lia') {
        opt = pend.options.find(o => o.id === 'lu:confirm') ||
              pend.options.find(o => /^lu:\d+$/.test(o.id)) ||
              pend.options.find(o => o.id === 'lu:cancel') || opt;
      }
      if (opt.id === 'unpick') continue;
      G.handleChoose(r, pid, opt.id);
      // カード保存則(復元をまたいで維持されること)
      if (r.phase === 'playing') {
        for (const q of r.players) {
          const board = r.owners.filter(o => o && o.player === q.id).length;
          const inBattle = r.battle && r.battle.corridor && r.battle.attacker === q.id ? 1 : 0;
          const total = (q.deck || []).length + (q.hand || []).length + (q.discard || []).length +
                        (q.exile || []).length + board + inBattle + (q.pickCards || []).length;
          if (totals[q.id] !== undefined && total < totals[q.id])
            throw new Error(`復元後にカード消滅: ${q.name} ${totals[q.id]}→${total}`);
          totals[q.id] = total;
        }
      }
      steps++;
      if (r.winner) break;
    }
  }
  ok(!!r.winner, `A-1: 途中復元${restores}回を挟んでフルゲーム完走(${steps}手)・分類表・往復一致・保存則`);
  G.rooms.delete(r.code);
}

// ===== A-2: pick_draw中の復元 ─ 候補保持・解決は一度だけ(v0.63: 制限時間なし) =====
{
  const r = setupGame();
  const p = r.players[r.turn];
  ok(r.pending[p.id] && r.pending[p.id].type === 'pick_draw', 'A-2前提: pick_draw中');
  const sv = G.serializeRoom(r);
  G.rooms.delete(r.code);
  const out = G.restoreRoom(clone(sv));
  ok(!out.error, 'A-2: pick_draw中のセーブを復元できる');
  const r2 = out.room;
  const p2 = r2.players.find(q => q.id === p.id);
  ok(r2.pending[p2.id].type === 'pick_draw' && p2.pickCards.length === 2, 'A-2: 候補2枚が保持されている');
  ok(r2.pending[p2.id].until === undefined, 'A-2: 制限時間なし(v0.63)');
  const h = p2.hand.length;
  G.handleChoose(r2, p2.id, 'pd:0');   // 通常の選択で解決
  ok(p2.hand.length === h + 1, 'A-2: 復元後に選択できる(手札+1)');
  G.handleChoose(r2, p2.id, 'pd:1');   // 二重送信は無視される
  ok(p2.hand.length === h + 1, 'A-2: 解決は一度だけ');
  G.rooms.delete(r2.code);
}

// ===== A-3: 検証 ─ 不正なセーブを拒否し、既存ルームを変更しない =====
{
  const r = setupGame();
  const good = G.serializeRoom(r);
  const beforeState = JSON.stringify(normalizeForDiff(G.serializeRoom(r)));
  const cases = [
    ['未知の未来版saveVer', s => { s.saveVer = 999; }, /新しすぎて/],
    ['旧saveVer', s => { s.saveVer = 0; }, /対応していません/],
    ['roomなし', s => { delete s.room; }, /壊れて/],
    ['不正コード', s => { s.room.code = 'ab'; }, /コード/],
    ['トークンなし', s => { delete s.room.boardToken; }, /トークン/],
    ['未知カードID', s => { s.room.players[0].hand = ['hacked_card']; }, /不明なカード/],
    ['未知キャラクターID', s => { s.room.players[0].charId = 'future_summoner'; }, /キャラクターID/],
    ['重複プレイヤーID', s => { s.room.players[1].id = s.room.players[0].id; }, /プレイヤーID/],
    ['盤面長不正', s => { s.room.owners = []; }, /盤面/],
    ['位置範囲外', s => { s.room.players[0].pos = 99; }, /位置/],
    ['ゾーン肥大', s => { s.room.players[0].deck = Array(400).fill('gecko'); }, /カード置き場/],
    ['pending対象不正', s => { s.room.pending = { zzz: { type: 'roll', options: [] } }; }, /pending/],
    ['数値不正', s => { s.room.players[0].gold = 'much'; }, /数値/],
  ];
  for (const [name, tamper, re] of cases) {
    const bad = clone(good);
    tamper(bad);
    const out = G.restoreRoom(bad);
    ok(out.error && re.test(out.error), `A-3: ${name} を拒否(${out.error ? out.error.slice(0, 22) : 'エラーなし!'})`);
  }
  ok(JSON.stringify(normalizeForDiff(G.serializeRoom(r))) === beforeState, 'A-3: 拒否時に既存ルームが無変更');
  G.rooms.delete(r.code);
}

// ===== A-4: コード衝突 ─ トークン不一致なら拒否、一致なら差し替え =====
{
  const r = setupGame();
  const sv = G.serializeRoom(r);
  const alien = clone(sv);
  alien.room.boardToken = 'x'.repeat(32);  // 他人のトークン
  const out1 = G.restoreRoom(alien);
  ok(out1.error && out1.status === 409, 'A-4: トークン不一致の同名コード復元を拒否(409)');
  ok(G.rooms.get(r.code) === r, 'A-4: 拒否時に既存ルームが残っている');
  const out2 = G.restoreRoom(clone(sv));
  ok(!out2.error && G.rooms.get(r.code) === out2.room, 'A-4: トークン一致なら自ルームを差し替え');
  G.rooms.delete(r.code);
}

// ===== A-5: 秘匿 ─ publicStateにboardTokenが漏れない =====
{
  const r = setupGame();
  const st = JSON.stringify(G.publicState(r, r.players[0].id));
  ok(!st.includes(r.boardToken), 'A-5: publicStateにboardTokenが含まれない');
  G.rooms.delete(r.code);
}

console.log(`Part A (in-process): ${pass} checks passed`);

// ===== Part B: 実サーバーでのAPI認可・名前復帰 =====
(async () => {
  const PORT = 3789;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const kill = () => { try { child.kill(); } catch (e) {} };
  process.on('exit', kill);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('サーバー起動タイムアウト')), 8000);
    child.stdout.on('data', d => { if (String(d).includes('起動')) { clearTimeout(t); resolve(); } });
    child.stderr.on('data', d => console.error(String(d)));
  });
  const api = (p2, opts) => fetch(`http://localhost:${PORT}${p2}`, opts).then(async r2 => ({ status: r2.status, body: await r2.json().catch(() => ({})) }));
  try {
    // ルーム作成・参加
    const c = await api('/api/create', { method: 'POST' });
    ok(c.body.boardToken && c.body.boardToken.length >= 32, 'B-1: createがboardTokenを返す');
    const codeB = c.body.code;
    const j1 = await api('/api/join', { method: 'POST', body: JSON.stringify({ room: codeB, name: '甲' }) });
    ok(j1.body.playerId, 'B-1: 参加できる');
    const jdup = await api('/api/join', { method: 'POST', body: JSON.stringify({ room: codeB, name: ' 甲 ' }) });
    ok(jdup.status === 400 && /同じ名前/.test(jdup.body.error), 'B-1: 同名参加(空白付き)を拒否');
    const j2 = await api('/api/join', { method: 'POST', body: JSON.stringify({ room: codeB, name: '乙' }) });
    ok(j2.body.playerId, 'B-1: 2人目参加');
    // 保存の認可
    const s1 = await api(`/api/save?room=${codeB}`);
    ok(s1.status === 403, 'B-2: トークンなしの保存を拒否(403)');
    const s2 = await api(`/api/save?room=${codeB}&token=wrongwrongwrongwrong`);
    ok(s2.status === 403, 'B-2: 誤トークンの保存を拒否(403)');
    const s3 = await api(`/api/save?room=${codeB}&token=${c.body.boardToken}`);
    ok(s3.status === 200 && s3.body.room && s3.body.saveVer === G.SAVE_VER, 'B-2: 正トークンで保存できる');
    // ゲーム開始 → 名前復帰
    await api('/api/action', { method: 'POST', body: JSON.stringify({ room: codeB, type: 'start_select' }) });
    const jmid = await api('/api/join', { method: 'POST', body: JSON.stringify({ room: codeB, name: '丙' }) });
    ok(jmid.status === 400, 'B-3: 進行中ルームへの新規参加を拒否');
    const jre = await api('/api/join', { method: 'POST', body: JSON.stringify({ room: codeB, name: '甲' }) });
    ok(jre.body.playerId === j1.body.playerId && jre.body.resumed, 'B-3: 同名(切断中)で復帰できる・IDが同一');
    // クローズの認可
    const cl1 = await api('/api/close', { method: 'POST', body: JSON.stringify({ room: codeB }) });
    ok(cl1.status === 403, 'B-4: トークンなしのクローズを拒否');
    const cl2 = await api('/api/close', { method: 'POST', body: JSON.stringify({ room: codeB, token: c.body.boardToken }) });
    ok(cl2.status === 200, 'B-4: 正トークンでクローズできる');
    // ルーム消滅後の復元(通常の再開経路)
    const rs1 = await api('/api/restore', { method: 'POST', body: JSON.stringify(s3.body) });
    ok(rs1.status === 200 && rs1.body.code === codeB && rs1.body.boardToken === c.body.boardToken,
      'B-5: セーブから同一コード・同一トークンで復元できる');
    const rs2 = await api('/api/restore', { method: 'POST', body: JSON.stringify({ saveVer: 999, room: {} }) });
    ok(rs2.status === 400, 'B-5: 不正セーブの復元を拒否');
    // 復元したルームにスマホが自動復帰できる(既存の/api/resume)
    const rz = await api('/api/resume', { method: 'POST', body: JSON.stringify({ room: codeB, playerId: j1.body.playerId }) });
    ok(rz.status === 200 && rz.body.ok, 'B-5: 復元後にスマホの自動復帰(resume)が通る');
    await api('/api/close', { method: 'POST', body: JSON.stringify({ room: codeB, token: c.body.boardToken }) });
    console.log(`Part B (HTTP): passed`);
    console.log(`SAVE/RESTORE ALL ${pass} CHECKS PASSED`);
  } finally { kill(); }
})().catch(e => { console.error(e.message); process.exit(1); });
