# SUMMONS CODE v1.58 マップ実装仕様

## マップ定義

正本は `public/map-definitions.js`。サーバー、テレビ（DOM / Phaser）、スマホが同じ定義を参照する。ルームの `mapId` を解決し、グローバルの盤面を切り替えない。

| ID | 名称 | マス | 通常の周回歩数 | 門 |
|---|---|---:|---|---|
| starting_corridor | 始まりの回廊 | 28 | 28歩 | 従来の1門・200G |
| twin_gate_cavern | 双門の洞窟 | 33 | 外周28歩 / 中央20歩 | 西22・東12、各100G |

洞窟は外周0〜27を左上から時計回り、中央28〜32を左から右へ採番する。城17、分岐A24・B10。上下左右の隣接のみ接続し、空白や斜めには通路を作らない。

| 行 / 列 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| 0 | 店0 | 土1 | 風2 | 風3 | 火4 | 火5 | 店6 |
| 1 | 水27 | | | | | | 水7 |
| 2 | 祠26 | | | | | | 祠8 |
| 3 | 火25 | | | | | | 土9 |
| 4 | 風24 | 水28 | 風29 | 火30 | 土31 | 水32 | 土10 |
| 5 | 火23 | | | | | | 風11 |
| 6 | 西門22 | | | | | | 東門12 |
| 7 | 土21 | | | | | | 水13 |
| 8 | 祠20 | 水19 | 火18 | 城17 | 風16 | 土15 | 祠14 |

土地各属性6、祠4、城1、門2、店2。分岐も通常の土地。中央を通ると上側の2店・2祠を省略する。施設の利用は着地時だけ。

## 中断・再開する移動

- 洞窟だけ `movement` に元の歩数、残歩数、実移動数、移動ID、区間番号、再開先、ダイス・必殺技のメタ情報を保持する。
- プレイヤーの `previousTile` はターンをまたいで保持。次の一歩は直前のマスを除く接続先から選ぶ。
- 初回・瞬間移動直後は `previousTile:null`。出目確定後に通常マスで2方向、分岐では3方向を選択する。
- 分岐で残歩数があれば `route_choice` を発行。歩数0なら着地し、次の移動時に選択する。
- 敵アンカーによる停止を分岐より先に判定。残歩数0のアンカー着地は強制停止としない。
- 城で両門が揃っていれば報酬と回復を確定し、城ドラフトを処理してから残歩数を再開する。勝利した場合は残歩数を破棄する。
- 瞬間移動は到着先の門・城のみ処理し、途中の施設・アンカーを処理しない。
- 風向転換の `reverseNext` は最初の一歩を `previousTile` に強制した後に解除。方向未確定なら使用不可・消費なし。
- ムーブは実際の隣接リストを使用。土地対象のスペル、マーロー、深淵標はマップの土地数と実効属性で評価する。

## 周回と報酬

門の初取得100Gは周回中1門につき1回。両門取得後の城帰還で、完了周回数を1増やして両門状態をリセットする。

城の報酬は `完了周回数 × 100 + round(所有地価合計 × 0.2)`。帰還回復10・カード獲得は従来どおり。回復から派生するワカタマ系の報酬も共通処理を使用する。両門未取得なら周回数・城報酬・帰還回復・ドラフトは発生せず、取得済みの門を保持する。

勝利は両門取得済みの城帰還で、報酬加算後の総資産8,000G以上。旧マップの勝利条件やバランスは変更しない。

## API・保存・表示

- `POST /api/create`: 任意の `mapId`。省略は旧マップ、不明値は400。作成後は変更不可。
- `POST /api/action`: `choose` の `route:<tile>` で確定。`route_preview` は `playerId`、`turnEpoch`、`promptId`、`optionId`、単調増加する `sequence` を検証。古い同一pending内のプレビューも409で拒否する。
- 公開状態: `mapId`、`mapName`、各プレイヤーの `gatesVisited`、`routePreview`。候補は経路、到着先、所有者、Lv、実効属性、現在の通行料のみを追加し、非公開カードを参照・転送しない。
- 到着探索は直前マス・現在マス・残歩数・門状態・周回・資産を含む状態で重複排除。アンカーと城の勝利による移動打切りを反映する。計算は読み取り専用。
- `lastDice.movementId` と `lastDice.segment.id` を分離。区間は `from`、`path`、順序付き `events`、`startAt`、`availableAt`。振り直しやSSE再送による二重移動を防ぐ。
- スマホは候補選択と確定を分離。通信失敗後も再試行可能。演出時刻までは操作不可、テレビ未接続でも時刻経過で進行可能。
- テレビは実経路を再生し、番号付き矢印・経路・到着候補を重ねる。進路プレビューは実線 / 破線で確定部分と分岐後の候補を区別する。
- 再接続時は最新位置へ戻し、過去のダイスや報酬表示を再実行しない。
- 保存形式番号1を維持。`mapId` のないセーブは旧マップ。洞窟の位置・接続・門・移動・pending・区間を検証し、復元失敗は既存ルームを変更しない。プレビューは保存しない。
- BOTはプレイヤーと同じ合法候補から、着地評価と未取得門 / 城への距離を評価し、同点は候補順で決定する。

## 背景アセット

静止した暗い洞窟、青緑の鉱石、古代遺跡。ゲームのマスや文字を背景に焼き込まない。imagegenで新規生成後、sharpでWebPへ変換。

- `public/assets/maps/twin-gate-cavern-v1.webp`: 1920×1080 / 約104KiB
- `public/assets/maps/twin-gate-cavern-preview-v1.webp`: 480×270 / 約9KiB
- `public/assets/maps/starting-corridor-preview-v1.webp`: 既存背景から480×270

生成プロンプト:

> Use case: stylized-concept. Asset: SUMMONS CODE board game background, wide 16:9 landscape. An ancient cavern illuminated by sparse blue-green glowing mineral crystals, worn ancient ruins at perimeter, atmospheric dark fantasy painterly game art. Elevated isometric looking down view. Very large quiet flat dark stone cavern floor filling central 75 percent, low contrast and unobstructed for an overlaid isometric game board. Craggy rock and subtle broken ancient stone pillars at extreme edges only. No characters, no game tiles, no grid, no UI, no text, no logos, no ornate centerpiece. Dark navy charcoal and restrained teal glow. Clear readable composition, polished illustrated RPG environment.

## 検査コマンド

- `npm test`: v1.58専用テストと既存全回帰。
- `npm run test:v158`: 配置、移動、報酬、アンカー、瞬間移動、保存、不正データ、固定乱数2〜4人BOT完走。
- `node v158_browser_test.js`: Playwrightが必要。`NODE_PATH` で導入済みランタイムを指定可能。既定はインストール済みChrome、`PLAYWRIGHT_CHANNEL` で変更可能。
- ブラウザ検査はローカルの一時サーバーを立て、マップ選択、実SSEのプレビュー同期、確認操作、通信失敗、古い通知、再接続、テレビ3解像度・スマホ横3解像度・縦回転案内、DOM描画を確認する。画像は `output/v158/` に出力し、製品アセットには含めない。

### 実施結果（2026-09-06）

- `npm test` 完了。新規2,090検査、固定乱数の新マップ2・3・4人BOT完走、既存のゲーム・UI・セーブ・BOT回帰が成功。
- `v158_browser_test.js` 完了。上記に加え、二重送信、実経路の移動と門通過通知を検査。テレビ1280×720 / 1366×768 / 1920×1080、スマホ667×375 / 844×390 / 896×414でスクリーンショットを取得し、表示を確認。
- DOM描画はテスト内だけで切り替え、本番のPhaser固定設定を維持する。
- ブラウザはローカルChrome。実機スマホ・実テレビおよび本番環境での確認は未実施。

コミットと本番反映は別途依頼時に実施する。
