# Summons Crest ─ 開発ガイド(CLAUDE.md)

カルドセプト/いただきストリート風の「すごろく×デッキ構築」Web対戦ゲーム(2〜4人)。
テレビで共有ボード(board.html)を映し、各プレイヤーはスマホ横持ち(phone.html)で操作する。
オーナーはゲームデザイン・AIアート・BGMを担当し、Claudeが実装・検証・ドキュメントを担当してきた。
テストプレイ→即日修正のサイクルで開発している。

- 公開URL: https://summons-crest.onrender.com (mainへのpushでRenderが自動デプロイ)
- 現在バージョン: **v0.70**(server.jsの`VERSION`とboard.html左下の`board X.XX`表記)

## 構成

```
server.js          … ゲームロジック全部入り(Node単体・依存パッケージなし・DB無し・全状態メモリ上)
public/board.html  … テレビ用共有ボード(SSEでstate受信)
public/phone.html  … スマホ操作画面(横持ち専用)
public/assets/     … アート(c_<id>.png=カード絵, e_<id>.png=進化形, full_*.png=キャラ立ち絵)
bot_test.js        … サーバー回帰テスト(後述)
ui_test.js         … スマホUI貫通テスト(後述)
tools/make_outline.py … アート加工(白背景透過+トリム+縁取り+width300)
docs/              … ゲーム説明書・仕様書(ファイル名は文字化け防止のため英数字)
```

サーバーは`rooms`マップに全状態を持つ。1ルーム=`r`オブジェクト(players/owners/pending/battle/tileFx/elemOv…)。
クライアントは`publicState(r, pid)`の定期ブロードキャストを受けて全描画する(状態駆動・差分なし)。
プレイヤーの入力はすべて「pending(選択肢の提示)→`handleChoose(r, pid, optionId)`」の1本道で処理する。

## 開発ルール(この流儀を守ること)

1. **パッチは実コードをgrep/readで確認してから書く。** 記憶や推測でアンカー文字列を作らない(インデント1つの違いで全滅する)。Python heredocで`assert old in s`方式の置換を使ってきたが、Claude CodeならEdit toolで同じ規律を守ればよい。
2. **変更のたびにバージョンを上げる**: server.jsの`const VERSION`と、board.htmlの`/ board X.XX`表記の両方。ユーザーはテレビ左下の表記でデプロイ版を確認する。
3. `pkill -f node`は使わない(環境を巻き込む)。ポート解放は`fuser -k 3000/tcp`等で。
4. **UI設計思想**(詳細は`docs/spec_rules.md` 13章): ①選択はボタン列でなくカード/マスを直接タップ(土地選択=ミニマップ、鍛錬・交代=カードタップ) ②大型UIは全画面切替(空きスペースへの押し込み禁止) ③UIに絵文字を出さない(iconizeでアイコン化or除去) ④テレビでは出来事を必ず演出で見せる(秘匿は手札とドラフトのみ)/マス変化はズーム+中央下メッセージ ⑤演出は直列(前の演出が終わってから次を発火) ⑥スマホはフロー配置(帯をfixedで重ねない ─ ui_testが検査)。
5. カードの絵はファイル名規約で自動解決される: 通常`assets/c_<id>.png`、進化形`assets/e_<id>.png`。新カードはIDとファイル名を一致させれば表示コードの変更は不要。
6. アート加工は `python3 tools/make_outline.py 入力.png public/assets/c_xxx.png --width 12 --color auto`(白背景透過→トリム→縁取り→幅300px)。
7. 新しい仕様はオーナーがMDで渡してくる。実装後、仕様との差異・確認事項は必ず報告に明記する。

## 検証(コード変更後は必ず全部通すこと)

```bash
node --check server.js && node --check public/game_timing.js && node --check public/board_world.js
node -e "const fs=require('fs');for(const f of ['public/board.html','public/phone.html']){[...fs.readFileSync(f,'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m=>new Function(m[1]));}console.log('OK')"
npm test    # timing(定数共有) → bot(サーバー回帰) → ui(スマホ貫通) → save(セーブ/復元)
```

- **bot_test.js**: server.jsをin-processで評価し、4体のランダムBOTが5局完走するかを検証。
  - カード保存則(全ゾーン+盤面+風の回廊の「戦闘中ゾーン」の合計が減ったら即失敗)
  - 全pending種別の発火網羅を出力
  - キャラ選択の`unpick`は10%でしか選ばない(ライブロック回避)
- **ui_test.js**: phone.htmlのスクリプトをDOMスタブ上で丸ごと実行し、サーバーと結合して3局走行。
  - 実HTMLに存在しないIDへの参照はnullを返す(=`$('actions')`型の実行時死を検知)
  - 毎手番「pendingがあるのに操作可能なUI(choose/mmTap/onclick/カードタップ)がゼロ」なら進行不能として失敗
  - 仮想時計(skew)で到着演出の時間待ちを解く。演出系を追加したら最大3パスの範囲で解けるか確認
- **save_test.js**: セーブ/復元の往復・検証・認可(v0.62)。**timing_test.js**: 移動タイミングのgame_timing.js共有と直書き再発検出(v0.66)。
- **盤面描画(v0.66〜)**: 既定はPhaser(`public/board_world.js`+同梱`vendor/phaser.min.js` **4.2.1固定**・v0.67で3.90.0から移行)。`?render=dom`とオプションメニューで旧DOM描画へ切替可・初期化失敗時は自動退避(Canvasは`?gl=0`の診断用・製品フォールバックはDOM)。**移動タイミングはgame_timing.jsのみで変更する**(直書き禁止)。パリティ確認は`/?fixture=1`+PW.snapshot()。禁止API等はphaser_test.jsが検査。Phase 2の新演出はPhaser 4のFilter/RenderNode方式で実装する(3系のFX/Pipeline例を持ち込まない)。
- 機能追加時は上記に加えて**単体テスト**(handleChoose/resolveBattleを直接叩く小スクリプト)を書き、仕様書の計算例をそのまま検証する。

過去にテストが検知した実バグ(教訓):
- クライアントの要素ID誤記(`$('actions')`)による描画死 → BOTテストでは見えない。ui_testが必要な理由。
- rollingフラグとlastDice待ちのデッドロック
- 同一ミリ秒のイベント衝突(→`stamp(r)`で全イベント刻印を単調増加化済み。`at: Date.now()`を新設しないこと)
- 破産直後のプレイヤーへのoverflow要求(観戦画面で操作不能)

## ゲーム仕様の要点(v0.62)

**現行ルールの全体像は`docs/spec_rules.md`**(実装準拠・常に最新を維持)。カード詳細はspec_spells_v0.53.md / spec_creatures_v0.57.md、ドロー詳細はspec_draw_v0.61.md、セーブ/再開はspec_save_v0.62.md。実装済みの重要ポイント:

- **セーブ/再開**(v0.62): 盤面ブラウザが`saveRev`契機で`/api/save`を呼びlocalStorageへ自動保存 → タイトル「続きから再開」で`/api/restore`(同一コード・同一ID復元)。save/close/restoreは`boardToken`認可。**ルームに新フィールドを追加したら`ROOM_PERSIST_KEYS`/`ROOM_RUNTIME_KEYS`に必ず分類する**(save_testが未分類を検出)。名前復帰=進行中ルームへ同名(切断中のみ)で/api/join。

- **選択ドロー**(v0.61): 手番開始時に山札から2枚見て1枚を手札へ・1枚を捨て札へ(`startPickDraw`/pending `pick_draw`/候補は本人のみ公開)。**制限時間なし**(v0.63でタイムアウト廃止)。祠・戦闘勝利・ひらめきは従来どおり直接ドロー。
- **獲得カードは山札行き**(v0.61): ドラフト・支援購入・鍛冶は`gainToDeck()`で山札に加えてシャッフル。捨て札直行にしないこと。

- **勝利**: 総資産8000G以上で城を通過(資産=所持金+地価+称号500G+秘宝600G)。7000Gでラストスパート。
- **地価**=100G×Lv倍率(1/2.5/**10**/**36**)×連鎖倍率(1.0/1.4/1.8/2.2/2.6)。**通行料**=地価×25%×rate(清流+0.2、満ち潮+0.5の加算式)。強化費用=100/450/950G(親和-20%)。
- **呪文は1ターンに1回まで**(v0.60。対象キャンセルは未使用扱い)。
- **破産**: 所持金マイナス→強制売却(70%)→それでも負なら脱落。破産者にpendingを出さないこと。
- **刻印**: 門通過で**+200Gと刻印**を取得(v0.59)、城通過で消費して一周ボーナス(+200G+地価10%+無料ドラフト+自領地負傷-10)。周回p.lapは刻印に関わらず+1。
- **進行方向**: 初回のダイス後に矢印UIで選択(`r.dirPend`)。出目は`noMove`付きlastDiceで先行配信し、確定後は同じatで移動再開(二重演出防止)。
- **戦闘(v0.57)**: 戦闘耐久値=現在HP+DF のプール方式。攻撃AT計算順=基礎/進化→固有→死影→血染めの刃→炎の渦→根の牢獄→支援→最低0。DF=地形(+岩壁+10/20)→女王(重複せず最大のみ)→岩盤隆起→支援。パカワタ【先制】は防衛側が先に1回(反撃の代わり)、アヴァランチ【双撃】は侵略時のみ同AT2回(プールから連続減算)。
- **属性変更**: `TILES`は共有constなので直接書き換え禁止。`r.elemOv`+`tileElem(r,i)`を必ず使う。
- **土地継続効果**: `r.tileFx[i]={vortex,tide:{by},uplift,roots}`。戦闘終了/受領/手番開始で解除。
- **死影**: `o.shade`(0-3)。土地にいる間持続、移動系で持ち越し、手札に戻ると解除。
- スペルの直接ダメージは`spellDamage(r,i,raw,srcName)`を経由(不動-10・死影蓄積・撃破処理を一元化)。
- 手札上限7(手番終了時overflow、破産者除外)。共通山札82枚(N×3/R×2/L×1)。

## 未解決・保留事項

- 衰弱/渦で滅んだ土地のレベルは消滅する実装(仕様書は「レベルそのまま」→ 廃墟システムの要否をオーナーに確認中)
- 数値バランス全般はテストプレイ待ち(特に v0.57で王の徴収が「その土地限定」になり複数キング戦略が弱体化)
- 未着アセット: 支援カード5種のイラスト(SVG代用中)、カード裏面(❖代用中)、効果音16種
- 説明書は`docs/manual.md`、ルールまとめは`docs/spec_rules.md`(どちらも**常に最新を維持する生きた文書** ─ バージョン付きの旧名からリネーム済み)。仕様変更時は両方更新する(**新規ファイル名は必ず英数字にする** ─ 日本語名はWindowsのzip展開やgitで文字化けの元)

## 報告の流儀

実装完了時は日本語で、(1)何を実装したか、(2)仕様との差異・独自判断、(3)実行したテストと結果、(4)確認してほしい事項、を簡潔に報告する。バランスに関わる変更は体感確認を促す一言を添える。
