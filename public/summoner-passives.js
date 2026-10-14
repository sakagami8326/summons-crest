/* Shared player-facing copy. Internal rules belong to server/tests. */
(function(root){
const descriptions={
redani:'ウェポン使用時、AT＋10。',
noir:'スペルを1ターンに2回まで使える。2回目は追加100G。',
lia:'停止先に隣接する、HPが減った敵クリーチャーの領地へ侵略できる。',
linnei:'ショップで購入したカードを手札に加える。',
grease:'進化クリーチャーで侵略に勝つと、奪った領地を通常の費用で強化できる。',
mio:'自分のターンに1回、ダイスを振り直せる。',
adel:'HP満タンのクリーチャーは、防衛時DF＋10。',
villa:'カードを廃棄すると、次の自分のターン開始時にランダムな新カード1枚を手札に加える。',
nerasio:'土の連鎖が増えるたび、200Gを獲得する。'
};
if(typeof module==='object')module.exports=descriptions;
else root.SummonerPassives=descriptions;
})(typeof window==='object'?window:globalThis);
