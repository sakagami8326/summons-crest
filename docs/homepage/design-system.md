# SUMMONS CODE Webデザインシステム

実装用の正式トークンは `public/site/design-system.css` とする。本書は判断基準と使用例をまとめる。

## Color

| Role | Token | Value | Usage |
|---|---|---:|---|
| 深層背景 | `--sc-ink-950` | `#0B0D18` | ページ背景 |
| 濃紺 | `--sc-ink-900` | `#141227` | ヘッダー、カード |
| 青紺 | `--sc-ink-800` | `#1E1B3C` | パネル、ホバー |
| 金 | `--sc-gold-500` | `#C9A227` | 枠線、主要アクセント |
| 淡金 | `--sc-gold-300` | `#EFD98F` | 見出し、小さな強調 |
| 羊皮紙 | `--sc-parchment-100` | `#F1E8D0` | 明るい面、本文 |
| 白金 | `--sc-ivory-50` | `#FFF8E7` | 暗背景上の強い文字 |
| 火 | `--sc-fire` | `#FF7A45` | 火属性 |
| 水 | `--sc-water` | `#56A8E8` | 水属性 |
| 土 | `--sc-earth` | `#D9B64F` | 土属性 |
| 風 | `--sc-wind` | `#5BE0D0` | 風属性 |

金色は本文色に使わず、見出し・境界・CTAへ限定する。長文は羊皮紙色を使う。

## Typography

- Display: `"Shippori Mincho", "Yu Mincho", serif`
- UI / Body: `"Shippori Mincho", "Yu Mincho", serif`
- Card display: 既存の `Marudeco`。カード名や短いラベル以外には使用しない
- 数字: `font-variant-numeric: tabular-nums`

ボタン、ナビゲーション、日付、ラベルも明朝体を使用する。サンセリフ体はファイルパス、カラートークン、開発者向け注釈など、公開ページに出ない補助情報へ限定する。

| Style | Size | Line height | Weight |
|---|---:|---:|---:|
| Hero | `clamp(2.5rem, 6vw, 5.5rem)` | 1.05 | 600 |
| H2 | `clamp(2rem, 4vw, 3.5rem)` | 1.15 | 600 |
| H3 | `clamp(1.25rem, 2vw, 1.75rem)` | 1.3 | 600 |
| Lead | `clamp(1.05rem, 1.8vw, 1.35rem)` | 1.8 | 400 |
| Body | `1rem` | 1.8 | 400 |
| Label | `.75rem` | 1.4 | 700 |

## Spacing and layout

- 4px基準: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128`
- 本文コンテナ: `min(1120px, calc(100% - 32px))`
- セクション余白: PC `96px`、スマホ `64px`
- カード間隔: PC `24px`、スマホ `16px`
- 角丸: ボタン `6px`、カード `14px`、小ラベル `999px`

## Components

### Primary button

濃紺から青紺へのグラデーション、金の1px境界、淡金文字。常に動詞から始める。

- 推奨: 「ゲームを始める」「遊び方を見る」
- 非推奨: 「こちら」「詳しく」

### Tarot panel

- 暗い半透明背景
- 金色の1px境界
- 内側にもう1本の薄い境界
- 四隅の装飾はCSS疑似要素で簡潔に表現
- 一画面に3枚以上並ぶ場合、装飾密度を半分にする

### Section heading

- 英字見出しはSUMMONS CODEロゴに近い鋭いセリフ体の単色シルエット（A案）で統一する
- 金属表現、グラデーション、縁取り、影、独立した装飾枠は使用しない
- 暗背景ではParchment `#F1E8D0`の1色、明背景ではCrest Navy `#141227`の1色を使う
- 基準アセットは `/assets/site/heading-concept-a.png`
- 日本語見出し
- 48〜72pxの短い金線
- 中央揃えはヒーローと最終CTAのみ。本文セクションは左揃えを基本にする

### Fixed game launcher

- 右下固定の円形ボタン
- 通常時は濃紺面、金の外周線、アイボリー文字
- `GAME START`を2行以内で中央配置
- 外周に回転するクレスト装飾を置く
- 本文とは独立した最上位CTAとして扱う
- フッター到達時も消さず、最終CTAと重なる場合だけ上へ退避する

### Attribute badge

属性色の小さな円と日本語名を組み合わせる。色のみで属性を区別しない。

### Early access badge

`EARLY ACCESS`を大文字、公開日を併記。警告色ではなく金色のアウトラインを使う。

## Iconography

### Spark star

- 星の意匠は縦横に鋭く伸びる光芒形を標準とする
- `/assets/site/spark-star.svg` と `/assets/site/spark-star-cluster.svg` を使用する
- 五芒星、丸い星、Unicodeの星記号は使用しない
- 単色シルエットとし、グラデーションや立体表現は加えない

- 絵文字は使用しない
- 既存のゲーム用SVGまたは単色の線画を使う
- 線幅は1.5〜2px
- 装飾的なアイコンと操作アイコンを混在させない

## Voice and copy

- 神秘的だが、意味を曖昧にしない
- 「伝説」「運命」などの抽象語だけで説明を終えない
- 最初の一文で遊び方を具体化する
- 未実装機能、ランキング、オンラインマッチングを示唆しない
