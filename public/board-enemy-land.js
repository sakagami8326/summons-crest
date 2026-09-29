/* Approved enemy-land inspection. Server owns all stats and selectable actions. */
window.EnemyLand=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const img=(f,cls='',alt='')=>`<img src="/assets/${f}" class="${cls}" alt="${esc(alt)}">`;
 const labels={water:'水',fire:'火',earth:'土',wind:'風',neutral:'無'};
 const element=e=>{const color=RUNE[e]||'#b998de',file='/assets/element-'+(e==='water'?'water-v2':e)+'.svg';return '<span class="elElement" role="img" aria-label="'+(labels[e]||'無')+'属性" style="color:'+color+'">'+(['fire','earth','water','wind'].includes(e)?'<i class="elGlyph" style="mask-image:url('+file+');-webkit-mask-image:url('+file+')"></i>':'<span>無</span>')+'</span>'};
 const shield='<svg viewBox="0 0 40 44" aria-hidden="true"><path d="M20 3 35 9v14Q34 33 20 40Q6 33 5 23V9Z"/></svg>';
 function badge(cid,who,stat,value,label,file){const visual=cid?'<review-game-card card-id="'+esc(cid)+'"></review-game-card>':img(file);return '<article class="elExtra elEffectBadge battleExternalBonus" title="'+esc(label+' / '+who+' / '+stat+' '+value)+'" aria-label="'+esc(label+' / '+who+' / '+stat+' '+value)+'"><small class="elBadgeTarget">'+who+'</small><div class="battleExternalArt">'+visual+'<i></i></div><div class="battleExternalValue">'+(stat==='AT'?img('cards/stat-at-icon.svg','','AT'):stat==='HP'?img('cards/stat-hp-icon.svg','','HP'):stat==='G'?img('ic_gold.png','','G'):'<span>DF</span>')+'<b>'+value+'</b></div></article>';}

 const landIcon=e=>'<span class="elTileElement" style="--tile-bg:url(/assets/cards/bg-'+e+'.webp)">'+element(e)+'</span>';
 function model(s){
  const tile=s.enemyLand.tile;
  const o=s.owners[tile],p=s.players.find(x=>x.id===o.player),c=s.catalog.CREATURES[o.creature],base=o.creature.replace(/_f$/,''),evolved=o.level>=(s.evoLevel||3)||o.creature.endsWith('_f'),ui=s.landCombat[tile],ward=s.enemyLand.barrier,max=s.enemyLand.stats.maxHp,at=s.enemyLand.stats.at,cid=evolved&&s.catalog.CREATURES[base+'_f']?base+'_f':o.creature;
  const stats=s.enemyLand.stats,ability=ui.effect,description=ability?.text||(evolved?c.evoFx||c.fx:c.fx)||'',soul=base==='alter'?Number(p.exileCount||0):null;
  const external=s.enemyLand.externalModifiers;
  const draw=entry=>{const card=entry.cardId,label=card?(s.catalog.CREATURES[card]||s.catalog.SPELLS[card]||{}).name:(s.catalog.CHARS[entry.charId]?.name||'必殺技');return badge(card,'',entry.stat.toUpperCase(),'+'+entry.amount,label||'',entry.charId?'board-actors/'+entry.charId+'.png':null);};
  const defend=external.defender.map(draw).join(''),attack=external.attacker.map(draw).join('');
  const group=(role,label,icon,content)=>'<section class="elEffectGroup '+role+'"><h3>'+icon+'<span>'+label+'</span></h3><div class="elGroupBadges">'+(content||'<span class="elNoEffect">—</span>')+'</div></section>';
  const effects=defend||attack?'<div class="elEffectGroups">'+group('attack','攻め側',img('cards/stat-at-icon.svg'),attack)+group('defend','守り側',shield,defend)+'</div>':'';
  const name=esc(evolved?c.evo||c.name:c.name),match=ui.affinity!=='mismatch';
  return {actor:p.id,html:
   '<header class="elHeader"><div class="elLand">'+landIcon(ui.tileElem)+'<span>Lv.<b>'+o.level+'</b></span></div><div class="elToll"><small>通行料</small>'+img('ic_gold.png')+'<strong>'+s.tolls[tile].toLocaleString()+'<em>G</em></strong></div></header>'+
   (ward?'<div class="elWardNotice">'+shield+'<div><small>結界</small><strong>侵略不可</strong></div></div>':'')+
   '<div class="elMain"><div class="elCreature"><div class="elCreatureArt">'+img('cards/'+(cid.endsWith('_f')?'e':'c')+'_'+base+'.webp','',name)+'</div></div>'+
   '<div class="elNumbers"><div class="elTotal"><small>HP + DF</small><strong>'+stats.total+'</strong></div>'+
   '<div class="elHp">'+img('cards/stat-hp-icon.svg')+'<small>残HP</small><strong>'+stats.hp+'<em> / '+max+'</em></strong></div>'+
   '<div class="elDf">'+shield+'<small>DF</small><b>'+stats.df+'</b></div>'+
   '<div class="elAt">'+img('cards/stat-at-icon.svg')+'<small>AT</small><b>'+at+'</b></div></div></div>'+
   '<h2 class="elCreatureName">'+element(ui.creatureElem)+name+'</h2>'+
   '<div class="elTerrain '+(match?'':'mismatch')+'" style="--affinity-color:'+(RUNE[ui.tileElem]||'#b998de')+'"><div class="elAffinity">'+landIcon(ui.tileElem)+'<span class="elMatchMark">'+(match?'✓':'×')+'</span>'+element(ui.creatureElem)+'<small>'+(ui.affinity==='universal'?'適応':match?'一致':'不一致')+'</small></div><div>'+shield+'<span>地形</span><strong>DF +'+ui.appliedBonus+'</strong></div></div>'+
   '<div class="elAbility '+(ability?.state||'')+'"><div>'+(soul!==null?'<span class="elSoul">'+img('ic_hand.png')+'廃棄 '+soul+'枚 <b>DF +'+soul*5+'</b></span>':'<span class="elAbilityLabel">固有能力</span>')+'<small>'+(ability&&soul===null?esc(ability.reason||{active:'発動',inactive:'不発動',conditional:'条件成立時'}[ability.state]):'')+'</small></div><p>'+esc(description)+'</p></div>'+effects};
 }

let key='',cameraToken=null,hooks=null,host=null,geometry='';
function hide(cameraAlreadyReset=false){
  key='';geometry='';hooks?.glow(null);
  window.BoardNotice.hideInspection();host=null;
  const token=cameraToken;cameraToken=null;if(token!==null&&!cameraAlreadyReset)hooks?.release(token);
}
function sync(s,context){
  hooks=context;const inspection=s?.enemyLand||s?.landStop;
  if(!inspection||context.blocked||document.hidden){hide();return false;}
  const data=s.enemyLand?model(s):BoardLandStop.model(s),next=JSON.stringify([s.code,s.stateInstanceId,inspection.player,inspection.promptId,data]);
  const view=innerWidth+':'+innerHeight;
  if(next!==key||geometry!==view||(host&&(host.hidden||host.dataset.flow!=='inspection'))){
    if(cameraToken!==null)hide();key=next;geometry=view;
    cameraToken=context.focus(inspection.tile,inspection.player);
  }
  context.hold(cameraToken,inspection.tile);
  // Do not mount the actor or window while the camera is travelling.
  if(!context.settled()){if(host){BoardNotice.hideInspection();host=null;context.glow(null)}return true;}
  if(host)return true;
  mountExistingGameCards(s);host=BoardNotice.inspect(data,s);if(!host)return true;
  const at=context.point(inspection.tile),frame=host.querySelector('.messageWindow');
  const scale=Math.min(1,(innerHeight-42)/frame.offsetHeight,(innerWidth-124)/frame.offsetWidth);
  host.style.setProperty('--inspect-scale',scale);
  const width=frame.offsetWidth*scale,height=frame.offsetHeight*scale,portrait=100*scale;
  const onRight=at.x+76+width+portrait+24<=innerWidth;
  const left=onRight?at.x+76:Math.max(18,at.x-width-88),top=Math.max(20,Math.min(innerHeight-height-22,at.y-height+15));
  host.style.left=left+'px';host.style.top=top+'px';
  const actor=host.querySelector('.actorStand');if(actor)actor.style.top=(Math.max(6,top-96*scale)-top)/scale+'px';
  host.classList.add('elAnchoredVisible');context.glow(inspection.tile,s.owners[inspection.tile]?.level||1);
  return true;
}
addEventListener('pagehide',()=>hide());
document.addEventListener('visibilitychange',()=>{if(document.hidden)hide()});
return {model,sync,hide,landIcon};
})();
