# SUMMONS CODE 属性エフェクト素材 v1

作成日: 2026-07-26  
用途: Phaser 4盤面・スペル・ハイブリッド戦闘演出  
形式: 透過PNG  
生成方式: built-in ImageGenで4×2クロマキー素材シートを生成し、ローカルで背景除去・セル分割・余白トリミング

## 構成

```text
fx/
├─ manifest.json
├─ fire/
├─ water/
├─ earth/
├─ wind/
├─ neutral/
└─ common/
```

火・水・土・風・無属性には各8点を収録する。

| ファイル | 主な用途 |
|---|---|
| `particle_01.png` | 小粒子の第1候補 |
| `particle_02.png` | 小粒子の第2候補 |
| `trail_light.png` | 軽攻撃、移動、projectile |
| `trail_heavy.png` | 通常攻撃、強攻撃 |
| `impact_small.png` | 小命中、配置着地 |
| `impact_large.png` | 戦闘命中、強いスペル |
| `summon.png` | 召喚・配置 |
| `disperse.png` | 退場・解除 |

共通8点:

| ファイル | 主な用途 |
|---|---|
| `flash_soft.png` | 局所フラッシュ |
| `shockwave.png` | 円形衝撃波 |
| `glow_round.png` | 選択・強化候補 |
| `spark_gold.png` | レベルアップ |
| `hit_small.png` | 汎用小命中 |
| `hit_large.png` | 汎用大命中 |
| `victory_ring.png` | 勝利・重要召喚 |
| `disperse_light.png` | 汎用光分解 |

## 使用ルール

- 画像のファイル名をゲームロジックへ直接散在させず、`manifest.json`経由で参照する。
- 画像は元の縦横比を維持する。
- `trail_*`は必要に応じて回転・左右反転して使用できる。
- `summon`とリング系はクリーチャーの背面に置く。
- `impact_*`はクリーチャーの前面へ置くが、顔とシルエットを長時間隠さない。
- Standard品質では粒子量をHighの60〜70%にする。
- Lite品質では`impact`、`trail`、`summon`など意味を伝える大形状だけを残す。
- 強いAdd系Blend Modeで白飛びする場合はNormalまたはScreen相当を優先する。

## QA結果

- ファイル数: 48
- 全ファイルRGBA
- 全ファイルに可視ピクセルあり
- 全ファイルの四隅が透明
- 可視状態のマゼンタ系残留ピクセル: 0
- 4×2セル境界から混入した小さな孤立成分を除去済み

各画像の寸法・可視ピクセル数・Alpha検証値は`manifest.json`に記録している。

## 制作プロンプト概要

各属性について、次の8要素を均等な4×2グリッドで生成した。

```text
particle cluster / secondary particle / light trail / heavy trail
small impact / large impact / hollow-center summon ring / disperse
```

共通条件:

- SUMMONS CODEのセル塗りクリーチャーと並ぶ、太く読みやすい2DファンタジーゲームFX
- 写実表現なし
- 内部ディテールを増やしすぎない
- 小表示でも大きな形が読める
- 文字、ロゴ、キャラクター、背景、影なし
- #ff00ffクロマキー背景

