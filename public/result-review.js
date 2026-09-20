/* End-of-match highlights and final inventories. */
window.mountMatchReview=({result,state,esc,fmt,onComplete=()=>{}})=>{
 const history=document.getElementById('mrHistory'),deck=document.getElementById('mrSummary');
 const $=id=>document.getElementById(id),data={players:result.rankings};
 const players=result.rankings,stats=id=>data.players.find(p=>p.id===id);
 mountExistingGameCards(state);
 const definitions=[{key:'battleWins',title:'最多バトル勝利',unit:'勝',icon:'/assets/ic_conqueror.png'},
  {key:'cardsCollected',title:'最多カード獲得',unit:'枚',icon:null},
  {key:'tollCollected',title:'最多通行料',unit:'G',icon:'/assets/ic_gold.png'}];
 let timer=null,index=0,back=()=>{},selected=players[0]?.id,page=0;
 const map=SummonsMapUI.get(state).background;
 history.classList.add('awardPage');deck.classList.add('deckReviewPage');
 history.innerHTML='<header class="reviewHeader"><h2>ハイライト</h2><span id="awardStep"></span></header><section id="awardStage" aria-live="polite"></section><footer class="reviewFooter"><button class="mrBtn" id="awardBack">‹ 順位へ</button><div class="awardPlayback"><button id="awardPause" class="mrBtn" aria-label="自動再生を一時停止">Ⅱ</button><div id="awardDots"></div></div><button class="mrBtn primary" id="awardNext">次へ →</button></footer>';
 deck.innerHTML='<header class="reviewHeader"><h2>最終デッキ</h2><nav id="deckTabs" role="tablist" aria-label="プレイヤーのデッキ"></nav></header><div class="deckLayout"><section class="deckBook" aria-label="デッキのカード"><div id="deckGrid" role="tabpanel"></div><nav id="deckPaging"></nav></section><aside id="deckComposition"></aside></div><footer class="reviewFooter"><button class="mrBtn" id="deckBack">‹ ハイライトへ</button><span></span><div class="reviewExitButtons"><button class="mrBtn" id="deckToRanking">順位を見る</button><button class="mrBtn primary" id="reviewClose">タイトルへ</button></div></footer>';
 history.style.setProperty('--review-map',`url("${map}")`);deck.style.setProperty('--review-map',`url("${map}")`);
 const dialog=document.createElement('dialog');dialog.className='reviewCardDialog';dialog.setAttribute('aria-label','カードの詳細');document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 function stop(){clearTimeout(timer);timer=null;$('awardPause').textContent='▶';$('awardPause').setAttribute('aria-label','自動再生を再開');}
 function schedule(){clearTimeout(timer);$('awardPause').textContent='Ⅱ';$('awardPause').setAttribute('aria-label','自動再生を一時停止');timer=setTimeout(()=>{if(index<2){renderAward(index+1);schedule();}else {stop();onComplete();}},4800);}
 function renderAward(i){
  index=i;const def=definitions[i],max=Math.max(0,...players.map(p=>Number(stats(p.id)?.[def.key]||0)));
  const winners=max>0?players.filter(p=>Number(stats(p.id)?.[def.key]||0)===max):[];
  const icon=def.icon?`<img src="${def.icon}" alt="">`:'<svg viewBox="0 0 72 72" aria-hidden="true"><rect x="10" y="15" width="33" height="46" rx="3" transform="rotate(-13 26 38)"/><rect x="29" y="9" width="33" height="46" rx="3"/><path d="m45 21 8 12-8 12-8-12Z"/></svg>';
  $('awardStep').textContent=`0${i+1} / 03`;
  $('awardStage').innerHTML=`<div class="awardArt" style="--winners:${Math.max(1,winners.length)}">${winners.map(p=>`<figure style="--pc:${p.color}"><div class="awardHalo"></div><img src="/assets/full_${esc(p.charId)}.png" alt="${esc(p.name)}"><figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div><div class="awardCopy"><div class="awardIcon">${icon}</div><h3>${def.title}</h3>${winners.length?`<div class="awardValue">${fmt(max)}<small>${def.unit}</small></div>${winners.length>1?'<span class="awardTie">同率</span>':''}`:`<div class="awardEmpty">${players.some(p=>stats(p.id)?.[def.key]!=null)?'該当なし':'記録なし'}</div>`}</div>`;
  $('awardStage').classList.remove('enter');void $('awardStage').offsetWidth;$('awardStage').classList.add('enter');
  $('awardNext').textContent=i===2?'デッキを見る →':'次へ →';
  $('awardDots').innerHTML=definitions.map((d,n)=>`<button class="${n===i?'active':''}" aria-label="${d.title}" aria-pressed="${n===i}" data-award="${n}"></button>`).join('');
  $('awardDots').querySelectorAll('button').forEach(el=>el.onclick=()=>{stop();renderAward(+el.dataset.award);});
 }
 function showHighlights(){stop();deck.classList.remove('on');history.classList.add('on');renderAward(0);if(!matchMedia('(prefers-reduced-motion: reduce)').matches)schedule();}
 $('awardBack').onclick=()=>{stop();back();};
 $('awardPause').onclick=()=>{if(timer)stop();else{if(index===2)renderAward(0);schedule();}};
 $('awardNext').onclick=()=>{stop();if(index===2)showDecks();else{renderAward(index+1);if(!matchMedia('(prefers-reduced-motion: reduce)').matches)schedule();}};
 const elementOrder=['neutral','fire','water','earth','wind'];
 const elementNames={neutral:'無',fire:'火',water:'水',earth:'土',wind:'風'};
 const elementColors={neutral:'#8e8198',fire:'#c05b44',water:'#4286bd',earth:'#a18a49',wind:'#488c73'};
 function cardInfo(id){
  const cr=state.catalog.CREATURES[id],sp=state.catalog.SPELLS[id],sup=state.catalog.SUPPORTS[id];
  if(cr){const base=id.replace(/_f$/,''),evo=/_f$/.test(id);return {id,kind:'creature',name:cr.name,element:cr.elem||'neutral',cost:cr.cost,st:cr.st,hp:cr.hp,effect:cr.fx||'効果なし',bg:`/assets/cards/bg-${cr.elem||'neutral'}.webp`,art:`/assets/cards/${evo?'e':'c'}_${base}.webp`};}
  if(sp){const art=dedicatedSpellAsset(id);return {id,kind:'spell',name:sp.name,cost:sp.cost,effect:sp.desc,bg:art||'/assets/cards/bg-spell-v1.webp',art:art?null:`/assets/c_${id}.png`};}
  if(sup)return {id,kind:'support',name:sup.name,cost:sup.cost,effect:sup.fx||[sup.st?`AT+${sup.st}`:'',sup.hp?`HP+${sup.hp}`:''].filter(Boolean).join(' / '),bg:'/assets/cards/bg-weapon-v1.webp',art:data.supportArt?.[id]};
  return {id,kind:'unknown',name:id,effect:'カード情報なし',bg:'/assets/cards/bg-neutral.webp'};
 }
 const typeNames={creature:'クリーチャー',support:'ウェポン',spell:'スペル',unknown:'その他'};
 function face(c){return `<review-game-card card-id="${esc(c.id)}"></review-game-card>`;}
 function openCard(c){
  dialog.innerHTML=`<button class="reviewDialogClose" aria-label="閉じる">×</button><div class="reviewDialogFace">${face(c)}</div><div class="reviewDialogCopy"><small>${typeNames[c.kind]}</small><h2>${esc(c.name)}</h2><div class="reviewCardStats"><span>${fmt(c.cost)}G</span>${c.kind==='creature'?`<span>AT ${c.st}</span><span>HP ${c.hp}</span>`:''}</div><p>${esc(c.effect||'')}</p></div>`;
  dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
 }
 function renderDeck(id){
  selected=id;const cards=(stats(id)?.finalDeck||[]).map(cardInfo).sort((a,b)=>{
   const k={creature:0,support:1,spell:2,unknown:3};return k[a.kind]-k[b.kind]||(a.kind==='creature'?elementOrder.indexOf(a.element)-elementOrder.indexOf(b.element):0)||a.id.localeCompare(b.id);
  });
  const p=players.find(x=>x.id===id),total=cards.length,pageSize=24,pages=Math.max(1,Math.ceil(total/pageSize));page=Math.min(page,pages-1);
  $('deckTabs').innerHTML=players.map(p=>{const ch=state.catalog.CHARS[p.charId],elem=ch?.elem||'neutral';return `<button class="plate" id="deck-tab-${p.id}" role="tab" aria-controls="deckGrid" aria-selected="${p.id===id}" tabindex="${p.id===id?0:-1}" data-player="${p.id}" style="--hud-color:${RUNE[elem]||'#C9A227'};--hud-bg:url('/assets/cards/bg-${elem}.webp')"><div class="hudPortrait"><img class="hudBust" src="/assets/pawn_${esc(p.charId)}.${p.charId==='adel'?'webp':'png'}" alt=""></div><span class="pname">${esc(ch?.name||p.name)}</span></button>`;}).join('');
  $('deckTabs').querySelectorAll('button').forEach((el,i)=>{
   el.onclick=()=>{page=0;renderDeck(el.dataset.player);$('deck-tab-'+el.dataset.player).focus();};
   el.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?players.length-1:(i+(e.key==='ArrowRight'?1:-1)+players.length)%players.length;page=0;renderDeck(players[n].id);$('deck-tab-'+players[n].id).focus();};
  });
  $('deckGrid').setAttribute('aria-labelledby','deck-tab-'+id);
  const visible=cards.slice(page*pageSize,(page+1)*pageSize);
  $('deckGrid').innerHTML=visible.map((c,i)=>`<button class="reviewDeckCard" aria-label="${esc(c.name)}の詳細" data-card-index="${i}">${face(c)}</button>`).join('')||`<p class="deckEmpty">${stats(id)?.finalDeck?'カードがありません':'この試合のデッキ記録はありません'}</p>`;
  $('deckGrid').querySelectorAll('button').forEach((el,i)=>el.onclick=()=>openCard(visible[i]));
  $('deckPaging').innerHTML=pages>1?`<button aria-label="前のページ" id="deckPrevPage" ${page===0?'disabled':''}>‹</button><span>${page+1} / ${pages}</span><button aria-label="次のページ" id="deckNextPage" ${page===pages-1?'disabled':''}>›</button>`:'';
  if(pages>1){$('deckPrevPage').onclick=()=>{page--;renderDeck(id);};$('deckNextPage').onclick=()=>{page++;renderDeck(id);};}
  const counts=Object.fromEntries(['creature','support','spell'].map(k=>[k,cards.filter(c=>c.kind===k).length]));
  $('deckComposition').innerHTML=`<h3>${esc(p.name)}</h3><div class="deckCount">${total}<small>枚</small></div><div class="deckElements">${elementOrder.map(e=>{const n=cards.filter(c=>c.element===e).length;return `<div><span style="color:${elementColors[e]}">${elementNames[e]}</span><b>${n}</b><i><em style="width:${total?n/total*100:0}%;background:${elementColors[e]}"></em></i></div>`;}).join('')}</div><div class="deckKinds">${Object.entries(counts).map(([k,n])=>`<div><span>${typeNames[k]}</span><b>${n}</b></div>`).join('')}</div>`;
 }
 function showDecks(id=selected){stop();onComplete();history.classList.remove('on');deck.classList.add('on');page=0;renderDeck(id);}
 $('deckBack').onclick=showHighlights;$('deckToRanking').onclick=()=>{stop();back();};
 return {destroy(){stop();dialog.close();dialog.remove();},stop,showHighlights,showDecks,setBack:fn=>back=fn,renderAward,renderDeck,cardInfo};
};

window.mountResultReview=({result,state,onComplete,onClose})=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Number(n||0).toLocaleString('ja-JP');
 const $=id=>document.getElementById(id);
 document.body.classList.add('resultReview');
 const flow=mountMatchReview({result,state,esc,fmt,onComplete});
 const stop=()=>flow.stop();
  const color=id=>result.rankings.find(p=>p.id===id)?.color||'#d2b568';
  const podium=document.createElement('section');podium.id='rvPodium';podium.className='mrPage';
  const ranked=[...result.rankings].sort((a,b)=>a.rank-b.rank);
  const lineup=ranked.length>1?[ranked[1],ranked[0],...ranked.slice(2)]:ranked;
  const crown=`<svg class="rvCrown" viewBox="0 0 180 150" aria-hidden="true">
   <defs>
    <linearGradient id="podiumGold" x1="0" y1="0" x2=".85" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#fff4c1"/><stop offset=".23" stop-color="#e2b451"/><stop offset=".43" stop-color="#fff0a6"/><stop offset=".62" stop-color="#aa671e"/><stop offset=".83" stop-color="#f5d27c"/><stop offset="1" stop-color="#9c591a"/></linearGradient>
    <linearGradient id="podiumRim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff8d2"/><stop offset=".2" stop-color="#eac779"/><stop offset=".48" stop-color="#8c4d19"/><stop offset=".65" stop-color="#e1ae4c"/><stop offset="1" stop-color="#fff0a0"/></linearGradient>
    <linearGradient id="podiumVelvet" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#406575"/><stop offset=".45" stop-color="#1b3545"/><stop offset="1" stop-color="#091824"/></linearGradient>
   </defs>
   <path d="M25 49Q42 79 54 50Q69 76 90 23Q111 76 126 50Q138 79 155 49L140 125Q90 144 40 125Z" fill="#613815" stroke="#44220e" stroke-width="5" stroke-linejoin="round"/>
   <path d="M27 50Q44 79 55 52Q70 78 90 25Q110 78 125 52Q136 79 153 50L138 120Q90 137 42 120Z" fill="url(#podiumVelvet)"/>
   <path d="M19 44Q39 67 46 75Q57 86 53 48Q71 82 80 52L90 20L100 52Q109 82 127 48Q123 86 134 75Q141 67 161 44L143 114Q90 132 37 114Z" fill="url(#podiumGold)" stroke="#f9dda0" stroke-width="1.8" stroke-linejoin="round"/>
   <g fill="url(#podiumGold)" stroke="#c5903e" stroke-width="1.3"><circle cx="18" cy="42" r="6"/><circle cx="53" cy="46" r="4.6"/><circle cx="127" cy="46" r="4.6"/><circle cx="162" cy="42" r="6"/></g>
   <circle cx="90" cy="16" r="6" fill="url(#podiumGold)" stroke="#ffedb0" stroke-width="1.5"/>
   <path d="M36 108Q90 123 144 108L140 133Q90 147 40 133Z" fill="url(#podiumRim)" stroke="#703d15" stroke-width="2"/>
   <path d="M40 114Q90 127 140 114L137 129Q90 141 43 129Z" fill="url(#podiumGold)" stroke="#f7d88d" stroke-width="1.3"/>
   <path d="M37 109Q90 124 143 109M41 133Q90 147 139 133" fill="none" stroke="#fff0b2" stroke-width="2"/>
  </svg>`;
  const ordinal=n=>({1:'st',2:'nd',3:'rd'}[n]||'th');
  podium.innerHTML=`<div class="rvPodiumBackdrop" aria-hidden="true"></div><h2 class="rvWinnerTitle">WINNER</h2><ol class="rvStandingList">${ranked.map(p=>`<li class="rvStanding ${p.rank===1?'champion':''}" style="--owner:${color(p.id)};--row:${p.rank-1}" data-player="${esc(p.id)}"><span class="rvPlace">${p.rank===1?crown:''}<b>${p.rank}<small>${ordinal(p.rank)}</small></b></span><span class="rvStandingName">${esc(p.name)}</span><span class="rvStandingAssets"><small>総資産</small><b>${fmt(p.assets.total)}<i>G</i></b></span></li>`).join('')}</ol><div class="rvLineup" style="--count:${lineup.length}">${lineup.map(p=>`<figure class="rvContestant ${p.rank===1?'champion':''}" style="--owner:${color(p.id)}"><div class="rvLaurel" aria-hidden="true"></div><img src="/assets/full_${esc(p.charId)}.png" alt="${esc(p.name)}"><figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div><div class="rvPodiumControls"><button class="mrBtn primary" id="rvToHistory">ハイライトへ →</button></div>`;
  $('matchResultOv').append(podium);
  podium.querySelector('.rvPodiumBackdrop').style.backgroundImage=`url("${SummonsMapUI.get(state).background}")`;
  function showPodium(){stop();$('mrHistory').classList.remove('on');$('mrSummary').classList.remove('on');podium.classList.add('on');document.body.classList.add('showPodium');}
  function showHistory(){podium.classList.remove('on');document.body.classList.remove('showPodium');flow.showHighlights();}
  $('rvToHistory').onclick=showHistory;
  flow.setBack(showPodium);

 $('reviewClose').onclick=()=>{onComplete();stop();onClose();};
 showPodium();
 return {flow,stop,showPodium,showHighlights:showHistory,showDecks(){podium.classList.remove('on');document.body.classList.remove('showPodium');flow.showDecks();},destroy(){flow.destroy();podium.remove();document.body.classList.remove('resultReview','showPodium');}};
};
