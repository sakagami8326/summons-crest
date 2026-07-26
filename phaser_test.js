// phaser_test.js ─ Phaser同梱物と禁止APIの静的検査(v0.67 / spec_phaser4_migration_v0.67.md §9.1)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let pass = 0;
const ok = (cond, name) => { if (!cond) throw new Error('FAIL: ' + name); pass++; };

const EXPECT_VER = '4.2.1';
const vendor = path.join(__dirname, 'public/vendor');

// 1) 同梱物の存在とバージョン
ok(fs.existsSync(path.join(vendor, 'phaser.min.js')), 'vendor: phaser.min.jsが存在する');
ok(fs.existsSync(path.join(vendor, 'PHASER_LICENSE.md')), 'vendor: LICENSEが同梱されている');
const min = fs.readFileSync(path.join(vendor, 'phaser.min.js'), 'utf8');
ok(min.includes(EXPECT_VER), `vendor: phaser.min.jsにバージョン${EXPECT_VER}が含まれる`);

// 2) PHASER_VERSION.txtの記録とSHA256の実一致
const vtxt = fs.readFileSync(path.join(vendor, 'PHASER_VERSION.txt'), 'utf8');
ok(vtxt.includes(EXPECT_VER), `VERSION.txt: ${EXPECT_VER}が記録されている`);
ok(/cdn\.jsdelivr\.net\/npm\/phaser@/.test(vtxt), 'VERSION.txt: 取得元URLが記録されている');
const recorded = (vtxt.match(/SHA256:\s*([0-9A-Fa-f]{64})/) || [])[1];
ok(!!recorded, 'VERSION.txt: SHA256が記録されている');
const actual = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(vendor, 'phaser.min.js'))).digest('hex').toUpperCase();
ok(actual === recorded.toUpperCase(), 'VERSION.txt: 記録SHA256が実ファイルと一致する');

// 3) 禁止API(spec §9.1)がプロジェクトコードに存在しない
const world = fs.readFileSync(path.join(__dirname, 'public/board_world.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(__dirname, 'public/battle_world.js'), 'utf8');  // v0.80: 戦闘Canvasも検査対象
const board = fs.readFileSync(path.join(__dirname, 'public/board.html'), 'utf8');
const BANNED = [
  ['setTintFill', /setTintFill/],
  ['独自Pipeline登録', /addPipeline|WebGLPipeline|PostFXPipeline/],
  ['Phaser.Geom.Point', /Phaser\.Geom\.Point/],
  ['Phaser.Struct', /Phaser\.Struct\./],
  ['Phaser 3 FX API', /\.(preFX|postFX)\b/],
  ['HexStringToColor(自前hex変換を使う)', /HexStringToColor/],
];
for (const [name, re] of BANNED) {
  ok(!re.test(world), `board_world: 禁止API「${name}」を使用していない`);
  ok(!re.test(board), `board.html: 禁止API「${name}」を使用していない`);
}

// 4) roundPixelsの明示(spec §4.2-8)
ok(/roundPixels:\s*false/.test(world), 'board_world: roundPixels: false を明示している');

// 5) 属性FX素材とハイブリッド戦闘の配線
const fxRoot = path.join(__dirname, 'public/assets/fx');
const elements = ['fire', 'water', 'earth', 'wind', 'neutral'];
const elementFx = [
  'particle_01.png', 'particle_02.png', 'particle_03.png', 'particle_04.png',
  'trail_light.png', 'trail_heavy.png', 'impact_small.png', 'impact_large.png',
  'summon.png', 'disperse.png',
];
for (const elem of elements)
  for (const file of elementFx)
    ok(fs.existsSync(path.join(fxRoot, elem, file)), `FX素材: ${elem}/${file}`);
for (const file of ['flash_soft.png', 'shockwave.png', 'glow_round.png', 'spark_gold.png'])
  ok(fs.existsSync(path.join(fxRoot, 'common', file)), `FX素材: common/${file}`);
ok(/function battleTrailFx\(/.test(board), 'board.html: 戦闘画面の属性軌跡を実装している');
ok(/function battleImpactFx\(/.test(board), 'board.html: 戦闘画面の属性着弾を実装している');
ok(/group\.trailHeavy/.test(board) && /group\.impactLarge/.test(board),
  'board.html: 強攻撃用の軌跡・着弾素材を使用している');
ok(/common\.shockwave/.test(board), 'board.html: 強打時に共通衝撃波を使用している');

console.log(`PHASER ALL ${pass} CHECKS PASSED (Phaser ${EXPECT_VER})`);
