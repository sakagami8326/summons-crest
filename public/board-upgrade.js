// Paid upgrades share the board's presentation queue and camera ownership.
window.BoardUpgrade=(()=>{
 const U=UpgradeUI,T=GAME_TIMING,result=document.createElement('section'),badge=document.createElement('div');
 result.id='upgradeResult';result.hidden=true;result.setAttribute('role','status');document.body.append(result);
 badge.id='upgradeTileLevel';badge.hidden=true;badge.setAttribute('aria-live','polite');document.body.append(badge);
 let api,seen='',scope='',active=null,generation=0;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function configure(hooks){api=hooks;}
 function view(s){
  if(!active||active.scope!==s.code+':'+s.stateInstanceId)return s;
  const {d,level,evolutionPending}=active,t=level===d.before.level?d.before:d.levels.find(t=>t.level===level);
  return {...s,owners:s.owners.map((o,i)=>i===d.tile?{...d.owner,level,displayEvolutionPending:evolutionPending}:o),
    tolls:s.tolls.map((v,i)=>i===d.tile?t.toll:v)};
 }
 function pawnAlpha(id){return active?.ids.includes(id)?active.pawnAlpha:1;}
 function creatureAlpha(tile){return active?.d.tile===tile?active.creatureAlpha:1;}
 function opacity(kind,to){
  if(!active)return;const a=active;
  if(kind==='pawn'){a.pawnAlpha=to;api.pawnOpacity(a.ids,to);}else{a.creatureAlpha=to;api.creatureOpacity(a.d.tile,to);}
 }
 function cancel(){
  generation++;
  if(active){opacity('pawn',1);opacity('creature',1);api.mask(active.d.tile,false);active=null;api.stopEvolution();queueMicrotask(()=>api.draw());}
  result.hidden=badge.hidden=true;result.classList.remove('out');badge.classList.remove('out');
 }
 function prepare(s,prev){
  const key=s.code+':'+s.stateInstanceId,d=s.lastUpgrade;
  if(key!==scope){cancel();scope=key;seen=d?.at||'';return null;}
  if(active&&(s.phase!=='playing'||s.owners[active.d.tile]?.creature!==active.d.owner.creature))cancel();
  if(!d||d.at===seen)return null;
  seen=d.at;
  const was=prev.ownersArr?.[d.tile];
  if(s.phase!=='playing'||!was||was.level!==d.before.level||was.player!==d.actor)return null;
  active={d,scope:key,level:d.before.level,evolutionPending:d.levels.find(t=>t.level===d.target)?.evolves,
    pawnAlpha:1,creatureAlpha:1,ids:s.players.filter(p=>p.pos===d.tile).map(p=>p.id),snapshot:s,phase:'queued'};
  api.queue({id:'land-upgrade:'+key+':'+d.at,kind:'land-upgrade',pri:2,actorId:d.actor,at:d.at,
    stale:()=>{const stale=!active||active.d.at!==d.at||api.state().code+':'+api.state().stateInstanceId!==key||api.state().phase!=='playing';if(stale&&active?.d.at===d.at)cancel();return stale;},run:()=>play(d)});
  return d.tile;
 }
 const stats=(d,t)=>`<div class="resultStats"><article><small>通行料</small><div class="oldValue">${d.before.toll}G →</div>${U.gold(t.toll)}</article><article><small>HP＋DF</small><div class="oldValue">${d.before.total} →</div><b>${t.total}</b><span>HP ${t.hp} ＋ DF ${t.df}</span></article></div>`;
 function content(d,t,s){const p=s.players.find(p=>p.id===d.actor);result.innerHTML=`<div class="upResultWindow"><i class="upCorner tl"></i><i class="upCorner tr"></i><i class="upCorner bl"></i><i class="upCorner br"></i><header>${U.img('pawn_'+p.charId+'.'+(p.charId==='adel'?'webp':'png'),p.name)}<span>${U.esc(p.name)}<small>領地強化</small></span></header><div class="upResultBody"><div class="resultLevel"><span>Lv.<b>${d.before.level}</b></span>${U.arrow()}<strong>Lv.<b>${t.level}</b></strong></div>${stats(d,t)}</div></div>`;}
 function place(){
  if(!active)return;const pt=api.point(active.d.tile,active.level),width=pt.width,gap=width*.67+26;
  const safeLeft=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-safe-left'))||420;
  const right=innerWidth-25-pt.x-gap,left=pt.x-gap-safeLeft-18;
  const scale=Math.max(.3,Math.min(1,innerHeight/820,Math.max(right,left)/330)),w=330*scale,h=result.offsetHeight*scale;
  result.style.setProperty('--result-scale',scale);
  result.style.left=(right>=w-1?pt.x+gap:Math.max(22,pt.x-gap-w))+'px';
  result.style.top=Math.max(90,Math.min(innerHeight-h-50,pt.y-h*.75))+'px';
  badge.style.left=pt.x+'px';badge.style.top=(pt.y+width*.30+24)+'px';badge.style.setProperty('--badge-scale',Math.min(1,innerHeight/780));
 }
 async function play(d){
  if(!active||active.d.at!==d.at)return;
  const a=active,gen=++generation,t=d.levels.find(t=>t.level===d.target),s=a.snapshot;
  let token=null,hold=null;
  const valid=()=>gen===generation&&active===a;
  const check=()=>{if(!valid())throw Error('upgrade cancelled');};
  const delay=async ms=>{await api.wait(reduced()?Math.min(ms,450):ms);check();};
  async function fade(kind,to){const from=kind==='pawn'?a.pawnAlpha:a.creatureAlpha,start=performance.now(),duration=api.ms(reduced()?100:T.upgradeFade);
   do{check();const v=Math.min(1,(performance.now()-start)/duration);opacity(kind,from+(to-from)*v*v*(3-2*v));if(v===1)break;await new Promise(requestAnimationFrame);}while(true);
  }
  try{
   a.phase='zoom';token=api.zoom(d.tile,d.actor);hold=setInterval(()=>api.hold(token),300);
   await delay(T.upgradeZoom);badge.hidden=false;badge.innerHTML='<small>Lv.</small><b>'+a.level+'</b>';place();await delay(T.upgradeLead);
   content(d,t,s);result.hidden=false;place();a.phase='conceal';await fade('pawn',0);
   a.phase='level';
   for(let level=d.before.level+1;level<=t.level;level++){
    check();a.level=level;await api.draw();check();api.glow(d.tile,level);api.impact(d.tile);
    const step=d.levels.find(t=>t.level===level);result.querySelector('.resultLevel strong b').textContent=level;
    const tmp=document.createElement('div');tmp.innerHTML=stats(d,step);result.querySelector('.resultStats').replaceWith(tmp.firstElementChild);
    badge.innerHTML='<small>Lv.</small><b>'+level+'</b>';badge.classList.remove('levelImpact');void badge.offsetWidth;badge.classList.add('levelImpact');place();await delay(T.upgradeStep);
   }
   if(t.evolves){
    a.phase='evolution';const cinematic=api.evolve(d,s,()=>api.point(d.tile,a.level));
    await fade('creature',0);api.mask(d.tile,true);await cinematic;check();
    a.evolutionPending=false;await api.draw();check();api.mask(d.tile,false);await fade('creature',1);
   }
   a.phase='result';place();await delay(t.evolves?T.upgradeEvolutionResult:T.upgradeResult);
   result.classList.add('out');badge.classList.add('out');await delay(T.upgradeDismiss);result.hidden=badge.hidden=true;
   api.glow(null);a.phase='restore';await fade('pawn',1);a.phase='return';await api.return(token);token=null;check();a.phase='done';
  }catch(e){if(valid())console.warn('territory upgrade:',e.message);}
  finally{
   clearInterval(hold);
   if(active===a){opacity('pawn',1);opacity('creature',1);api.mask(d.tile,false);active=null;result.hidden=badge.hidden=true;result.classList.remove('out');badge.classList.remove('out');api.glow(null);await api.draw();}
   if(token!=null)api.release(token);
  }
 }
 addEventListener('resize',place);
 return {configure,prepare,view,cancel,pawnAlpha,creatureAlpha,get status(){return active?{phase:active.phase,tile:active.d.tile,level:active.level,evolutionPending:active.evolutionPending}:null;}};
})();
