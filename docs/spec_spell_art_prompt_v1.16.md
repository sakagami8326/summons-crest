# Summons Crest スペルアート生成プロンプト規格 v1.16

## 1. この文書の用途

スペルカードアートを画像生成するときに、プロンプトへ入力する項目だけを定義する。

- 完全版の制作規格：`docs/spec_spell_art_master_v1.16.md`
- 基準画像：ダイス1～6、衰弱の呪文
- 出力：背景込みの縦長一枚絵
- カード名、コスト、効果文、外枠などのUIは画像へ含めない

## 2. 生成前に用意するもの

### 必須参照画像

1. ダイススペルの完成画像1～2枚
2. 衰弱の呪文の完成画像
3. 同シリーズを制作中の場合は、そのシリーズで最初に採用した基準画像

参照画像は画風、彩度、陰影、紙質、魔法陣の線密度を合わせるために使う。参照画像の主役モチーフや構図を、そのまま別カードへコピーしない。

### カードごとの必須入力項目

生成前に以下の6項目を確定する。

| 項目 | 入力内容 |
|---|---|
| `CARD_NAME` | 管理用の日本語カード名。画像内には描かない |
| `MAIN_SYMBOL` | 中央へ置く主役モチーフ一つ |
| `ACTION` | 効果を表す動き一つ |
| `GEOMETRY` | 背後の魔法陣または幾何学構成 |
| `ACCENT_COLORS` | 固有の差し色、最大二色 |
| `DISTINCTION` | 類似カードと混同させない条件 |

## 3. 全カード共通の固定条件

以下はカードごとに変更しない。

### 画面・構図

- 1024×1536px、正確な縦2:3。
- 背景込みの不透明な一枚絵。
- 主役は一つだけ。
- 主役中心は画面幅50%、画面高さ35%前後。
- 主役はおおむねX180～844、Y230～850へ収める。
- 上部13%、下部30%、左下のコスト領域に重要な物体を置かない。
- 下部は単純な霧、太い影、弱い光の余韻へ落とす。
- 背後には大きな魔法陣または単純な幾何学を一つだけ置く。
- 幅80pxへ縮小しても中央の主役を識別できる構図にする。

### 画風

- タロットカード風の儀式魔術。
- Summons Crestのダイススペルと同じシリーズに見える画風。
- スタイライズされた2Dゲームイラスト。
- 大きな色面と2～3段階の控えめなセル塗り。
- 軽い紙の粒子感と乾いたブラシ輪郭。
- 写実ではなく、大きく読みやすいシルエットを優先。
- 情報量、彩度、コントラストを基準画像より増やさない。

### 共通配色

- 背景：深い藍、青紫、暗いプラム。
- 主光：淡い象牙色～薄い金。
- カード固有色は主役と補助光だけに使う。
- 画面全体を一つの属性色で塗らない。
- 黒潰れさせず、主役の輪郭を暗い背景から分離する。

### 情報量制限

- 主役以外の補助モチーフは最大二種類。
- 小粒子は最大12個程度。
- 強い発光点は一つまで。
- 細い線は魔法陣に限定する。
- 主役と同程度に目立つ物体を複数置かない。

## 4. 共通プロンプト

以下を固定本文として使い、`<>`内だけをカード別指定で置換する。

```text
Use case: stylized-concept
Asset type: full-frame spell card artwork for Summons Crest

Create a tarot-inspired ritual spell illustration centered on <MAIN_SYMBOL>, clearly expressing the single action <ACTION>.

The main symbol floats in the upper-middle of a deep indigo ritual space. Behind it is <GEOMETRY>. The lower third fades into simple mist, broad shadow shapes, and restrained magical afterglow.

Use the supplied Summons Crest dice spell cards and Weaken spell artwork only as visual style references. Match their stylized 2D game illustration style, large flat color masses, restrained two-to-three-step cel shading, light paper grain, dry-brush edges, simple bold silhouettes, saturation, contrast, and detail density. Do not copy their subject matter.

Composition: exact 2:3 portrait, 1024 by 1536 pixels. Place the center of the main symbol around 50 percent width and 35 percent height. Keep the top 13 percent, lower 30 percent, and lower-left cost area free of important details. Keep all important silhouettes above 58 percent height. Use one dominant symbol and at most two supporting motifs. The subject must remain recognizable at 80-pixel card width.

Palette: deep indigo, blue-violet, and dark plum base; parchment-gold or pale ivory primary light; restrained <ACCENT_COLORS> only on the main symbol and supporting magical light. Do not tint the entire image with the accent color.

Distinction requirement: <DISTINCTION>.

No text, letters, numerals, logo, watermark, card name, card frame, border, UI, cost panel, rarity mark, effect panel, people, hands, summoners, creatures, detailed scenery, architecture, dense particles, realistic 3D rendering, photographic materials, excessive lens flare, or rune shapes resembling readable writing.
```

## 5. 再生成・修正用プロンプト

構図は採用できるが一部だけ直したい場合は、共通プロンプトを繰り返さず以下を使う。

```text
Preserve the current composition, camera, main symbol position, palette balance, magic-circle scale, paper grain, dry-brush edges, and overall detail density.

Change only the following issue: <修正内容>.

Do not add any new objects, text, symbols, particles, scenery, UI, borders, or secondary focal points. Keep the exact 2:3 portrait composition and all important details inside the existing safe area.
```

### よく使う修正内容

| 問題 | `修正内容` |
|---|---|
| 主役が小さい | enlarge the single main symbol by about 15 percent without moving it into the title, cost, brush, or effect-panel areas |
| 主役が下すぎる | move the entire main symbol upward while preserving its scale and all surrounding geometry |
| 情報量が多い | remove minor particles, tiny ornaments, secondary objects, and background details while preserving the main symbol |
| 写実的すぎる | simplify materials into large stylized color masses with restrained cel shading and dry-brush outlines |
| 光が強すぎる | reduce bloom and lens flare, preserving only one controlled pale-gold focal light |
| 文字状のルーンがある | replace all letter-like or numeral-like runes with non-readable simple geometric lines |
| 類似カードと混同する | strengthen <DISTINCTION> without changing the shared series style |

## 6. 生成直後の確認項目

生成結果を採用する前に、以下だけは毎回確認する。

- [ ] 1024×1536、縦2:3になっている
- [ ] 主役が一つに絞られている
- [ ] 主役が上部タイトル、左下コスト、下部効果欄へ入っていない
- [ ] 文字、数字、ロゴ、UI、カード枠がない
- [ ] 人物、手、召喚士、クリーチャーがない
- [ ] 幅80px相当でも主役を識別できる
- [ ] ダイス基準画像と彩度、陰影、紙質、描き込み量が揃っている
- [ ] `DISTINCTION`の禁止対象が混入していない
- [ ] 類似カードと並べても効果を取り違えない
- [ ] 重要部分がY850より下へ伸びていない
