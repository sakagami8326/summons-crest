/* Approved phone summoner selection. Server options remain authoritative. */
window.PhoneSummonerSelection={create(root,{card:bigCardHTML,icon:sic,send,onOpen=()=>{}}){
 let snapshot=null,playerId=null,C=null,scope='',signature='',submission=0,transitionId=0,submitting=false;
 const self=()=>snapshot?.players.find(p=>p.id===playerId);
 const pending=()=>snapshot?.pending?.[playerId];
 const available=id=>pending()?.type==='select_char'&&pending().options.some(o=>o.id===id)&&!snapshot.players.some(p=>p.id!==playerId&&p.confirmed&&p.charId===id)&&C.CHARS[id]?.selectable!==false&&!C.CHARS[id]?.upcoming;
 const canUnpick=()=>pending()?.options?.some(o=>o.id==='unpick');

 const preferred=['redani','linnei','grease','mio','lia','adel','villa','nerasio','noir'];
 const element=id=>C.CHARS[id].elem||'neutral';
 let ids=[];
 const colors={fire:'#ed875b',water:'#78bfef',earth:'#d8b756',wind:'#6cddc7',neutral:'#d8d1e4'},names={fire:'火',water:'水',earth:'土',wind:'風',neutral:'無'};
 let filter='all',active=null,busy=false,scroll=0;
 const icon=e=>`<span class="elementIcon" role="img" aria-label="${names[e]}属性" style="background:${colors[e]};mask:url(/assets/element-${e==='water'?'water-v2':e}.svg) center/contain no-repeat"></span>`;
 const navArrow=()=>'<img class="ornateArrow" src="/assets/ui/arrow-ornate.svg" alt="" aria-hidden="true">';
 const art=id=>`/assets/board-actors/${id}.png`;
 const vars=id=>`--accent:${colors[element(id)]};--element-bg:url('/assets/cards/bg-${element(id)}.webp')`;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function list(){active=null;root.dataset.view='list';root.innerHTML=`<section class="summonerList"><header class="listHeader"><h1>召喚士を選択</h1><span class="selectionStatus" role="status">${self()?.confirmed?esc(C.CHARS[self().charId]?.name||'')+'で決定':''}</span>${canUnpick()?'<button class="reselectSummoner">選び直す</button>':''}</header><nav class="elementFilters" aria-label="属性で絞り込み"><button data-filter="all" aria-label="全属性" aria-pressed="${filter==='all'}"><svg viewBox="0 0 32 32"><path d="m16 2 5 9 9 5-9 5-5 9-5-9-9-5 9-5Z"/></svg></button>${Object.keys(names).map(e=>`<button data-filter="${e}" aria-label="${names[e]}属性" aria-pressed="${filter===e}" style="--accent:${colors[e]}">${icon(e)}</button>`).join('')}</nav><div class="rosterScroll"><div class="roster">${ids.filter(id=>filter==='all'||element(id)===filter).map((id,i)=>`<button class="summonerTile ${available(id)?'':'unavailable'} ${self()?.charId===id?'mine':''}" data-id="${id}" style="${vars(id)};--order:${i}" aria-label="${C.CHARS[id].name}の詳細"><div class="tileBackdrop"></div><img class="tileCrest" src="/assets/element-${element(id)==='water'?'water-v2':element(id)}.svg" alt=""><img class="tileArt" src="${art(id)}" alt=""><span class="tileName">${icon(element(id))}<b>${C.CHARS[id].name}</b></span>${tileStatus(id)}</button>`).join('')||'<p class="rosterEmpty">該当する召喚士はいません</p>'}</div></div><span class="scrollCue" aria-hidden="true">⌄</span></section>`;
 root.querySelector('.rosterScroll').scrollTop=scroll;
 root.querySelector('.reselectSummoner')?.addEventListener('click',()=>submit('unpick'));
 root.querySelector('.rosterScroll').onscroll=e=>{scroll=e.currentTarget.scrollTop;};
 root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{if(busy||submitting)return;filter=b.dataset.filter;scroll=0;list();});
 root.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{scroll=root.querySelector('.rosterScroll').scrollTop;transition(()=>detail(b.dataset.id),'open');});
 }
 function detail(id){active=id;root.dataset.view='detail';const c={...C.CHARS[id],elem:element(id)},u=C.ULTS[id]||{name:'必殺技',desc:'準備中'},deck=C.STARTER_DECKS[id]||[];
 const ultimateDescription=id==='lia'?'敵領地を最大<b>3</b>か所選び、配置クリーチャーに<b>10ダメージ</b>。<br>次にその領地へ侵略するクリーチャーは<b>AT+10</b>。':esc(id==='villa'?u.desc.replace(/。その後ダイスを振る[。]?$/,'。'):u.desc);
 root.innerHTML=`<section class="summonerDetail" style="${vars(id)}"><div class="detailBackground"></div><img class="detailCrest" src="/assets/element-${c.elem==='water'?'water-v2':c.elem}.svg" alt=""><button class="backList" aria-label="召喚士一覧に戻る">${navArrow()}<span>一覧</span></button><div class="portraitStage"><img class="portrait" src="${art(id)}" alt="${c.name}"></div><button class="summonerArrow previous" aria-label="前の召喚士">${navArrow()}</button><button class="summonerArrow next" aria-label="次の召喚士">${navArrow()}</button><article class="summonerInfo"><header class="detailHeading">${icon(c.elem)}<h1>${c.name}</h1><span class="index">${String(ids.indexOf(id)+1).padStart(2,'0')}<small> / ${String(ids.length).padStart(2,'0')}</small></span></header><p class="concept">${esc(c.style)}${'<span class="affinityBenefit">'+icon(c.elem)+'<span>'+(c.elem==='neutral'?'全属性の領地 強化費用 <b>10％OFF</b>':'同属性の領地 強化費用 <b>20％OFF</b>')+'</span></span>'}</p><section class="ultimateInfo"><h2><span>${u.name}</span><span class="ultimateLimit" aria-label="必殺技は1試合1回"><span class="limitCaption">1試合に</span><span class="limitCount"><b>1</b><span>回</span></span></span></h2><p>${ultimateDescription}</p></section><section class="starter"><header><h2>${sic('draft')}初期デッキ</h2></header><div class="starterGrid">${deck.map(cid=>`<button class="starterCard" data-card="${cid}" aria-label="${esc((C.CREATURES[cid]||C.SPELLS[cid]||C.SUPPORTS[cid]).name)}"><div class="cardCanvas">${bigCardHTML(cid)}</div></button>`).join('')}</div></section><button class="chooseSummoner" ${submitting||(!available(id)&&!(self()?.charId===id&&canUnpick()))?'disabled':''}>${chooseLabel(id)}<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 6"/></svg></button></article></section>`;
 root.querySelector('.backList').onclick=()=>transition(list,'back');root.querySelector('.previous').onclick=()=>step(-1);root.querySelector('.next').onclick=()=>step(1);
 root.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>showCard(b.dataset.card));
 root.querySelector('.chooseSummoner').onclick=()=>submit(self()?.charId===id&&canUnpick()?'unpick':id);
 fit();
 }
 function fit(){
 const grid=root.querySelector('.starterGrid');if(!grid)return;
 const style=getComputedStyle(grid),gapX=parseFloat(style.columnGap)||0,gapY=parseFloat(style.rowGap)||0;
 const rows=Math.ceil(grid.children.length/6);
 const width=Math.max(0,Math.min((grid.clientWidth-gapX*5)/6,(grid.clientHeight-gapY*(rows-1))/Math.max(1,rows)*300/470));
 grid.style.setProperty('--starter-card-width',`${width}px`);
 root.querySelectorAll('.starterCard').forEach(b=>b.querySelector('.cardCanvas').style.transform=`scale(${b.clientWidth/300})`);
 }
 function showCard(cid){const d=document.createElement('div');d.className='starterZoom';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','カード詳細');d.innerHTML=`<button class="zoomClose" aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div class="zoomFrame"><div class="cardCanvas">${bigCardHTML(cid)}</div></div>`;root.append(d);d.querySelector('.cardCanvas').style.transform=`scale(${d.querySelector('.zoomFrame').clientWidth/300})`;const close=()=>{d.remove();root.querySelector(`[data-card="${cid}"]`)?.focus();};d.querySelector('button').onclick=close;d.onclick=e=>{if(e.target===d)close();};d.querySelector('button').focus();}
 function step(dir){if(busy||submitting)return;const next=ids[(ids.indexOf(active)+dir+ids.length)%ids.length];transition(()=>detail(next),dir>0?'next':'previous');}
 async function transition(render,mode){
 if(busy||submitting||root.hidden)return;busy=true;const token=++transitionId;root.dataset.motion=mode;
 const old=root.firstElementChild,reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
 try{await old.animate([{opacity:1,transform:'translateX(0) scale(1)'},{opacity:0,transform:'translateX('+(mode==='previous'?100:-100)+'px) scale(.96)'}],{duration:reduce?0:180,easing:'cubic-bezier(.6,0,1,.5)',fill:'forwards'}).finished;}catch(e){}
 if(token!==transitionId||root.hidden)return;
 render();root.classList.remove('arrive');void root.offsetWidth;root.classList.add('arrive');
 setTimeout(()=>{if(token===transitionId)busy=false;},reduce?0:500);
 }
 function tileStatus(id){
 const mine=self()?.charId===id&&self()?.confirmed;
 const taken=snapshot.players.find(p=>p.id!==playerId&&p.confirmed&&p.charId===id);
 const label=mine?'選択済み':taken?esc(taken.name)+' が使用中':C.CHARS[id].selectable===false||C.CHARS[id].upcoming?'準備中':'';
 return label?'<span class="tileStatus">'+label+'</span>':'';
 }
 function chooseLabel(id){if(submitting)return '確定中…';if(self()?.charId===id&&canUnpick())return '選び直す';if(available(id))return 'この召喚士を選ぶ';if(C.CHARS[id].selectable===false||C.CHARS[id].upcoming)return '準備中';return self()?.confirmed?'選択済み':'選択できません';}
 async function submit(id){
 if(submitting||root.hidden||!(id==='unpick'?canUnpick():available(id)))return;
 const token=++submission;submitting=true;root.querySelector('.selectionFeedback')?.remove();
 const button=root.querySelector('.chooseSummoner,.reselectSummoner');if(button){button.disabled=true;button.textContent='確定中…';}
 let failure='';
 try{const res=await send(id);if(!res?.ok)failure=res?.status===409?'選択状況が変わりました':'通信できませんでした。もう一度お試しください';}
 catch(e){failure='通信できませんでした。もう一度お試しください';}
 finally{if(token===submission&&!root.hidden){submitting=false;signature='';active?detail(active):list();if(failure){const msg=document.createElement('div');msg.className='selectionFeedback';msg.setAttribute('role','alert');msg.textContent=failure;root.append(msg);}}}
 }
 function hide(){root.hidden=true;transitionId++;submission++;busy=false;submitting=false;active=null;signature='';root.replaceChildren();root.classList.remove('arrive');}
 function update(next,meId){
 if(next?.phase!=='select'){hide();return;}
 const nextScope=[next.code,next.stateInstanceId,meId].join('|');
 if(scope!==nextScope){hide();filter='all';scroll=0;scope=nextScope;}
 snapshot=next;playerId=meId;C=next.catalog;ids=[...preferred.filter(id=>C.CHARS[id]),...Object.keys(C.CHARS).filter(id=>!preferred.includes(id))];if(active&&!C.CHARS[active])active=null;
 const key=JSON.stringify([nextScope,next.pending[meId],next.players.map(p=>[p.id,p.name,p.charId,p.confirmed]),C.CHARS,C.STARTER_DECKS]);
 if(key===signature&&!root.hidden)return;
 const opening=root.hidden;root.hidden=false;if(opening)onOpen();
 transitionId++;busy=false;root.classList.remove('arrive');
 const zoom=root.querySelector('.starterZoom');if(zoom)zoom.remove();
 active?detail(active):list();if(zoom)root.append(zoom);signature=key;
 }
 window.addEventListener('resize',fit);document.addEventListener('keydown',e=>{if(root.hidden)return;if(root.querySelector('.starterZoom')){if(e.key==='Escape')root.querySelector('.zoomClose').click();return;}if(active&&e.key==='ArrowRight')step(1);if(active&&e.key==='ArrowLeft')step(-1);if(active&&e.key==='Escape')transition(list,'back');});
 new ResizeObserver(fit).observe(root);
 return {update,hide};
}};
