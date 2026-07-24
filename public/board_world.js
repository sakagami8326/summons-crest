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
  let tileTexKeys = [];                             // 現行世代のタイルテクスチャ
  const pawns = {};                                 // id → { spr, sh, tex, x, y, tw }
  const texPromises = {};
  let camTarget = 'none';                           // カメラの現在目標(同一目標への再tween防止)

  const sum = i => GEO[i][0] + GEO[i][1];

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
          const forceCanvas = new URLSearchParams(location.search).get('gl') === '0';  // 検証用: ?gl=0でCanvas強制
          game = new Phaser.Game({
            type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO, parent: 'phaserHost', width: 1280, height: 905,
            transparent: true, banner: false,
            scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
            scene: {
              create: function () {
                scene = this;
                makeShadowTex();
                ready = true;
                clearTimeout(wd);
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
    const col = Phaser.Display.Color.HexStringToColor(b.color).color;
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
      if (P.tw) { P.tw.remove(); P.tw = null; }
      if (moved && P.spr) {
        const sx = P.x, sy = P.y, dist = Math.hypot(it.x - sx, it.y - sy);
        P.tw = scene.tweens.addCounter({
          from: 0, to: 1, duration: Math.min(GAME_TIMING.stepMs - 30, 220), ease: 'Sine.easeInOut',
          onUpdate: tw => {
            const v = tw.getValue();
            place(P, sx + (it.x - sx) * v, sy + (it.y - sy) * v - Math.sin(Math.PI * v) * Math.min(20, dist * 0.35), it);
          },
          onComplete: () => { P.tw = null; place(P, it.x, it.y, it); },
        });
      } else {
        place(P, it.x, it.y, it);
      }
      P.x = it.x; P.y = it.y;
    }
  }
  function place(P, x, y, it) {
    if (P.spr) {
      P.spr.setPosition(x, y).setDepth(it.z);
      P.spr.setScale(it.w / P.spr.width);
    }
    P.sh.setPosition(x, y - 5).setDepth(100 + Math.floor(it.z) - 102);
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
    const col = Phaser.Display.Color.HexStringToColor(color || '#F2D062').color;
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
  function pump(frames = 60) {
    if (!ready || !game) return;
    const t0 = performance.now();
    for (let k = 0; k < frames; k++) game.loop.step(t0 + k * 16.7);
  }
  return { init, syncBoard, syncPawns, setCamera, worldToViewport, pawnViewport, fx,
           snapshot, debugCounts, pump, isReady: () => ready, hasFailed: () => failed };
})();
