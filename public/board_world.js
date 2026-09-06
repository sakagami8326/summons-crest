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
  let presentationSpeed = 1;

  const sum = i => GEO[i][0] + GEO[i][1];
  // '#RRGGBB' → 数値。Phaserの色変換APIに依存しない(v3/v4差異の影響を受けない)
  const hexInt = s => parseInt(String(s || '#F2D062').replace('#', ''), 16);

  // v1.37: テレビ演出はStandard品質・演出低減なしへ固定する。
  const quality = 'standard';
  const reduceFx = false;
  const qf = () => 0.65;

  // ===== 属性エフェクト素材基盤(発注書v0.75 §3 / M2) =====
  // 参照はfx_manifest.jsのFX_ASSETS経由のみ。未配置・読込失敗はGraphicsへフォールバック
  const ELEM_FX_GROUP = { fire: 'fire', water: 'water', earth: 'earth', wind: 'wind' };
  const fxTexOk = new Set();     // 読込成功したテクスチャキー
  function fxAssetUrl(group, key) {
    if (typeof FX_ASSETS === 'undefined') return null;
    const m = FX_ASSETS[group];
    if (!m) return null;
    const v = m[key];
    if (Array.isArray(v)) return v[Math.floor(Math.random() * v.length)] || null;
    return v || null;
  }
  // 起動時に全素材の読込を試みる(欠損はSceneを失敗させず黙って無視 ─ §3.4)
  function preloadFxAssets() {
    if (typeof FX_ASSETS === 'undefined') return;
    for (const m of Object.values(FX_ASSETS))
      for (const v of Object.values(m))
        for (const url of (Array.isArray(v) ? v : [v])) {
          const tk = 'pwFx_' + url;
          pngTexture(tk, url).then(k => { if (k) fxTexOk.add(tk); }).catch(() => {});
        }
  }
  // 同期参照(読込済みのみ返す)。elemはfire等のゲーム属性、なければneutral/commonを直接指定
  function fxTexKey(group, key) {
    const url = fxAssetUrl(ELEM_FX_GROUP[group] || group, key);
    if (!url) return null;
    const tk = 'pwFx_' + url;
    return fxTexOk.has(tk) && scene && scene.textures.exists(tk) ? tk : null;
  }
  // 画像粒子プール(素材到着後に使用。未着時はdustPoolの円で代替)
  const fxImgPool = [];
  let fxImgActive = 0;
  const FX_IMG_POOL_MAX = 40;
  function acquireFxImg(texKey) {
    let s = fxImgPool.pop();
    if (!s) s = scene.add.image(0, 0, texKey);
    else s.setTexture(texKey);
    s.setVisible(true).setActive(true).setAlpha(1).setScale(1).setRotation(0);
    fxImgActive++;
    return s;
  }
  function releaseFxImg(s) {
    fxImgActive = Math.max(0, fxImgActive - 1);
    s.setVisible(false).setActive(false);
    if (fxImgPool.length < FX_IMG_POOL_MAX) fxImgPool.push(s);
    else s.destroy();
  }
  // 単発の画像フラッシュ(summon/impact/disperse等の中心表示)。テクスチャ未着ならfalse
  function fxImageFlash(group, key, x, y, opt) {
    const tk = fxTexKey(group, key);
    if (!tk) return false;
    const o = opt || {};
    const s = acquireFxImg(tk);
    s.setPosition(x, y).setDepth(o.depth != null ? o.depth : 320);
    const w = o.width || 90;
    s.setScale((w / s.width) * (o.from != null ? o.from : 0.5));
    s.setAlpha(0);
    scene.tweens.addCounter({ from: 0, to: 1, duration: o.ms || 450, ease: 'Sine.easeOut',
      onUpdate: tw => { const v = tw.getValue();
        if (!s.active) return;
        s.setScale((w / s.width) * ((o.from != null ? o.from : 0.5) + ((o.to != null ? o.to : 1) - (o.from != null ? o.from : 0.5)) * v));
        s.setAlpha(Math.sin(Math.PI * v) * (o.alpha || 0.95)); },
      onComplete: () => releaseFxImg(s) });
    return true;
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
    // ===== Phase 2D: 連鎖の順次発光(plan §8.2-8.3) =====
    'chain-glow': fx2dChain,
    // ===== Phase 2E: 侵略結果の盤面演出(plan §9) =====
    'invade-fx': fx2eInvade,
    'defend-fx': fx2eDefend,
    // 結界の衝撃時発光(plan §8.4 ─ v0.73)
    'barrier-flash': fx2dBarrierFlash,
    // スペルの盤面演出(発注書v0.75 §7 ─ M3第1群)
    'spell-fx': fxSpell,
    // 勝利演出(発注書v0.75 §9 ─ M7)
    'victory-glow': fxVictoryGlow,
    'victory-castle': fxVictoryCastle,
  };

  // 勝利§9.2-4〜5: 勝者の所有領地だけを盤面順に弱く発光→光を城へ収束(Liteは省略 ─ §9.5)
  async function fxVictoryGlow(ev) {
    if (quality === 'lite') return;
    const castle = ev.castle;
    const pc = castle != null && GEO[castle] ? proj(GEO[castle][0], GEO[castle][1]) : null;
    const col = hexInt(ev.color || '#F2D062');
    const tiles = (ev.tiles || []).filter(t2 => GEO[t2]);
    for (const t2 of tiles) {
      const pz = proj(GEO[t2][0], GEO[t2][1]);
      const g = scene.add.graphics().setDepth(330);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 700, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          const a = 0.6 * Math.sin(Math.PI * v);
          g.lineStyle(3.5, col, a); g.strokeEllipse(pz.x, pz.y, 105 + 28 * v, (105 + 28 * v) * 0.55);
          g.fillStyle(col, a * 0.25); g.fillEllipse(pz.x, pz.y, 110, 60); },
        onComplete: () => g.destroy() });
      if (pc) projectile({ x: pz.x, y: pz.y - 10 }, { x: pc.x, y: pc.y - 24 }, col, 800);
      await wait(120);
    }
    await wait(800);
  }
  // 勝利§9.2-7: 城から金色の光柱と粒子
  async function fxVictoryCastle(ev) {
    const castle = ev.castle;
    if (castle == null || !GEO[castle]) return;
    const pc = proj(GEO[castle][0], GEO[castle][1]);
    if (quality !== 'lite') {
      fx(castle, 'fxPillar', '#F2D062', -20);
      fxImageFlash('common', 'victoryRing', pc.x, pc.y, { width: 230, ms: 1000, depth: 96, from: 0.4, to: 1.1 });
      fxImageFlash('common', 'sparkGold', pc.x, pc.y - 50, { width: 195, ms: 900, depth: 341 });
      elemBurst(pc.x, pc.y - 10, 0xF2D062, 12, true, 342);
      await wait(1300);
    } else await wait(400);
  }

  // ===== スペル演出プリミティブ(発注書§7.2) =====
  function casterPoint(pid) {
    const P = pid && pawns[pid];
    return P ? { x: P.x, y: P.y - 20 } : { x: 640, y: -40 };  // コマが無ければ画面外上から
  }
  // 弧を描いて飛ぶ投射体+短い軌跡
  function projectile(from, to, col, ms) {
    return new Promise(res => {
      const s = scene.add.circle(from.x, from.y, 6.5, col, 1).setDepth(340);
      const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - 60;
      let fr = 0;
      scene.tweens.addCounter({ from: 0, to: 1, duration: ms || 420, ease: 'Sine.easeIn',
        onUpdate: tw => { const v = tw.getValue(), u = 1 - v;
          s.setPosition(u * u * from.x + 2 * u * v * mx + v * v * to.x,
                        u * u * from.y + 2 * u * v * my + v * v * to.y);
          if ((fr++ % 3) === 0 && quality !== 'lite') {
            const t2 = scene.add.circle(s.x, s.y, 4, col, 0.7).setDepth(339);
            scene.tweens.add({ targets: t2, alpha: 0, duration: 260, onComplete: () => t2.destroy() });
          } },
        onComplete: () => { s.destroy(); res(); } });
    });
  }
  // 着弾(素材impact_small優先・なければリング+白閃)
  function impactAt(x, y, col, elem) {
    if (!fxImageFlash(elem, 'impactSmall', x, y, { width: 130, ms: 330, depth: 341 })) {
      const g = scene.add.graphics().setDepth(341);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 330, ease: 'Cubic.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          g.lineStyle(3 + 4 * (1 - v), col, 1 - v);
          g.strokeEllipse(x, y, 28 + 90 * v, (28 + 90 * v) * 0.55);
          g.fillStyle(0xFFFFFF, 0.5 * (1 - v));
          g.fillEllipse(x, y, 32 * (1 - v) + 6, (32 * (1 - v) + 6) * 0.55); },
        onComplete: () => g.destroy() });
    }
    elemBurst(x, y, col, 7, true, 342, elem);
  }
  // 亀裂: 中心から外周へ暗いライン(§7.3 地割れ/岩盤)
  function crackAt(x, y, ms) {
    const g = scene.add.graphics().setDepth(300);
    const arms = [];
    for (let k = 0; k < 6; k++)
      arms.push({ a: (k / 6) * Math.PI * 2 + Math.random() * 0.5, len: 40 + Math.random() * 32 });
    return new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: ms || 700, ease: 'Cubic.easeOut',
      onUpdate: tw => { const v = tw.getValue(); g.clear();
        const al = v < 0.7 ? 0.9 : 0.9 * (1 - (v - 0.7) / 0.3);
        g.lineStyle(3.5, 0x1A1620, al);
        for (const m of arms) {
          const L = m.len * Math.min(1, v * 1.6);
          g.beginPath(); g.moveTo(x, y);
          g.lineTo(x + Math.cos(m.a) * L * 0.5, y + Math.sin(m.a) * L * 0.28 + 3);
          g.lineTo(x + Math.cos(m.a) * L, y + Math.sin(m.a) * L * 0.55);
          g.strokePath();
        } },
      onComplete: () => { g.destroy(); res(); } }));
  }
  // 回復・強化の柔らかい明滅
  function pulseAt(x, y, col, ms) {
    const g = scene.add.graphics().setDepth(320);
    return new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: ms || 600, ease: 'Sine.easeInOut',
      onUpdate: tw => { const v = tw.getValue(); g.clear();
        const a = 0.5 * Math.sin(Math.PI * v);
        g.fillStyle(col, a * 0.4); g.fillEllipse(x, y, 130, 70);
        g.lineStyle(3, col, a); g.strokeEllipse(x, y, 100 + 30 * v, (100 + 30 * v) * 0.55); },
      onComplete: () => { g.destroy(); res(); } }));
  }
  function tintCreature(i, col, ms) {
    const spr = creatureSprites[i];
    if (spr && spr.scene && quality !== 'lite') {
      spr.setTint(col);
      setTimeout(() => { if (spr.scene) spr.clearTint(); }, ms || 450);
    }
  }
  // 転移(§7.3): 両マスに魔法陣→2体同時縮小→交差する光跡→再出現
  async function fxSwapTiles(tiles) {
    const [a, b] = tiles || [];
    if (a == null || b == null || !GEO[a] || !GEO[b]) return;
    const pa = proj(GEO[a][0], GEO[a][1]), pb = proj(GEO[b][0], GEO[b][1]);
    groundRipple(a, 0xC8BAE8, 600); groundRipple(b, 0xC8BAE8, 600);
    const sa = creatureSprites[a], sb = creatureSprites[b];
    const shrink = s => new Promise(res => {
      if (!s || !s.scene) return res();
      const base = s.scale;
      scene.tweens.addCounter({ from: 0, to: 1, duration: 260, ease: 'Sine.easeIn',
        onUpdate: tw => { const v = tw.getValue(); if (!s.scene) return;
          s.setScale(base * (1 - 0.9 * v)); s.setAlpha(1 - v); },
        onComplete: () => { if (s.scene) s.setScale(base); res(); } });
    });
    await Promise.all([shrink(sa), shrink(sb)]);
    await Promise.all([
      projectile({ x: pa.x, y: pa.y - 20 }, { x: pb.x, y: pb.y - 20 }, 0xC8BAE8, 420),
      projectile({ x: pb.x, y: pb.y - 20 }, { x: pa.x, y: pa.y - 20 }, 0xC8BAE8, 420),
    ]);
    await Promise.all([popInSprite(sa), popInSprite(sb)]);
    await wait(150);
  }
  // 風の渦(疾風・風向転換): 中心の周りを回る風粒子
  function windSwirl(x, y, ms, reverse) {
    const g = scene.add.graphics().setDepth(340);
    return new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: ms || 800, ease: 'Sine.easeInOut',
      onUpdate: tw => { const v = tw.getValue(); g.clear();
        const a = v < 0.75 ? 0.8 : 0.8 * (1 - (v - 0.75) / 0.25);
        const dir = reverse ? -1 : 1;
        for (let k = 0; k < 6; k++) {
          const an = dir * (v * 7 + k * Math.PI / 3);
          g.fillStyle(0x9FE8D8, a * (0.5 + 0.5 * Math.sin(an * 2)));
          g.fillCircle(x + Math.cos(an) * 38, y - 18 + Math.sin(an) * 18, 4);
        } },
      onComplete: () => { g.destroy(); res(); } }));
  }
  // 2マスを結ぶ線に沿ってクリーチャーが渡る(ムーブ)
  async function fxLinkMove(ev, col, band) {
    const [a, b] = ev.tiles || [];
    if (a == null || b == null || !GEO[a] || !GEO[b]) return;
    const pa = proj(GEO[a][0], GEO[a][1]), pb = proj(GEO[b][0], GEO[b][1]);
    const g = scene.add.graphics().setDepth(315);
    const draw = v => { g.clear();
      g.lineStyle(band ? 10 : 3, col, band ? 0.3 * v : 0.85 * v);
      g.beginPath(); g.moveTo(pa.x, pa.y - 8); g.lineTo(pb.x, pb.y - 8); g.strokePath();
      if (band) { g.lineStyle(2, col, 0.8 * v);
        g.beginPath(); g.moveTo(pa.x, pa.y - 8); g.lineTo(pb.x, pb.y - 8); g.strokePath(); } };
    await new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: 260,
      onUpdate: tw => draw(tw.getValue()), onComplete: res }));
    await projectile({ x: pa.x, y: pa.y - 16 }, { x: pb.x, y: pb.y - 16 }, col, 480);
    await new Promise(res => scene.tweens.addCounter({ from: 1, to: 0, duration: 300,
      onUpdate: tw => draw(tw.getValue()), onComplete: () => { g.destroy(); res(); } }));
    // 到着先の出現(空き地取得はstate反映済み → ポップ。戦闘時は戦闘演出に委ねる)
    if (!ev.battle) {
      const spr = creatureSprites[b];
      if (spr && spr.scene) await popInSprite(spr);
    }
  }
  // 一時ゴースト(羽休め・交代の旧クリーチャー)
  async function ghostOf(cid, x, y) {
    const bid = (cid || '').replace(/_f$/, '');
    if (!bid) return null;
    const evo = bid !== cid;
    const key = 'pwCre_' + (evo ? 'e_' : 'c_') + bid;
    await pngTexture(key, '/assets/' + (evo ? 'e_' : 'c_') + bid + '.png').catch(() => {});
    if (!scene || !scene.textures.exists(key)) return null;
    const s = scene.add.image(x, y + 6, key).setOrigin(0.5, 1).setDepth(333);
    s.setScale(80 / s.width);
    return s;
  }
  // タイルを一瞬覆う光(属性変更の切替被覆 ─ §7.4。stateは切替済みのため被覆のみの簡略版)
  function coverFlash(x, y, col, ms) {
    const g = scene.add.graphics().setDepth(316);
    return new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: ms || 700, ease: 'Sine.easeInOut',
      onUpdate: tw => { const v = tw.getValue(); g.clear();
        const a = Math.sin(Math.PI * v);
        g.fillStyle(col, a * 0.55); g.fillEllipse(x, y, DW + 10, DH + 6);
        g.fillStyle(0xFFFFFF, a * 0.3); g.fillEllipse(x, y, DW - 20, DH - 12); },
      onComplete: () => { g.destroy(); res(); } }));
  }

  // 第1群のスペル別シーケンス(§7.3・§7.5)
  async function fxSpell(ev) {
    const sid = ev.spell;
    if (sid === 'sp_move') return fxSwapTiles(ev.tiles);
    const from = casterPoint(ev.caster);
    const i = (ev.tiles || [])[0];
    const hasTile = i != null && !!GEO[i];
    // 術者中心のスペル(黄金・疾風・風向転換・血染めの刃・ひらめき)と
    // 自前でtiles配列を処理するスペル(バリア)以外は対象マス必須
    const needTile = !['sp_gold', 'sp_gale', 'sp_wind_shift', 'sp_bloodstained_blade',
                       'sp_insight', 'sp_ward'].includes(sid);
    if (needTile && !hasTile) return;
    const { x, y } = hasTile ? proj(GEO[i][0], GEO[i][1]) : { x: from.x, y: from.y };
    if (sid === 'ult_adel') {
      for (const ti of (ev.tiles || []).filter(t2 => GEO[t2])) {
        const pt = proj(GEO[ti][0], GEO[ti][1]);
        await coverFlash(pt.x, pt.y, 0x9BD8FF, 520);
        elemBurst(pt.x, pt.y, 0xD9F3FF, 7, true, 331, 'water');
        tintCreature(ti, 0xCDEEFF, 420);
        await wait(90);
      }
      return;
    } else if (sid === 'sp_weaken') {
      await projectile(from, { x, y: y - 14 }, 0x7A2EB8, 420);   // 暗紫projectile
      impactAt(x, y, 0x9B59D0, null);
      tintCreature(i, 0xB07AE0, 500);
      await wait(500);
    } else if (sid === 'sp_flame_vortex') {
      // 撃破時はstate上の所有者が既に消えているため、旧クリーチャーを炎演出中だけ復元する。
      const victim = (!creatureSprites[i] || !creatureSprites[i].scene) && ev.cid
        ? await ghostOf(ev.cid, x, y) : null;
      await projectile(from, { x, y: y - 10 }, 0xFF7A45, 420);   // 火種
      const g = scene.add.graphics().setDepth(330);              // 円形の炎(回転)
      await new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: 900, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          const a = v < 0.75 ? 0.85 : 0.85 * (1 - (v - 0.75) / 0.25);
          for (let k = 0; k < 8; k++) {
            const an = v * 6 + k * Math.PI / 4;
            g.fillStyle(0xFF7A45, a);
            g.fillCircle(x + Math.cos(an) * 48, y + Math.sin(an) * 26, 5.5);
          } },
        onComplete: () => { g.destroy(); res(); } }));
      tintCreature(i, 0xFFB08A, 400);
      if (victim) victim.setTint(0xFFB08A);
      elemBurst(x, y, 0xFF7A45, 6, true, 331, 'fire');
      await wait(200);
      if (victim) victim.destroy();
    } else if (sid === 'sp_root_prison') {
      const g = scene.add.graphics().setDepth(330);              // 四隅から根が中心へ
      const cs = [[-DW / 2 + 8, 0], [0, -DH / 2 + 5], [DW / 2 - 8, 0], [0, DH / 2 - 5]];
      await new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: 750, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          g.lineStyle(4.5, 0x6B4F2A, 0.95);
          for (const [dx2, dy2] of cs) {
            const sx = x + dx2, sy = y + dy2;
            g.beginPath(); g.moveTo(sx, sy);
            g.lineTo(sx + (x - sx) * v + Math.sin(v * 9) * 4, sy + (y - sy) * v);
            g.strokePath();
          } },
        onComplete: () => { g.destroy(); res(); } }));
      pulseAt(x, y, 0xD9B64F, 500);
      await wait(300);
    } else if (sid === 'sp_bedrock_uplift') {
      crackAt(x, y, 550);
      elemBurst(x, y, 0x8A7350, 8, true, 331, 'earth');          // 岩片が下から上へ
      await wait(350);
      await pulseAt(x, y, 0xD9B64F, 600);                        // 回復pulse
    } else if (sid === 'sp_quake') {
      await crackAt(x, y, 750);                                  // 亀裂→岩片・砂煙→段が沈む(SVGはstateで切替済み)
      dustBurst(x, y, 8, 0x9A8B6E, 331);
      shake(5, 220);
      await wait(300);
    } else if (sid === 'sp_feather_rest') {
      // 羽休め(§7.3): 風の光で包む→縮小・上昇・消滅(stateでは既に空き地 → ゴーストで再現)
      const gh = await ghostOf(ev.cid, x, y);
      windSwirl(x, y, 700);
      elemBurst(x, y, 0x9FE8D8, 8, true, 332, 'wind');
      if (gh) {
        await new Promise(res => scene.tweens.add({ targets: gh, y: gh.y - 46, alpha: 0,
          scaleX: gh.scaleX * 0.55, scaleY: gh.scaleY * 0.55,
          duration: 750, ease: 'Sine.easeIn', onComplete: () => { gh.destroy(); res(); } }));
      } else await wait(750);
      await wait(200);
    } else if (sid === 'sp_swap') {
      // 交代(§7.3): 旧を暗転縮小して捨て札方向へ→新を配置演出(直列)
      const gh = await ghostOf(ev.cid, x, y);
      const spr = creatureSprites[i];
      if (spr && spr.scene) spr.setAlpha(0);   // 新クリーチャーは旧退場まで隠す
      if (gh) {
        gh.setTint(0x555566);
        await new Promise(res => scene.tweens.add({ targets: gh, y: gh.y + 10, alpha: 0,
          scaleX: gh.scaleX * 0.5, scaleY: gh.scaleY * 0.5,
          duration: 520, ease: 'Sine.easeIn', onComplete: () => { gh.destroy(); res(); } }));
      } else await wait(400);
      if (!fxImageFlash('neutral', 'summon', x, y, { width: 155, ms: 550, depth: 96 }))
        groundRipple(i, 0xD8D2E8, 600);
      convergeBurst(x, y, 0xD8D2E8, 8);
      await wait(240);
      if (spr) await popInSprite(spr);
      await wait(150);
    } else if (sid === 'sp_high_tide') {
      // 満ち潮(§7.3): 外周を一周する波+水滴の立ち上り
      const g = scene.add.graphics().setDepth(330);
      await new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: 950, ease: 'Sine.easeInOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          const a = v < 0.8 ? 0.85 : 0.85 * (1 - (v - 0.8) / 0.2);
          const an = v * Math.PI * 2 - Math.PI / 2;
          for (let k = 0; k < 5; k++) {
            const a2 = an - k * 0.22;
            g.fillStyle(0x56A8E8, a * (1 - k * 0.17));
            g.fillCircle(x + Math.cos(a2) * (DW / 2 - 2), y + Math.sin(a2) * (DH / 2 - 1), 5 - k * 0.6);
          } },
        onComplete: () => { g.destroy(); res(); } }));
      elemBurst(x, y, 0x56A8E8, 6, true, 331, 'water');
      await wait(200);
    } else if (sid === 'sp_ward') {
      // 加護(§7.3): 自領地を盤面順に弱発光+結界輪(以降の常時表示は既存結界枠)
      const tiles = (ev.tiles || []).filter(t2 => GEO[t2]);
      for (const t2 of tiles) {
        const pz = proj(GEO[t2][0], GEO[t2][1]);
        const g = scene.add.graphics().setDepth(330);
        scene.tweens.addCounter({ from: 0, to: 1, duration: 650, ease: 'Sine.easeOut',
          onUpdate: tw => { const v = tw.getValue(); g.clear();
            const a = 0.8 * Math.sin(Math.PI * v);
            g.lineStyle(3.5, 0xBFEFFF, a);
            g.strokeEllipse(pz.x, pz.y, 95 + 36 * v, (95 + 36 * v) * 0.55); },
          onComplete: () => g.destroy() });
        await wait(130);
      }
      await wait(500);
    } else if (ev.elem && (sid === 'sp_volcanic_core' || sid === 'sp_abyssal_pearl' ||
                           sid === 'sp_earth_mother_stone' || sid === 'sp_sky_crystal')) {
      // 属性変更4種(§7.3/§7.4): 導入FX→光の被覆→(SVGはstate反映済み)→属性バースト
      const ecol = elemCol(ev.elem);
      if (sid === 'sp_volcanic_core') { await projectile(from, { x, y: y - 8 }, ecol, 420); crackAt(x, y, 500); }
      else if (sid === 'sp_abyssal_pearl') { await projectile({ x, y: y - 140 }, { x, y: y - 8 }, ecol, 380); groundRipple(i, ecol, 500); }
      else if (sid === 'sp_earth_mother_stone') { convergeBurst(x, y, ecol, 10); await wait(380); }
      else { await projectile({ x: x + 90, y: y - 150 }, { x, y: y - 8 }, ecol, 380); windSwirl(x, y, 450); }
      await coverFlash(x, y, ecol, 650);
      elemBurst(x, y, ecol, 9, true, 331, ev.elem);
      await wait(250);
    } else if (sid === 'sp_step') {
      await fxLinkMove(ev, 0xD8D2E8, false);   // 細い線で接続して移動(§7.3)
    } else if (sid === 'sp_gold') {
      // 黄金(§7.3): コマ付近に金色ルーン+金粒子(獲得額はバナー=DOM)
      pulseAt(from.x, from.y + 14, 0xF2D062, 700);
      elemBurst(from.x, from.y, 0xF2D062, 10, true, 341);
      fxImageFlash('common', 'sparkGold', from.x, from.y - 10, { width: 90, ms: 600, depth: 342 });
      await wait(800);
    } else if (sid === 'sp_gale') {
      await windSwirl(from.x, from.y, 800);            // 疾風(§7.3): コマ周囲の旋風(ダイス2個はDOM)
    } else if (sid === 'sp_wind_shift') {
      await windSwirl(from.x, from.y, 900, true);      // 風向転換(§7.3): 逆回りの風
    } else if (sid === 'sp_bloodstained_blade') {
      // 血染めの刃(§7.3): コマ付近に暗赤の刃(斜めの閃線2本)
      const g = scene.add.graphics().setDepth(341);
      await new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: 650, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          const a = v < 0.7 ? 0.9 : 0.9 * (1 - (v - 0.7) / 0.3);
          g.lineStyle(3, 0xA32020, a);
          const L = 30 * Math.min(1, v * 1.8);
          g.beginPath(); g.moveTo(from.x - L, from.y - 10 + L * 0.6); g.lineTo(from.x + L, from.y - 10 - L * 0.6); g.strokePath();
          g.lineStyle(2, 0xE05050, a * 0.8);
          g.beginPath(); g.moveTo(from.x - L * 0.7, from.y - 4 - L * 0.5); g.lineTo(from.x + L * 0.7, from.y - 4 + L * 0.5); g.strokePath(); },
        onComplete: () => { g.destroy(); res(); } }));
    } else if (sid === 'sp_insight') {
      // ひらめき(§7.3): 白金の閃き(カード裏の飛翔はDOM側 ─ 中身はTVに出さない)
      pulseAt(from.x, from.y, 0xEDE6F8, 550);
      elemBurst(from.x, from.y - 6, 0xEDE6F8, 7, true, 341);
      await wait(650);
    }
  }

  // 結界(§8.4): 侵略を阻んだ瞬間だけ強く発光する輪(常時表示の結界枠はタイル側で描画済み)
  async function fx2dBarrierFlash(ev) {
    const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]);
    const col = 0x9BD8FF;
    for (let k = 0; k < 2; k++) {
      const g = scene.add.graphics().setDepth(322);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 620, ease: 'Cubic.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          const a = 0.95 * (1 - v);
          g.lineStyle(4 + 6 * (1 - v), col, a);
          g.strokeEllipse(x, y, 80 + 150 * v, (80 + 150 * v) * 0.55);
          g.fillStyle(col, a * 0.22); g.fillEllipse(x, y, 122, 66); },
        onComplete: () => g.destroy() });
      await wait(200);
    }
    elemBurst(x, y, col, 7, true, 323);
    await wait(600);
  }

  // 小さな反動(防衛成功: 潰れ→わずかに伸びて戻る)
  function recoilSprite(spr, dur) {
    return new Promise(res => {
      if (!spr || !spr.scene) return res();
      const base = spr.scale;
      scene.tweens.addCounter({ from: 0, to: 1, duration: dur || 340, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue();
          if (!spr.scene) return;
          const s = v < 0.45 ? 1 - 0.1 * Math.sin(Math.PI * v / 0.45)
                             : 1 + 0.05 * Math.sin(Math.PI * (v - 0.45) / 0.55);
          spr.setScale(base * s); },
        onComplete: () => { if (spr.scene) spr.setScale(base); res(); } });
    });
  }

  // 侵略成功(§9): 攻撃属性の命中余韻バースト→勝者色の波紋→新クリーチャーのポップ
  // (所有色・クリーチャーはstate同期のsyncBoardが既に反映済み ─ 演出は余韻のみ)
  async function fx2eInvade(ev) {
    const col = elemCol(ev.element);
    const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]);
    fxImageFlash(ev.element, 'impactLarge', x, y - 10, { width: 185, ms: 380, depth: 332 });  // 支給素材があれば命中画像
    elemBurst(x, y, col, 12, true, 331, ev.element);
    shake(4, 180);
    await wait(250);
    groundRipple(ev.tile, hexInt(ev.color || '#F2D062'), 700);
    const spr = await waitCreature(ev.tile, 10);
    if (spr) await popSprite(spr, 420);
    await wait(300);
  }

  // 防衛成功(§9): 防御側クリーチャーの小さな反動+防御属性の残光
  async function fx2eDefend(ev) {
    const col = elemCol(ev.element);
    const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]);
    const spr = creatureSprites[ev.tile];
    if (spr && spr.scene) recoilSprite(spr);
    const g = scene.add.graphics().setDepth(298);
    await new Promise(res => scene.tweens.addCounter({ from: 0, to: 1, duration: 900, ease: 'Sine.easeOut',
      onUpdate: tw => { const v = tw.getValue(); g.clear();
        const a = 0.5 * (1 - v);
        g.fillStyle(col, a * 0.5); g.fillEllipse(x, y, 135, 74);
        g.lineStyle(3, col, a); g.strokeEllipse(x, y, 120 + 40 * v, (120 + 40 * v) * 0.55); },
      onComplete: () => { g.destroy(); res(); } }));
    elemBurst(x, y, col, 5, true, 331);
    await wait(200);
  }

  // 連鎖(§8.2): 実対象を盤面順に強く発光させ、粒子と二重リングで成立を明示する。
  // 減少(§8.3)は従来どおり控えめにする。
  async function fx2dChain(ev) {
    const tiles = (ev.tiles || []).filter(i => GEO[i]);
    if (!tiles.length) return;
    const col = elemCol(ev.element);
    const peak = ev.dim ? 0.28 : 0.9;
    for (const i of tiles) {
      const { x, y } = proj(GEO[i][0], GEO[i][1]);
      const g = scene.add.graphics().setDepth(298);
      scene.tweens.addCounter({ from: 0, to: 1, duration: ev.dim ? 620 : 820, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          const a = peak * Math.sin(Math.PI * v);
          g.fillStyle(col, a * (ev.dim ? 0.5 : 0.72)); g.fillEllipse(x, y, 130, 72);
          g.lineStyle(ev.dim ? 3 : 5, col, a); g.strokeEllipse(x, y, 128 + 42 * v, (128 + 42 * v) * 0.55);
          if (!ev.dim) { g.lineStyle(2, 0xffffff, a * 0.8); g.strokeEllipse(x, y, 96 + 58 * v, (96 + 58 * v) * 0.55); } },
        onComplete: () => g.destroy() });
      if (!ev.dim) elemBurst(x, y - 3, col, 7, true, 320, ev.element);
      await wait(ev.dim ? 140 : 110);
    }
    await wait(480);
  }

  // ---- 2C共通ヘルパー ----
  const ELEM_COL = { fire: 0xFF7A45, water: 0x56A8E8, earth: 0xD9B64F, wind: 0x5BE0D0 };
  const elemCol = e => ELEM_COL[e] || 0xD8D2E8;
  const wait = ms => new Promise(res => setTimeout(res, GAME_TIMING.scaled(ms, presentationSpeed)));
  // 属性色の粒子を放射(pool再利用。上方向up=trueで立ち上る)
  // elem指定時、支給素材(particle_01〜04)が読込済みなら画像粒子を使う(M2 ─ 未着はGraphics円)
  function elemBurst(x, y, col, base, up, depth, elem) {
    if (!ready || quality === 'lite') return;
    const n = Math.max(2, Math.round(base * qf()));
    for (let k = 0; k < n; k++) {
      const sx = x + (Math.random() * 36 - 18), sy = y - (up ? 10 : 2);
      const dx = Math.random() * 40 - 20;
      const dy = up ? -(30 + Math.random() * 50) : (8 + Math.random() * 14);
      const dur = 500 + Math.random() * 300;
      const tk = elem ? fxTexKey(elem, 'particles') : null;
      if (tk) {
        const s = acquireFxImg(tk);
        s.setPosition(sx, sy).setDepth(depth != null ? depth : 320);
        const w = 15 + Math.random() * 13;
        s.setScale(w / s.width).setRotation(Math.random() * Math.PI * 2);
        scene.tweens.addCounter({ from: 0, to: 1, duration: dur, ease: 'Sine.easeOut',
          onUpdate: tw => { const v = tw.getValue();
            if (!s.active) return;
            s.setPosition(sx + dx * v * 0.6, sy + dy * v);
            s.setAlpha(0.95 * (1 - v)); },
          onComplete: () => releaseFxImg(s) });
        continue;
      }
      const p = acquireDust();
      p.setPosition(sx, sy);
      p.setFillStyle(col, 0.9);
      p.setRadius(2.5 + Math.random() * 3);
      p.setDepth(depth != null ? depth : 320);
      scene.tweens.addCounter({
        from: 0, to: 1, duration: dur, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); p.setPosition(p.x + dx * 0.045, sy + dy * v * 1.4); p.setAlpha(0.9 * (1 - v)); },
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
        g.lineStyle(3 + 4 * (1 - v), col, 0.9 * (1 - v));
        g.strokeEllipse(x, y, 30 + 140 * v, (30 + 140 * v) * 0.55);
        g.lineStyle(2, col, 0.5 * (1 - v));
        g.strokeEllipse(x, y, 16 + 85 * v, (16 + 85 * v) * 0.55); },
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

  // 収束粒子(発注書v0.75 §4.2-3: マス外周から中心へ属性粒子を収束)
  function convergeBurst(x, y, col, base, depth) {
    if (!ready || quality === 'lite') return;
    const n = Math.max(2, Math.round(base * qf()));
    for (let k = 0; k < n; k++) {
      const p = acquireDust();
      const a = Math.random() * Math.PI * 2;
      const sx = x + Math.cos(a) * (64 + Math.random() * 22), sy = y + Math.sin(a) * (34 + Math.random() * 12);
      p.setPosition(sx, sy);
      p.setFillStyle(col, 0);
      p.setRadius(2.5 + Math.random() * 2.5);
      p.setDepth(depth != null ? depth : 318);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 300 + Math.random() * 160, ease: 'Sine.easeIn',
        onUpdate: tw => { const v = tw.getValue();
          p.setPosition(sx + (x - sx) * v, sy + (y - 6 - sy) * v);
          p.setAlpha(Math.min(1, v * 2) * 0.9); },
        onComplete: () => releaseDust(p) });
    }
  }
  // 出現ポップ(§4.2-4〜6: Alpha0/Scale0.80 → 230msで1.05 → 150msで1.00)
  function popInSprite(spr) {
    return new Promise(res => {
      if (!spr || !spr.scene) return res();
      const base = spr.scale;
      spr.setAlpha(0); spr.setScale(base * 0.8);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 230, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); if (!spr.scene) return;
          spr.setAlpha(v); spr.setScale(base * (0.8 + 0.25 * v)); },
        onComplete: () => {
          if (!spr.scene) return res();
          scene.tweens.addCounter({ from: 0, to: 1, duration: 150, ease: 'Sine.easeInOut',
            onUpdate: tw2 => { const v2 = tw2.getValue(); if (!spr.scene) return; spr.setScale(base * (1.05 - 0.05 * v2)); },
            onComplete: () => { if (spr.scene) { spr.setScale(base); spr.setAlpha(1); } res(); } });
        } });
    });
  }

  // 配置(発注書v0.75 §4.2 / 0.8〜1.2秒): 波紋+収束粒子→出現ポップ→着地バースト。
  // DOM立ち絵カットインと並列再生(カメラは停止マスズームが既に効いているため動かさない)
  async function fx2cSummon(ev) {
    const col = elemCol(ev.element);
    const { x, y } = proj(GEO[ev.tile][0], GEO[ev.tile][1]);
    // 召喚紋: 支給素材があれば画像、なければ波紋Graphics(§3.4フォールバック)。
    // リング系はクリーチャーの背面に置く(ASSET_NOTES_v1 ─ depthを影(100+)より下げる)
    if (!fxImageFlash(ev.element, 'summon', x, y, { width: 160, ms: 600, depth: 96, from: 0.55, to: 1.05 }))
      groundRipple(ev.tile, col, 650);
    convergeBurst(x, y, col, 10);
    const spr = await waitCreature(ev.tile);
    if (spr && spr.scene) spr.setAlpha(0);    // 収束の間は隠す
    await wait(280);
    if (spr) await popInSprite(spr);
    // 着地impact: 支給素材(impact_small)があれば画像+粒子、なければ粒子のみ
    fxImageFlash(ev.element, 'impactSmall', x, y - 6, { width: 125, ms: 320, depth: 321 });
    elemBurst(x, y, col, 8, true, 320, ev.element);
    await wait(150);
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
    shake(6, 280);
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
    fxImageFlash(ev.element, 'disperse', x, y - 20, { width: 150, ms: 700, depth: 332 });  // 支給素材があれば重ねる
    if (ghost) {
      ghost.setTint(0x555566);   // 彩度低下の代替(単色化)
      elemBurst(x, y, col, 10, false, 331, ev.element);
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
    return Promise.race([p, new Promise(res => setTimeout(res,
      GAME_TIMING.scaled(ev.timeoutMs || 4000, ev.speed || presentationSpeed)))])
      .catch(() => {})
      .then(() => { fxPlaying = null; });
  }

  function fxDebug() {
    return {
      quality, reduceFx, playing: fxPlaying,
      tweens: ready && scene.tweens ? (scene.tweens.getTweens ? scene.tweens.getTweens().length : -1) : 0,
      dustPool: dustPool.length, dustActive,
      fxImgPool: fxImgPool.length, fxImgActive, fxTexLoaded: fxTexOk.size,
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
                preloadFxAssets();   // 属性エフェクト素材(未配置は黙って無視 ─ M2 §3.4)
                // 全景ズームを盤面の実バウンズから算出して即適用
                // (Canvasは境界で描画が切れるため、端のマスのはみ出し分だけ引いて収める)
                computeFit();
                this.cameras.main.centerOn(fitCx, fitCy);
                this.cameras.main.setZoom(fitZoom);
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
  let displayedMapId=null;
  function syncBoard(st) {
    if (failed) return;
    if (!ready) { pendingState = st; return; }
    if(displayedMapId!==st.mapId){displayedMapId=st.mapId;computeFit();resetCamera();boardKey='';}
    const key = JSON.stringify(st.owners) + JSON.stringify(st.tolls || []) + JSON.stringify(st.curses || {}) + JSON.stringify(st.abyssMarks || []) + JSON.stringify(st.barrier || {}) +
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
    for (let i = 0; i < st.tiles.length; i++) {
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
        const colHex = ({ fire: 0xFF7A45, water: 0x56A8E8, earth: 0xD9B64F, wind: 0x5BE0D0 })[c.elem] || 0x6E7288;
        makers.push(() => {
          const g = scene.add.graphics().setDepth(d);
          g.fillStyle(colHex, 1); g.fillCircle(x, y - lift + 6 - 32, 32);
          g.lineStyle(3, 0x2C2A4A, 1); g.strokeCircle(x, y - lift + 6 - 32, 32);
          boardObjs.push(g);
          boardObjs.push(scene.add.text(x, y - lift + 6 - 32, c.name.slice(0, 4),
            { fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", serif', fontSize: '15px', color: '#F6EFDD' }).setOrigin(0.5, 0.5).setDepth(d));
        });
      }
    }
    // 深淵標（配置計算はDOMと共有）
    const abyssMarks = buildAbyssMarkBadges(st);
    if (abyssMarks.length) jobs.push(pngTexture('pwImg_abyss_mark', '/assets/abyss-mark-v1.webp'));
    for (const mark of abyssMarks) makers.push(() => {
      const obj = makeAbyssMark(mark);
      if (obj) boardObjs.push(obj);
    });
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

  function makeAbyssMark(mark) {
    if (!scene.textures.exists('pwImg_abyss_mark')) return null;
    const cont = scene.add.container(mark.x, mark.y).setDepth(mark.z);
    const img = scene.add.image(0, -5, 'pwImg_abyss_mark').setOrigin(0.5, 0.5);
    img.setScale(46 / Math.max(img.width, img.height));
    const txt = scene.add.text(0, 21, `+${mark.bonus}G`, {
      fontFamily:'Arial, sans-serif', fontSize:'11px', fontStyle:'bold', color:'#C9F3FF',
      backgroundColor:'rgba(6,20,48,.9)', padding:{ left:5, right:5, top:1, bottom:1 },
    }).setOrigin(0.5, 0.5);
    txt.setStroke('#153F6A', 1); txt.setShadow(0, 1, '#000000', 2);
    cont.add([img, txt]);
    return cont;
  }

  function makeBadge(b) {
    const cont = scene.add.container(b.x, b.y).setDepth(b.z);
    const txt = scene.add.text(b.icon ? 8 : 0, 0, b.text,
      { fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", serif', fontSize: '13px', fontStyle: '700', color: '#fff' }).setOrigin(0.5, 0.5);
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
  function makeTurnAura() {
    const aura = scene.add.container(0, 0).setVisible(false);
    const ring = scene.add.graphics();
    ring.fillStyle(0xFFF4C1, 0.12); ring.fillEllipse(0, 0, 62, 25);
    ring.lineStyle(3, 0xF2D062, 0.98); ring.strokeEllipse(0, 0, 62, 25);
    ring.lineStyle(1, 0xFFFFFF, 0.82); ring.strokeEllipse(0, 0, 48, 18);
    aura.add(ring);
    const marker = scene.add.container(0, -78).setVisible(false);
    const mg = scene.add.graphics();
    mg.fillStyle(0x101028, 0.94); mg.fillRoundedRect(-27, -13, 54, 24, 6);
    mg.lineStyle(2, 0xF2D062, 1); mg.strokeRoundedRect(-27, -13, 54, 24, 6);
    mg.fillStyle(0xF2D062, 1); mg.fillTriangle(-6, 13, 6, 13, 0, 23);
    const mt = scene.add.text(0, -1, 'TURN', { fontFamily:'Georgia, serif', fontSize:'12px',
      fontStyle:'bold', color:'#FFF4C1', letterSpacing:1 }).setOrigin(0.5);
    mt.setShadow(0, 2, '#000000', 3);
    marker.add([mg, mt]);
    const tween = scene.tweens.add({ targets:ring, scaleX:{from:0.92,to:1.16}, scaleY:{from:0.92,to:1.16},
      alpha:{from:1,to:0.38}, duration:820, yoyo:true, repeat:-1, ease:'Sine.easeInOut', paused:true });
    return { aura, marker, tween };
  }
  function syncPawns(layout) {
    if (failed) return;
    if (!ready) { pendingLayout = layout; return; }
    for (const it of layout) {
      let P = pawns[it.id];
      if (!P) {
        const turn = makeTurnAura();
        P = pawns[it.id] = { spr: null, sh: scene.add.image(it.x, it.y - 5, 'pwShadow').setOrigin(0.5, 0.5).setDisplaySize(40, 13),
          tex: null, x: it.x, y: it.y, tw: null, active:false,
          aura:turn.aura, marker:turn.marker, auraTween:turn.tween };
      }
      if (P.active !== !!it.active) {
        P.active = !!it.active;
        P.aura.setVisible(P.active); P.marker.setVisible(P.active);
        if (P.active) P.auraTween.resume();
        else { P.auraTween.pause(); P.auraTween.restart(); P.auraTween.pause(); }
      }
      const pawnTex = 'pw_' + it.charId + (it.asset && it.asset.includes('outline') ? '_outline' : '');
      if (it.charId && P.tex !== pawnTex && P.tex !== 'loading_' + pawnTex) {
        P.tex = 'loading_' + pawnTex;
        pngTexture(pawnTex, it.asset || '/assets/p_' + it.charId + '.png').then(k => {
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
          from: 0, to: 1, duration: GAME_TIMING.scaled(Math.min(GAME_TIMING.stepMs - 30, 220), it.speed || 1), ease: 'Sine.easeInOut',
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
      const focus = it.active ? 1.12 : 1;
      P.spr.setScale(base * focus * (d ? d.sx : 1), base * focus * (d ? d.sy : 1));
    }
    const air = d ? d.air : 0;
    P.sh.setPosition(x, y - 5).setDepth(it.zs != null ? it.zs : it.z - 2);
    P.sh.setDisplaySize(40 * (1 - 0.35 * air), 13 * (1 - 0.35 * air));
    P.sh.setAlpha(1 - 0.5 * air);
    if (P.aura) P.aura.setPosition(x, y - 6).setDepth(it.active ? it.z - 1 : it.z - 3);
    if (P.marker) P.marker.setPosition(x, y - Math.max(90, it.w * 1.55) - air * 10).setDepth(it.z + 3);
  }

  // ===== 強化候補ハイライト(発注書v0.75 §6) =====
  // list: [{tile, strong, evolve}] ─ 弱=金色外周のゆっくり明滅 / 強=二重外周+面グロー(点滅なし)
  const hlObjs = [];
  let hlKey = '';
  function setHighlights(list) {
    const arr = Array.isArray(list) ? list : [];
    const key = JSON.stringify(arr);
    if (key === hlKey) return;
    hlKey = key;
    for (const h of hlObjs) { if (h.tw) h.tw.remove(); h.g.destroy(); }
    hlObjs.length = 0;
    if (!ready) return;
    for (const it of arr) {
      if (!GEO[it.tile]) continue;
      const { x, y } = proj(GEO[it.tile][0], GEO[it.tile][1]);
      const g = scene.add.graphics().setDepth(97);   // タイルより前面・クリーチャー影(100+)より背面
      const dia = (ins, w, col2, a) => {
        g.lineStyle(w, col2, a);
        g.beginPath();
        g.moveTo(x, y - DH / 2 + ins * 0.55);
        g.lineTo(x + DW / 2 - ins, y);
        g.lineTo(x, y + DH / 2 - ins * 0.55);
        g.lineTo(x - DW / 2 + ins, y);
        g.closePath(); g.strokePath();
      };
      if (it.strong) {
        dia(2, 3.2, 0xF2D062, 1);
        dia(7, 1.6, 0xF2D062, 0.9);
        g.fillStyle(0xF2D062, 0.10); g.fillEllipse(x, y, DW - 16, DH - 10);
        if (it.evolve) { g.fillStyle(0xFFF3C8, 0.26); g.fillRect(x - 8, y - 72, 16, 64); }  // 進化予告の光柱
        g.setAlpha(0.95);
        hlObjs.push({ g, tw: null });
      } else {
        dia(3, 2, 0xF2D062, 1);
        const tw = scene.tweens.add({ targets: g, alpha: { from: 0.45, to: 0.8 },
          duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });   // 1.5秒周期(§6.1)
        hlObjs.push({ g, tw });
      }
    }
  }

  // ===== カメラ(setZoom契約: null=全景 / タイル番号=1.5倍ズーム) =====
  // 全景: マス中心のバウンズ+はみ出し余白(クリーチャー上方・バッジ・タイル厚み)が
  // 1280x905のCanvasに収まるズームを算出(既定は1相当。端が切れる盤面だけ僅かに縮む)
  let fitZoom = 1, fitCx = 640, fitCy = 452.5;
  function computeFit() {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < GEO.length; i++) {
      const { x, y } = proj(GEO[i][0], GEO[i][1]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const mx = DW / 2 + 14;                   // 左右: タイル半幅+バッジ分
    minX -= mx; maxX += mx;
    minY -= 132;                              // 上: クリーチャー立ち上がり+レベル持ち上げ
    maxY += THICK + 36;                       // 下: タイル厚み+影
    fitZoom = Math.min(1, 1280 / (maxX - minX), 905 / (maxY - minY));
    fitCx = (minX + maxX) / 2; fitCy = (minY + maxY) / 2;
  }
  function setPresentationSpeed(speed) {
    presentationSpeed = speed === 2 ? 2 : 1;
    if (ready && scene && scene.tweens) scene.tweens.timeScale = presentationSpeed;
  }
  function resetCameraEffects(cam) {
    try { if (cam.panEffect && cam.panEffect.reset) cam.panEffect.reset(); } catch (e) {}
    try { if (cam.zoomEffect && cam.zoomEffect.reset) cam.zoomEffect.reset(); } catch (e) {}
  }
  function setCamera(ti, opts) {
    if (!ready) return;
    const o = opts || {}, speed = o.speed === 2 ? 2 : presentationSpeed;
    const target = ti === null || ti === undefined ? 'fit' : 'z' + ti;
    if (target === camTarget && !o.force) return;
    camTarget = target;
    const cam = scene.cameras.main;
    resetCameraEffects(cam);
    const duration = GAME_TIMING.scaled(o.duration == null ? 850 : o.duration, speed);
    if (target === 'fit') {
      cam.pan(fitCx, fitCy, duration, 'Cubic.easeOut');
      cam.zoomTo(fitZoom, duration, 'Cubic.easeOut');
    } else {
      const { x, y } = proj(GEO[ti][0], GEO[ti][1]);
      cam.pan(x, y + 24, duration, 'Cubic.easeOut');   // マスを画面中央やや上(DOM版の46%相当)に
      cam.zoomTo(fitZoom * 1.5, duration, 'Cubic.easeOut');
    }
    return duration;
  }
  function resetCamera() {
    if (!ready || !scene) return;
    const cam = scene.cameras.main;
    resetCameraEffects(cam);
    camTarget = 'fit';
    cam.centerOn(fitCx, fitCy);
    cam.setZoom(fitZoom);
  }
  function cameraState() {
    if (!ready || !scene) return { ready:false, isFit:true, target:'fit' };
    const cam = scene.cameras.main;
    const center = cam.midPoint || { x:fitCx, y:fitCy };
    const panRunning = !!(cam.panEffect && cam.panEffect.isRunning);
    const zoomRunning = !!(cam.zoomEffect && cam.zoomEffect.isRunning);
    const isFit = camTarget === 'fit' && !panRunning && !zoomRunning &&
      Math.abs(cam.zoom - fitZoom) < .002 && Math.abs(center.x - fitCx) < 2 && Math.abs(center.y - fitCy) < 2;
    return { ready:true, isFit, target:camTarget, zoom:cam.zoom, fitZoom, panRunning, zoomRunning };
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
          g.lineStyle(2 + 6 * (1 - v), col, 1 - v);
          g.strokeEllipse(x, y + dy, 44 + 190 * v, (44 + 190 * v) * 0.55); },
        onComplete: () => g.destroy() });
    } else if (cls === 'fxPillar') {
      const g = scene.add.graphics().setDepth(300);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 1200, ease: 'Sine.easeOut',
        onUpdate: tw => { const v = tw.getValue(); g.clear();
          g.fillStyle(col, 0.4 * (1 - v));
          g.fillRect(x - 38, y + dy - 235 * v, 76, 235 * v); },
        onComplete: () => g.destroy() });
      for (let k = 0; k < 10; k++) {
        const p = scene.add.circle(x + (Math.random() * 76 - 38), y + dy, 3 + Math.random() * 3, col).setDepth(301);
        scene.tweens.add({ targets: p, y: p.y - 150 - Math.random() * 90, alpha: 0,
          duration: 900 + Math.random() * 400, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
      }
    } else if (cls === 'fxBolt') {
      pngTexture('pwImg_ic_curse', '/assets/ic_curse.png').then(k => {
        if (!k || !scene) return;
        const s = scene.add.image(x, y + dy - 100, k).setOrigin(0.5, 0.5).setDepth(301);
        s.setScale(84 / s.height);
        scene.tweens.add({ targets: s, y: y + dy - 34, duration: 420, ease: 'Bounce.easeOut',
          onComplete: () => scene.tweens.add({ targets: s, alpha: 0, duration: 600, delay: 350, onComplete: () => s.destroy() }) });
      });
      // 呪い(2D plan§8.4): 着弾時にクリーチャーを短時間だけ紫に変色(ColorMatrix代替のsetTint)
      const spr = creatureSprites[i];
      if (spr && spr.scene && quality !== 'lite') {
        setTimeout(() => { if (spr.scene) spr.setTint(0xB07AE0); }, 380);
        setTimeout(() => { if (spr.scene) spr.clearTint(); }, 860);
      }
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
  function resize() {
    if (!ready || !game || !game.scale) return;
    game.scale.refresh();
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
  return { init, syncBoard, syncPawns, setCamera, resetCamera, cameraState, setPresentationSpeed,
           worldToViewport, pawnViewport, fx, resize,
           snapshot, debugCounts, pump, isReady: () => ready, hasFailed: () => failed,
           setHighlights,   // 強化候補ハイライト(発注書v0.75 §6)
           // Phase 2A: 演出基盤
            play, shake, fxDebug,
           _debugScene: () => scene };  // 診断用(製品コードからは使用しない)
})();
