# スペル盤面演出 対応表(発注書v0.75 §7 ─ 納品物)

実装状況: 全22種 実装済み(第1群=v0.77 / 第2〜4群=v0.78)

イベント経路: サーバー`spellFx(r, sid, tiles, caster)` → `publicState.lastSpellFx` →
TVがバナー(pri2)→ズーム+`PW.play({type:'spell-fx', spell, tiles, caster})`の順に直列再生。
ハーネス: `?fixture=1&fx=spell&spell=<sid>`

| # | スペル | sid | 群 | 状況 | 盤面演出 |
|---|---|---|---|---|---|
| 1 | 衰弱の呪文 | sp_weaken | 1 | ✅ v0.77 | 暗紫projectile→着弾→紫Tint(撃破時は既存ruin-fxが続く) |
| 2 | 炎の渦 | sp_flame_vortex | 1 | ✅ v0.77 | 火種projectile→回転する円形の炎→Tint+火粒子(状態バッジは既存) |
| 3 | 根の牢獄 | sp_root_prison | 1 | ✅ v0.77 | 四隅から根が中心へ伸びる→緑pulse(状態バッジは既存) |
| 4 | リストア | sp_bedrock_uplift | 1 | ✅ v0.77 | 亀裂+岩片上昇→回復pulse |
| 5 | 地割れ | sp_quake | 1 | ✅ v0.77 | 中心から亀裂→砂煙+小shake(レベル段はstate反映のSVG切替) |
| 6 | スイッチ | sp_move | 1 | ✅ v0.77 | 両マス魔法陣→2体同時縮小→交差光跡→再出現 |
| 7 | ムーブ | sp_step | 2 | ✅ v0.78 | 移動元→先を属性線で接続しクリーチャー移動(空き地=配置/敵地=戦闘へ) |
| 8 | 風の回廊 | sp_wind_corridor | - | 廃止 v1.04 | ムーブへ一本化 |
| 9 | 羽休め | sp_feather_rest | 2 | ✅ v0.78 | 風・羽状光で包む→縮小上昇消滅→空き地化 |
| 10 | チェンジ | sp_swap | 2 | ✅ v0.78 | 旧を暗転縮小→捨て札方向へ・新を配置演出(直列) |
| 11 | バリア | sp_ward | 2 | ✅ v0.78 | 自領地を盤面順に弱発光+結界輪(以降は既存結界枠/barrier-flash) |
| 12 | 満ち潮 | sp_high_tide | 2 | ✅ v0.78 | 水領地外周を一周する波→水滴が通行料タグへ |
| 13 | フレイム・シフト | sp_volcanic_core | 3 | ✅ v0.78 | 火種を埋める→赤い亀裂→光被覆→火属性SVGへ |
| 14 | アクア・シフト | sp_abyssal_pearl | 3 | ✅ v0.78 | 水球落下→波紋被覆→水属性SVGへ |
| 15 | アース・シフト | sp_earth_mother_stone | 3 | ✅ v0.78 | 岩片収束→土煙被覆→土属性SVGへ |
| 16 | ウィンド・シフト | sp_sky_crystal | 3 | ✅ v0.78 | 結晶片が上空から→風被覆→風属性SVGへ |
| 18 | ゴールド | sp_gold | 3 | ✅ v0.78 | コマ付近に金ルーン→金粒子がHUDへ |
| 19 | ダブルロール | sp_gale | 4 | ✅ v0.78 | コマ周囲に短い旋風(ダイス2個はDOM表示) |
| 20 | 風向転換 | sp_wind_shift | 4 | ✅ v0.78 | コマ周囲一周の風+外周へ逆方向の風流 |
| 21 | 血染めの刃 | sp_bloodstained_blade | 4 | ✅ v0.78 | 暗赤の刃エフェクト(侵略開始時に合流) |
| 22 | ダブルドロー | sp_insight | 4 | ✅ v0.78 | コマ付近に白金の閃き+カード裏2枚がHUDへ(中身は非表示) |
