/* Approved finale notices share the regular board frame and summoner artwork. */
window.BoardFinale = (() => {
  function model(kind,actor,s) {
    if(!s.players.some(p=>p.id===actor))return null;
    const victory=kind==='victory';
    return {actor,scene:'finale',kind,duration:victory?5200:4200,
      html:'<section class="finaleNotice '+kind+'">'+(victory?
        '<div class="finaleCrown" aria-hidden="true">'+SummonsHudRank.crown(1,'finale').replace(/<b>[\s\S]*$/,'')+'</div><h2>勝利</h2>':
        '<div class="finaleCoin"><img src="/assets/ic_gold.png" alt=""></div><h2>破産</h2><span class="finaleExit">脱落</span>')+'</section>'};
  }
  async function present(kind,actor,s,{ms=n=>n}={}) {
    const m=model(kind,actor,s);if(!m)return;
    const done=BoardNotice.effect(m,s,{ms});
    if(kind==='bankrupt') {
      const host=document.getElementById('boardNotice');host.dataset.motion='slash';
      for(const animation of host.getAnimations({subtree:true}))animation.playbackRate=1000/Math.max(1,ms(1000));
    }
    await done;
  }
  return {model,present};
})();
