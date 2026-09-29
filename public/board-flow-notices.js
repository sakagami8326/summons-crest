/* Approved ruin and match/turn introductions. Render event snapshots, not live owners. */
window.BoardFlow = (() => {
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ruinModel(e,s) {
    const cid=e.creature.replace(/_f$/,''),c=s.catalog.CREATURES[cid];if(!c)return null;
    const evolved=e.evolved ?? (/_f$/.test(e.creature)||e.level>=(s.evoLevel||3));
    const name=evolved&&c.evo?c.evo:c.name,element=e.element||s.tiles[e.tile]?.e||'neutral';
    return {actor:e.player,scene:'ruin',kind:'ruin',duration:GAME_TIMING.ruinNotice,
      html:'<header class="effectHeading"><h2>領地が崩壊</h2></header><div class="ruinOutcome"><section class="ruinBefore"><div class="ruinArt"><img src="/assets/cards/'+(evolved&&c.evo?'e':'c')+'_'+cid+'.webp" alt="'+esc(name)+'"></div><b class="ruinName">'+esc(name)+'</b><div class="ruinHp"><img src="/assets/cards/stat-hp-icon.svg" alt="HP"><strong>0</strong></div></section><span class="ruinArrow" aria-hidden="true"><svg viewBox="0 0 48 30"><path d="M1 15H44M32 3L44 15 32 27"/></svg></span><section class="ruinAfter"><div class="ruinTile">'+EnemyLand.landIcon(element)+'</div><strong>空き地へ</strong></section></div>'};
  }
  async function ruin(e,s,{ms=n=>n,fx=()=>Promise.resolve()}={}) {
    const m=ruinModel(e,s);if(!m)return;
    const done=BoardNotice.effect(m,s,{ms});
    document.querySelector('#boardNotice .standName')?.insertAdjacentHTML('afterbegin','<small class="ruinOwner">領地主</small>');
    await Promise.all([done,new Promise(r=>setTimeout(r,ms(GAME_TIMING.ruinChange))).then(fx)]);
  }
  function startModel(kind,s,actor) {
    const p=s.players.find(p=>p.id===actor);
    if(kind==='turn'&&!p)return null;
    return kind==='game'?{scene:'start-game',kind:'start-game',duration:GAME_TIMING.gameNotice,
      html:'<section class="startGame"><h2>ゲーム開始</h2><div class="startPlayers" style="--start-count:'+s.players.length+'">'+s.players.map((p,i)=>'<div style="--i:'+i+'"><img src="/assets/pawn_'+p.charId+'.'+(p.charId==='adel'?'webp':'png')+'" alt="'+esc(s.catalog.CHARS[p.charId]?.name)+'"><b>'+esc(p.name)+'</b></div>').join('')+'</div><div class="startGoal"><img src="/assets/struct_castle.png" alt="城"><span><strong>'+Number(s.target)+'<small>G</small></strong>稼いで城へ向かえ</span></div></section>'}:
      {actor:p.id,scene:'start-turn',kind:'start-turn',duration:GAME_TIMING.turnNotice,html:'<section class="startTurn"><h2>'+esc(p.name)+'のターン</h2><div class="startUnderline" aria-hidden="true"></div></section>'};
  }
  function start(kind,s,actor,options={}){
    const m=startModel(kind,s,actor);if(!m)return;
    const done=BoardNotice.effect(m,s,options);
    // A match intro has no single actor, so apply the animation speed here as well.
    if(kind==='game')for(const a of document.getElementById('boardNotice').getAnimations({subtree:true}))a.playbackRate=1000/Math.max(1,(options.ms||((n)=>n))(1000));
    return done;
  }
  return {ruinModel,ruin,startModel,start};
})();
