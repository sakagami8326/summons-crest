// board_world.js ─ 盤面ワールドのPhaser描画(v0.66 / docs/plan_phaser_board_v0.66.md)
// board.htmlのDOM描画と同じ「状態駆動・差分再構築」を踏襲する。
// 依存: グローバルの GEO/proj/DW/DH/THICK/GAME_TIMING/buildTileSVG/buildTollBadges/state/player
// (board.htmlのインラインscriptで定義。呼び出しは全てページロード後なので参照解決は問題ない)
// 座標契約: worldPos()=論理1280×905空間 / worldToViewport()=ブラウザ画面px(§3.2)
const PW = (() => {
  let game = null, scene = null, ready = false, failed = false;
  let failCb = null, readyCb = null;
  let stoneDataUrl = null;
  let pendingState = null, pendingLayout = null;   // Scene準備前に届いたstateの保留(最新1件)
  let boardKey = '', boardGen = 0;
  let boardObjs = [];                               // 現行世代の表示オブジェクト
  const creatureSprites = {};                       // タイル番号 → クリーチャースプライト(2C演出用)
  let tileTexKeys = [];                             // 現行世代のタイルテクスチャ
  const pawns = {};                                 // id → { spr, sh, tex, x, y, tw }
  const texPromises = {};
  let camTarget = 'none';                           // カメラの現在目標(同一目標への再tween防止)

  const sum = i => GEO[i][0] + GEO[i][1];
  // '#RRGGBB' → 数値。Phaserの色変換APIに依存しない(v3/v4差異の影響を受けない)
  const hexInt = s => parseInt(String(s || '#F2D062').replace('#', ''), 16);

  // ===== Phase 2A: 品質コントローラ(plan_phaser4_phase2plus §4.2-4.3) =====
  // 設定は再読み込みなしで即時反映される。イベントの意味・尺は品質で変えない
  const QUALITY_FACTOR = { high: 1, standard: 0.65, lite: 0.3 };
  let quality = 'standard';
  let reduceFx = false;
  try {
    quality = localStorage.getItem('sc_quality') || 'standard';
    reduceFx = localStorage.getItem('sc_reduce_fx') === '1';
  } catch (e) {}
  if (!QUALITY_FACTOR[quality]) quality = 'standard';
  const qf = () => QUALITY_FACTOR[quality];
  function setQuality(q) {
    if (!QUALITY_FACTOR[q]) return;
    quality = q;
    try { localStorage.setItem('sc_quality', q); } catch (e) {}
  }
  function setReduceFx(b) {
    reduceFx = !!b;
    try { localStorage.setItem('sc_reduce_fx', b ? '1' : '0'); } catch (e) {}
  }

  // ===== Phase 2A: EffectPool(短命粒子の再利用・plan §2.4) =====
  const dustPool = [];
  let dustActive = 0;
  const DUST_POOL_MAX = 60;
  function acquireDust() {
    let p = dustPool.pop();
    if (!p) p = scene.add.circle(0, 0, 2, 0xffffff);
    p.setVisible(true).setActive(true);
    dustActive++;
    return p;
  }
  function releaseDust(p) {
    dustActive = Math.max(0, dustActive - 1);
    p.setVisible(false).setActive(false);
    if (dustPool.length < DUST_POOL_MAX) dustPool.push(p);
    else p.destroy();
  }
  // 着地の土埃など: 小粒子を放射(品質で数を絞る。lite=0)
  function dustBurst(x, y, base, col, depth) {
    if (!ready || quality === 'lite') return;
    const n = Math.max(1, Math.round(base * qf()));
    for (let k = 0; k < n; k++) {
      const p = acquireDust();
      p.setPosition(x + (Math.random() * 18 - 9), y - 2);
      p.setFillStyle(col != null ? col : 0xBBB49A, 0.85);
      p.setRadius(1.5 + Math.random() * 1.5);
      p.setDepth(depth != null ? depth : 250);
      const dx = Math.random() * 26 - 13, dy = -(6 + Math.random() * 10);
      scene.tweens.addCounter({
        from: 0, to: 1, duration: 260 + Math.random() * 140, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); p.setPosition(p.x + dx * 0.06, y - 2 + dy * v + 14 * v * v); p.setAlpha(0.85 * (1 - v)); },
        onComplete: () => releaseDust(p),
      });
    }
  }
  // カメラシェイク(演出低減設定で無効/半減 ─ plan §4.3)
  function shake(px, ms) {
    if (!ready || reduceFx) return;
    const amp = (quality === 'lite' ? px * 0.5 : px) / 1280;
    scene.cameras.main.shake(ms, amp);
  }

  // ===== Phase 2A: EffectDirector(plan §2.2) =====
  // PW.play(ev)はPromiseを返す。未対応typeは即resolve。同一idの二重再生を防止。
  // 個別演出は最大4秒でタイムアウトし、例外でも呼び出し側を止めない
  const playedIds = [];
  const playedSet = new Set();
  let fxPlaying = null;
  const EFFECTS = {
    // 検証用: 指定時間だけ「演出中」になる
    'debug-wait': ev => new Promise(res => setTimeout(res, ev.ms || 100)),
    // 検証用: 例外を投げる(キューが止まらないことの確認)
    'debug-error': () => { throw new Error('debug-error'); },
    // 着地土埃(2B: 移動ジュースからも直接使用)
    'dust': ev => { const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]); dustBurst(x, y, ev.n || 4, null, 250); return Promise.resolve(); },
    // ===== Phase 2C: 盤面状態変化(plan §7) =====
    'summon': fx2cSummon,
    'upgrade-sparks': fx2cUpgrade,
    'evolve-fx': fx2cEvolve,
    'ruin-fx': fx2cRuin,
  };

  // ---- 2C共通ヘルパー ----
  const ELEM_COL = { fire: 0xFF7A45, water: 0x56A8E8, earth: 0x7FD35C, wind: 0x5BE0D0 };
  const elemCol = e => ELEM_COL[e] || 0xD8D2E8;
  const wait = ms => new Promise(res => setTimeout(res, ms));
  // 属性色の粒子を放射(pool再利用。上方向up=trueで立ち上る)
  function elemBurst(x, y, col, base, up, depth) {
    if (!ready || quality === 'lite') return;
    const n = Math.max(2, Math.round(base * qf()));
    for (let k = 0; k < n; k++) {
      const p = acquireDust();
      p.setPosition(x + (Math.random() * 36 - 18), y - (up ? 10 : 2));
      p.setFillStyle(col, 0.9);
      p.setRadius(1.5 + Math.random() * 2);
      p.setDepth(depth != null ? depth : 320);
      const dx = Math.random() * 40 - 20;
      const dy = up ? -(30 + Math.random() * 50) : (8 + Math.random() * 14);
      scene.tweens.addCounter({
        from: 0, to: 1, duration: 500 + Math.random() * 300, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); p.setPosition(p.x + dx * 0.03, y - (up ? 10 : 2) + dy * v); p.setAlpha(0.9 * (1 - v)); },
        onComplete: () => releaseDust(p),
      });
    }
  }
  // 地面の波紋(召喚の紋章代替: 属性共通素材が届くまでの生成版 ─ plan §3.1)
  function groundRipple(i, col, dur) {
    const { x, y } = proj(GEO[i][0], GEO[i][1]);
    const g = scene.add.graphics().setDepth(299);
    scene.tweens.addCounter({ from: 0, to: 1, duration: dur || 700, ease: 'Cubic.easeOut',
      onUpdate: tw => { const v = tw.getValue(); g.clear();
        g.lineStyle(2 + 3 * (1 - v), col, 0.9 * (1 - v));
        g.strokeEllipse(x, y, 20 + 90 * v, (20 + 90 * v) * 0.55);
        g.lineStyle(1.5, col, 0.5 * (1 - v));
        g.strokeEllipse(x, y, 10 + 55 * v, (10 + 55 * v) * 0.55); },
      onComplete: () => g.destroy() });
  }
  // クリーチャースプライトのポップ(85%→105%→100% ─ plan §7.1)
  function popSprite(spr, dur) {
    return new Promise(res => {
      if (!spr || !spr.scene) return res();
      const base = spr.scale;
      scene.tweens.addCounter({ from: 0, to: 1, duration: dur || 420, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue();
          if (!spr.scene) return;
          const s = v < 0.55 ? 0.85 + 0.2 * (v / 0.55) : 1.05 - 0.05 * ((v - 0.55) / 0.45);
          spr.setScale(base * s); },
        onComplete: () => { if (spr.scene) spr.setScale(base); res(); } });
    });
  }
  // 再構築完了後のクリーチャースプライトを待つ(state更新→演出の順序ずれ対策)
  function waitCreature(i, tries = 20) {
    return new Promise(res => {
      const chk = () => {
        const s = creatureSprites[i];
        if (s && s.scene) return res(s);
        if (--tries <= 0) return res(null);
        setTimeout(chk, 100);
      };
      chk();
    });
  }

  // 召喚(plan §7.1): DOM立ち絵カットインが主役。盤面側は波紋+出現ポップ+属性粒子のみ
  async function fx2cSummon(ev) {
    const col = elemCol(ev.element);
    groundRipple(ev.tile, col, 700);
    const spr = await waitCreature(ev.tile);
    const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]);
    elemBurst(x, y, col, 10, true, 320);
    if (spr) await popSprite(spr, 450);
    await wait(250);
  }

  // 強化(plan §7.2): 外周リング+短い発光+上昇粒子。カメラは動かさない
  async function fx2cUpgrade(ev) {
    const col = hexInt(ev.color != null ? ev.color : '#EBD98A');
    fx(ev.tile, 'fxRing', col);
    const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]);
    elemBurst(x, y, col, 6, true, 320);
    const spr = creatureSprites[ev.tile];
    if (spr && spr.scene && quality !== 'lite') {
      spr.setTint(0xFFF2C0);
      setTimeout(() => { if (spr.scene) spr.clearTint(); }, 260);
    }
    await wait(500);
  }

  // 進化(plan §7.3): 旧姿オーバーレイ→光柱の中でフェードアウト→新姿ポップ。
  // stateが先に進化後へ切り替わるため、旧テクスチャを上に重ねて切替の瞬間を隠す
  async function fx2cEvolve(ev) {
    const col = elemCol(ev.element);
    const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]);
    const lift = ((ev.level || 3) - 1) * 7;
    let old = null;
    const oldKey = 'pwCre_c_' + ev.bid;
    await pngTexture(oldKey, '/assets/c_' + ev.bid + '.png').catch(() => {});
    if (scene && scene.textures.exists(oldKey)) {
      old = scene.add.image(x, y - lift + 6, oldKey).setOrigin(0.5, 1).setDepth(330);
      old.setScale(80 / old.width);
    }
    await wait(300);
    fx(ev.tile, 'fxPillar', col, -lift);
    elemBurst(x, y - lift, col, 12, true, 331);
    if (old) {
      await new Promise(res => scene.tweens.add({ targets: old, alpha: 0, duration: 500, delay: 250,
        onComplete: () => { old.destroy(); res(); } }));
    } else { await wait(750); }
    const spr = await waitCreature(ev.tile, 8);
    if (spr) await popSprite(spr, 450);
    await wait(300);
  }

  // 退場(plan §7.4): stateからは既に消えているため、旧姿を一時表示して沈下+粒子分解
  async function fx2cRuin(ev) {
    const col = elemCol(ev.element);
    const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]);
    const bid = (ev.cid || '').replace(/_f$/, '');
    let ghost = null;
    if (bid) {
      const evo = bid !== ev.cid;
      const key = 'pwCre_' + (evo ? 'e_' : 'c_') + bid;
      await pngTexture(key, '/assets/' + (evo ? 'e_' : 'c_') + bid + '.png').catch(() => {});
      if (scene && scene.textures.exists(key)) {
        ghost = scene.add.image(x, y + 6, key).setOrigin(0.5, 1).setDepth(330);
        ghost.setScale(80 / ghost.width);
      }
    }
    await wait(200);
    if (ghost) {
      ghost.setTint(0x555566);   // 彩度低下の代替(単色化)
      elemBurst(x, y, col, 10, false, 331);
      await new Promise(res => scene.tweens.add({ targets: ghost, y: ghost.y + 14, alpha: 0,
        duration: 800, ease: 'Sine.easeIn', onComplete: () => { ghost.destroy(); res(); } }));
      elemBurst(x, y, col, 6, true, 331);
    } else {
      elemBurst(x, y, col, 10, false, 331);
      await wait(800);
    }
    await wait(200);
  }
  function play(ev) {
    if (!ev || !ev.type) return Promise.resolve();
    if (ev.id != null) {
      if (playedSet.has(ev.id)) return Promise.resolve();   // 二重再生防止(SSE再接続対策)
      playedSet.add(ev.id);
      playedIds.push(ev.id);
      if (playedIds.length > 200) playedSet.delete(playedIds.shift());
    }
    if (failed || !ready) return Promise.resolve();          // DOM描画時は安全なno-op
    const impl = EFFECTS[ev.type];
    if (!impl) return Promise.resolve();                     // 未対応typeはゲームを止めない
    fxPlaying = ev.type;
    let p;
    try { p = Promise.resolve(impl(ev)); }
    catch (e) { fxPlaying = null; return Promise.resolve(); }
    return Promise.race([p, new Promise(res => setTimeout(res, ev.timeoutMs || 4000))])
      .catch(() => {})
      .then(() => { fxPlaying = null; });
  }

  function fxDebug() {
    return {
      quality, reduceFx, playing: fxPlaying,
      tweens: ready && scene.tweens ? (scene.tweens.getTweens ? scene.tweens.getTweens().length : -1) : 0,
      dustPool: dustPool.length, dustActive,
      children: ready ? scene.children.length : 0,
      zoom: ready ? scene.cameras.main.zoom : 0,
    };
  }

  function fail(why) {
    if (failed || ready) { if (!ready) return; }
    if (failed) return;
    failed = true;
    try { if (game) game.destroy(true); } catch (e) {}
    game = null; scene = null; ready = false;
    if (failCb) failCb(why);
  }

  function makeShadowTex() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,.45)');
    grd.addColorStop(0.65, 'rgba(0,0,0,.22)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    scene.textures.addCanvas('pwShadow', c);
  }

  function svgTexture(key, svg) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        if (!scene) return res(null);
        if (scene.textures.exists(key)) scene.textures.remove(key);
        scene.textures.addImage(key, img);
        res(key);
      };
      img.onerror = () => res(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function pngTexture(key, url) {
    if (scene && scene.textures.exists(key)) return Promise.resolve(key);
    if (texPromises[key]) return texPromises[key];
    texPromises[key] = new Promise(res => {
      const img = new Image();
      img.onload = () => {
        if (!scene) return res(null);
        if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
        res(key);
      };
      img.onerror = () => { delete texPromises[key]; res(null); };
      img.src = url;
    });
    return texPromises[key];
  }

  function init(opts) {
    failCb = opts.onFail; readyCb = opts.onReady;
    if (typeof Phaser === 'undefined') return fail('phaser-load');
    const wd = setTimeout(() => { if (!ready) fail('timeout'); }, 4000);
    // stone.jpgはSVGテクスチャ内から外部参照できないためdataURL化して埋め込む
    fetch('/assets/stone.jpg').then(r => r.blob())
      .then(b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }))
      .catch(() => null)
      .then(dataUrl => {
        if (failed) return;
        stoneDataUrl = dataUrl;
        try {
          // ?gl=0: 非推奨Canvas Rendererの診断用(Phaser 4ではCanvasは製品保証外。
          // 本命フォールバックは既存DOM描画 ─ spec_phaser4_migration_v0.67.md P4-06)
          const forceCanvas = new URLSearchParams(location.search).get('gl') === '0';
          game = new Phaser.Game({
            type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO, parent: 'phaserHost', width: 1280, height: 905,
            transparent: true, banner: false,
            render: { roundPixels: false },  // Phaser 4は既定false ─ 滑らかな移動優先で明示(spec §4.2-8)
            scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
            scene: {
              create: function () {
                scene = this;
                makeShadowTex();
                ready = true;
                clearTimeout(wd);
                console.log('Phaser ' + Phaser.VERSION + ' / ' +
                  (game.renderer && game.renderer.gl ? 'WebGL' : 'Canvas') + ' / Scene ready');
                if (readyCb) readyCb();
                if (pendingState) { const s = pendingState; pendingState = null; syncBoard(s); }
                if (pendingLayout) { const l = pendingLayout; pendingLayout = null; syncPawns(l); }
              },
            },
          });
        } catch (e) { fail('init: ' + e.message); }
      });
  }

  // ===== 盤面(タイル・建造物・クリーチャー・バッジ) =====
  function syncBoard(st) {
    if (failed) return;
    if (!ready) { pendingState = st; return; }
    const key = JSON.stringify(st.owners) + JSON.stringify(st.curses || {}) + JSON.stringify(st.barrier || {}) +
      st.players.map(p => p.id + p.color).join('') + st.tiles.map(t => t.e || t.t).join('');
    if (key === boardKey) return;
    boardKey = key;
    const gen = ++boardGen;
    const jobs = [];      // [Promise(texKey), 適用関数]の組
    const makers = [];    // テクスチャ確定後に実行する生成関数
    const newTileTex = [];

    // タイル(DOM版と同じSVGをテクスチャ化 → 完全パリティ)
    const PAD = 24;
    const order = GEO.map((_, i) => i).sort((a, b) => sum(a) - sum(b));
    for (const i of order) {
      const t = st.tiles[i], o = st.owners[i];
      const ownColor = o ? player(o.player).color : null;
      const barrier = o && st.barrier && st.barrier[o.player];
      const svg = buildTileSVG(i, t, o, ownColor, barrier, PAD, stoneDataUrl);
      const texKey = 'pwTile' + i + '_' + gen;
      newTileTex.push(texKey);
      const { x, y } = proj(GEO[i][0], GEO[i][1]);
      jobs.push(svgTexture(texKey, svg));
      makers.push(() => {
        if (!scene.textures.exists(texKey)) return;
        boardObjs.push(scene.add.image(x, y + DH / 2 + THICK + PAD, texKey).setOrigin(0.5, 1).setDepth(sum(i)));
      });
    }
    // 建造物
    const STRUCTS = { castle: ['struct_castle', 116], shrine: ['struct_shrine', 78], market: ['struct_market', 100], gate: ['struct_gate', 94] };
    st.tiles.forEach((t, i) => {
      const sc = STRUCTS[t.t];
      if (!sc) return;
      const { x, y } = proj(GEO[i][0], GEO[i][1]);
      const texKey = 'pwImg_' + sc[0];
      jobs.push(pngTexture(texKey, '/assets/' + sc[0] + '.png'));
      makers.push(() => {
        boardObjs.push(scene.add.image(x, y, 'pwShadow').setOrigin(0.5, 0.5).setDisplaySize(sc[1] * 0.8, 20).setDepth(100 + sum(i)));
        if (!scene.textures.exists(texKey)) return;
        const img = scene.add.image(x, y + 8, texKey).setOrigin(0.5, 1).setDepth(101 + sum(i));
        img.setScale(sc[1] / img.width);
        boardObjs.push(img);
      });
    });
    // クリーチャー
    for (let i = 0; i < 28; i++) {
      const o = st.owners[i];
      if (!o) continue;
      const { x, y } = proj(GEO[i][0], GEO[i][1]);
      const lift = (o.level - 1) * 7;
      const bid = o.creature.replace(/_f$/, '');
      const evo = bid !== o.creature || (o.level >= (st.evoLevel || 3) && st.catalog.CREATURES[bid].evo);
      const d = 101 + sum(i);
      makers.push(() => {
        boardObjs.push(scene.add.image(x, y - lift, 'pwShadow').setOrigin(0.5, 0.5).setDisplaySize(64, 20).setDepth(100 + sum(i)));
      });
      if (HAS_ART.has(bid)) {
        const texKey = 'pwCre_' + (evo ? 'e_' : 'c_') + bid;
        jobs.push(pngTexture(texKey, '/assets/' + (evo ? 'e_' : 'c_') + bid + '.png'));
        makers.push(() => {
          if (!scene.textures.exists(texKey)) return;
          const img = scene.add.image(x, y - lift + 6, texKey).setOrigin(0.5, 1).setDepth(d);
          img.setScale(80 / img.width);
          creatureSprites[i] = img;   // 2C演出(出現ポップ・発光・反動)の対象
          boardObjs.push(img);
        });
      } else {
        // アート無しは色トークン(DOMの.tokと同等)
        const c = st.catalog.CREATURES[o.creature];
        const colHex = ({ fire: 0xFF7A45, water: 0x56A8E8, earth: 0x7FD35C, wind: 0x5BE0D0 })[c.elem] || 0x6E7288;
        makers.push(() => {
          const g = scene.add.graphics().setDepth(d);
          g.fillStyle(colHex, 1); g.fillCircle(x, y - lift + 6 - 32, 32);
          g.lineStyle(3, 0x2C2A4A, 1); g.strokeCircle(x, y - lift + 6 - 32, 32);
          boardObjs.push(g);
          boardObjs.push(scene.add.text(x, y - lift + 6 - 32, c.name.slice(0, 4),
            { fontFamily: 'sans-serif', fontSize: '15px', color: '#F6EFDD' }).setOrigin(0.5, 0.5).setDepth(d));
        });
      }
    }
    // 通行料・呪いバッジ(配置計算はDOMと共有)
    for (const b of buildTollBadges(st)) {
      if (b.icon) { jobs.push(pngTexture('pwImg_ic_curse', '/assets/ic_curse.png')); }
      makers.push(() => boardObjs.push(makeBadge(b)));
    }

    Promise.all(jobs).then(() => {
      if (gen !== boardGen || !scene) {   // 古い世代: 生成したテクスチャだけ掃除して破棄
        newTileTex.forEach(k => { if (scene && scene.textures.exists(k)) scene.textures.remove(k); });
        return;
      }
      boardObjs.forEach(ob => { try { ob.destroy(); } catch (e) {} });
      boardObjs = [];
      Object.keys(creatureSprites).forEach(k => delete creatureSprites[k]);
      tileTexKeys.forEach(k => { if (scene.textures.exists(k)) scene.textures.remove(k); });
      tileTexKeys = newTileTex;
      makers.forEach(fn => { try { fn(); } catch (e) {} });
    });
  }

  function makeBadge(b) {
    const cont = scene.add.container(b.x, b.y).setDepth(b.z);
    const txt = scene.add.text(b.icon ? 8 : 0, 0, b.text,
      { fontFamily: 'sans-serif', fontSize: '13px', fontStyle: '700', color: '#fff' }).setOrigin(0.5, 0.5);
    txt.setShadow(0, 1, 'rgba(0,0,0,.45)', 2);
    const w = txt.width + (b.icon ? 34 : 22), h = 19, sk = 2;  // skewX(-6deg)相当の平行四辺形
    const col = hexInt(b.color);
    const g = scene.add.graphics();
    g.fillStyle(col, 1);
    g.beginPath();
    g.moveTo(-w / 2 + sk, -h / 2); g.lineTo(w / 2 + sk, -h / 2);
    g.lineTo(w / 2 - sk, h / 2); g.lineTo(-w / 2 - sk, h / 2);
    g.closePath(); g.fillPath();
    g.lineStyle(1, 0xffffff, 0.5); g.strokePath();
    cont.add(g);
    if (b.icon && scene.textures.exists('pwImg_ic_curse')) {
      const ic = scene.add.image(-w / 2 + 12, 0, 'pwImg_ic_curse').setOrigin(0.5, 0.5);
      ic.setScale(13 / ic.height);
      cont.add(ic);
    }
    cont.add(txt);
    return cont;
  }

  // ===== コマ =====
  function syncPawns(layout) {
    if (failed) return;
    if (!ready) { pendingLayout = layout; return; }
    for (const it of layout) {
      let P = pawns[it.id];
      if (!P) {
        P = pawns[it.id] = { spr: null, sh: scene.add.image(it.x, it.y - 5, 'pwShadow').setOrigin(0.5, 0.5).setDisplaySize(40, 13), tex: null, x: it.x, y: it.y, tw: null };
      }
      if (it.charId && P.tex !== 'pw_' + it.charId && P.tex !== 'loading_' + it.charId) {
        P.tex = 'loading_' + it.charId;
        pngTexture('pw_' + it.charId, '/assets/p_' + it.charId + '.png').then(k => {
          if (!k || pawns[it.id] !== P) return;
          if (P.spr) P.spr.destroy();
          P.spr = scene.add.image(P.x, P.y, k).setOrigin(0.5, 1);
          P.tex = k;
          place(P, P.x, P.y, it);
        });
      }
      const moved = Math.hypot(it.x - P.x, it.y - P.y) > 2;
      if (!moved) {
        // 目標が変わらない再描画(HUD更新など)では進行中のホップを殺さない
        if (!P.tw) place(P, it.x, it.y, it);
        P.x = it.x; P.y = it.y;
        continue;
      }
      if (P.tw) { P.tw.remove(); P.tw = null; }
      if (P.spr) {
        // 2B 移動ジュース: 出発で縦に縮み→上昇で伸び→着地で1回潰れる+影は空中で小さく薄く
        // GAME_TIMING.stepMsは変更せず、tweenは既存の1歩時間内に完了させる(plan §6)
        const sx = P.x, sy = P.y, dist = Math.hypot(it.x - sx, it.y - sy);
        const juice = quality !== 'lite';
        P.tw = scene.tweens.addCounter({
          from: 0, to: 1, duration: Math.min(GAME_TIMING.stepMs - 30, 220), ease: 'Sine.easeInOut',
          onUpdate: tw => {
            const v = tw.getValue();
            const air = Math.sin(Math.PI * v);
            let d = { sx: 1, sy: 1, air };
            if (juice) {
              if (v < 0.18) { const k = 1 - v / 0.18; d = { sx: 1 + 0.04 * k, sy: 1 - 0.06 * k, air }; }
              else if (v < 0.75) { d = { sx: 1 - 0.03 * air, sy: 1 + 0.06 * air, air }; }
              else { const k = Math.sin(Math.PI * (v - 0.75) / 0.25); d = { sx: 1 + 0.05 * k, sy: 1 - 0.07 * k, air }; }
            }
            place(P, sx + (it.x - sx) * v, sy + (it.y - sy) * v - air * Math.min(20, dist * 0.35), it, d);
          },
          onComplete: () => {
            P.tw = null;
            place(P, it.x, it.y, it);
            if (dist > 8) dustBurst(it.x, it.y, 3, 0xB8AE8F, it.z + 1);  // 着地の小粒子(品質係数・liteは0)
          },
        });
      } else {
        place(P, it.x, it.y, it);
      }
      P.x = it.x; P.y = it.y;
    }
  }
  function place(P, x, y, it, d) {
    if (P.spr) {
      const base = it.w / P.spr.width;
      P.spr.setPosition(x, y).setDepth(it.z);
      P.spr.setScale(base * (d ? d.sx : 1), base * (d ? d.sy : 1));
    }
    const air = d ? d.air : 0;
    P.sh.setPosition(x, y - 5).setDepth(it.zs != null ? it.zs : it.z - 2);
    P.sh.setDisplaySize(40 * (1 - 0.35 * air), 13 * (1 - 0.35 * air));
    P.sh.setAlpha(1 - 0.5 * air);
  }

  // ===== カメラ(setZoom契約: null=全景 / タイル番号=1.5倍ズーム) =====
  function setCamera(ti) {
    if (!ready) return;
    const target = ti === null || ti === undefined ? 'fit' : 'z' + ti;
    if (target === camTarget) return;
    camTarget = target;
    const cam = scene.cameras.main;
    if (target === 'fit') {
      cam.pan(640, 452.5, 850, 'Cubic.easeOut');
      cam.zoomTo(1, 850, 'Cubic.easeOut');
    } else {
      const { x, y } = proj(GEO[ti][0], GEO[ti][1]);
      cam.pan(x, y + 24, 850, 'Cubic.easeOut');   // マスを画面中央やや上(DOM版の46%相当)に
      cam.zoomTo(1.5, 850, 'Cubic.easeOut');
    }
  }

  // ===== 座標変換(DOMオーバーレイ用の画面px) =====
  function worldToViewport(wx, wy) {
    if (!ready || !game || !game.canvas) return { x: -9999, y: -9999 };
    const cam = scene.cameras.main;
    const wv = cam.worldView;
    const r = game.canvas.getBoundingClientRect();
    return { x: r.left + (wx - wv.x) / wv.width * r.width, y: r.top + (wy - wv.y) / wv.height * r.height };
  }
  function pawnViewport(pid) {
    const P = pawns[pid];
    if (!P) return null;
    return worldToViewport(P.x, P.y - 20);
  }

  // ===== マスFX(fxAt同等) =====
  function fx(i, cls, color, dy = 0) {
    if (!ready) return;
    const { x, y } = proj(GEO[i][0], GEO[i][1]);
    const col = hexInt(color);
    if (cls === 'fxRing') {
      const g = scene.add.graphics().setDepth(300);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 900, ease: 'Cubic.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          g.lineStyle(1 + 4 * (1 - v), col, 1 - v);
          g.strokeEllipse(x, y + dy, 30 + 130 * v, (30 + 130 * v) * 0.55); },
        onComplete: () => g.destroy() });
    } else if (cls === 'fxPillar') {
      const g = scene.add.graphics().setDepth(300);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 1200, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          g.fillStyle(col, 0.35 * (1 - v));
          g.fillRect(x - 26, y + dy - 170 * v, 52, 170 * v); },
        onComplete: () => g.destroy() });
      for (let k = 0; k < 10; k++) {
        const p = scene.add.circle(x + (Math.random() * 56 - 28), y + dy, 2 + Math.random() * 2, col).setDepth(301);
        scene.tweens.add({ targets: p, y: p.y - 110 - Math.random() * 70, alpha: 0,
          duration: 900 + Math.random() * 400, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
      }
    } else if (cls === 'fxBolt') {
      pngTexture('pwImg_ic_curse', '/assets/ic_curse.png').then(k => {
        if (!k || !scene) return;
        const s = scene.add.image(x, y + dy - 100, k).setOrigin(0.5, 0.5).setDepth(301);
        s.setScale(58 / s.height);
        scene.tweens.add({ targets: s, y: y + dy - 34, duration: 420, ease: 'Bounce.easeOut',
          onComplete: () => scene.tweens.add({ targets: s, alpha: 0, duration: 600, delay: 350, onComplete: () => s.destroy() }) });
      });
    }
  }

  // 描画内容の検証用(パリティテスト・デバッグ)
  function snapshot() {
    return new Promise(res => {
      if (!ready || !game) return res(null);
      game.renderer.snapshot(img => res(img && img.src ? img.src : null));
    });
  }
  function debugCounts() {
    if (!ready) return null;
    return { children: scene.children.length, pawns: Object.keys(pawns).length,
             boardObjs: boardObjs.length, zoom: scene.cameras.main.zoom };
  }
  // 非表示タブ(RAF停止)でも検証できるようループを手動で進める(テスト用)
  // 注意(Phaser 4): tween/カメラ効果は実時間基準のため、合成時刻での早送りは効かない。
  // 検証時は「実時間で待ちながら pump(2) を繰り返す」こと(時刻は単調増加を維持)
  let pumpT = 0;
  function pump(frames = 60) {
    if (!ready || !game) return;
    pumpT = Math.max(pumpT, performance.now());
    for (let k = 0; k < frames; k++) { pumpT += 16.7; game.loop.step(pumpT); }
  }
  return { init, syncBoard, syncPawns, setCamera, worldToViewport, pawnViewport, fx,
           snapshot, debugCounts, pump, isReady: () => ready, hasFailed: () => failed,
           // Phase 2A: 演出基盤
           play, shake, fxDebug, setQuality, setReduceFx,
           getQuality: () => ({ quality, reduceFx }),
           _debugScene: () => scene };  // 診断用(製品コードからは使用しない)
})();
