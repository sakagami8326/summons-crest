/* Approved 10-12 notices. Display only: all values come from public event snapshots. */
window.BoardMilestones = (() => {
  const duration=4200;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const img=(file,cls='',alt='')=>`<img class="${cls}" src="/assets/${file}" alt="${esc(alt)}">`;
  const element=e=>`<span class="msElement"><svg viewBox="-40 -40 80 80" aria-hidden="true">${typeof ELEM==='object'?ELEM[e]||'':''}</svg></span>`;
  const arrow='<i class="msArrow" aria-hidden="true"></i>';
  const player=(s,id)=>s.players.find(p=>p.id===id);
  function displayId(cid,level,s){const c=s.catalog.CREATURES[cid];return c?.evo&&level>=(s.evoLevel||3)&&s.catalog.CREATURES[cid+'_f']?cid+'_f':cid;}
  function portrait(p){return p?`<div class="msOwner">${img(`pawn_${p.charId}.${p.charId==='adel'?'webp':'png'}`,'msPawn')}<span>${esc(p.name)}</span></div>`:'';}
  function land(cid,elem,level,p,s,cls=''){
    cid=displayId(cid,level,s);const c=s.catalog.CREATURES[cid];
    return `<div class="msLand ${cls}" style="--land-bg:url('/assets/cards/bg-${elem}.webp')"><div class="msLandArt"><i></i>${c?img(`${cid.endsWith('_f')?'e':'c'}_${cid.replace(/_f$/,'')}.png`,'',c.name):''}</div><span class="msLandBadge">${element(elem)}Lv.${level}</span><b>${esc(c?.name)}</b>${portrait(p)}</div>`;
  }
  function model(kind,e,s){
    let actor,heading,body;
    if(kind==='title'){
      const p=player(s,e.player),prior=player(s,e.previous),pilgrim=e.title==='pilgrim';if(!p)return null;actor=p.id;
      heading=prior?'称号が交代':'称号を獲得';
      body=`<div class="msTitleHero">${img(pilgrim?'ic_pilgrim.png':'ic_conqueror.png','msTitleIcon')}<div><h3>${pilgrim?'大巡礼者':'覇者'}</h3><small>${pilgrim?'祠参拝':'戦闘勝利'} ${Number(p[pilgrim?'shrineVisits':'battleWins'])||0}${pilgrim?'回':'勝'}</small></div></div><div class="msAsset"><span>総資産</span><strong>+500<em>G</em></strong></div>${prior?`<div class="msFormer">${portrait(prior)}<span>総資産 <b>−500G</b></span></div>`:''}`;
    }else if(kind==='summon'){
      const o=e.owner,p=player(s,o?.player);if(!p||!s.catalog.CREATURES[o.creature])return null;actor=p.id;
      const cid=displayId(o.creature,o.level,s),elem=e.element||s.tiles[e.tile]?.e||'neutral';
      heading=cid.endsWith('_f')?'クリーチャーを配置':'クリーチャーを召喚';
      body=`<div class="msSummon"><div class="msCard"><review-game-card card-id="${esc(cid)}"></review-game-card></div>${arrow}<div class="msLanding"><div class="msEmptyLand" style="--land-bg:url('/assets/cards/bg-${elem}.webp')">${element(elem)}</div><b>Lv.${Number(o.level)||1}</b></div></div>`;
    }else if(kind==='battle-result'){
      const atk=player(s,e.attacker),def=player(s,e.defender);if(!atk||!def)return null;
      const level=e.defLevel||1,elem=e.terrainElem||s.tiles[e.tile]?.e||'neutral';actor=e.win?atk.id:def.id;
      if(e.win){heading='領地を奪取';body=`<div class="msTransfer">${land(e.defCreature,elem,level,def,s,'msPrevious')}${arrow}${land(e.atkCreature,elem,level,atk,s,'msAcquired')}</div>`;}
      else{heading='防衛成功';body=`<div class="msDefend">${land(e.defCreature,elem,level,null,s,'msAcquired')}<div class="msRemaining"><small>残りHP</small><strong>${Math.max(0,Number(e.remainHp)||0)}</strong><span>領地を守った</span></div></div>`;}
    }else return null;
    return {actor,scene:'milestones',kind:'ms-'+kind,duration,html:`<header class="effectHeading"><h2>${heading}</h2></header><div class="msBody">${body}</div>`};
  }
  async function present(kind,e,s,options={}){const m=model(kind,e,s);if(!m)return;window.mountExistingGameCards?.(s);return BoardNotice.effect(m,s,options);}
  return {model,present,duration};
})();
