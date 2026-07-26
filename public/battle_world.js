// 戦闘シーン(発注書v0.75 §8 ─ M5ハイブリッド戦闘の縦切り)
// #battleオーバーレイ内の#bwHostへ透明Canvasを置き、クリーチャー本体・予備動作・踏み込み・
// 属性trail・命中・ヒットストップ・反動・退場/帰還だけをPhaserで描く。
// 名前/AT/DF/HPバー/支援カード/注記/結果表示は従来どおりDOM(§8.2 ─ Canvasへ移植しない)。
// start()がfalseを返したら呼び出し側(board.htmlのplayBattle)は従来DOM表現のまま進行する。
// 依存: グローバルPhaser(vendor/phaser.min.js)。盤面のPWとは別Gameインスタンス(§8.3)。
const BW = (() => {
  const W = 1100, H = 460;
  let game = null, scene = null, ready = false, failed = false;
  let initP = null;
  let sprs = { atk: null, def: null };
  const texP = {};
  const ELEM_COL = { fire: 0xFF7A45, water: 0x56A8E8, earth: 0x7FD35C, wind: 0x5BE0D0 };
  const qLite = () => { try { return localStorage.getItem('sc_quality') === 'lite'; } catch (e) { return false; } };

  function init() {
    if (ready) return Promise.resolve(true);
    if (failed) return Promise.resolve(false);
    if (initP) return initP;
    initP = new Promise(res => {
      if (typeof Phaser === 'undefined' || !document.getElementById('bwHost')) { failed = true; return res(false); }
      const wd = setTimeout(() => {
        if (!ready) { failed = true; try { if (game) game.destroy(true); } catch (e) {} game = null; res(false); }
      }, 3000);
      try {
        game = new Phaser.Game({
          type: Phaser.AUTO, parent: 'bwHost', width: W, height: H,
          transparent: true, banner: false,
          render: { roundPixels: false },
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
          scene: { create: function () { scene = this; ready = true; clearTimeout(wd); res(true); } },
        });
      } catch (e) { failed = true; clearTimeout(wd); res(false); }
    });
    return initP;
  }
  function tex(url) {
    if (!url) return Promise.resolve(null);
    if (scene && scene.textures.exists('bw_' + url)) return Promise.resolve('bw_' + url);
    if (texP[url]) return texP[url];
    texP[url] = new Promise(res => {
      const img = new Image();
      img.onload = () => {
        if (!scene) return res(null);
        if (!scene.textures.exists('bw_' + url)) scene.textures.addImage('bw_' + url, img);
        res('bw_' + url);
      };
      img.onerror = () => { delete texP[url]; res(null); };
      img.src = url;
    });
    return texP[url];
  }
  const tw = (t, props, duration, ease) => new Promise(res => {
    if (!scene || !t || !t.scene) return res();
    scene.tweens.add(Object.assign({}, props, { targets: t, duration, ease: ease || 'Sine.easeInOut', onComplete: res }));
  });
  const waitMs = ms => new Promise(res => setTimeout(res, ms));

  // 命中フラッシュ(§2.4: 強い白発光は100ms前後の瞬間のみ)
  function flash(x, y, col) {
    if (!scene) return;
    const g = scene.add.graphics().setDepth(50);
    scene.tweens.addCounter({ from: 0, to: 1, duration: 150, ease: 'Cubic.easeOut',
      onUpdate: t2 => { const v = t2.getValue(); g.clear();
        g.fillStyle(0xFFFFFF, 0.65 * (1 - v)); g.fillCircle(x, y, 26 + 30 * v);
        g.lineStyle(3, col, 0.9 * (1 - v)); g.strokeCircle(x, y, 30 + 70 * v); },
      onComplete: () => g.destroy() });
  }
  // 命中の粒子(短命・即destroy ─ 戦闘は回数が少ないためPool不要)
  function burst(x, y, col, n) {
    if (!scene || qLite()) return;
    for (let k = 0; k < n; k++) {
      const p = scene.add.circle(x, y, 2 + Math.random() * 2.5, col, 0.95).setDepth(49);
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      scene.tweens.add({ targets: p, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp * 0.7,
        alpha: 0, duration: 380 + Math.random() * 220, ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
    }
  }
  // 支給素材のURL(fx_manifest.jsのFX_ASSETS経由 ─ 未定義・未配置はnull→Graphicsフォールバック)
  function fxUrl(group, key) {
    if (typeof FX_ASSETS === 'undefined') return null;
    const m = FX_ASSETS[group] || FX_ASSETS.neutral;
    return (m && m[key]) || null;
  }
  // 属性trail(§8.6): 支給trail_heavy素材があれば画像、なければ光球+残像
  async function trail(fromX, toX, y, col, elem) {
    if (!scene) return;
    const k = elem ? await tex(fxUrl(elem, 'trailHeavy')) : null;
    return new Promise(res => {
      if (!scene) return res();
      let s;
      if (k) {
        s = scene.add.image(fromX, y, k).setDepth(48);
        s.setScale(150 / s.width);           // 縦横比は素材のまま(ASSET_NOTES)
        s.setFlipX(toX < fromX);             // trail_*は左右反転可
      } else {
        s = scene.add.circle(fromX, y, 7, col, 1).setDepth(48);
      }
      let fr = 0;
      scene.tweens.addCounter({ from: 0, to: 1, duration: 230, ease: 'Sine.easeIn',
        onUpdate: t2 => { const v = t2.getValue();
          s.setPosition(fromX + (toX - fromX) * v, y + Math.sin(v * Math.PI) * -18);
          if (!qLite() && !k && (fr++ % 2) === 0) {
            const d = scene.add.circle(s.x, s.y, 4, col, 0.6).setDepth(47);
            scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
          } },
        onComplete: () => { s.destroy(); res(); } });
    });
  }
  // 命中画像(impact_large+shockwave ─ 顔を長時間隠さない短時間表示)
  async function impactImg(x, y, elem) {
    if (!scene || !elem) return false;
    const [ki, ks] = await Promise.all([tex(fxUrl(elem, 'impactLarge')), tex(fxUrl('common', 'shockwave'))]);
    if (!ki || !scene) return false;
    const s = scene.add.image(x, y, ki).setDepth(51);
    const w = 130;
    s.setScale((w / s.width) * 0.55).setAlpha(0);
    scene.tweens.addCounter({ from: 0, to: 1, duration: 300, ease: 'Sine.easeOut',
      onUpdate: t2 => { const v = t2.getValue();
        if (!s.scene) return;
        s.setScale((w / s.width) * (0.55 + 0.5 * v));
        s.setAlpha(Math.sin(Math.PI * v)); },
      onComplete: () => s.destroy() });
    if (ks) {
      const sw = scene.add.image(x, y, ks).setDepth(50);
      sw.setScale((60 / sw.width)).setAlpha(0.8);
      scene.tweens.add({ targets: sw, scale: 170 / sw.width, alpha: 0, duration: 320,
        ease: 'Cubic.easeOut', onComplete: () => sw.destroy() });
    }
    return true;
  }

  // 戦闘開始: 2体の一枚絵を配置(§8.4は全クリーチャー共通・パーツ分けなし)
  async function start(atkUrl, defUrl) {
    if (!(await init())) return false;
    stop();
    const [ka, kd] = await Promise.all([tex(atkUrl), tex(defUrl)]);
    if (!ka || !kd || !scene) return false;
    const mk = (k, x, flip) => {
      const s = scene.add.image(x, H - 56, k).setOrigin(0.5, 1).setDepth(40);
      s.setScale(Math.min(300 / s.width, 290 / s.height));
      s.setFlipX(!!flip);
      s.bwHome = { x, y: H - 56, sx: s.scaleX, sy: s.scaleY };
      s.setAlpha(0);
      scene.tweens.add({ targets: s, alpha: 1, duration: 280 });
      return s;
    };
    sprs.atk = mk(ka, W * 0.30, false);
    sprs.def = mk(kd, W * 0.70, true);
    return true;
  }

  // 攻撃1回分(§8.4): 予備動作→踏み込み→trail→impact→ヒットストップ→相手の反動→戻る
  async function attack(side, elem, heavy) {
    const S = sprs[side], T = sprs[side === 'atk' ? 'def' : 'atk'];
    if (!S || !S.scene || !T || !T.scene) return;
    const dir = side === 'atk' ? 1 : -1;
    const col = ELEM_COL[elem] || 0xD8D2E8;
    await tw(S, { x: S.bwHome.x - 46 * dir, scaleY: S.bwHome.sy * 0.94 }, 230, 'Sine.easeIn');   // 予備動作
    await tw(S, { x: S.bwHome.x + 150 * dir, scaleY: S.bwHome.sy }, 150, 'Cubic.easeIn');        // 踏み込み
    await trail(S.bwHome.x + 200 * dir, T.bwHome.x - 70 * dir, H - 200, col, elem);              // 属性trail(素材優先)
    if (!(await impactImg(T.bwHome.x, H - 190, elem))) flash(T.bwHome.x, H - 190, col);          // impact(素材優先)
    burst(T.bwHome.x, H - 180, col, heavy ? 15 : 9);
    // ヒットストップ(§8.4-5/§8.9: 演出Tweenだけを止める。JS・SSEは止めない)
    if (scene.tweens) { scene.tweens.timeScale = 0.05; await waitMs(75); scene.tweens.timeScale = 1; }
    tw(T, { x: T.bwHome.x + 30 * dir, angle: 4 * dir }, 90, 'Cubic.easeOut')                     // 反動
      .then(() => tw(T, { x: T.bwHome.x, angle: 0 }, 240, 'Sine.easeOut'));
    await tw(S, { x: S.bwHome.x }, 260, 'Sine.easeOut');                                         // 戻る
  }
  // 撃破: 単色化→沈んで消える
  async function defeat(side) {
    const S = sprs[side];
    if (!S || !S.scene) return;
    S.setTint(0x555566);
    burst(S.x, H - 180, 0x9090B0, 10);
    await tw(S, { y: S.bwHome.y + 30, alpha: 0 }, 650, 'Sine.easeIn');
  }
  // 帰還(耐えた攻撃側): 上昇して消える
  async function returnHome(side) {
    const S = sprs[side];
    if (!S || !S.scene) return;
    await tw(S, { y: S.bwHome.y - 60, alpha: 0 }, 600, 'Sine.easeOut');
  }
  // 全消去(Game/テクスチャは再利用 ─ §11.4: 戦闘終了後に一時オブジェクト・Tweenを残さない)
  function stop() {
    if (!scene) return;
    if (scene.tweens && scene.tweens.getTweens) scene.tweens.getTweens().forEach(t2 => t2.remove());
    if (scene.tweens) scene.tweens.timeScale = 1;
    for (const c of [...scene.children.list]) c.destroy();
    sprs = { atk: null, def: null };
  }
  // 非表示タブでの検証用(PW.pumpと同じ ─ Phaser4のtweenは実時間基準)
  let pumpT = 0;
  function pump(frames = 60) {
    if (!ready || !game) return;
    pumpT = Math.max(pumpT, performance.now());
    for (let k = 0; k < frames; k++) { pumpT += 16.7; game.loop.step(pumpT); }
  }
  function debug() {
    return { ready, failed,
      children: scene ? scene.children.length : 0,
      tweens: scene && scene.tweens && scene.tweens.getTweens ? scene.tweens.getTweens().length : 0 };
  }
  return { start, attack, defeat, returnHome, stop, pump, debug,
           isReady: () => ready, hasFailed: () => failed };
})();
