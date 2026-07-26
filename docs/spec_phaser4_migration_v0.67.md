# Phaser 4移行 要件仕様書（v0.67）

作成日: 2026-07-26  
対象プロジェクト: Summons Crest（クレストサーキット）  
対象リポジトリ: `E:\クレストサーキット\repo\summons-crest`  
移行元: Phaser 3.90.0  
移行先: Phaser 4.2.1（Giedi、2026-07-09公開）

---

## 0. 本書の位置づけ

本書は、v0.66で実装済みの盤面ワールドをPhaser 3.90.0からPhaser 4.2.1へ移行するための要件を定義する。

本書は実装方法を細部まで固定する設計書ではなく、以下を明確にするための要件仕様書である。

- 移行の目的と対象範囲
- 維持しなければならない既存仕様
- Phaser 4で確認すべき互換性
- 機能・品質・性能・障害復旧の要件
- テスト項目と受入条件
- リリースおよびロールバック条件

既存の盤面Phaser化方針・実装記録については、`docs/plan_phaser_board_v0.66.md`を参照する。

---

## 1. 移行の目的

### 1.1 主目的

1. 今後の盤面演出をPhaser 4の現行レンダラーおよびFilter基盤上で実装できる状態にする。
2. Phaser 3固有の実装負債が増える前に、Phase 2の演出実装開始前に基盤をPhaser 4へ統一する。
3. Phaser 4系の修正・性能改善・将来の保守対象を利用できる状態にする。
4. 現行のゲーム進行、表示、スマホ連携を変更せず、描画エンジンのみを安全に更新する。

### 1.2 移行の成功定義

以下をすべて満たした時点で移行完了とする。

- Phaser 4.2.1で盤面ワールドが起動する。
- v0.66の盤面表示・移動・カメラ・座標連携・FXが維持される。
- ゲームルール、SSE通信、スマホUI、DOMオーバーレイの挙動が変化しない。
- 既存自動テストと本書で追加する移行テストがすべて通過する。
- WebGL環境で2人対戦のフルゲームを完走できる。
- Phaser起動失敗時に既存DOM描画へ復旧できる。
- Phaser 3.90.0へ戻せるロールバック手段が確認されている。

---

## 2. 基本方針

### 2.1 移行方式

段階的な互換移行とし、Phaser 4移行と新規演出追加を同時に行わない。

移行作業中は次の順序を守る。

1. 移行前の基準状態を保存する。
2. Phaser本体を4.2.1へ更新する。
3. 起動・描画互換性を修正する。
4. 表示と動作のパリティを確認する。
5. フォールバックとロールバックを確認する。
6. 移行完了後にPhase 2の新規演出へ進む。

### 2.2 バージョン固定

- 移行先は`4.2.1`に固定する。
- `latest`、範囲指定、起動時CDN取得は使用しない。
- `public/vendor/phaser.min.js`としてリポジトリへ同梱する。
- 取得元URL、取得日、ファイルサイズ、SHA256、ライセンスを`public/vendor/PHASER_VERSION.txt`へ記録する。
- 更新後も`public/vendor/PHASER_LICENSE.md`を同梱する。
- 4.2.1以降への更新は別作業とし、本移行へ自動的に含めない。

### 2.3 読み込み方式

現行と同じブラウザグローバル版を維持し、`window.Phaser`を使用する。

- 本移行ではnpm、ESM、TypeScript、バンドラーを新規導入しない。
- `import Phaser from 'phaser'`への変更は行わない。
- 既存HTMLのスクリプト読込順を維持する。
- Phaser本体の読込失敗はウォッチドッグが検出し、DOM描画へ退避する。

---

## 3. 対象範囲

### 3.1 移行対象

| 対象 | 要件 |
|---|---|
| `public/vendor/phaser.min.js` | Phaser 4.2.1へ差し替える |
| `public/vendor/PHASER_VERSION.txt` | バージョン、URL、SHA256、サイズ、日付を更新する |
| `public/vendor/PHASER_LICENSE.md` | Phaser 4.2.1のライセンス内容を確認する |
| `public/board_world.js` | Phaser 4で動作しない箇所のみ修正する |
| `public/board.html` | 読込、起動、フォールバック、検証パラメータに必要な場合のみ修正する |
| テストコード | Phaserバージョン検証、起動、描画、Tween、ScaleManagerの回帰テストを追加・更新する |
| 関連文書 | v0.67への更新内容と検証結果を記録する |

### 3.2 移行対象となるPhaser機能

現行`board_world.js`で使用している以下の機能を対象とする。

- `Phaser.Game`
- `Phaser.AUTO`および検証用`Phaser.CANVAS`
- `Phaser.Scale.FIT`
- `Phaser.Scale.CENTER_BOTH`
- Texture Manager
  - `addCanvas`
  - `addImage`
  - `exists`
  - `remove`
- Game Objects
  - Image
  - Graphics
  - Text
  - Circle
  - Container
- Tween Manager
  - `add`
  - `addCounter`
  - delay、duration、ease、onUpdate、onComplete
- Camera
  - `pan`
  - `zoomTo`
  - `worldView`
  - `zoom`
- Display Color
  - `HexStringToColor`
- Renderer snapshot
- Game loopの検証用手動step

### 3.3 移行対象外

以下は本移行では変更しない。

- ゲームルールおよび勝敗条件
- `server.js`のゲーム進行ロジック
- SSEの通信形式と`publicState`
- スマホ側の手札・選択・操作UI
- HUD、バナー、カットイン、ダイス、戦闘画面などの既存DOM演出
- 盤面の論理座標、28マス構成、等角投影式
- クリーチャー、建造物、コマなどのアート素材
- 移動タイミング定数
- 新しい水・火・土・風属性エフェクトの本実装
- 戦闘画面全体のPhaser化
- npm、Vite、React、TypeScriptなどへの構成変更
- カスタムShader、RenderNode、Filterの新規実装

---

## 4. 現行実装の互換性評価

### 4.1 低リスク項目

現行実装はImage、Graphics、Text、Container、Tween、標準Cameraなどの標準APIが中心である。カスタムWebGL PipelineやShaderを使用していないため、Phaser 4の新RenderNode方式への独自コード移植は不要とする。

現行実装では以下を使用していない。

- カスタムPipeline
- カスタムShader
- Phaser 3 FX API
- BitmapMask
- `setTintFill`
- Light Pipeline
- `Phaser.Geom.Point`
- `Phaser.Math.TAU`
- `Phaser.Struct.Set` / `Phaser.Struct.Map`
- DynamicTexture / RenderTexture
- Mesh / Plane
- Camera3D / Layer3D
- Spineプラグイン
- 圧縮テクスチャ

これらが新たに検出された場合は、本書の見積もりと移行範囲を再評価する。

### 4.2 重点確認項目

以下は現行コードで使用している、またはPhaser 4の変更影響を受けやすいため重点確認する。

1. **ScaleManager**
   - `FIT`と親コンテナ追従
   - リサイズ、フルスクリーン、横長TVでのサイズ計算
   - 4.2.1で親コンテナへのリサイズ修正が含まれるため、4.2.0以下を採用しない

2. **Tween**
   - `addCounter`の値更新
   - startDelayまたはdelayを使用する演出
   - onCompleteが一度だけ実行されること
   - 4.2.1でTweenのstartDelay状態修正が含まれるため回帰確認する

3. **Camera**
   - `pan`と`zoomTo`
   - `worldView`を利用した`worldToViewport`
   - ズーム途中、リサイズ直後、フルスクリーン時のDOM座標追従

4. **Graphics**
   - タイルFXの楕円、矩形、円、パス描画
   - `clear()`後の再描画
   - 色とAlpha

5. **Texture Manager**
   - SVG由来Imageの登録と世代更新
   - Data URL化した`stone.jpg`
   - 古いテクスチャのremove
   - Scene破棄時のテクスチャ解放

6. **Renderer snapshot**
   - WebGLで画像Data URLを取得できること
   - snapshot失敗時にテストが無期限待機しないこと

7. **Canvas Renderer**
   - Phaser 4では非推奨であることを前提とする
   - `?gl=0`は移行検証・緊急診断用途としてのみ維持する
   - 製品上の本命フォールバックはCanvas Rendererではなく既存DOM描画とする

8. **roundPixels**
   - Phaser 4では既定値が`false`
   - 現行の滑らかな移動・拡大縮小を優先し、明示的に`roundPixels: false`を設定する
   - 変更する場合はスクリーンショット比較を必須とする

---

## 5. 機能要件

### FR-01 Phaser起動

- Phaser 4.2.1がローカル同梱ファイルから読み込まれること。
- 外部CDNへ接続できない環境でも起動すること。
- `Phaser.VERSION`が`4.2.1`であることを起動時またはテストで検証できること。
- 4秒以内にSceneがreadyにならない場合は既存DOM描画へ切り替わること。

### FR-02 盤面表示

- 全28マスが表示されること。
- タイル形状、属性色、所有色、レベル段積みがv0.66と同等であること。
- 城、祠、市場、門が正しいマスと深度で表示されること。
- 通行料、呪い、結界などの表示が維持されること。
- クリーチャーの通常・進化アートが正しく表示されること。
- 同一状態の同期で不要な再構築を行わないこと。

### FR-03 コマ表示・移動

- 1〜4人のコマが正しい位置に表示されること。
- 同一マスの複数コマが重ならず、既存レイアウトと同等になること。
- ホップ移動の開始、1歩ごとの時間、城での中断・再開が既存仕様と一致すること。
- SSE同期で移動中の表示位置が不意に確定位置へ上書きされないこと。
- 移動完了時にサーバー確定位置と照合されること。
- Tweenのキャンセル・再作成で二重完了や残存Tweenが発生しないこと。

### FR-04 カメラ

- `setCamera(null)`で全景へ戻ること。
- `setCamera(tileIndex)`で対象マスへ1.5倍ズームすること。
- カメラTween時間とイージングの体感をv0.66から変更しないこと。
- 連続呼び出し時に不要な同一Tweenを発生させないこと。
- 画面リサイズ中および直後も盤面が親領域へ収まること。

### FR-05 DOMオーバーレイ座標連携

- `worldToViewport(wx, wy)`がブラウザ画面座標を返すこと。
- Cameraのscroll、zoom、ScaleManagerのFIT倍率、レターボックス、Canvas位置を反映すること。
- callout、coinFly、spotなどのDOM演出が対象マスまたはコマへ追従すること。
- 通常表示、ズーム中、リサイズ直後、フルスクリーンで位置ずれが許容範囲内であること。

許容誤差:

- 1280×905基準表示: 中心点から±3px
- 1920×1080および横長TV: 中心点から±5px

### FR-06 既存FX

- `fxRing`、`fxPillar`、`fxBolt`がPhaser 4で表示されること。
- 色、継続時間、消滅タイミングがv0.66と同等であること。
- FX終了後にGame ObjectとTweenが残存しないこと。
- FX連続実行で描画オブジェクト数が増え続けないこと。

### FR-07 状態同期

- Scene準備前に受信した最新stateを1件保持し、ready後に適用すること。
- SSE再接続時はサーバー確定状態へ安全に復帰すること。
- 古い非同期テクスチャ生成結果が新しい盤面状態を上書きしないこと。
- `animBusy`、`lastMoveEnd`、`hopState.holding`の意味を変更しないこと。

### FR-08 描画方式の切替

- 既定描画はPhaserとする。
- オプションメニューからDOM描画へ切り替えられること。
- `?render=dom`でPhaserを使用せずDOM描画を選択できること。
- Phaser起動失敗、Scene例外、テクスチャロード失敗時にDOM描画へ自動退避できること。
- 自動退避後に無限再起動を行わないこと。

### FR-09 検証用機能

- `?fixture=1`でSSEを必要とせず固定盤面を表示できること。
- `PW.snapshot()`または同等手段で検証画像を取得できること。
- `PW.debugCounts()`で最低限、Scene子要素数、コマ数、盤面オブジェクト数、Zoomを取得できること。
- `?gl=0`を維持する場合は「非推奨Canvas Rendererの診断用」であることをコードコメントと文書へ明記すること。

---

## 6. 非機能要件

### NFR-01 性能

対象は実際に使用するTVブラウザを最優先とする。少なくとも以下を満たすこと。

- 静止盤面で不要な継続再構築を行わない。
- コマ移動中に目視できる長時間の停止が発生しない。
- 既存FXを10回連続再生しても操作・SSE処理が停止しない。
- テクスチャ世代更新後に旧テクスチャが解放される。
- 30分間の連続表示でオブジェクト数が一方向に増加し続けない。
- Phaser 3.90.0基準に対して、同一端末・同一フィクスチャで重大な性能悪化がない。

性能悪化の判定基準:

- 平均FPSが20%以上低下した場合は不合格
- 移動演出の所要時間が設計値から±50msを超えて繰り返しずれる場合は不合格
- 30分後のJSヒープが初期安定時より継続的に50MB以上増加し、GC後も回復しない場合は要調査

### NFR-02 表示品質

- クリーチャーアート、タイル、文字が著しくぼやけないこと。
- 細い罫線、通行料タグ、呪いアイコンが欠けないこと。
- WebGLのテクスチャ上下反転が発生しないこと。
- 透明背景、Alpha、描画順がv0.66と一致すること。
- `roundPixels: false`を明示し、移動・ズーム時のちらつきを防ぐこと。

### NFR-03 対応環境

最低限、プロジェクトで実際に使用する以下の環境を対象とする。

- Windows上の現行Chrome
- 共有TVで使用する実機ブラウザ
- WebGL 2が利用可能な環境
- WebGL初期化に失敗した環境でのDOMフォールバック

Canvas Rendererは診断対象とするが、Phaser 4移行後の製品保証対象にはしない。実機要件でCanvasが必要と判明した場合は、Phaser 4移行の可否を再判断する。

### NFR-04 保守性

- Phaser固有処理は原則`public/board_world.js`内に閉じ込める。
- ゲームルールと描画処理を混在させない。
- Phaser 4固有の互換処理には理由と対象バージョンをコメントする。
- グローバル公開するPW APIの名前と意味を変更しない。
- 新規の非推奨APIを使用しない。

### NFR-05 障害解析

以下を開発者が確認できること。

- 読み込まれたPhaserバージョン
- Phaser初期化成功・失敗
- WebGLまたはCanvasの選択結果
- DOMフォールバック理由
- Scene readyタイムアウト
- テクスチャロード失敗
- Context lostまたはRenderer例外

通常プレイ中の画面へ開発者向け詳細を表示する必要はない。コンソールとオプション上の簡潔な通知でよい。

---

## 7. Phaser 4固有要件

### P4-01 RenderNode

Phaser 4のRenderNodeへ移行するための独自実装は行わない。現行コードにカスタムPipelineがないことを移行前の静的検索で確認する。

将来カスタムShaderを導入する場合は、Phaser 3のPipeline例を流用せず、Phaser 4のRenderNodeおよびFilter方式で別途設計する。

### P4-02 Filter

本移行ではFilterを新規導入しない。

Phase 2でGlow、Blur、Mask、ColorMatrixなどを使用する場合は、Phaser 4のFilterを使用し、Phaser 3のFXまたはMask APIを使用しない。

### P4-03 Tint

- `setTintFill()`を使用しない。
- 将来の被弾フラッシュなどは`setTint()`と`setTintMode()`を使用する。
- Tint Modeの選択は演出仕様書側で定義する。

### P4-04 Camera

標準的なpan、zoom、worldViewの範囲に限定する。内部Camera Matrixへ直接アクセスしない。

### P4-05 DynamicTexture

本移行では使用しない。将来使用する場合、Phaser 4では描画命令後に`render()`が必要であることを実装要件へ含める。

### P4-06 Canvas Renderer

Phaser 4でCanvas Rendererが非推奨になったことを受け、障害復旧の優先順位を次のようにする。

1. Phaser 4 WebGL
2. 既存DOMワールド
3. Phaser 4 Canvasは開発・診断用

`Phaser.AUTO`がCanvasを選択した場合も動作確認は行うが、将来的な削除に備え、DOMフォールバックを削除しない。

---

## 8. セキュリティ・ライセンス要件

- Phaser本体は公式配布物または公式npmパッケージ由来のjsDelivrから取得する。
- ダウンロード後にSHA256を記録する。
- 本番起動時に外部コードを動的取得しない。
- PhaserのMITライセンスファイルを同梱する。
- 現行のサーバーAPI、認証、セーブデータ形式へ変更を加えない。

---

## 9. テスト要件

### 9.1 静的確認

- `public/vendor/phaser.min.js`が存在する。
- `PHASER_VERSION.txt`に4.2.1、URL、SHA256、サイズ、取得日が記載されている。
- `Phaser.VERSION === '4.2.1'`を検証できる。
- 以下の禁止APIがプロジェクト内に存在しない。
  - `setTintFill`
  - 独自Pipeline登録
  - `Phaser.Geom.Point`
  - `Phaser.Struct.Set`
  - `Phaser.Struct.Map`
  - Phaser 3 FX API
- `roundPixels: false`が明示されている。

### 9.2 既存自動テスト

`npm test`を実行し、以下を含む全テストが通過すること。

- timing_test
- bot_test
- ui_test
- save_test

### 9.3 Phaser起動テスト

| ID | 条件 | 期待結果 |
|---|---|---|
| P4-B01 | 通常起動 | Phaser 4.2.1、WebGL、Scene ready |
| P4-B02 | Phaserファイル読込失敗を模擬 | 4秒以内にDOM描画へ退避 |
| P4-B03 | Scene create例外を模擬 | DOM描画へ退避し、無限再起動しない |
| P4-B04 | `?render=dom` | PhaserなしでDOM盤面が表示される |
| P4-B05 | `?gl=0` | 診断用Canvasで起動、または対応不能を明示してDOMへ退避 |
| P4-B06 | WebGL context lost | 盤面が停止したまま放置されず、復旧またはDOM退避 |

### 9.4 表示パリティテスト

固定フィクスチャをPhaser 3.90.0とPhaser 4.2.1で同条件撮影し、並べて確認する。

フィクスチャ:

1. 全28マスと全建造物
2. Lv1〜4領地と進化クリーチャー
3. 4人同一マス
4. 結界・呪い・土地効果

画面条件:

- 1280×905
- 1920×1080
- 実TV解像度・アスペクト比
- 全景
- 1.5倍ズーム
- リサイズ直後
- フルスクリーン

確認項目:

- オブジェクト数
- タイル位置と深度
- 建造物とクリーチャーの重なり
- コマ位置
- 文字・バッジ
- 透明度
- 画像の上下方向
- DOM callout座標

### 9.5 動作パリティテスト

- 通常ホップ移動
- 複数ダイス移動
- 城での移動中断・再開
- 4人同一マスへの到着
- 停止マスへのズーム
- 全景への復帰
- SSE再接続
- Scene ready前のstate受信
- 盤面stateの高速連続更新
- FX各種の単発・連続再生
- オプションからDOM/Phaser切替
- セーブして終了、再開

### 9.6 フルゲーム試験

最低1回、可能なら以下を実施する。

- 2人対戦をゲーム終了まで完走
- 実TVで表示
- スマホ2台を接続
- セーブ・再開を途中で1回実施
- 侵略、領地取得、強化、進化、呪文、ショップ、門をそれぞれ1回以上発生
- コンソールに未処理例外がないこと
- 終了時までDOMオーバーレイと盤面の位置関係が崩れないこと

---

## 10. 受入条件

以下をすべて満たした場合のみ、Phaser 4移行を受け入れる。

### 必須

- [ ] Phaser 4.2.1がローカル同梱されている
- [ ] バージョン、SHA256、ライセンスが記録されている
- [ ] 通常環境でWebGL起動する
- [ ] 全28マス、建造物、クリーチャー、コマが表示される
- [ ] 移動タイミングがv0.66と一致する
- [ ] Camera pan/zoomが正常に動作する
- [ ] DOMオーバーレイ座標が許容誤差内で一致する
- [ ] 既存FXが正常に終了し、リークしない
- [ ] `npm test`が全通過する
- [ ] 2人対戦フルゲームを完走する
- [ ] 実TVで重大な性能劣化がない
- [ ] `?render=dom`で完全復帰できる
- [ ] Phaser起動失敗時にDOMへ自動退避できる
- [ ] Phaser 3.90.0へのロールバック手順が確認されている

### 移行後対応でもよい項目

- 新しいFilter演出
- 水・火・土・風の属性別パーティクル
- 戦闘画面のPhaser化
- GPU Sprite Layerの導入
- カスタムRenderNode
- npm/ESM/TypeScript化

---

## 11. 実装フェーズ

### Phase M0: 基準保存

- 現行ブランチ・コミットを記録
- Phaser 3.90.0のvendorファイルを保全
- 既存テスト結果を保存
- 基準スクリーンショットを撮影
- `PW.debugCounts()`の値を保存

完了条件:

- Phaser 3基準へいつでも戻せる
- 比較用の画像と数値が揃っている

### Phase M1: Phaser本体更新

- 4.2.1を取得
- SHA256とサイズを記録
- LICENSE確認
- `phaser.min.js`差し替え
- `PHASER_VERSION.txt`更新
- `roundPixels: false`を明示

完了条件:

- Phaser 4.2.1でScene readyになる
- 起動時の未処理例外がない

### Phase M2: 互換修正

- ScaleManager
- Tween
- Camera
- Texture Manager
- Graphics
- snapshot
- Canvas診断

の順に確認し、必要最小限の修正を行う。

完了条件:

- 固定フィクスチャが表示される
- コマ移動とカメラが動作する

### Phase M3: 回帰試験

- 自動テスト
- スクリーンショット比較
- FX連続試験
- リサイズ・フルスクリーン
- フォールバック試験

完了条件:

- 本書の自動・手動テストに重大な不合格がない

### Phase M4: 実機受入

- TVとスマホでフルゲーム試験
- 性能と視認性を確認
- 検証結果を文書化

完了条件:

- §10の必須項目をすべて満たす

### Phase M5: 移行完了

- 既定描画をPhaser 4とする
- DOMフォールバックを維持する
- `spec_rules.md`の版と履歴を更新する
- 以後のPhase 2演出をPhaser 4 APIで実装する

---

## 12. ロールバック要件

### 12.1 即時ロールバック条件

以下のいずれかが発生し、短時間で解消できない場合はPhaser 3.90.0へ戻す。

- 実TVでWebGL起動率が許容できない
- 盤面が表示されない、または頻繁に消える
- SSE同期とTweenが競合しゲーム進行を誤認させる
- CameraとDOMオーバーレイの位置ずれが解消できない
- Phaser 3比で重大な性能劣化がある
- セーブ・再開を含むフルゲームを完走できない
- DOMフォールバックが動作しない

### 12.2 ロールバック手順

1. 既定描画をDOMへ変更する、または`?render=dom`で運用を継続する。
2. Phaser 4対応コミットを切り戻す。
3. `public/vendor/phaser.min.js`を保全済みの3.90.0へ戻す。
4. `PHASER_VERSION.txt`を3.90.0の内容へ戻す。
5. `npm test`と固定フィクスチャを再実行する。
6. Phaser 3.90.0での正常動作を確認する。

ロールバックのため、移行完了後もしばらくDOM描画を削除しない。

---

## 13. 移行時の禁止事項

- Phaser 4移行と同時にPhase 2演出を追加しない
- ゲームルールを変更しない
- 移動タイミング定数を変更しない
- 盤面座標や等角投影式を変更しない
- DOMフォールバックを削除しない
- Phaserを外部CDNから実行時取得しない
- バージョンを`latest`で管理しない
- 移行のためだけにnpm/ESM/TypeScript化しない
- Phaser 3のカスタムPipelineやFX例を新規コードへ持ち込まない
- Canvas Rendererを長期的な唯一のフォールバックとしない
- 自動テスト未通過の状態を既定描画として公開しない

---

## 14. 既知の判断事項

| 項目 | 決定 |
|---|---|
| 移行時期 | Phase 2の新規演出実装前 |
| 移行先 | Phaser 4.2.1固定 |
| 読み込み方式 | 現行のローカル同梱・ブラウザグローバル版 |
| npm/ESM化 | 本移行では行わない |
| 既定Renderer | WebGL |
| `roundPixels` | `false`を明示 |
| Canvas | 診断用。製品フォールバックはDOM |
| DOMワールド | 当面維持 |
| 新規Filter演出 | 移行完了後に別仕様で追加 |
| 戦闘画面Phaser化 | 本移行の対象外 |

---

## 15. 参照資料

- `docs/plan_phaser_board_v0.66.md`
- `docs/spec_rules.md`
- `public/board_world.js`
- `public/vendor/PHASER_VERSION.txt`
- Phaser公式「Migrating from Phaser 3 to Phaser 4」
  - https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know
- Phaser公式GitHub Releases
  - https://github.com/phaserjs/phaser/releases/tag/v4.2.1
- Phaser 4.0.0 Changelog
  - https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md

---

## 16. 実装完了記録欄

- 移行実施日: 2026-07-26
- 実装コミット: v0.67リリースコミット(移行前基準=0117157e015d5ccd2c39481cd48c471e4bf8a6f1)
- Phaser取得元URL: https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js
- Phaser SHA256: 66348B1B5141E49B7D5EBBE688CDDCB502EAB1CB00F21C538686A5B2C5ABE4DE
- Phaserファイルサイズ: 1,375,976 bytes
- 自動テスト結果: 全通過(phaser_test 20項目新設 / timing 24 / bot 5局完走 / ui 3局 / save 38)
- フィクスチャ比較結果: 一致(docs/parity_v067/ の fixture_phaser3900.png と fixture_phaser421.png を目視比較。
  表示オブジェクト数87で3系・DOM版と同一。タイル/ルーン/バッジ配置/進化絵/4人集合/深度すべて一致)
- 実TV: **未実施(オーナーのテストプレイで確認)** ─ 問題があればオプションからDOM描画へ即切替可
- 使用ブラウザ・バージョン: 開発検証はChromium系(Claude Codeブラウザペイン)。WebGL/Canvas両モード起動確認
- フルゲーム試験結果: 2人対戦2局完走(29周/25周)。2局目は第9周で保存→ルームクローズ→復元→SSE自動再接続→完走。
  戦闘3回・強化・呪文・市場・門・祠・ULT発生。コンソール未処理例外ゼロ
- DOMフォールバック試験結果: `?render=dom`でPhaser未使用のDOM描画87要素を確認。
  自動退避(ウォッチドッグ/onerror)はコード経路維持(v0.66から変更なし)
- Canvas診断結果: `?gl=0`で2Dコンテキスト起動・87オブジェクト描画・snapshot取得可(診断用途のみ・製品保証外)
- 既知の軽微差: ①タイル自体のCSSドロップシャドウ未再現(v0.66からの既知差) ②鍛錬(g_forge)はフルゲーム試験中に
  条件が揃わず未発生(bot_testでは毎回発火・盤面描画はクリーチャー共通経路のため影響なし)
  ③検証用pump()はPhaser 4のtween実時間化により合成時刻の早送り不可(実時間待ち+pumpの併用に変更・製品コード非影響)
- 移行時の互換修正: Phaser固有API依存を2点解消(色変換を自前hexIntに置換 / roundPixels:false明示)。
  その他のAPI(Game/Scale/Tween addCounter/Camera pan・zoomTo・worldView/Texture/snapshot)は4.2.1でそのまま動作
- 移行承認者: (オーナーのテストプレイ確認後に記入)

