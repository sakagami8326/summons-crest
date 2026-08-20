# ホームページ用デザインアセット一覧

ビジュアル見本は `/site/brand-assets.html` を参照する。本書は見本ページで使用する素材の詳細と運用ルールを補足する。

すべて `public/assets/` 以下の実装済みアセットを参照する。元ファイルは移動・上書きせず、Webページから同じURLを利用する。

## Core brand

| Purpose | Asset | Treatment |
|---|---|---|
| 明背景用ロゴ | `/assets/summons-code-blue.svg` | タイトル画面・羊皮紙面で使用 |
| 暗背景用ロゴ | `/assets/summons-code-gold.svg` | ゲーム盤面・濃紺面で使用 |
| 単色ロゴ | `/assets/summons-code-white.svg` | 写真上など、十分なコントラストが必要な場合のみ |
| 英字見出し CONCEPT | `/assets/site/heading-concept-a.png` | ロゴ準拠の単色シルエット。暗背景ではParchment色で使用 |
| ヒーロー背景 | `/assets/summoner-select-bg-v1.png` | 中央配置、暗色オーバーレイを重ねる |
| 盤面テクスチャ | `/assets/bg.jpg` | セクション背景または小さなプレビュー |
| 羊皮紙テクスチャ | `/assets/cards/brush-boundary-b-paper.png` | 見出し下やカード内の限定用途 |

## Summoners

人物紹介には透過・静止画版を優先する。

- `/assets/summoner-still-redani.webp`
- `/assets/summoner-still-linnei.webp`
- `/assets/summoner-still-grease.webp`
- `/assets/summoner-still-mio.webp`
- `/assets/summoner-still-lia.webp`
- `/assets/summoner-still-adel.webp`
- `/assets/summoner-still-villa.webp`
- `/assets/summoner-still-nerasio.webp`

使用規則:

- 顔や上半身を切らない
- 人物ごとの表示面積を揃える
- 背景に直接置かず、薄い光輪またはカード面を挟む
- 同じ人物の `full_*.png` と混在させない

## Featured cards

ホームページ初版では以下を代表アートとして採用する。

| Category | Asset | Reason |
|---|---|---|
| スペル | `/assets/cards/spell-flame-vortex-art-v1.webp` | 動きと火属性が伝わる |
| スペル | `/assets/cards/spell-restore-art-v1.webp` | 回復・支援の幅を示せる |
| スペル | `/assets/cards/spell-wind-turn-art-v1.webp` | 属性とタロット感を補強 |
| クリーチャー | `/assets/cards/c_cresteria.webp` | ゲームの代表的なカード面 |
| クリーチャー | `/assets/cards/c_avalanche.webp` | 戦闘的な印象を出す |
| クリーチャー | `/assets/cards/c_palecoral.webp` | 色調の偏りを防ぐ |
| ウェポン | `/assets/cards/bg-weapon-v1.webp` | ウェポンカテゴリの背景 |

カード画像にはテキストを重ねない。カード名と説明は画像の下にHTMLで置く。

## UI primitives

- `/assets/site/spark-star.svg`: 標準の光芒形スター。単体の強調に使用
- `/assets/site/spark-star-cluster.svg`: 大小2つの光芒形スター。余白の装飾に使用
- `/assets/cards/rule-brush.svg`: 区切り線
- `/assets/cards/cost-frame.svg`: 小さなコスト表示
- `/assets/cards/cost-coin.svg`: ゴールド表現
- `/assets/cards/stat-at-icon.svg`: AT
- `/assets/cards/stat-hp-icon.svg`: HP

スターは上記2種のみを使用する。Unicodeの `★` `☆` `✦` や丸みのある五芒星へ置き換えない。色は単色とし、Ritual Gold、Soft Gold、Parchmentのいずれかに限定する。

## Production checklist

- ロゴは1ページに最大2回。背景に合わせてblue／goldを使い分ける
- 同じカードアートを同一ページ内で重複使用しない
- PNG/WebPの再圧縮は実装時に必要性を測定してから行う
- ヒーローのLargest Contentful Paint対象には幅・高さを指定する
- ファーストビュー外の画像は `loading="lazy"`
- Open Graph画像は1200×630pxで別途制作する
- faviconはロゴ全体ではなく、視認性の高い紋章部分から切り出す
