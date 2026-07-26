# 属性エフェクト素材の配置先(発注書v0.75 §3)

```
public/assets/fx/
├─ common/   flash_soft.png / shockwave.png / glow_round.png / spark_gold.png
├─ fire/     particle_01..04.png / trail_light.png / trail_heavy.png /
├─ water/      impact_small.png / impact_large.png / summon.png / disperse.png
├─ earth/    (属性フォルダはすべて同じキー構成)
├─ wind/
└─ neutral/
```

- ファイル名は `public/fx_manifest.js` の表と一致させること(参照はマニフェスト経由のみ)
- 透過PNG / sRGB / 文字・接地影・背景なし / 余白トリム済み(§3.3)
- 未配置でもゲームは進行する(Graphics粒子フォールバック)。置くだけで自動で画像に切り替わる
