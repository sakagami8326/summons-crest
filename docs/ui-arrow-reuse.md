# 共通ナビゲーション矢印

素材: `public/assets/ui/arrow-ornate.svg`。召喚士選択で採用された形状・配色をそのまま分離。左向き、viewBox `0 0 52 64`、背景透過。

```html
<button aria-label="前のカード"><img src="/assets/ui/arrow-ornate.svg" alt="" width="26" height="32"></button>
```

- 右向きは画像を `transform:rotate(180deg)`。
- 白色は画像に `filter:brightness(0) invert(1)`。影・発光は使用先のCSSで付ける。
- ボタン自体に操作名を付け、画像は装飾扱い。縦横比を保ち、タップ領域と絵の大きさを分ける。
- 召喚士選択の前後と一覧への戻るボタンは共通素材に置換済み。

## 追加候補（未変更）

| 優先 | 箇所 | 現在の実装 | 使い方 |
|---|---|---|---|
| 1 | スマホのカード図鑑、カード詳細の前後 | `public/phone.html` の `galPrev` / `galNext` | 左右の金色矢印 |
| 2 | リザルト最終デッキのページ送り | `public/result-review.js` の `deckPrevPage` / `deckNextPage` | 小さな左右矢印。無効時は低い不透明度 |
| 3 | リザルトの順位・ハイライト・デッキ間の移動 | 同ファイルの `awardBack` / `awardNext` / `deckBack` | 戻るは白、進むは金。既存の短いボタン名は残す |
| 4 | はじめ方ガイドの戻る・次へ | `public/assets/start-guide/guide.js` の `step-nav` | 操作ボタン横の装飾矢印 |
| 5 | ホームページのメニューリンク | `public/site/navigation.js` | ゲームと同じ装飾に寄せる場合の候補。小さいリンクでは縮小しすぎないよう確認 |

盤面の進路矢印、金額移動の矢印、カード効果の記号は移動経路や数値関係を示す別の用途なので、今回のナビゲーション素材の一括置換対象にはしない。
