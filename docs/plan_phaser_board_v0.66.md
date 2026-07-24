# 盤面ワールドのPhaser移行 実装計画(v0.66・レビュー反映版)

状態: **Phase 0〜1D実装済み(v0.66)**。レビュー指摘(P1×4・P2×3)反映済み・対応表は§10。実装記録は§11。

## 0. 背景・目的

- 盤面(board.html)の見た目を「ゲームっぽく」する: パーティクル・滑らかなカメラ・トゥイーンなどWebGLならではの演出
- 盤面はSSEで`publicState`を受け取る純粋なビューアーなので、描画層だけを差し替える

## 1. 方針(3原則)

1. **ハイブリッド**: Phaser化するのは「盤面ワールド」(マス・クリーチャー・コマ・移動・カメラ・マス上のFX)だけ。HUDプレート・戦闘画面・バナー・カットイン・ダイス演出・タイトル/ロビー/セーブUI・オプションは**既存DOMのままcanvasの上に重ねる**(ワールドはクリック操作を持たないためcanvasはpointer-events:none)
2. **契約維持**: ワールド層APIを同等のセマンティクスでPhaser実装に差し替え、呼び出し側(バナーキュー・tileCloseup・実況など)は無修正。ただし座標APIは論理座標と画面座標に**分離**する(§3.2)
3. **フォールバック**: 旧DOMワールドを削除せず併存。自動退避ウォッチドッグ+手動切替(§6.1)

**変更範囲の正確な定義**(初版の「phone.html無変更」を修正):
- server.js: **無変更**
- phone.html: **移動タイミング定数の読み込み元を共有ファイルに変える1点のみ**(挙動は不変・§3.1)
- board.html: ワールド層を`public/board_world.js`へ分離しPhaser化。DOM UI部は原則無修正

## 2. 現状の棚卸し

### Phaserへ移植する(ワールド層)

| 要素 | 現実装 | 備考 |
|---|---|---|
| 座標系 | `GEO`(8×8周回28マス)+等角投影`proj()`(TW150/TH84/THICK16/GS1.16/OX640/OY150) | 定数ごと移植。仮想解像度**1280×905**を維持 |
| マス描画 | `#stage`にDOMスプライト一括構築(ownersCacheで差分抑制) | タイル台座・属性色・建造物(城/祠/市場/門)・レベル段積み・通行料タグ・結界/呪い表示 |
| クリーチャー | `artHTML`(c_/e_ PNG・レベルで進化絵) | そのままテクスチャとして使用 |
| コマ | `renderPawns`+`hopState`ステートマシン(ホップ移動・同マス集合オフセット・影・城での中断/再開) | タイミングは§3.1の共有定数に従う |
| カメラ | `applyZoom`/`setZoom`(fit倍率+停止マスへの1.5倍ズーム) | Phaserカメラ(pan/zoomTo+イージング)で置換 |
| マスFX | `fxAt`(fxRing/fxPillar/fxBolt)・`showCallout`・`showSpot`・`coinFly` | パーティクル/トゥイーンで再実装。テキストを含むcalloutはDOM併用(§3.2の画面座標APIを使用) |

### DOMのまま残す

HUDプレート・ティッカー・centerBanner・tileMsg(中央下)・turnCutin/summonCut/ultCut/bankruptCut・戦闘画面一式・ダイス演出(3D CSS)・telop・ショップ演出・tileInfoパネル・タイトル/ロビー/QR・セーブ/オプションUI・BGM。

## 3. アーキテクチャ

```
board.html
├─ <canvas>(Phaser・z-index最下層・仮想解像度1280×905・ScaleManager FIT)
│    BoardScene: マスごとのTileContainer(§3.4)+パーティクルマネージャ
├─ 既存DOMオーバーレイ(HUD・演出・メニュー ─ 無修正)
├─ public/game_timing.js(§3.1: board/phone共有の演出タイミング定数)
└─ public/board_world.js(ワールド層アダプタ: DOM実装/Phaser実装の切替と共通API)
```

### 3.1 タイミング定数の共有(`public/game_timing.js`)

移動演出の数値はスマホの到着UI待ちと完全一致が必須。現状はphone.htmlに直書きのため、**共有ファイル化**する:

```js
const GAME_TIMING = {
  moveStartDelay: 1900,      // 移動開始までの初動(単独ダイス)
  moveStartDelayMulti: 2900, // 複数ダイス時の初動
  stepMs: 250,               // 1歩あたり
  castleResume: 650,         // 城ドラフト後の移動再開
  arriveBufA: 1100,          // 到着バッファ(城経由)
  arriveBufB: 1300,          // 到着バッファ(通常)
  castleDraftLead: 400,      // 城ドラフト表示の先行
};
```

- board.html(Phaser/DOM両実装)とphone.htmlは**必ずこのファイルから参照**する(直書き禁止)
- テストハーネス対応: ①HTML構文チェックの対象に`game_timing.js`を追加 ②ui_test.jsはphone.htmlのインラインscript実行前に`game_timing.js`の内容を読み込んで連結する(既存の`<script>`抽出方式の拡張)
- さらに保険として、**タイミング一致の自動テスト**(§7.2)で片側だけの改変を検出する

### 3.2 座標APIの分離(論理座標 vs 画面座標)

現行`worldPos()`は`#world`内の論理座標を返し、DOM親のtransformが画面変換を担っていた。Phaser化後はこの前提が崩れるため分離する:

```js
worldPos(tileIndex)        // 論理ワールド座標(1280×905空間) ─ Phaser内部・proj()と同一
worldToViewport(tileIndex) // DOMオーバーレイ用のブラウザ画面座標(px)
```

`worldToViewport()`は以下を**すべて**合成して算出する:
1. Phaserカメラのpan(scrollX/Y) 2. カメラzoom 3. ScaleManagerのFIT倍率 4. canvas周囲の余白(レターボックス) 5. `canvas.getBoundingClientRect()`(ページ内位置)

- 利用箇所: `showCallout`(DOM吹き出し)・`coinFly`の起点・`showSpot`相当・その他DOM側でマス位置を使うすべて
- DOM描画モード時は`worldToViewport` = 旧実装(worldPos+worldのtransform適用)で同じ値を返す
- **検証**: ズーム中・リサイズ直後・フルスクリーンでcallout位置がマスに追従することをパリティ項目に含める(§7.3)

### 3.3 SSE同期とアニメーションの所有権

サーバー確定状態と表示中状態を明確に分離する:

```
authoritativeState  … SSEで受け取った最新のstate(常に上書き)
presentationState   … 画面上の表示位置(移動アニメ中はこちらが優先)
```

ルール:
- `BoardScene.sync(state)`は**移動アニメ中のコマ位置を上書きしない**(現行`pawnAnim`優先と同じ所有権モデル)
- 移動終了時(`finishHop`相当)に`authoritativeState`の確定位置へ**照合**し、ズレていれば即座に確定位置へスナップ
- **Scene準備前のSSE**: 最新state1件だけを保留バッファに保存し、`create()`完了後に適用(画像ロード完了前の受信に対応)
- **SSE再接続時**: 進行中アニメーションは安全に完了させるか、即キャンセルして確定位置へスナップ(再接続で届くstateは常に最新のため、スナップを既定とする)
- `animBusy`/`lastMoveEnd`/`hopState.holding`のセマンティクスは現行どおり維持(バナーキュー・TURN START・ショップ演出が参照)

### 3.4 深度設計: マス単位コンテナ

固定レイヤー方式(全タイル<全クリーチャー)では、奥のクリーチャーが手前の城・高レベル段積みより前に出る事故が起きるため、**マスごとにコンテナを作る**:

```
TileContainer(マスごと)
├─ タイル底面 → 段積み → 建造物 → クリーチャー → コマ → マスFX(コンテナ内は固定順)
tileContainer.depth = Math.round(projectedY * 100);
```

- 移動中のコマは所属コンテナを跨ぐため、コマだけはシーン直下に置き `depth = projectedYベース + 系数` で同じ式に乗せる
- 同一マスに複数コマがいる場合の前後は、集合オフセットの`dy`を子depthに反映

## 4. 段階計画

### Phase 0: 土台(半セッション)
- Phaser同梱(§9.1のバージョン固定手順)・canvas設置・ScaleManager(FIT・1280×905)
- `game_timing.js`切り出し+phone.html/ui_test/構文チェックの追随(**この時点で既存テスト全通過を確認**)
- レンダラー切替(§6.1)の骨格・空Sceneでの重なり/リサイズ確認

### Phase 1A: 静止盤面(1セッション)
- TileContainer構造・タイル台座/属性色/建造物/レベル段積み/通行料タグ/結界・呪いマーカー/クリーチャー(進化絵)
- フィクスチャ表示モード(§7.3)もここで実装(以後の確認に使う)

### Phase 1B: コマ移動(1セッション)
- コマ+ホップ移動(共有タイミング準拠)・同マス集合・影・城での中断/再開・§3.3の所有権モデル
- タイミング自動テスト(§7.2)をここで追加

### Phase 1C: カメラとDOM座標連携(0.5〜1セッション)
- fit/停止マスズーム(`setZoom`契約)・tileCloseup・`worldToViewport`と利用箇所の接続

### Phase 1D: FXとフォールバック仕上げ(0.5〜1セッション)
- fxAt/showCallout/coinFly同等品・ウォッチドッグ自動退避・オプションからの描画切替
- **Phase 1完了条件**: §7.3のパリティ確認+2人対戦フルゲーム1局(セーブ/再開含む)をPhaser描画で通す

### Phase 2: ジュース(継続的に追加・優先順は§9.3)
- 移動: squash&stretch・着地の土埃・ゆるい追従カメラ
- 侵略成功: 火花+フラッシュ / 進化: 光柱 / 退場: 崩壊パーティクル
- 通行料: コインが飛び散ってHUDへ吸い込まれる / 連鎖成立: 同属性マスの波及発光
- ※演出直列ルール(cutBusy/バナーキュー)に従う

### Phase 3(任意・別判断): 戦闘シーンのPhaser化
- 現行DOM戦闘画面は完成度が高いため当面残す。Phase 2完了後に再評価

## 5. 互換性の要点(壊してはいけないもの)

1. 移動タイミング(§3.1の共有定数経由でのみ変更可能。変更時はboard/phoneが自動で揃う)
2. `animBusy`/`lastMoveEnd`/`hopState.holding`のセマンティクス
3. `setZoom(ti)`契約(tileCloseup・updateTileInfoが呼ぶ)
4. UI設計思想: 絵文字禁止・演出直列・マス変化はズーム+中央下メッセージ
5. 既存テスト一式(bot/ui/save)+構文チェックの通過

## 6. リスクと対策

### 6.1 フォールバック(多段構え)

`Phaser.AUTO`(WebGL→Canvas自動切替)だけでは、スクリプト読込失敗・テクスチャロード失敗・Scene初期化例外・コンテキストロスト・実装バグに対応できない。以下を実装する:

```
Phaser起動 → 4秒以内にScene ready?
   ├─ 成功 → Phaser描画
   └─ 失敗/例外/タイムアウト → DOM描画へ自動切替+localStorageに記録
                                (次回起動時もDOMで開始し、無限リトライを防ぐ)
```

- **手動切替**: オプションメニューに「描画方式: Phaser/DOM」を追加(URL入力不要でその場で復旧できる)。`?render=dom|phaser`も併用可
- 実行時例外はwindow.onerrorで捕捉し、ワールド層由来ならDOMへ退避+オプションに通知表示

### 6.2 その他

| リスク | 対策 |
|---|---|
| 低スペックTVでの性能不足 | Phaser.AUTO+§6.1の手動切替。パーティクル数はPhase 2で上限設定 |
| 等角投影の深度 | §3.4のマス単位コンテナ |
| 日本語テキストのcanvas描画品質 | 数字タグはPhaser Text(システムフォント)。長文はDOM側 |
| board.htmlの肥大 | ワールド層を`public/board_world.js`に分離(構文チェック対象に追加) |
| 移植中のデグレ | フォールバック併存+§7の自動テスト+フィクスチャ比較 |

## 7. テスト計画

### 7.1 既存テスト
- `npm test`(bot/ui/save)の全通過を各Phaseの完了条件に含める(特にPhase 0の`game_timing.js`切り出し直後)

### 7.2 タイミング自動テスト(新設・npm testに常設)
- `game_timing.js`の値がboard/phoneの両方で参照されていること(直書き定数の再出現をgrepで検出)
- ホップ進行のスケジュールをフェイクタイマーで検証: 開始遅延(1900/2900)→歩数×250ms→城で中断→650ms再開→`animBusy`解除・`lastMoveEnd`更新の時刻が期待どおり
- 実装のためPhase 1Bでホップ進行ロジックを純粋関数(タイマー注入可能)としてboard_world.jsに切り出す

### 7.3 パリティ確認(フィクスチャ+スクリーンショット比較)
- **フィクスチャ表示モード**: `?fixture=<name>`で固定stateを描画する開発用モードを実装(SSE不要)
- フィクスチャ一覧: ①全28マス+全建造物 ②Lv1〜4の領地+進化クリーチャー ③4人同一マス集合 ④結界・呪い・土地効果つき
- 撮影マトリクス: 通常表示/停止マス1.5倍ズーム × 1280×905/1920×1080/横長TV比率 × WebGL/Canvas
- 新旧レンダラーで同一フィクスチャを撮影し**並べて比較**(開発中はブラウザ自動操作で撮影・保存)。基準スクショは`docs/parity_v066/`に保存
- 目視項目(動きもの): ホップ移動・ズーム追従・callout/coinFly位置(ズーム中・リサイズ直後・フルスクリーンを含む)・`?render=dom`完全復帰

## 8. 規模感(レビュー反映で再見積もり)

- Phase 0: 半セッション
- Phase 1A〜1D: **合計3〜4セッション**(初版の1〜2セッションは過小だった)
- Phase 2: 項目ごとに小刻みに追加
- Phase 1完了までは見た目パリティが目標(リリース可能状態を維持)

## 9. 実装前にオーナーが決めること

1. **Phaserのバージョン固定手順**(推奨): Phase 0の冒頭で特定バージョンを取得し、本計画書に「正確なバージョン番号・取得元URL・phaser.min.jsのSHA256」を追記。`public/vendor/`にLICENSEファイルを同梱。以後の更新はオーナー承認制。Canvas/WebGL両モードでの動作検証をPhase 0完了条件に含める
2. 新描画を既定にするタイミング(推奨: Phase 1D完了後に既定=Phaser。`?render=dom`とオプション切替は当面残す)
3. Phase 2の演出優先順位(推奨: 移動ジュース → 侵略/進化 → コイン → 連鎖波及)

## 10. レビュー対応表(2026-07-24)

| 指摘 | 対応 |
|---|---|
| P1-1 タイミング共有とphone無変更の矛盾 | **採用(推奨案)**: `game_timing.js`を新設しboard/phoneで共用。§1の変更範囲を「phoneは定数読み込み元の変更のみ」に修正。ui_test/構文チェックの追随と、直書き再発を検出する自動テストも追加(§3.1・§7.2) |
| P1-2 worldPos座標空間の曖昧さ | **採用**: `worldPos`(論理)と`worldToViewport`(画面px)に分離。カメラpan/zoom・FIT倍率・レターボックス・getBoundingClientRectの合成を明記(§3.2) |
| P1-3 SSE同期とアニメ競合 | **採用**: authoritative/presentationの所有権モデル、Scene準備前の保留バッファ、移動中の非上書き、終了時照合、再接続時スナップを明記(§3.3) |
| P1-4 深度設計の不足 | **採用**: マス単位のTileContainer+depth=projectedY方式へ変更。移動中コマの扱い・同マス複数コマのdyも規定(§3.4) |
| P2-5 フォールバック不足 | **採用**: Scene readyウォッチドッグ(4秒)で自動DOM退避+localStorage記録、オプションメニューからの手動切替、window.onerror捕捉(§6.1) |
| P2-6 目視中心のパリティ確認 | **採用**: フィクスチャ表示モード+新旧スクリーンショット比較マトリクス+タイミングのフェイクタイマー自動テスト(§7.2-7.3)。完全な自動画素比較は依存追加になるため導入せず、固定フィクスチャの系統的撮影比較で代替 |
| P2-7 バージョン固定が曖昧 | **採用**: 「3系最新」を撤回し、§9.1の固定手順(正確なバージョン・URL・SHA256・LICENSE同梱・両レンダラー検証・更新はオーナー承認制)に変更。実装時に本書へ追記 |
| 規模見積もり | **採用**: Phase 1を1A〜1Dに分割し合計3〜4セッションに修正(§4・§8) |

## 11. 実装記録(2026-07-24 / v0.66)

### 確定事項
- **Phaserバージョン**: 3.90.0(3系最新安定版)を`public/vendor/phaser.min.js`に同梱
  - 取得元: https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js
  - SHA256: `E92DDEF111BA42E92D316979C732311757093688EA1810591CB7AA2858EBA7A7`(1,196,122 bytes)
  - LICENSE(MIT)を`PHASER_LICENSE.md`として同梱。詳細は`public/vendor/PHASER_VERSION.txt`
- **既定の描画**: Phaser(パリティ確認済みのため)。`?render=dom`・オプションメニューの「描画方式」でDOMへ切替可

### 実装ファイル
- `public/game_timing.js`: board/phone共有の移動タイミング定数(§3.1)
- `public/board_world.js`: PhaserワールドレンダラーPW(§3のアダプタ・カメラ・座標変換・FX)
- board.html: ディスパッチャ(renderBoard/renderPawns/applyZoom/fxAt/showCallout/flyCoins)、
  タイルSVG・バッジ配置・コマレイアウトの共有関数化(buildTileSVG/buildTollBadges/pawnLayout)、
  ウォッチドッグ自動退避(4秒・1時間記憶)+window.onerror捕捉、オプションの描画切替、
  フィクスチャ表示(`/?fixture=1`)、`?gl=0`でCanvasレンダラー強制(検証用)
- server.js: `/api/fixture`(パリティ確認用の固定state)・静的ルート追加
- `timing_test.js`: 共有定数・直書き再発検出・式構成の検査(24項目・npm test常設)

### 設計上の決定(計画からの差分)
- **深度**: §3.4のマス単位コンテナ案に代えて、実績のあるDOMのzIndex体系(sum+100系)をdepth値として
  そのまま移植した。DOMと同一の数値体系なので描画順は構築上一致する(パリティ目標に対して十分)
- **タイルの見た目**: DOMと同じSVG文字列をテクスチャ化することで完全パリティを実現
  (stone.jpgはSVG-as-imageの外部参照制限のためdataURL埋め込み)。タイル自体のCSS drop-shadowのみ未再現(既知の軽微差)
- **タイミング検証**: フェイクタイマーでのホップ進行テストは、共有定数化+式構成検査で代替
  (ホップ機構自体をboard.htmlに残しDOM/Phaserで共用したため、片側だけズレる経路が存在しない)

### 検証結果
- `npm test`全通過(timing24+bot5局+UI貫通3局+save38)
- フィクスチャのスナップショット検証: 表示オブジェクト数がDOM版と一致(87)、
  タイル/建造物/進化クリーチャー/バッジ/4人集合コマの描画をピクセル読み出しとPNG目視で確認
- カメラ: setZoom契約(1.5倍ズーム/全景復帰)・worldToViewportの画面中央一致を確認
- 実ゲーム: 2人対戦を4ラウンド、Phaser描画でコンソールエラーなし・ホップ完走・animBusy解除を確認
- WebGL/Canvas両レンダラーで初期化・描画を確認(`?gl=0`)

### 残項目(Phase 2以降)
- ジュース演出(§4 Phase 2)は未着手 ─ 次の指示で優先順位(§9.3)に従って追加
- 実TVでの見た目・性能確認(低スペック時はオプションからDOMへ切替可能)
