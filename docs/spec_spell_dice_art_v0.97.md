# サイコロ固定スペル6種 アート制作規格 v0.97

## 1. 目的

サイコロの出目を1～6のいずれかに固定する6種類のスペルカード用アートを制作する。
6枚は同一シリーズであることが一目で分かり、手札の縮小表示でも出目を即座に識別できることを最優先とする。

この文書はアート制作規格のみを定義する。カード効果、コスト、入手方法、ゲーム処理は別工程で確定する。

## 2. 採用する素材方式

- 背景込みの縦長一枚絵を6枚制作する。
- 既存スペル共通背景と透過エフェクトの合成方式は、今回の6枚には使用しない。
- カード名、コスト、効果文、ブラシ境界、外枠はシステム側で重ねるため、画像へ描き込まない。
- 出目の点まで一枚絵へ直接描き込み、システム側で画像を重ねない。
- ダイス正面の点数・配置は生成後に目視検査し、誤りがあればその画像だけを再生成または編集する。

## 3. ファイル規格

| 項目 | 規格 |
|---|---|
| 制作キャンバス | 1024×1536px、縦2:3 |
| 制作形式 | PNG、RGB、不透明 |
| 実装形式 | WebP、品質85～88 |
| 目標容量 | 1枚300KB以下 |
| 実装ファイル名 | `spell-dice-1-art-v1.webp` ～ `spell-dice-6-art-v1.webp` |
| 配置先 | `public/assets/cards/` |

トリミングや縦横比変更は禁止する。6枚すべて同一解像度・同一座標系で納品する。

## 4. カードUIとの安全領域

座標は1024×1536pxを基準とする。

| 領域 | Y座標の目安 | 指定 |
|---|---:|---|
| カード名領域 | 48～194px | 顔・ダイス・重要な光を置かない |
| メインアート領域 | 215～855px | ダイスと各案の主要モチーフを配置 |
| 補助演出領域 | 170～940px | 魔法陣、光、シルエットを配置可能 |
| ブラシ境界 | 949～1109px | 主役を置かない。形が切れてもよい余韻だけにする |
| コスト枠干渉域 | X33～350px / Y1000～1115px | 重要な記号を置かない |
| 効果欄 | Y1088～1536px | システムUIで隠れる。背景の余韻だけにする |

ダイス本体の中心はX512px、Y500～575pxを基本とする。主要シルエットはY850pxより下へ伸ばさない。

## 5. 共通アートディレクション

### 世界観・媒体

- タロットカード風の儀式魔術。
- 紙へ描いたような軽いざらつきと、乾いたブラシの輪郭。
- セル塗りに近い2～3段階の大きな色面。
- 写実的な石、金属、煙、光学表現は避ける。
- 細かな背景物ではなく、大きなシルエットと幾何学で見せる。

### 共通構図

- 画面上半分の中央に、大きな六面ダイスを1個だけ配置する。
- ダイスはやや見上げる角度だが、出目を載せる正面は十分に見えるようにする。
- ダイスの背後に1つの大きな円形魔法陣を置く。
- 下部は霧、布、光の帯などの単純な余韻へ落とし、情報量を減らす。
- 上端のカード名、左下のコスト、下部の効果文と競合させない。

### 共通配色

- 基調色：深い藍、青紫、暗いプラム。
- 主光：淡い象牙色～薄い金。
- 補助光：くすんだシアンとマゼンタを少量。
- 黒潰れを避け、カード名の白文字とダイスの輪郭が明確に分離する明度差を確保する。
- 6枚を色違いシリーズにはしない。配色比率は全カードで共通にする。

### 情報量

- ダイス、魔法陣、前景シルエットの3層まで。
- 小粒子は最大12個程度。星屑を画面全体へ散らさない。
- 細い装飾線は魔法陣に限定し、建築物や小物を追加しない。
- 幅80px相当で「中央のダイス」と「出目」が残ること。

## 6. 6枚の差分設計

差は配色ではなく、魔法陣の幾何学と周囲の大きなシルエットで表現する。ダイスの大きさ、位置、光源、描き込み量は統一する。

| 出目 | 背後の幾何学 | 周囲の構成 |
|---:|---|---|
| 1 | 中央の一点と一重円 | 光が中央へ収束する、最も静かな構成 |
| 2 | 左右対称の二つの弧 | 二本の光帯がダイスを挟む |
| 3 | 大きな三角形 | 三方向から光が集まる |
| 4 | 正方形と四つの角 | 四隅の柱状シルエットが中央を囲む |
| 5 | 中央点＋四方向の菱形 | 五つの大きな光面が星型を作る |
| 6 | 六角形と六方向の短い光条 | 最も完成された安定感。ただし描き込み量は増やさない |

## 7. 出目描写の規格

- 出目はダイスの最も大きく見える正面へ直接描く。
- 点は完全な円形、単色の濃紺または黒紫とする。
- 1～6は一般的なサイコロ配置を使用し、数字の字形は使わない。
- 点径、点同士の間隔、面の端からの余白は6枚で統一する。
- 正面以外の側面には、別の出目と誤認する点を描かない。
- 魔法陣や粒子に、出目と誤認する円形を追加しない。
- 80px相当へ縮小し、出目が正しく読めることを1枚ずつ確認する。

## 8. 画像へ含めないもの

- カード名、数字、文章、ロゴ、透かし。
- コスト枠、効果欄、ブラシ境界、カード外枠。
- 複数のダイス、手、人物、召喚士、クリーチャー。
- 出目を誤認させる円形装飾。
- 写実的な3Dレンダー、強いレンズフレア、過剰な粒子、細かな風景。
- 左右で異なる属性色や、6枚ごとの大幅な色替え。

## 9. 生成手順

1. 出目1のアートを基準画像として生成し、構図・彩度・描き込み量を確定する。
2. 出目2～6は出目1をスタイル参照に使い、カメラ、ダイス位置、配色、質感、点の大きさを固定する。
3. 変更するのは背後の幾何学と大きな光帯だけに限定する。
4. 6枚を2:3の縮小サムネイルで横並びにし、統一感と識別性を確認する。
5. カードUIへ仮組みし、カード名、コスト、ブラシ境界、効果文との干渉を確認する。
6. PNG原本を保持し、WebPへ変換して実装する。

## 10. 共通生成プロンプト雛形

```text
Use case: stylized-concept
Asset type: full-frame spell card artwork for SUMMONS CODE
Primary request: a tarot-inspired ritual spell illustration centered on one large magical six-sided die; the largest visible front face shows exactly <出目> circular pips in the standard dice arrangement
Scene: the die floats in the upper-middle of a deep indigo ritual space, backed by a single large geometric magic circle; the lower third fades into simple mist and broad shadow shapes
Style: stylized 2D game illustration, large flat color masses, restrained cel shading, light paper grain, dry-brush edges, simple silhouettes, not photorealistic
Composition: exact 2:3 portrait; main die centered around 50% width and 35% height; keep the top 13%, lower 30%, and lower-left cost area free of important details; the front face of the die must be flat and clearly visible
Palette: deep indigo, blue-violet and dark plum, with parchment-gold primary light and small restrained cyan/magenta accents; keep the same palette as all other cards in this six-card set
Variant motif: <出目ごとの幾何学と周囲構成>
Constraints: one die only; exactly <出目> pips on the main face; no misleading pips on side faces; strong silhouette at thumbnail size; no text, numeral glyph, letters, logo, watermark, card frame, UI, cost panel, effect panel, characters, hands, creatures, detailed architecture, dense particles, realistic 3D rendering
```

## 11. 完成判定

- 6枚を並べたとき、同じ魔術体系の連作に見える。
- 配色変更に頼らず、幾何学構成と出目で識別できる。
- ダイス正面の出目が一般的な配置で正確に描かれている。
- カードUIを重ねた状態で主役が隠れない。
- 幅80px相当でも出目を読み取れる。
- 既存のスペルカードより描き込み量や質感が増えていない。
- 文字・数字・枠・効果欄が画像へ混入していない。
