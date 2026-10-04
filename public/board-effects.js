/* 04-06: public event data only. Never expose drawn or evolved hand card identities. */
window.BoardEffects = (() => {
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=x=>Math.round(Number(x)||0).toLocaleString('ja-JP');
  const img=(file,cls='',alt='')=>`<img src="/assets/${file}" class="${cls}" alt="${esc(alt)}">`;
  const arrow='<span class="effectArrow" aria-hidden="true"></span>';
  function art(cid,s,cls=''){if(!s.catalog.CREATURES[cid])return '';return img(`${cid.endsWith('_f')?'e':'c'}_${cid.replace(/_f$/,'')}.png`,cls,s.catalog.CREATURES[cid].name);}
  function target(cid,s,label=''){return `<div class="effectTarget">${art(cid,s)}${label?`<span>${esc(label)}</span>`:''}<b>${esc(s.catalog.CREATURES[cid]?.name)}</b></div>`;}
  const metric=(file,label,value,unit='')=>`<div class="metric"><small>${esc(label)}</small><div class="metricValue">${img(file,'metricIcon')}<strong>${esc(value)}<em>${esc(unit)}</em></strong></div></div>`;
  const pair=(label,a,b)=>`<div class="valuePair"><small>${esc(label)}</small><div><span>${esc(a)}</span>${arrow}<b class="resultGlow">${esc(b)}</b></div></div>`;
  const text=t=>`<div class="spellText">${esc(t)}</div>`;
  const source=(cid,s)=>`<div class="effectSource">${art(cid,s,'sourceArt')}<b>${esc(s.catalog.CREATURES[cid]?.name)}</b></div>`;
  const element=elem=>`<span class="elementIcon"><svg viewBox="-40 -40 80 80" aria-hidden="true">${typeof ELEM==='object'?ELEM[elem]||'':''}</svg></span>`;
  function pages(list,s){if(!list.length)return '';const chunks=[];for(let i=0;i<list.length;i+=3)chunks.push(list.slice(i,i+3));return `<div class="miniTargets"><div class="miniTargetsCount">${list.length}領地を回復</div>${chunks.map((a,i)=>`<div class="miniPage ${i?'':'active'}">${a.map(t=>`<span>${art(t.creatureId||t.creature,s)}<b>+${n(t.amount)}</b></span>`).join('')}</div>`).join('')}<div class="miniDots">${chunks.map((_,i)=>`<i class="${i?'':'active'}"></i>`).join('')}</div></div>`;}
  function model(kind,e,s){
    let title='',left='',body='',foot='',actor=e.player,scene='creature',duration=3000;
    if(kind==='shrine'||kind==='gate'){
      scene='shrine';left=`<div class="effectSource facility">${img(kind==='shrine'?'struct_shrine.png':'struct_gate.png','sourceArt')}</div>`;
      if(kind==='shrine'){title='祠の加護';body=metric('ic_gold.png','ボーナス','+'+n(e.gold),'G');foot=`参拝 ${n(e.visits)} 回目`;}
      else {title={g_up:'領地を強化',g_draft:'カードを選択',g_forge:'手札を進化',pass:'変化の門'}[e.choice]||'変化の門';body=e.choice==='g_draft'?metric('ic_hand.png','獲得','1','枚')+'<p class="shortHint">3枚から選択</p>':text({g_up:'強化する領地を選択',g_forge:'進化するクリーチャーを選択',pass:'何もしない'}[e.choice]||'');foot='変化の門';}
    }else if(kind==='wind'){
      title='風の補給';left=source(e.source.creature,s);body=metric('ic_hand.png','手札に追加','+'+n(e.count??1),'枚')+pair('手札',n(e.beforeCount)+'枚',n(e.afterCount)+'枚');
    }else if(kind==='heal'){
      title='恵みの水脈';left=source(e.reward.creature,s);body=`<div class="conversion">${metric('cards/stat-hp-icon.svg','回復',n(e.reward.healed),'HP')}${arrow}${metric('ic_gold.png','獲得','+'+n(e.reward.gold),'G')}</div>`+pages(e.targets||[],s);duration=Math.max(3500,1600+Math.ceil((e.targets?.length||0)/3)*2200);
    }else if(kind==='abyss_anchor'){
      actor=e.owner;title='深淵の錨';left=source(e.creature||'mist_jelly',s);const stopped=s.players.find(p=>p.id===e.player);body=`<div class="stopResult">${stopped?img(`pawn_${stopped.charId}.${stopped.charId==='adel'?'webp':'png'}`,'stoppedPawn'):''}<div><span class="stopIcon" aria-hidden="true"></span><strong>移動停止</strong><small>${esc(stopped?.name)}</small></div></div>`;duration=GAME_TIMING.anchorStop;
    }else if(kind==='abyss_mark'){
      title='深淵標';left=source(e.creature||'night_jelly',s);body=`<div class="targetResult">${img('abyss-mark-v1.webp','markArt')}${metric('ic_gold.png','通行料','+'+n(e.bonus),'G')}</div>`;
    }else if(kind==='frontline_swap'){
      title='戦線交代';left=source(e.from,s);body=`<div class="creaturePair">${target(e.from,s,'手札へ')}${arrow}${target(e.creature,s,'配置')}</div>`;
    }else if(kind==='kamadoma'){
      title='武具錬成';left=source(e.creature||'kamadoma',s);
      body='<div class="forgeReward"><div class="sourceCard"><review-game-card card-id="weapon"></review-game-card></div>'
        +metric('ic_hand.png','手札に追加',n(e.count),'枚')+'</div>';duration=3500;
    }else if(kind==='card_operation'){
      if(e.kind==='gate_evolve'||e.kind==='gate_skip'){
        scene='shrine';title='門通過ボーナス';left=`<div class="effectSource facility">${img('struct_gate.png','sourceArt')}</div>`;
        body=e.kind==='gate_evolve'?metric('ic_hand.png','進化完了',n(e.count),'枚')+metric('ic_gold.png','費用','−'+n(e.cost),'G'):text('進化を見送り');
      }else{
      const victim=s.players.find(p=>p.id===e.target);
      title={draw:'インクの選別',search:e.creature?.startsWith('joma')?'武庫の鍵':'禁書の頁',censor:'禁書検閲',judgment:'漆黒の審判'}[e.kind]||'カード効果';
      left=e.creature?source(e.creature,s):'';
      body=victim?`<div class="discardTarget">${img('pawn_'+victim.charId+'.'+(victim.charId==='adel'?'webp':'png'),'discardPawn')}<b>${esc(victim.name)}</b></div>`+metric('ic_hand.png','手札を捨てる',n(e.count),'枚'):
        metric('ic_hand.png',e.kind==='draw'?'ドロー':'手札に加える','+'+n(e.count),'枚');
      if(e.drawn)body+=metric('ic_hand.png','自分はドロー','+'+n(e.drawn),'枚');
      }
    }else if(kind==='toxy'){
      title='瘴気連鎖';left=source(e.creature||'toxy',s);
      const victim=s.players.find(p=>p.id===e.target);
      body=`<div class="discardTarget">${victim?img(`pawn_${victim.charId}.${victim.charId==='adel'?'webp':'png'}`,'discardPawn'):''}<b>${esc(victim?.name)}</b></div>`
        +metric('ic_hand.png','手札を捨てる',n(e.count),'枚')+pair('手札',n(e.beforeCount)+'枚',n(e.afterCount)+'枚');
    }else if(kind==='spell'){
      scene='spell';actor=e.caster;duration=3500;const sid=e.spell,sp=s.catalog.SPELLS[sid];title=sp?.name||'効果発動';
      left=`<div class="effectSource spellSource"><div class="sourceCard"><review-game-card card-id="${esc(sid)}"></review-game-card></div></div>`;
      const result=e.display||{},snap=e.targets?.[0],cid=result.creature||snap?.creature;
      if(result.beforeHp!=null)body=`<div class="targetResult">${target(cid,s)}${pair('HP',n(result.beforeHp),n(result.afterHp))}</div>${result.df?'<div class="effectPill">次の戦闘 DF +10</div>':''}${sid==='sp_flame_vortex'?'<div class="effectPill">次の侵略者 AT +10</div>':''}`;
      else if(sid==='sp_gold')body=result.gold!=null?metric('ic_gold.png','獲得','+'+n(result.gold),'G'):text('Gを獲得');
      else if(sid==='sp_insight')body=metric('ic_hand.png','手札に追加','+'+n(e.n),'枚');
      else if(sid==='sp_quake'&&result.beforeLevel!=null)body=`<div class="targetResult">${target(cid,s)}${pair('領地レベル','Lv.'+result.beforeLevel,'Lv.'+result.afterLevel)}</div>`;
      else if(e.elem)body=`<div class="targetResult">${target(cid,s)}<div class="elementPair">${result.beforeElem?element(result.beforeElem):''}${arrow}${element(e.elem)}</div></div>`;
      else if(sid==='sp_evolve')body=metric('ic_hand.png','手札のクリーチャー','1','枚')+text('進化');
      else if(sid==='sp_ward')body='<div class="metric"><span class="shieldIcon" aria-hidden="true"></span></div>'+text('全自領地への侵略を防ぐ');
      else if(sid==='sp_step'||sid==='sp_move')body=(cid?target(cid,s):'')+text(sid==='sp_step'?(e.battle?'移動侵略':'隣の領地へ移動'):'領地のクリーチャーを交換');
      else if(sid==='sp_swap')body=(cid?target(cid,s):'')+text('クリーチャーを交代');
      else if(e.fixedDice)body=pair('次のダイス','',String(e.fixedDice));
      else if(sid==='sp_gale')body=text('このターンのダイス 2個');
      else if(sid==='sp_wind_shift')body=text('進行方向を反転');
      else if(sid==='sp_bloodstained_blade')body=pair('次の侵略 AT','', '+10')+'<div class="effectPill">勝利時に30G奪う</div>';
      else if(sid==='sp_fatal_reward')body=text(e.exiled?'手札を1枚廃棄':'カードを1枚ドロー');
      else if(sid==='sp_flame_vortex')body=(cid?target(cid,s):'')+text('次の侵略者 AT +10');
      else body=text(sp?.desc||'効果発動');
    }
    return {actor,scene,kind,duration,html:`<header class="effectHeading"><h2>${esc(title)}</h2></header><div class="effectLayout">${left}<div class="effectResult">${body}</div></div>${foot?`<div class="effectFooter">${esc(foot)}</div>`:''}`};
  }
  async function present(kind,e,s,options={}){
    window.mountExistingGameCards?.(s);
    return BoardNotice.effect(model(kind,e,s),s,options);
  }
  function noticeObserver(kind,field){
   let seenScope='',seen=0;
   return function(s,{queue,current,ms}){
    const scope=`${s.code}:${s.stateInstanceId||''}`,events=s[field]||[];
    // Initial load/save restoration must not replay earlier effect history.
    if(scope!==seenScope){seenScope=scope;seen=Math.max(0,...events.map(e=>e.at));return;}
    for(const e of events){
      if(e.at<=seen)continue;
      seen=e.at;
      const ev=structuredClone(e),snapshot=structuredClone(s);
      queue(3,()=>{const now=current();if(now?.code!==snapshot.code||now?.stateInstanceId!==snapshot.stateInstanceId)return;
        return present(kind,ev,snapshot,{ms});},
        {actorId:e.player,id:`${kind}:${scope}:${e.at}`,kind,at:e.at});
    }
   };
  }
  const observeToxy=noticeObserver('toxy','toxyNotices');
  const observeKamadoma=noticeObserver('kamadoma','kamadomaNotices');
  const observeCardOperations=noticeObserver('card_operation','cardEffectNotices');
  return {present,model,observeToxy,observeKamadoma,observeCardOperations};
})();
