// game_timing.js ─ 盤面(board.html)とスマホ(phone.html)で共有する移動演出タイミング(v0.66)
// スマホはこの数値を前提に「到着UIをいつ出すか」を計算しているため、
// 盤面・スマホへの直書きは禁止。変更は必ずこのファイルで行う(timing_testが直書き再発を検出する)。
const GAME_TIMING = {
  moveStartDelay: 1900,       // ダイス確定から移動開始まで(単独ダイス)
  moveStartDelayMulti: 2900,  // 複数ダイス(疾風・烈火の進軍)時の移動開始まで
  stepMs: 250,                // 1歩あたりのホップ間隔
  otherStartDelay: 250,       // 自分以外のコマ移動の初動(盤面のみ)
  castleResume: 650,          // 城ドラフト後にコマ移動を再開するまでの間
  arriveBuf: 1300,            // 到着後、スマホが到着UIを出すまでのバッファ(通常)
  arriveBufCastle: 1100,      // 同(城ドラフト経由の再開後)
  castleDraftLead: 400,       // 城ドラフトUIをコマの城到着に合わせて出す先行時間
};
