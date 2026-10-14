window.BoardPassives=(()=>{
const seen=new Set();let scope='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function model(e,s){
 const name=s.catalog.CHARS[e.charId]?.name||'',text={second_spell:'スペルを1ターンに2回使用できる',adjacent_invasion:'負傷した敵の領地へ侵略できる',shop_hand:'購入カードはすべて手札へ',captured_upgrade:'奪った領地を強化できる',dice_choice:'ダイスを振り直せる',reroll:'ダイスを振り直す',exile_reward:'前ターンカード廃棄により、新カードを獲得',earth_chain:`土の連鎖 ${e.before} → ${e.after}　＋${e.gold}G`,battle:e.charId==='redani'?'ウェポン使用で AT＋10':'HP満タンで DF＋10'}[e.kind];
 const icon=e.kind==='exile_reward'||e.kind==='shop_hand'?'ic_hand.png':e.kind==='earth_chain'?'element-earth.svg':e.charId==='redani'?'cards/stat-at-icon.svg':'ic_hand.png';
 return {actor:e.player,kind:'passive',scene:'passive',duration:GAME_TIMING.passiveNotice,
 html:`<header class="effectHeading"><small>${esc(name)}の固有能力</small><h2>${esc(text)}</h2></header>${e.kind==='exile_reward'?'<div class="nativeReward"><img src="/assets/ic_hand.png" alt="カード"><strong>手札 ＋1</strong></div>':''}`};
}
async function present(e,s,ms){if(e.kind==='battle')document.body.classList.add('passiveBattle');try{return await BoardNotice.effect(model(e,s),s,{ms});}finally{if(e.kind==='battle')document.body.classList.remove('passiveBattle');}}
function observe(s,{queue,ms}){
 const key=s.code+':'+s.stateInstanceId;
 if(scope!==key){seen.clear();scope=key;for(const e of s.passiveNotices||[])seen.add(e.id);return;}
 for(const e of s.passiveNotices||[]){if(seen.has(e.id))continue;seen.add(e.id);const snap=structuredClone(s);
 queue({id:e.id,at:e.at,kind:'passive',pri:e.kind==='exile_reward'?5:1,actorId:e.player,run:()=>present(e,snap,ms)});}
}
return {observe,present,model};
})();
