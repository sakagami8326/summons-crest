// 属性エフェクト素材マニフェスト(発注書v0.75 §3.4)
// - 素材ファイル名をゲームロジックへ散在させない。参照は必ずこの表を経由する
// - ファイルが未配置でもゲームは進行する(board_world.jsがGraphics粒子へフォールバック)
// - 素材が届いたら該当パスのファイルを置くだけで自動的に画像へ切り替わる
const FX_DIR = '/assets/fx';
const FX_ELEM_SET = e => ({
  particles: [1, 2, 3, 4].map(n => `${FX_DIR}/${e}/particle_0${n}.png`),
  trailLight: `${FX_DIR}/${e}/trail_light.png`,
  trailHeavy: `${FX_DIR}/${e}/trail_heavy.png`,
  impactSmall: `${FX_DIR}/${e}/impact_small.png`,
  impactLarge: `${FX_DIR}/${e}/impact_large.png`,
  summon: `${FX_DIR}/${e}/summon.png`,
  disperse: `${FX_DIR}/${e}/disperse.png`,
});
const FX_ASSETS = {
  fire: FX_ELEM_SET('fire'),
  water: FX_ELEM_SET('water'),
  earth: FX_ELEM_SET('earth'),
  wind: FX_ELEM_SET('wind'),
  neutral: FX_ELEM_SET('neutral'),
  common: {
    flashSoft: `${FX_DIR}/common/flash_soft.png`,
    shockwave: `${FX_DIR}/common/shockwave.png`,
    glowRound: `${FX_DIR}/common/glow_round.png`,
    sparkGold: `${FX_DIR}/common/spark_gold.png`,
    // v0.80: 支給素材v1(ASSET_NOTES_v1.md)の共通追加分
    hitSmall: `${FX_DIR}/common/hit_small.png`,
    hitLarge: `${FX_DIR}/common/hit_large.png`,
    victoryRing: `${FX_DIR}/common/victory_ring.png`,
    disperseLight: `${FX_DIR}/common/disperse_light.png`,
  },
};
