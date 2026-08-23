// 戦闘シーン(発注書v0.75 §8 ─ M5ハイブリッド戦闘の縦切り)
// #battleオーバーレイ内の#bwHostへ透明Canvasを置き、クリーチャー本体・予備動作・踏み込み・
// 属性trail・命中・ヒットストップ・反動・退場/帰還だけをPhaserで描く。
// 名前/AT/DF/HPバー/支援カード/注記/結果表示は従来どおりDOM(§8.2 ─ Canvasへ移植しない)。
// start()がfalseを返したら呼び出し側(board.htmlのplayBattle)は従来DOM表現のまま進行する。
// 依存: グローバルPhaser(vendor/phaser.min.js)。盤面のPWとは別Gameインスタンス(§8.3)。
const BW = (() => {
  const W = 1920, H = 1080;
  let game = null, scene = null, ready = false, failed = false;
  let initP = null;
  let sprs = { atk: null, def: null };
  let bgSprs = {};
  let presentationSpeed = 1;
  const texP = {};
  const ELEM_COL = { fire: 0xFF7A45, water: 0x56A8E8, earth: 0xD9B64F, wind: 0x5BE0D0 };
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
          scene: { create: function () { scene = this; ready = true;
            scene.tweens.timeScale = presentationSpeed; clearTimeout(wd); res(true); } },
        });
        // リサイズ・フルスクリーン切替でもFITを追従させる(v0.84)
        window.addEventListener('resize', () => { try { if (game && game.scale) game.scale.refresh(); } catch (e) {} });
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
  const waitMs = ms => new Promise(res => setTimeout(res,
    Math.max(1, Math.round(ms / (presentationSpeed === 2 ? 2 : 1)))));
  function setSpeed(value) {
    presentationSpeed = value === 2 ? 2 : 1;
    if (scene && scene.tweens) scene.tweens.timeScale = presentationSpeed;
  }

  // v0.93 カード戦闘用の背景レイヤー。UIはDOMのまま、背景だけをPhaserで穏やかに動かす。
  async function backgroundStart() {
    if (!(await init())) return false;
    stop();
    try { if (game && game.scale && game.scale.refresh) game.scale.refresh(); } catch (e) {}
    const root = '/assets/battle/layers/battle-';
    const names = ['base', 'red', 'blue', 'rings', 'crest', 'foreground'];
    const keys = await Promise.all(names.map(n => tex(root + n + '.webp')));
    if (keys.some(k => !k) || !scene) return false;
    names.forEach((n, i) => {
      const s = scene.add.image(W / 2, H / 2, keys[i]).setDepth(i);
      s.setDisplaySize(W, H);
      bgSprs[n] = s;
    });
    // 待機中はカードの可読性を優先し、移動量と明滅を最小限にする。
    scene.tweens.add({ targets:bgSprs.red, x:W/2+10, scaleX:1.012, scaleY:1.006,
      duration:4300, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    scene.tweens.add({ targets:bgSprs.blue, x:W/2-10, scaleX:1.012, scaleY:1.006,
      duration:4700, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    scene.tweens.add({ targets:bgSprs.rings, angle:360, duration:90000, repeat:-1, ease:'Linear' });
    scene.tweens.add({ targets:bgSprs.crest, y:H/2-8, alpha:.88,
      duration:2600, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    scene.tweens.add({ targets:bgSprs.foreground, x:W/2+6,
      duration:5200, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    return true;
  }

  function backgroundPulse(kind, side) {
    if (!scene || !bgSprs.crest) return;
    if (kind === 'support') {
      for (const s of [bgSprs.red, bgSprs.blue])
        scene.tweens.add({ targets:s, alpha:{from:.65,to:1}, duration:220, yoyo:true, ease:'Cubic.easeOut' });
      scene.tweens.add({ targets:bgSprs.crest, scale:1.08, alpha:1, duration:260, yoyo:true, ease:'Cubic.easeOut' });
      return;
    }
    if (kind === 'attack') {
      const s = side === 'def' ? bgSprs.blue : bgSprs.red;
      if (s) scene.tweens.add({ targets:s, x:W/2+(side === 'def'?-42:42), scaleX:1.045,
        alpha:1, duration:170, yoyo:true, ease:'Cubic.easeOut' });
      return;
    }
    if (kind === 'result') {
      const win = side === 'def' ? bgSprs.blue : bgSprs.red;
      const lose = side === 'def' ? bgSprs.red : bgSprs.blue;
      if (win) scene.tweens.add({ targets:win, alpha:1, scaleX:1.07, scaleY:1.03, duration:650, ease:'Sine.easeOut' });
      if (lose) scene.tweens.add({ targets:lose, alpha:.28, duration:650, ease:'Sine.easeOut' });
      scene.tweens.add({ targets:bgSprs.crest, scale:1.12, alpha:1, duration:420, yoyo:true, ease:'Cubic.easeOut' });
    }
  }

  // 命中フラッシュ(§2.4: 強い白発光は100ms前後の瞬間のみ)
  function flash(x, y, col) {
    if (!scene) return;
    const g = scene.add.graphics().setDepth(50);
    scene.tweens.addCounter({ from: 0, to: 1, duration: 150, ease: 'Cubic.easeOut',
      onUpdate: t2 => { const v = t2.getValue(); g.clear();
        g.fillStyle(0xFFFFFF, 0.65 * (1 - v)); g.fillCircle(x, y, 40 + 45 * v);
        g.lineStyle(4, col, 0.9 * (1 - v)); g.strokeCircle(x, y, 46 + 100 * v); },
      onComplete: () => g.destroy() });
  }
  // 命中の粒子(短命・即destroy ─ 戦闘は回数が少ないためPool不要)
  function burst(x, y, col, n) {
    if (!scene || qLite()) return;
    for (let k = 0; k < n; k++) {
      const p = scene.add.circle(x, y, 3.5 + Math.random() * 3.5, col, 0.95).setDepth(49);
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 130;
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
  // 属性trail(§8.6): 支給trail_heavy素材があれば画像、なければ光球+残像。
  // 軌道と速度に属性差 ─ 火=直線で速い / 水=大きな曲線 / 土=重い放物線でゆっくり /
  // 風=最速+二連の筋 / 無=静かな直線
  async function trail(fromX, toX, y, col, elem) {
    if (!scene) return;
    const k = elem ? await tex(fxUrl(elem, 'trailHeavy')) : null;
    const P = {
      fire: { ms: 190, arc: -4 },
      water: { ms: 260, arc: -34 },
      earth: { ms: 320, arc: -64 },
      wind: { ms: 150, arc: -14 },
    }[elem] || { ms: 230, arc: -18 };
    const run = (delay, small) => new Promise(res => {
      if (!scene) return res();
      let s;
      if (k && !small) {
        s = scene.add.image(fromX, y, k).setDepth(48);
        s.setScale(240 / s.width);           // 縦横比は素材のまま(ASSET_NOTES)
        s.setFlipX(toX < fromX);             // trail_*は左右反転可
      } else {
        s = scene.add.circle(fromX, y, small ? 6 : 10, col, small ? 0.7 : 1).setDepth(small ? 47 : 48);
      }
      let fr = 0;
      scene.tweens.addCounter({ from: 0, to: 1, duration: P.ms, delay: delay || 0, ease: 'Sine.easeIn',
        onUpdate: t2 => { const v = t2.getValue();
          s.setPosition(fromX + (toX - fromX) * v, y + Math.sin(v * Math.PI) * P.arc);
          if (!qLite() && !k && (fr++ % 2) === 0) {
            const d = scene.add.circle(s.x, s.y, 6, col, 0.6).setDepth(47);
            scene.tweens.add({ targets: d, alpha: 0, duration: 200, onComplete: () => d.destroy() });
          } },
        onComplete: () => { s.destroy(); res(); } });
    });
    // 風は二連の筋(§8.6 高速軌跡)
    if (elem === 'wind' && !qLite()) return Promise.all([run(0, false), run(60, true)]).then(() => {});
    return run(0, false);
  }
  // 命中画像(impact_large+shockwave ─ 顔を長時間隠さない短時間表示)
  async function impactImg(x, y, elem) {
    if (!scene || !elem) return false;
    const [ki, ks] = await Promise.all([tex(fxUrl(elem, 'impactLarge')), tex(fxUrl('common', 'shockwave'))]);
    if (!ki || !scene) return false;
    const s = scene.add.image(x, y, ki).setDepth(51);
    const w = 210;
    s.setScale((w / s.width) * 0.55).setAlpha(0);
    scene.tweens.addCounter({ from: 0, to: 1, duration: 300, ease: 'Sine.easeOut',
      onUpdate: t2 => { const v = t2.getValue();
        if (!s.scene) return;
        s.setScale((w / s.width) * (0.55 + 0.5 * v));
        s.setAlpha(Math.sin(Math.PI * v)); },
      onComplete: () => s.destroy() });
    if (ks) {
      const sw = scene.add.image(x, y, ks).setDepth(50);
      sw.setScale((90 / sw.width)).setAlpha(0.8);
      scene.tweens.add({ targets: sw, scale: 270 / sw.width, alpha: 0, duration: 340,
        ease: 'Cubic.easeOut', onComplete: () => sw.destroy() });
    }
    return true;
  }

  // 戦闘開始: 2体の一枚絵を配置(§8.4は全クリーチャー共通・パーツ分けなし)
  async function start(atkUrl, defUrl) {
    if (!(await init())) return false;
    stop();
    // 呼び出し時点で#battleは表示済み ─ 親サイズを再計算してFITを正す(非表示中の初期化対策)
    try { if (game && game.scale && game.scale.refresh) game.scale.refresh(); } catch (e) {}
    // Canvasが画面上で実サイズを持つことを確認(v0.84)。サイズ0のままだと「クリーチャーが
    // 見えないのにDOM絵も隠れる」最悪の状態になるため、回復しなければfalse=DOM表現へ
    let sized = false;
    for (let k = 0; k < 6; k++) {
      const rc = game && game.canvas ? game.canvas.getBoundingClientRect() : { width: 0, height: 0 };
      if (rc.width > 50 && rc.height > 30) { sized = true; break; }
      await waitMs(80);
      try { game.scale.refresh(); } catch (e) {}
    }
    if (!sized) return false;
    const [ka, kd] = await Promise.all([tex(atkUrl), tex(defUrl)]);
    if (!ka || !kd || !scene) return false;
    // 立ち位置: DOM側でカード絵のために確保されている枠(.bArtWrap)の位置に合わせる
    // (名前・HPバーと重ならない ─ v0.86)。取得できなければ従来の固定位置
    const cr = game && game.canvas ? game.canvas.getBoundingClientRect() : null;
    const anchor = (sel, fbX) => {
      const el = document.querySelector(sel);
      if (!el || !cr || cr.width < 50) return { x: fbX, y: H - 110, hMax: 290 };
      const r2 = el.getBoundingClientRect();
      if (r2.width < 10) return { x: fbX, y: H - 110, hMax: 290 };
      const x = Math.min(W - 90, Math.max(90, (r2.left + r2.width / 2 - cr.left) / cr.width * W));
      const y = Math.min(H - 12, Math.max(180, (r2.bottom - cr.top) / cr.height * H));
      const hMax = Math.max(180, Math.min(320, r2.height / cr.height * H));
      return { x, y, hMax };
    };
    const aA = anchor('#bAtk .bArtWrap', W * 0.30);
    const aD = anchor('#bDef .bArtWrap', W * 0.70);
    const mk = (k, an, flip) => {
      const s = scene.add.image(an.x, an.y, k).setOrigin(0.5, 1).setDepth(40);
      s.setScale(Math.min(310 / s.width, an.hMax / s.height));
      s.setFlipX(!!flip);
      s.bwHome = { x: an.x, y: an.y, sx: s.scaleX, sy: s.scaleY };
      s.setAlpha(0);
      scene.tweens.add({ targets: s, alpha: 1, duration: 280 });
      return s;
    };
    // クリーチャーの一枚絵は左向き基準 → 左に立つ攻撃側を反転して右(相手)を向かせ、
    // 右に立つ防衛側はそのまま左(相手)を向かせる(v0.85: 向きが逆との指摘で入替)
    sprs.atk = mk(ka, aA, true);
    sprs.def = mk(kd, aD, false);
    return true;
  }

  // モーションProfile(§8.5 ─ 見せ方のみを変え、AT・攻撃順・結果へは影響しない)。
  // 割当は暫定(オーナー調整前提)。未登録はmelee
  const PROFILES = {
    gecko: 'melee', kbaby: 'melee', bedebero: 'melee',
    barbaro: 'charge', avalanche: 'charge', bonerex: 'charge',
    qbaby: 'caster', cleo: 'caster', cresteria: 'caster', beruf: 'caster', ludi: 'caster',
    fugorm: 'weapon', magado: 'weapon', detropas: 'weapon', zati: 'weapon',
    nome: 'beast', goagoa: 'beast', morbill: 'beast', pakawata: 'beast',
    orphe: 'floating', gaston: 'floating', garble: 'floating', mimic: 'floating',
  };
  // 詠唱の収束光(caster用)
  function gatherGlow(S, col) {
    return new Promise(res => {
      if (!scene || !S || !S.scene) return res();
      const g = scene.add.graphics().setDepth(45);
      const cx = S.x, cy = S.y - 130;
      scene.tweens.addCounter({ from: 0, to: 1, duration: 320, ease: 'Sine.easeIn',
        onUpdate: t2 => { const v = t2.getValue(); g.clear();
          g.lineStyle(3, col, 0.9 * v); g.strokeCircle(cx, cy, 50 * (1 - v) + 12);
          g.fillStyle(col, 0.5 * v); g.fillCircle(cx, cy, 11 * v + 3); },
        onComplete: () => { g.destroy(); res(); } });
    });
  }
  // 武器の斬撃弧(trail_light素材があれば回転画像、なければ弧のGraphics)
  async function slashArc(x, y, dir, col, elem) {
    if (!scene) return;
    const k = elem ? await tex(fxUrl(elem, 'trailLight')) : null;
    return new Promise(res => {
      if (!scene) return res();
      if (k) {
        const s = scene.add.image(x, y, k).setDepth(51);
        s.setScale(210 / s.width).setFlipX(dir < 0).setRotation(-0.7 * dir).setAlpha(0);
        scene.tweens.addCounter({ from: 0, to: 1, duration: 190, ease: 'Cubic.easeOut',
          onUpdate: t2 => { const v = t2.getValue();
            if (!s.scene) return;
            s.setRotation((-0.7 + 1.4 * v) * dir);
            s.setAlpha(Math.sin(Math.PI * v)); },
          onComplete: () => { s.destroy(); res(); } });
      } else {
        const g = scene.add.graphics().setDepth(51);
        scene.tweens.addCounter({ from: 0, to: 1, duration: 190, ease: 'Cubic.easeOut',
          onUpdate: t2 => { const v = t2.getValue(); g.clear();
            g.lineStyle(6, col, 0.9 * (1 - v * 0.4));
            g.beginPath();
            g.arc(x, y, 85, (-1.1 + 1.6 * v) * dir - Math.PI / 2, (-0.4 + 1.6 * v) * dir - Math.PI / 2);
            g.strokePath(); },
          onComplete: () => { g.destroy(); res(); } });
      }
    });
  }
  // 支援カード発光(§8.7 支援演出連携): weapon系=攻性の赤金 / shield系=守りの青輪 / jinx=紫
  function supportGlow(side, kind) {
    const S = sprs[side];
    if (!scene || !S || !S.scene) return;
    const col = /shield/.test(kind) ? 0x6FA8E8 : kind === 'jinx' ? 0x9B59D0 : 0xE8A050;
    const g = scene.add.graphics().setDepth(46);
    const cx = S.bwHome.x, cy = S.bwHome.y - Math.min(120, S.displayHeight * 0.5);
    scene.tweens.addCounter({ from: 0, to: 1, duration: 650, ease: 'Sine.easeOut',
      onUpdate: t2 => { const v = t2.getValue(); g.clear();
        const a = 0.85 * Math.sin(Math.PI * v);
        g.lineStyle(4, col, a); g.strokeCircle(cx, cy, 95 + 55 * v);
        g.fillStyle(col, a * 0.15); g.fillCircle(cx, cy, 120); },
      onComplete: () => g.destroy() });
  }
  // 相手の支援を無効化された側の明示(jinx ─ 紫の弾け)
  function jinxedFlash(side) {
    const S = sprs[side];
    if (!scene || !S || !S.scene) return;
    burst(S.bwHome.x, S.bwHome.y - 120, 0x9B59D0, 8);
    S.setTint(0xB07AE0);
    setTimeout(() => { if (S.scene) S.clearTint(); }, 400);
  }

  // 攻撃1回分(§8.4/§8.5/§8.6): Profile別の予備動作・踏み込み→属性trail→impact→
  // ヒットストップ→相手の反動→戻る。opts = { heavy, cid(Profile解決用), guard(DF軽減の防御スパーク), corrode(腐蝕) }
  async function attack(side, elem, opts) {
    const o2 = typeof opts === 'object' && opts ? opts : { heavy: !!opts };
    const S = sprs[side], T = sprs[side === 'atk' ? 'def' : 'atk'];
    if (!S || !S.scene || !T || !T.scene) return;
    const dir = side === 'atk' ? 1 : -1;
    const col = ELEM_COL[elem] || 0xD8D2E8;
    const prof = PROFILES[(o2.cid || '').replace(/_f$/, '')] || 'melee';
    // 【腐蝕】など: 攻撃開始時に相手を病的な色へ短時間変色
    if (o2.corrode && T.scene) { T.setTint(0x9BB86A); setTimeout(() => { if (T.scene) T.clearTint(); }, 700); }
    // --- 予備動作+踏み込み(Profile別 §8.5) ---
    if (prof === 'charge') {           // 低く構える→直線突進(本体が弾丸 ─ trailなし)
      await tw(S, { scaleY: S.bwHome.sy * 0.82, y: S.bwHome.y + 6 }, 240, 'Sine.easeIn');
      await tw(S, { x: S.bwHome.x + 265 * dir, scaleY: S.bwHome.sy, y: S.bwHome.y }, 130, 'Cubic.easeIn');
    } else if (prof === 'caster') {    // 収束→遠隔projectile(本体は動かない)
      await gatherGlow(S, col);
    } else if (prof === 'floating') {  // 浮上→遠隔攻撃→(後で漂って戻る)
      await tw(S, { y: S.bwHome.y - 26 }, 260, 'Sine.easeOut');
    } else if (prof === 'beast') {     // 全身の短い踏み込み×2(噛みつき ─ trailなし)
      await tw(S, { x: S.bwHome.x + 60 * dir, y: S.bwHome.y - 10 }, 130, 'Sine.easeOut');
      await tw(S, { y: S.bwHome.y }, 90, 'Sine.easeIn');
      await tw(S, { x: S.bwHome.x + 180 * dir, y: S.bwHome.y - 8 }, 120, 'Cubic.easeIn');
    } else if (prof === 'weapon') {    // 一歩踏み込み→武器起点の斬撃弧
      await tw(S, { x: S.bwHome.x + 95 * dir }, 160, 'Cubic.easeIn');
    } else {                           // melee: 後ろへ引く→前進
      await tw(S, { x: S.bwHome.x - 46 * dir, scaleY: S.bwHome.sy * 0.94 }, 230, 'Sine.easeIn');
      await tw(S, { x: S.bwHome.x + 150 * dir, scaleY: S.bwHome.sy }, 150, 'Cubic.easeIn');
    }
    // 相手の胸元の高さ(立ち位置アンカー基準 ─ v0.86)
    const hitY = T.bwHome.y - Math.min(140, T.displayHeight * 0.55);
    // --- 属性trail(§8.6。charge/beastは本体突撃のため省略、weaponは斬撃弧) ---
    if (prof === 'weapon') await slashArc(T.bwHome.x - 40 * dir, hitY, dir, col, elem);
    else if (prof !== 'charge' && prof !== 'beast')
      await trail(S.x + 80 * dir, T.bwHome.x - 70 * dir, hitY, col, elem);
    // --- impact(素材優先) ---
    if (!(await impactImg(T.bwHome.x, hitY, elem))) flash(T.bwHome.x, hitY, col);
    burst(T.bwHome.x, hitY + 10, col, (o2.heavy || prof === 'charge') ? 15 : 9);
    // DF軽減があった命中: 防御スパーク(骨鎧・岩壁などの「守った感」 ─ 数値はDOMが正)
    if (o2.guard) {
      const g = scene.add.graphics().setDepth(52);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 260, ease: 'Cubic.easeOut',
        onUpdate: t2 => { const v = t2.getValue(); g.clear();
          g.lineStyle(5, 0xCBB878, 0.9 * (1 - v));
          g.beginPath();
          g.arc(T.bwHome.x - 46 * dir, hitY, 62 + 20 * v, -Math.PI / 2 - 0.8 * dir, -Math.PI / 2 + 0.8 * dir);
          g.strokePath(); },
        onComplete: () => g.destroy() });
    }
    // ヒットストップ(§8.4-5/§8.9: 演出Tweenだけを止める。JS・SSEは止めない)
    if (scene.tweens) { scene.tweens.timeScale = 0.05; await waitMs(prof === 'charge' ? 90 : 75); scene.tweens.timeScale = presentationSpeed; }
    tw(T, { x: T.bwHome.x + (prof === 'charge' ? 44 : 30) * dir, angle: 4 * dir }, 90, 'Cubic.easeOut')  // 反動
      .then(() => tw(T, { x: T.bwHome.x, angle: 0 }, 240, 'Sine.easeOut'));
    // --- 戻る(floatingは漂って降りる §8.5) ---
    await tw(S, { x: S.bwHome.x, y: S.bwHome.y }, prof === 'floating' ? 420 : 260, 'Sine.easeOut');
  }
  // 撃破: 単色化→沈んで消える
  async function defeat(side) {
    const S = sprs[side];
    if (!S || !S.scene) return;
    S.setTint(0x555566);
    burst(S.x, S.bwHome.y - 120, 0x9090B0, 10);
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
    if (scene.tweens) scene.tweens.timeScale = presentationSpeed;
    for (const c of [...scene.children.list]) c.destroy();
    sprs = { atk: null, def: null };
    bgSprs = {};
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
  return { start, attack, defeat, returnHome, stop, pump, debug, setSpeed,
           backgroundStart, backgroundPulse,
           supportGlow, jinxedFlash,
           isReady: () => ready, hasFailed: () => failed };
})();
