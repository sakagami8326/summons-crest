// game_timing.js ─ 盤面(board.html)とスマホ(phone.html)で共有する移動演出タイミング(v0.66)
// スマホはこの数値を前提に「到着UIをいつ出すか」を計算しているため、
// 盤面・スマホへの直書きは禁止。変更は必ずこのファイルで行う(timing_testが直書き再発を検出する)。
const GAME_TIMING = {
  ruinNotice: 5200,
  ruinChange: 2100,
  gameEntryReturn: 4150,
  gameEntryCameraReturn: 850,
  placementCameraReturn: 1300,
  gameNotice: 4200,
  startNoticeGap: 350,
  turnNotice: 3300,
  turnNoticeBuffer: 1000,
  ultimateIntro: 1000,
  ultimateNotice: 6000,
  rareNotice: 4200,
  chainNotice: 4400,
  moveStartDelay: 1900,       // ダイス確定から移動開始まで(単独ダイス)
  moveStartDelayMulti: 2900,  // 複数ダイス(疾風・烈火の進軍)時の移動開始まで
  stepMs: 250,                // 1歩あたりのホップ間隔
  anchorStop: 1500,           // 深淵の錨による強制停止の発光・バナー時間
  otherStartDelay: 250,       // 自分以外のコマ移動の初動(盤面のみ)
  castleResume: 650,          // 城ドラフト後にコマ移動を再開するまでの間
  castleZoom: 550,            // 城到着からズーム・効果音まで
  castleBreakdown: 6500,      // 城ボーナス内訳の表示時間
  gateNotice: 4800,          // 門の刻印・Gを表示してから移動を再開
  healPageFirst: 3500,
  healPageInterval: 2200,
  arriveBuf: 1300,            // 到着後、スマホが到着UIを出すまでのバッファ(通常)
  arriveBufCastle: 1100,      // 同(城ドラフト経由の再開後)
  castleDraftLead: 7050,      // 城ズーム＋内訳表示後にドラフトUIを解禁
  moveWaitMax: 60000,         // 時計ずれ時のスマホ待機上限
};
GAME_TIMING.scaled = (ms, speed) => Math.max(1, Math.round(ms / (speed === 2 ? 2 : 1)));
GAME_TIMING.ultimateDuration = GAME_TIMING.ultimateIntro + GAME_TIMING.ultimateNotice;
GAME_TIMING.castleDuration = ev => ev?.usedSeal === false ? 4000 : Math.max(GAME_TIMING.castleBreakdown, 1600 + Math.ceil((ev?.healed?.length || 0) / 3) * GAME_TIMING.healPageInterval);
if (typeof module !== 'undefined') module.exports = GAME_TIMING;
