// ui_test.js ─ スマホUI貫通テスト
// phone.htmlのスクリプトをDOMスタブ上で実際に実行し、サーバーと結合してゲームを進行。
// 検知対象:
//   A) 実HTMLに存在しないIDへの参照(null例外) … v0.54の $('actions') 型
//   B) pendingがあるのに操作可能なUIがない(進行不能) … v0.55のrollingデッドロック型
//   C) render中のあらゆる実行時例外
const fs = require('fs');

// ===== サーバー(in-process) =====
let ssrc = fs.readFileSync('server.js', 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const S = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  ssrc + ';return {makeRoom,startSelect,handleChoose,publicState,SPELLS,doRoll};')(
  require, __dirname, process, { log: () => {}, error: console.error }, () => 0);

// ===== ダイス固定スペル =====
for (let n = 1; n <= 6; n++) {
  const sid = 'sp_dice_' + n;
  const sp = S.SPELLS[sid];
  if (!sp || sp.name !== 'ダイス' + n || sp.fixedDice !== n)
    throw new Error(`ダイス固定スペル検査: ${sid} の定義が不正`);
  const r = S.makeRoom();
  r.phase = 'playing';
  const p = { id:'dice-test', name:'テスト', charId:'redani', pos:0, dir:1, gold:300,
    hand:[], deck:[], discard:[], exile:[], gems:0, treasures:0, battleWins:0,
    shrineVisits:0, lap:1, seal:false, fixedDice:n };
  r.players = [p]; r.turn = 0;
  S.doRoll(r, p);
  if (p.pos !== n || !r.lastDice || r.lastDice.value !== n || !r.lastDice.fixed || p.fixedDice !== null)
    throw new Error(`ダイス固定スペル検査: 出目${n}が移動へ正しく反映されない`);
}
console.log('ダイス固定スペル1〜6 ✓');

// ===== phone.html → DOMスタブ環境で実行 =====
const html = fs.readFileSync('public/phone.html', 'utf8');
const knownIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
// v0.66: 共有タイミング定数(外部スクリプト)をインラインscriptの前に連結して実行する
const timingSrc = fs.readFileSync('public/game_timing.js', 'utf8');
const scripts = timingSrc + '\n' +
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

// ===== レイアウト不変条件 =====
// 通常画面はHUD(header)+手札の2段フロー。判断ボタンだけ固定オーバーレイへ逃がす。
{
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
  const ruleOf = sel => {
    const m = css.match(new RegExp('(?:^|[\\s}])' + sel.replace(/#/g, '\\#') + '\\s*\\{([^}]*)\\}'));
    return m ? m[1] : null;
  };
  const bodyRule = ruleOf('body');
  if (!bodyRule || !/flex-direction:\s*column/.test(bodyRule))
    throw new Error('レイアウト検査: bodyがflex縦積みでない(帯の重なり防止が壊れている)');
  for (const sel of ['header', '#handWrap']) {
    const rule = ruleOf(sel);
    if (rule === null) throw new Error(`レイアウト検査: ${sel} のCSSルールが見つからない`);
    if (/position:\s*fixed/.test(rule))
      throw new Error(`レイアウト検査: ${sel} がposition:fixed ─ フロー配置に戻すこと(HUDと重なる)`);
  }
  if (!/#midRow\s*\{[^}]*display:\s*none\s*!important/.test(css))
    throw new Error('レイアウト検査: 旧メッセージ/アクション帯が通常フローに残っている');
  if (!/<div id="diceDock"><\/div>[\s\S]{0,400}?<div id="topTools">/.test(html))
    throw new Error('レイアウト検査: HUD中央のダイス領域または右側ツール群がない');
  if (!/p\.type \+ '\|' \+ p\.prompt \+ '\|' \+ p\.options\.map\(o => o\.id\)/.test(html))
    throw new Error('操作ロック検査: pendingキーに選択肢が含まれていない(即時スペル後にボタンが固まる)');
  if (!/function browseActionHand\(\)/.test(html) ||
      !/btn\.style\.display\s*=\s*'inline-flex'/.test(html) ||
      !/btn\.textContent\s*=\s*'選択肢に戻る'/.test(html))
    throw new Error('敵領地手札確認検査: 手札から選択肢へ戻る導線が表示されない');
  if (!/-webkit-line-clamp:\s*3/.test(css) || !/-webkit-line-clamp:\s*5/.test(css) ||
      !/#cardZoomCard \.ccEffect p/.test(css))
    throw new Error('カード本文検査: 通常表示の省略または拡大時の全文表示がない');
  if (!/grid-template-columns:repeat\(4,minmax\(0,1fr\)\) clamp\(48px,8vw,84px\)/.test(css) ||
      !/class="csUpcoming" aria-disabled="true"/.test(html))
    throw new Error('召喚士選択検査: 4人カード+準備中アーデル枠の固定レイアウトがない');
  const boardHtml = fs.readFileSync('public/board.html', 'utf8');
  const boardWorldSrc = fs.readFileSync('public/board_world.js', 'utf8');
  if (!/--font-mincho:/.test(html) || !/--font-mincho:/.test(boardHtml) ||
      !/body \*,button,input,select,textarea\s*\{\s*font-family:var\(--font-mincho\)!important/.test(html) ||
      !/body \*,button,input,select,textarea\s*\{\s*font-family:var\(--font-mincho\)!important/.test(boardHtml) ||
      !/Yu Mincho/.test(boardWorldSrc) || /fonts\.googleapis\.com/.test(html + boardHtml))
    throw new Error('フォント検査: テレビ・スマホ・Phaserが明朝体へ統一されていない');
  if (!/summonerSelect/.test(boardHtml) || !/class="scLocked">準備中/.test(boardHtml) ||
      !/selectable === false/.test(boardHtml))
    throw new Error('テレビ召喚士選択検査: 5本パネルまたは準備中表示がない');
  if (!/bgm_select\.mp3/.test(boardHtml) || !/summonerOrbit/.test(boardHtml) ||
      !/function playGameEntryTransition\(\)/.test(boardHtml) ||
      !/class="entryRing"/.test(boardHtml) || !/zoomTile = 0; applyZoom\(\)/.test(boardHtml))
    throw new Error('ゲーム開始演出検査: 選択BGM・回転リング・円形ワイプ・城ズームが不足');
  if (/\.selCard\.chosen\s*\{[^}]*flex-grow/.test(boardHtml) ||
      /\.selCard[^\n]*\.chosen\s*\{[^}]*scale\(/.test(boardHtml))
    throw new Error('召喚士選択検査: 選択済みパネルが拡大されている');
  if ((boardHtml.match(/class="titleCardSlot"/g) || []).length !== 8 ||
      !/@keyframes titleCardFloat/.test(boardHtml) || !/@keyframes titleShadow/.test(boardHtml) ||
      !/id="titleSettings"/.test(boardHtml) || !/id="titleSoundToggle"/.test(boardHtml))
    throw new Error('タイトル画面検査: 実カード8枚・浮遊影・タロット風メニューが不足');
  console.log('レイアウト不変条件 ✓ (HUD/ダイス/ツール+大型手札の2段配置)');
}

let qEls, qsaCalls;
function makeEl(id) {
  const cls = new Set();
  const el = {
    id, innerHTML: '', textContent: '', src: '', value: '', style: { setProperty: () => {}, },
    dataset: {}, offsetWidth: 0, onclick: null,
    classList: {
      add: (...a) => a.forEach(x => cls.add(x)), remove: (...a) => a.forEach(x => cls.delete(x)),
      toggle: (x, f) => { (f === undefined ? !cls.has(x) : f) ? cls.add(x) : cls.delete(x); },
      contains: x => cls.has(x),
    },
    _cls: cls,
    appendChild: () => {}, remove: () => {}, focus: () => {}, addEventListener: () => {},
    querySelector: sel => (qEls[id + '|' + sel] || (qEls[id + '|' + sel] = makeEl(sel))),
    querySelectorAll: sel => { qsaCalls.add(sel); return []; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  };
  Object.defineProperty(el.style, 'display', { value: '', writable: true });
  return el;
}
const els = {};
const timers = []; let timerId = 1;
function flushTimers(maxMs = 5000) {
  const due = timers.splice(0).filter(t => t.ms <= maxMs);
  for (const t of due) { try { t.fn(); } catch (e) { throw new Error('timer内例外: ' + e.message); } }
}
qEls = {};
qsaCalls = new Set();  // このフレームでバインドを試みたセレクタ
const doc = {
  getElementById: id => knownIds.has(id) ? (els[id] || (els[id] = makeEl(id))) : null,
  // classセレクタ等は実HTMLに存在する前提の汎用スタブ(ID参照の欠落検知はgetElementByIdで担保)
  querySelectorAll: sel => { qsaCalls.add(sel); return []; },
  querySelector: sel => (qEls[sel] || (qEls[sel] = makeEl(sel))),
  createElement: () => makeEl('_dyn'), body: { appendChild: () => {} },
  addEventListener: () => {}, hidden: false,
};
const win = {
  addEventListener: () => {}, location: { search: '', href: '', reload: () => {} },
  innerWidth: 800, innerHeight: 380, matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};
const noop = () => {};
class FakeES { constructor() {} addEventListener() {} close() {} set onmessage(_) {} set onerror(_) {} }
class FakeAudio { constructor() { this.volume = 1; } play() { return { catch: noop }; } pause() {} addEventListener() {} load() {} }
const store = { getItem: () => null, setItem: noop, removeItem: noop };

const sandboxSrc = scripts + `
;return {
  render, pend, cardOption,
  setState: s => { state = s; }, setPid: x => { pid = x; }, setRoom: x => { room = x; },
  getLastDiceAt: () => lastDiceAt, getSettleT: () => settleT,
  getRolling: () => rolling, setRolling: v => { rolling = v; },
  setContextActions, browseActionHand,
};`;
let skew = 0;
const FakeDate = new Proxy(Date, {
  get: (t, k) => k === 'now' ? (() => Date.now() + skew) : t[k],
  construct: (t, args) => args.length ? new t(...args) : new t(Date.now() + skew),
});
let P;
try {
  P = new Function('window', 'document', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'EventSource', 'Audio', 'fetch', 'localStorage', 'sessionStorage', 'location', 'navigator', 'history', 'screen', 'console', 'Date',
    sandboxSrc)(
    win, doc,
    (fn, ms) => { timers.push({ fn, ms: ms || 0, id: timerId }); return timerId++; },
    () => timerId++, id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); }, noop,
    FakeES, FakeAudio, () => Promise.resolve({ json: () => Promise.resolve({}) }),
    store, store, { search: '', href: '' }, { userAgent: 'test', clipboard: {} }, { replaceState: noop }, { orientation: {} },
    { log: noop, warn: noop, error: (...a) => { throw new Error('console.error: ' + a.join(' ')); } }, FakeDate);
} catch (e) {
  console.error('スクリプト初期化で例外(スタブ不足の可能性):', e.message);
  process.exit(1);
}
// 敵領地の選択肢から手札へ移動しても、上部ボタンで必ず選択肢へ戻れる。
P.setContextActions('敵領地', [
  { id:'toll', label:'通行料を払う' }, { id:'invade', label:'侵略する' }
]);
if (els.contextBtn.style.display !== 'inline-flex')
  throw new Error('敵領地手札確認検査: 選択肢を開く上部ボタンが非表示');
P.browseActionHand();
if (els.contextBtn.style.display !== 'inline-flex' || els.contextBtn.textContent !== '選択肢に戻る')
  throw new Error('敵領地手札確認検査: 手札確認後の戻るボタンが表示されない');
// ===== 操作可能性の判定 =====
function clearDom() {
  for (const el of Object.values(els)) {
    el.innerHTML = ''; el.textContent = ''; el.onclick = null;
    for (const k of Object.keys(el.dataset)) delete el.dataset[k];  // 再描画キャッシュも毎フレーム破棄
  }
  qsaCalls.clear();
}
function affordance(pid2, st) {
  // 1) インラインonclick(choose等)がどこかに描画されたか
  for (const [id, el] of Object.entries(els)) {
    if (/choose\(|submitAction\(|mmTap\(|pickOvChoose\(|showUltConfirm\(/.test(el.innerHTML || '')) return 'inline:' + id;
  }
  // 2) querySelectorAllで後付けバインドを試み、かつ対象classが実際に描画されているか
  for (const sel of qsaCalls) {
    const cls = (sel.match(/\.([\w-]+)/) || [])[1];
    if (!cls) continue;
    for (const el of Object.values(els))
      if ((el.innerHTML || '').includes(cls)) return 'bind:' + sel;
  }
  // 3) onclickプロパティの直接束縛(ダイス等)
  for (const [id, el] of Object.entries(els))
    if (typeof el.onclick === 'function') return 'onclick:' + id;
  // 4) 手札タップで選択肢に到達できるか
  const m = st.players.find(q => q.id === pid2);
  if (m && (m.hand || []).some(c => P.cardOption(c))) return 'card-tap';
  return null;
}

// ===== 結合シミュレーション =====
function runGame(g) {
  const r = S.makeRoom();
  ['甲', '乙', '丙', '丁'].forEach((n, i) => r.players.push({ id: 'p' + i, name: n }));
  S.startSelect(r);
  let steps = 0;
  const dbgTypes = [];
  while (r.phase !== 'ended' && steps < 30000) {
    const ids = Object.keys(r.pending).filter(k => r.pending[k]);
    if (!ids.length) break;
    for (const pid2 of ids) {
      const pend = r.pending[pid2];
      if (!pend) continue;
      // --- スマホ側で描画して操作可能性を検証 ---
      const st = S.publicState(r, pid2);
      P.setPid(pid2); P.setRoom('TEST'); P.setState(st);
      // 到着演出などの時間待ちは「時計を進めて再描画」で実機同様に解ける。最大3パス試す
      let a = null;
      for (let pass = 0; pass < 3 && !a; pass++) {
        skew += 9000;
        clearDom();
        try { P.render(); } catch (e) {
          throw new Error(`GAME${g} step${steps}: render例外 [pending=${pend.type}] ${e.message}`);
        }
        flushTimers();
        try { P.render(); } catch (e) {
          throw new Error(`GAME${g} step${steps}: タイマー後render例外 [pending=${pend.type}] ${e.message}`);
        }
        a = affordance(pid2, st);
      }
      if (r.phase === 'playing' || r.phase === 'select') {
        if (!a) throw new Error(
          `GAME${g} step${steps}: 進行不能を検知! pending=${pend.type} なのに操作可能なUIが存在しない` +
          ` (rolling=${P.getRolling()}, phonePend=${JSON.stringify(P.pend() && P.pend().type)},` +
          ` msg="${((els['msg'] || {}).textContent || (els['msg'] || {}).innerHTML || '').slice(0, 40)}",` +
          ` deckOvOn=${(els['deckOv'] || { _cls: new Set() })._cls.has('on')},` +
          ` deckScroll=${((els['deckScroll'] || {}).innerHTML || '').length}字,` +
          ` shopOn=${(els['shopScene'] || { _cls: new Set() })._cls.has('on')},` +
          ` shopItems="${((els['shopItems'] || {}).innerHTML || '').slice(0, 60)}",` +
          ` action="${(els['action'] || {}).innerHTML?.slice(0, 60)}")`);
      }
      // --- 進行(サーバー直叩き。rollはスマホと同じくrollingを立てて挙動を再現) ---
      if (dbgTypes.length >= 400) dbgTypes.shift();
      dbgTypes.push(pend.type);
      let opt = pend.options[Math.floor(Math.random() * pend.options.length)];
      // 「キャラを選び直す」は稀にだけ選ぶ(ランダムBOTのライブロック回避。実プレイヤーは任意)
      if (opt.id === 'unpick' && Math.random() < 0.9) {
        const alt = pend.options.filter(o => o.id !== 'unpick');
        if (alt.length) opt = alt[Math.floor(Math.random() * alt.length)];
        else continue;  // 選択肢がunpickのみ=確定済みの待機。9割は何もしない
      }
      const atBefore = (r.lastDice || {}).at, dirBefore = (r.players.find(q => q.id === pid2) || {}).dir;
      if (opt.id === 'roll') P.setRolling(true);
      S.handleChoose(r, pid2, opt.id);
      if (opt.id === 'roll' && P.getRolling()) {
        const ld = r.lastDice || {};
        if (ld.at === P.getLastDiceAt())
          console.error('[at-trace] roll直後: at=' + ld.at + ' は消費済み! atBefore=' + atBefore +
            ' 同一=' + (ld.at === atBefore) + ' dirBefore=' + dirBefore + ' noMove=' + ld.noMove);
      }
      // rollingはlastDice到着→settle→タイマーで解除される流れをrender+flushで再現
      if (P.getRolling()) {
        P.setState(S.publicState(r, pid2));
        const tA = timers.length;
        try { P.render(); const tB = timers.length; flushTimers(); P.render();
          if (P.getRolling() && r.pending[pid2])
            console.error('[trace] timers前=' + tA + ' 後=' + tB + ' 消化後rolling=' + P.getRolling() +
              ' consumed=' + (P.getLastDiceAt() === (r.lastDice || {}).at) + ' settleT遅延=' + (P.getSettleT() - Date.now()));
        } catch (e) {
          throw new Error(`GAME${g} step${steps}: ダイス解決で例外 ${e.message}`);
        }
        if (P.getRolling()) {
          // まだ解除されない=デッドロック候補。pendingが残っているなら失敗
          const still = r.pending[pid2];
          if (still) throw new Error(
            `GAME${g} step${steps}: rollingデッドロック検知! pending=${still.type} のままrollingが解除されない ` +
            `lastDice=${JSON.stringify(r.lastDice && { p: r.lastDice.player, at: r.lastDice.at, v: r.lastDice.value, noMove: r.lastDice.noMove })} ` +
            `consumedAt=${P.getLastDiceAt()} settleT=${P.getSettleT()} now=${Date.now() + 0} roller=${pid2}`);
          P.setRolling(false);
        }
      }
      steps++;
    }
  }
  if (r.phase !== 'ended') {
    const hist = {};
    for (const t of dbgTypes) hist[t] = (hist[t] || 0) + 1;
    throw new Error(`GAME${g}: ${steps}手で未決着(サーバー側停滞) round=${r.round} 直近pending内訳=` +
      JSON.stringify(Object.fromEntries(Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6))));
  }
  console.log(`GAME${g}: UI貫通 ✓ ${steps}手 / 勝者=${r.players.find(q => q.id === r.winner).name}`);
}

for (let g = 1; g <= 3; g++) runGame(g);
console.log('UI WALKTHROUGH PASSED ─ 全pendingで操作可能UIを確認');
