/* Approved 07–09 notices, fed by immutable event snapshots. */
window.BoardNext=(()=>{
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const img=(file,cls='')=>`<img class="${cls}" src="/assets/${file}" alt="">`;
 const icon=e=>`<span class="nextElement"><svg viewBox="-40 -40 80 80" aria-hidden="true">${ELEM[e]||''}</svg></span>`;
 const arrow='<span class="nextArrow" aria-hidden="true"></span>';
  const stat=(file,label,value,unit='')=>`<div class="nextStat">${file==='land'?'<span class="statLand" aria-hidden="true"></span>':file==='shield'?'<span class="statShield" aria-hidden="true"></span>':img(file)}<small>${label}</small><strong>${value}<em>${unit}</em></strong></div>`;
 const land=(e,i)=>`<i class="chainLand" style="--i:${i};--land-bg:url('/assets/cards/bg-${e}.webp')">${icon(e)}</i>`;
 function ultimate(s,p){const actor=p.charId;
  const tiles=(e,n)=>`<div class="ultTiles">${Array.from({length:n},(_,i)=>land(e,i)).join('')}</div>`;
  const content={
   redani:`<div class="ultRedani"><div class="ultAxe">${img('cards/support-heavy-axe-v1.webp')}<span>手札に <b>1</b> 枚</span><small>ヘビーアックス・AT＋40</small></div><div><div class="diceTriplet">${img('ic_dice.png')}${img('ic_dice.png')}${img('ic_dice.png')}</div><p class="nextBrief">ダイス <strong>3</strong> 個で移動</p></div></div>`,
   linnei:`${img('struct_market.png','ultFacility')}<p class="nextBrief">全品 <strong>半額</strong></p><small class="nextSub">このマスでショップを開く</small>`,
   grease:`<p class="ultEvolution">進化</p><div class="ultMetrics">${stat('ic_hand.png','手札','1','体まで')}${stat('land','領地','1','体まで')}</div>`,
   mio:`<div class="ultMove">${land('wind',0)}${arrow}${img('pawn_mio.png')}</div><p class="nextBrief">好きなマスへ移動</p><div class="nextStatLine"><small>侵略時</small><b>AT <strong>+20</strong></b></div>`,
   lia:`<div class="liaTargets">${tiles('fire',3)}<small>敵領地・<b class="liaTargetCount">3</b>か所まで</small></div><div class="liaSequence"><div class="liaDamage"><small>対象のHPを削る</small><b>HP <strong>−10</strong></b></div><div class="liaAttack"><small>次に攻めるとき</small><b>AT <strong>+10</strong></b></div></div>`,
   adel:`<div class="ultMetrics">${stat('cards/stat-hp-icon.svg','全自クリーチャー','<span class="ultHeal">HPを <b>20</b> 回復</span>')}${stat('shield','次の防衛','+10','DF')}</div>`,
   villa:`<div class="ultMetrics ultVilla">${stat('ic_dice.png','廃棄枚数分','移動')}${stat('ic_hand.png','廃棄から','3','枚まで回収')}</div><small class="nextSub">移動後に回収・その後ダイス</small>`,
   nerasio:`${tiles('earth',2)}<div class="ultElements">${['fire','water','earth','wind'].map(icon).join('')}</div><p class="nextBrief">自領地 <strong>2</strong> か所まで属性変更</p>`
  }[actor];
  return {actor:p.id,scene:'next',kind:'next-ultimate',duration:GAME_TIMING.ultimateNotice,html:`<header class="effectHeading"><small class="nextEyebrow">必殺技</small><h2>${esc(s.catalog.ULTS[actor].name)}</h2></header><div class="nextBody ultBody">${content}</div>`};
 }
 function rare(p){return {actor:p.id,scene:'next',kind:'next-rare',duration:GAME_TIMING.rareNotice,html:`<header class="effectHeading"><h2>レアカードを引いた</h2></header><div class="nextBody rareBody"><div class="rareHalo" aria-hidden="true"><i></i></div><div class="rareHand"><img src="/assets/ui/rare-hand-hd.png" alt="カードの裏面"><i class="rareGleam"></i></div></div>`};}
 function chain(p,{before,after,element}){const mul=n=>n===0?'—':'×'+[1,1,1.4,1.8,2.2,2.6][Math.min(5,n)].toFixed(1);return {actor:p.id,scene:'next',kind:'next-chain',duration:GAME_TIMING.chainNotice,html:`<header class="effectHeading"><h2>${icon(element)}${{fire:'火',water:'水',earth:'土',wind:'風'}[element]}の連鎖${after<before?'が減少':''}</h2></header><div class="nextBody chainBody ${after<before?'decreased':'increased'}"><div class="chainValues"><span>${before}</span>${arrow}<strong>${after}</strong></div><div class="chainLands">${Array.from({length:Math.min(5,Math.max(before,after))},(_,i)=>`<span class="chainSlot ${i>=after?'lost':''} ${i>=before?'new':''}">${land(element,i)}</span>`).join('')}${after>5?'<b class="chainMore">+'+(after-5)+'</b>':''}</div><div class="chainMultiplier"><small>地価</small><span>${mul(before)}</span>${arrow}<b>${mul(after)}</b></div></div>`};}

 let splash,generation=0;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 function cancel(){generation++;splash?.classList.remove('on');}
 async function present(kind,event,s,{ms=n=>n}={}){
  const token=generation,p=s.players.find(p=>p.id===event.player);if(!p)return;
  if(kind==='ultimate'){
   if(!splash){splash=document.createElement('div');splash.id='nextUltSplash';splash.setAttribute('aria-hidden','true');document.body.append(splash);}
   splash.innerHTML=img((s.catalog.ULTS[p.charId].art||'/assets/ult_'+p.charId+'.webp').replace('/assets/',''));
   splash.querySelector('img').style.animationDuration=ms(GAME_TIMING.ultimateIntro)+'ms';
   splash.classList.add('on');
   try{await pause(ms(GAME_TIMING.ultimateIntro));}finally{splash.classList.remove('on');}
   if(token!==generation)return;
  }
  if(token===generation)await BoardNotice.effect(kind==='ultimate'?ultimate(s,p):kind==='rare'?rare(p):chain(p,event),s,{ms});
 }
 addEventListener('pagehide',cancel);
 return {present,cancel,ultimate,rare,chain};
})();
