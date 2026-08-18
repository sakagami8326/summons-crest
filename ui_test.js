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
  ssrc + ';return {makeRoom,startSelect,handleChoose,resolveUltSequence,publicState,isSelectionReady,startGame,SPELLS,doRoll,CHARS,CHAR_DECKS,ULTS};')(
  require, __dirname, process, { log: () => {}, error: console.error }, () => 0);

// ===== リーア仮実装 =====
if (!S.CHARS.lia || S.CHARS.lia.elem !== 'fire' || S.CHARS.lia.selectable === false ||
    !Array.isArray(S.CHAR_DECKS.lia) || S.CHAR_DECKS.lia.length !== 12 || !S.ULTS.lia)
  throw new Error('リーア仮実装検査: 火属性・選択可・12枚デッキ・固有スキルの定義が不足');
for (const asset of ['full_lia.png', 'p_lia.png', 'f_lia.png', 'summoner-still-lia.webp'])
  if (!fs.existsSync('public/assets/' + asset)) throw new Error(`リーア仮実装検査: ${asset} がない`);
console.log('リーア仮実装 ✓');

// ===== ヴィラ正式実装 =====
if (!S.CHARS.villa || S.CHARS.villa.elem !== 'wind' || S.CHARS.villa.selectable === false ||
    S.CHARS.villa.upcoming || !Array.isArray(S.CHAR_DECKS.villa) || S.CHAR_DECKS.villa.length !== 12 ||
    !S.ULTS.villa || S.ULTS.villa.name !== '墓守の協奏曲')
  throw new Error('ヴィラ正式実装検査: 風属性・選択可能・12枚デッキ・必殺技の定義が不正');
for (const asset of ['full_villa.png', 'p_villa.png', 'f_villa.png', 'summoner-still-villa.webp', 'ult_villa.webp'])
  if (!fs.existsSync('public/assets/' + asset)) throw new Error(`ヴィラ仮実装検査: ${asset} がない`);
console.log('ヴィラ正式実装 ✓');

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

// ===== 召喚士確定後のテレビ開始待機 =====
{
  const r = S.makeRoom();
  r.players = [{ id:'p1', name:'甲' }, { id:'p2', name:'乙' }];
  S.startSelect(r);
  S.handleChoose(r, 'p1', 'redani');
  S.handleChoose(r, 'p2', 'linnei');
  const pub = S.publicState(r, null);
  if (r.phase !== 'select' || !S.isSelectionReady(r) || !pub.selectionReady)
    throw new Error('召喚士開始待機検査: 全員確定後にselect維持/selectionReady算出ができない');
  if (!r.pending.p1 || !r.pending.p1.options.some(o => o.id === 'unpick') ||
      !r.pending.p2 || !r.pending.p2.options.some(o => o.id === 'unpick'))
    throw new Error('召喚士開始待機検査: テレビ開始前の選び直しができない');
}
console.log('召喚士のテレビ開始待機 ✓');

// ===== phone.html → DOMスタブ環境で実行 =====
const html = fs.readFileSync('public/phone.html', 'utf8');
if (!fs.existsSync('public/assets/cards/support-disarm-v1.webp') ||
    !/jinx:\s*'\/assets\/cards\/support-disarm-v1\.webp'/.test(html))
  throw new Error('ディスアームアート検査: スマホカード用の専用アートが未接続');
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
  if (!/grid-template-columns:repeat\(4,minmax\(0,1fr\)\);\s*grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/.test(css) ||
      /土属性召喚士・準備中/.test(html))
    throw new Error('召喚士選択検査: 8人用の4×2レイアウトまたはネラシオ正式解禁表示が不正');
  const boardHtml = fs.readFileSync('public/board.html', 'utf8');
  if (!/jinx:'support-disarm-v1\.webp'/.test(boardHtml))
    throw new Error('ディスアームアート検査: 戦闘支援公開へ専用アートが未接続');
  const boardWorldSrc = fs.readFileSync('public/board_world.js', 'utf8');
  if (!/--font-mincho:/.test(html) || !/--font-mincho:/.test(boardHtml) ||
      !/body \*,button,input,select,textarea\s*\{\s*font-family:var\(--font-mincho\)!important/.test(html) ||
      !/body \*,button,input,select,textarea\s*\{\s*font-family:var\(--font-mincho\)!important/.test(boardHtml) ||
      !/Yu Mincho/.test(boardWorldSrc) || /fonts\.googleapis\.com/.test(html + boardHtml))
    throw new Error('フォント検査: テレビ・スマホ・Phaserが明朝体へ統一されていない');
  if (!/summonerSelect/.test(boardHtml) || !/Array\.from\(\{ length:4 \}/.test(boardHtml) ||
      !/data-player-slot/.test(boardHtml) || !/scPortrait/.test(boardHtml) || !/scPawnWrap/.test(boardHtml))
    throw new Error('テレビ召喚士選択検査: 参加者4枠・イメージアート・コマの表示がない');
  if (!/summoner-still-\$\{cid\}\.webp/.test(boardHtml) || !/assets\/p_\$\{cid\}\.png/.test(boardHtml) ||
      !/revealedSummoners/.test(boardHtml))
    throw new Error('テレビ召喚士選択検査: 選択確定時のイメージアートまたはコマがない');
  if (!/bgm_select\.mp3/.test(boardHtml) || !/summonerOrbit/.test(boardHtml) ||
      !/function playGameEntryTransition\(\)/.test(boardHtml) ||
      !/class="entryRing"/.test(boardHtml) || !/zoomTile = 0; applyZoom\(\)/.test(boardHtml))
    throw new Error('ゲーム開始演出検査: 選択BGM・回転リング・円形ワイプ・城ズームが不足');
  if (/id="audioGate"/.test(boardHtml) || /function unlockTitleAudio\(\)/.test(boardHtml) ||
      !/function startTitleBgm\(\)/.test(boardHtml) ||
      !/startTitleBgm\(\);/.test(boardHtml) ||
      !/pointerdown.*resumeTitleBgmFromGesture/.test(boardHtml) ||
      !/crossfadeBgmTo\('normal', 1150\)/.test(boardHtml))
    throw new Error('タイトルBGM検査: ゲートなしのタイトル再生または開始時クロスフェードが不正');
  if (!/id="selectionStartBtn"/.test(boardHtml) ||
      !/type:'start_game', token:boardToken/.test(boardHtml) ||
      !/state\.selectionReady/.test(boardHtml))
    throw new Error('テレビゲーム開始検査: readiness連動の管理者開始ボタンがない');
  if (!/\.scPortrait\s*\{[^}]*bottom:1\.1%/.test(boardHtml) ||
      !/img\.scStill\s*\{[^}]*object-fit:cover/.test(boardHtml))
    throw new Error('召喚士選択検査: 縦長イメージのcover表示がない');
  if (/\.selCard\.chosen\s*\{[^}]*flex-grow/.test(boardHtml) ||
      /\.selCard[^\n]*\.chosen\s*\{[^}]*scale\(/.test(boardHtml))
    throw new Error('召喚士選択検査: 選択済みパネルが拡大されている');
  if ((boardHtml.match(/class="titleCardSlot"/g) || []).length !== 8 ||
      !/@keyframes titleCardFloat/.test(boardHtml) || !/@keyframes titleShadow/.test(boardHtml) ||
      !/id="titleSettings"/.test(boardHtml) || !/id="titleSoundToggle"/.test(boardHtml))
    throw new Error('タイトル画面検査: 実カード8枚・浮遊影・タロット風メニューが不足');
  if (/class="titleCardName"|class="titleCardElem"/.test(boardHtml) ||
      !/nth-child\(2\)[^}]*width:clamp\(92px,8\.7vw,160px\)/.test(boardHtml) ||
      !/nth-child\(5\)[^}]*width:clamp\(138px,13\.5vw,248px\)/.test(boardHtml))
    throw new Error('タイトル画面検査: カード文字が残っているか、奥行き用のサイズ差がない');
  if (!/#titleOv \.saveSmall\s*\{[^}]*background:linear-gradient\(180deg,#213858,#122440\)/.test(boardHtml) ||
      !/#titleOv \.saveSmall\s*\{[^}]*color:#fff3d0/.test(boardHtml))
    throw new Error('タイトル画面検査: セーブ操作ボタンのコントラストが不足');
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
      if ((r.phase === 'playing' || r.phase === 'select') && pend.type !== 'ult_resolve') {
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
      if (pend.type === 'ult_resolve') { S.resolveUltSequence(r); steps++; continue; }
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
      // 全員確定後、テレビ側の「ゲーム開始」押下を再現する。
      if (r.phase === 'select' && S.isSelectionReady(r)) S.startGame(r);
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
