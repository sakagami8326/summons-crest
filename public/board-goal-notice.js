/* Match threshold events are recorded by the server. This module only presents them. */
window.BoardGoal = (() => {
  let instance=null,seen=new Set();
  function model(e,s) {
    if(!s.players.some(p=>p.id===e.player))return null;
    const ready=e.stage==='ready',target=Number(e.target),assets=Number(e.points);
    return {actor:e.player,scene:'goal-notice',kind:ready?'goal-ready':'goal-near',duration:4400,
      html:'<section class="goalNotice '+(ready?'ready':'near')+'"><div class="goalHero"><div class="goalCastle"><i aria-hidden="true"></i><img src="/assets/struct_castle.png" alt="城"></div><div class="goalAsset"><span>総資産</span><div><strong>'+assets.toLocaleString('ja-JP')+'</strong><em>G</em></div><small>目標 '+target.toLocaleString('ja-JP')+'G</small></div></div><h2>'+(ready?'城へ戻れば勝利':target+'G稼いで城へ向かえ')+'</h2></section>'};
  }
  function observe(s,{queue,current,ms=n=>n}) {
    const key=s.code+':'+s.stateInstanceId,events=s.goalNotices||[];
    // Initial load / save restoration establishes a baseline, without replaying past milestones.
    if(instance!==key){instance=key;seen=new Set(events.map(e=>e.id));return;}
    for(const e of events) {
      if(seen.has(e.id))continue;
      seen.add(e.id);if(s.phase!=='playing')continue;
      const snapshot=structuredClone(s),p=snapshot.players.find(p=>p.id===e.player);
      if(!p)continue;
      p.name=e.name;p.charId=e.charId;
      const stale=()=>{
        const now=current(),actor=now?.players.find(p=>p.id===e.player);
        return !now || now.code+':'+now.stateInstanceId!==key || now.phase!=='playing' || !actor || actor.bankrupt ||
          actor.points<(e.stage==='ready'?e.target:e.reachAt) ||
          (e.stage==='near'&&(actor.points>=e.target||(now.goalNotices||[]).some(n=>n.player===e.player&&n.stage==='ready')));
      };
      queue(3,()=>{const m=model(e,snapshot);if(m&&!stale())return BoardNotice.effect(m,snapshot,{ms});},
        {id:'goal:'+key+':'+e.id,actorId:e.player,at:e.at,kind:'goal-notice',stale});
    }
  }
  return {model,observe};
})();
