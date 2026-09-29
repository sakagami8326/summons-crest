/* Approved 01A board notices. Display-only: never writes game state or sends actions. */
window.BoardNotice = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = n => Math.round(Number(n)||0).toLocaleString('ja-JP');
  const delay = ms => new Promise(r=>setTimeout(r,ms));
  const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
  let host, arrows, directionKey='', routeKey='', generation=0, scope='', activeMoney=false;
  const pending = new Map(), completed = new Set();
  function mount(){
    if(host)return;
    host=document.createElement('div');host.id='boardNotice';host.className='flowDemo';host.dataset.design='a';host.dataset.corner='fade';host.hidden=true;
    host.innerHTML='<section class="messageWindow" role="status" aria-live="polite"><div class="lineDecor" aria-hidden="true">'+['tl','tr','bl','br'].map(c=>`<i class="corner ${c}"></i>`).join('')+'<i class="crest top"></i><i class="crest bottom"></i></div><div class="noticeContent"></div></section>';document.body.append(host);
    arrows=document.createElementNS('http://www.w3.org/2000/svg','svg');arrows.id='boardDirectionRoutes';arrows.setAttribute('aria-label','進行方向の候補');arrows.setAttribute("hidden","");document.body.append(arrows);
  }
  function art(p){const id=/^(redani|linnei|grease|mio|lia|adel|villa|nerasio)$/.test(p?.charId)?p.charId:null;return id?`<img class="flowPortrait" src="/assets/pawn_${id}.${id==='adel'?'webp':'png'}" alt="">`:'';}
  function creature(cid,s){const c=s.catalog.CREATURES[cid],base=String(cid).replace(/_f$/,'');if(!c||!/^[a-z0-9_]+$/.test(base))return '';return `<img src="/assets/${String(cid).endsWith('_f')?'e':'c'}_${base}.png" alt="${esc(c.name)}">`;}
  function reveal(flow,html,kind=''){mount();hideInspection();window.BoardActor?.clear(host);host.dataset.flow=flow;host.dataset.kind=kind;host.querySelector('.noticeContent').innerHTML=html;host.hidden=false;host.classList.remove('enter','leaving','moneyMoving','settled','illuminated');void host.offsetWidth;host.classList.add('enter');}
  function hideDirection(){directionKey='';routeKey='';if(arrows){arrows.setAttribute("hidden","");arrows.innerHTML='';}if(host?.dataset.flow==='direction')host.hidden=true;}
  function direction(s,p,pend,point){
    if(!p||!pend||activeMoney){hideDirection();return;}mount();
    const opts=pend.options.filter(o=>o.id==='dir:1'||o.id==='dir:-1');
    if(!opts.length){hideDirection();return;}
    const key=JSON.stringify([p.id,p.charId,p.name,p.pos,opts.map(o=>o.id)]);
    if(directionKey!==key){directionKey=key;const elem=s.catalog.CHARS[p.charId]?.elem;
      reveal('direction',`<div class="directionBar">${art(p)}<div><span class="flowEyebrow">${['fire','water','earth','wind'].includes(elem)?`<img src="/assets/element-${elem==='water'?'water-v2':elem}.svg" alt="">`:''}${esc(p.name)}</span><h2>進む方向を選択</h2></div><div class="phonePrompt"><span class="phoneOutline" aria-hidden="true"></span><span>スマホで選択</span><span class="waitingDots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>`);
    }
    const paths=opts.map(o=>{const dir=o.id==='dir:1'?1:-1;return{dir,points:[0,1,2].map(n=>point((p.pos+n*dir+s.tiles.length)%s.tiles.length))};});
    const stamp=JSON.stringify([innerWidth,innerHeight,paths.map(v=>v.points.map(x=>[Math.round(x.x*10),Math.round(x.y*10)]))]);
    if(routeKey===stamp)return;routeKey=stamp;arrows.removeAttribute("hidden");arrows.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    arrows.innerHTML=paths.map(({dir,points:ps})=>{const end=ps.at(-1),prev=ps.at(-2),angle=Math.atan2(end.y-prev.y,end.x-prev.x)*180/Math.PI,d=ps.map((v,i)=>`${i?'L':'M'}${v.x} ${v.y}`).join(' ');return `<g class="routeBranch"><path d="${d}" class="routeShadow"/><path d="${d}" class="routeLine"/><g transform="translate(${end.x},${end.y}) rotate(${angle})"><path class="routeTip" d="M-20 -12 L0 0 L-20 12"/></g><g transform="translate(${end.x},${end.y-39})"><rect x="-43" y="-17" width="86" height="30"/><text text-anchor="middle" y="4">${dir===1?'左回り':'右回り'}</text></g></g>`;}).join('');
    const origin=paths[0].points[0];arrows.innerHTML+=`<ellipse class="startHalo" cx="${origin.x}" cy="${origin.y}" rx="35" ry="17"/>`;
  }
  function setScope(s){const key=`${s.code}:${s.stateInstanceId||''}`;if(scope!==key){reset();scope=key;}}
  function prepare(s,b,seen){setScope(s);if(!b||seen||completed.has(b.at)||pending.has(b.at))return;
    const holds=new Map();for(const e of b.moneyEvents||[]){if(e.from&&!holds.has(e.from))holds.set(e.from,e.fromBefore);if(e.to&&!holds.has(e.to))holds.set(e.to,e.toBefore);}if(holds.size)pending.set(b.at,holds);
  }
  function hudGold(p){for(const holds of pending.values())if(holds.has(p.id))return holds.get(p.id);return p.gold;}
  function held(pid){return [...pending.values()].some(m=>m.has(pid));}
  function finish(b){pending.delete(b.at);completed.add(b.at);if(completed.size>100)completed.delete(completed.values().next().value);}
  function account(p,negative,amount,before){return `<article class="flowAccount ${negative?'payer':'receiver'}">${art(p)}<div class="accountName"><small>${negative?'支払い':'受け取り'}</small><b>${esc(p?.name)}</b></div><strong class="flowDelta">${negative?'−':'+'}${num(amount)}<small>G</small></strong><div class="flowBalance"><small>手持ちG</small><span>${num(before)}</span><i>→</i><b data-counter="${negative?'from':'to'}">${num(before)}</b></div></article>`;}
  const titles={toll:'通行料',plunder:'略奪',rage:'逆鱗',bloodstained_blade:'血染めの刃',evolution_prayer:'進化の祈り'};
  async function battle(b,getState,{ms,onHud}){
    mount();hideDirection();activeMoney=true;const token=generation;
    try{
      const events=b.moneyEvents||[];
      for(const e of events){
        if(token!==generation)break;const s=getState(),to=s.players.find(p=>p.id===e.to),from=s.players.find(p=>p.id===e.from);if(!to||e.from&&!from)continue;
        let source='';if(!from){const providers=e.providers||[],chosen=providers.find(x=>x.creature.endsWith('_f'))||providers[0];if(chosen)source=`<div class="prayerSource">${creature(chosen.creature,s)}<b>${esc(s.catalog.CREATURES[chosen.creature]?.name)}</b>${providers.length>1?`<small>配置${providers.length}体分</small>`:''}</div>`;}
        reveal('battle',`<header class="moneyHeader"><span>${e.reason==='toll'?(b.nonBattle?'':'防衛成功'):'クリーチャー・カード効果'}</span><h2>${esc(titles[e.reason]||'Gの移動')}</h2></header><div class="moneyGrid">${from?account(from,true,e.amount,e.fromBefore):source}<div class="transferTrack" aria-hidden="true"><span class="transferArrow"></span>${Array.from({length:5},(_,i)=>`<img class="travelCoin" src="/assets/ic_gold.png" style="--i:${i}" alt="">`).join('')}</div>${account(to,false,e.amount,e.toBefore)}</div>`,e.reason==='toll'?'toll':'prayer');
        window.BoardActor?.attach(host,to,s,ms);
        await delay(ms(1100));if(token!==generation)break;host.classList.add('moneyMoving');
        const start=performance.now(),duration=reduced()?0:ms(1200);let raf=0;
        const paint=k=>{for(const side of ['from','to']){const el=host.querySelector(`[data-counter="${side}"]`);if(el)el.textContent=num(e[side+'Before']+(e[side+'After']-e[side+'Before'])*k);}};
        const tick=now=>{if(token!==generation)return;const k=duration?Math.min(1,(now-start)/duration):1;paint(k);if(k<1)raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);
        await delay(duration);cancelAnimationFrame(raf);if(token!==generation)break;paint(1);host.classList.add('settled');
        const holds=pending.get(b.at);if(e.from)holds?.set(e.from,e.fromAfter);holds?.set(e.to,e.toAfter);onHud();
        await delay(ms(1700));if(token!==generation)break;host.classList.add('leaving');await delay(ms(200));
      }
      if(!events.length&&b.tollWaived&&token===generation){const s=getState(),p=s.players.find(x=>x.id===b.defender);reveal('battle',`<header class="moneyHeader"><span>バトル終了</span><h2>防衛成功</h2></header><div class="noTransfer">${art(p)}<div><h3>通行料なし</h3><p>移動侵略</p></div></div>`,'none');window.BoardActor?.attach(host,p,s,ms);await delay(ms(2500));}
    }finally{if(token===generation){host.hidden=true;window.BoardActor?.clear(host);activeMoney=false;finish(b);onHud();}}
  }

  // Keep authoritative cash before each notice until its own count-up finishes.
  function hold(key, entries){if(!completed.has(key)&&!pending.has(key))pending.set(key,new Map(entries.filter(([,v])=>Number.isFinite(v))));}
  function tollData(e){return {at:'toll:'+e.at,nonBattle:true,moneyEvents:[{reason:'toll',from:e.from,to:e.to,amount:e.amount,fromBefore:e.fromGold+e.amount,fromAfter:e.fromGold,toBefore:e.toGold-e.amount,toAfter:e.toGold}]};}
  function prepareEconomy(s,prev,segmentSeen,willMove){
    setScope(s);
    const e=s.lastEvent;if(e?.type==='toll'&&e.at!==prev.eventAt)prepare(s,tollData(e),false);
    const ld=s.lastDice, fresh=ld?.segment ? ld.segment.id!==segmentSeen : ld?.at!==prev.dice&&willMove;
    for(const ev of ld?.gateEvents||ld?.segment?.events?.filter(e=>e.type==='gate')||[]){if(fresh)hold('gate:'+ev.at,[[ev.player||ld.player,ev.beforeGold]]);}
    if(ld?.castle&&fresh)hold('castle:'+(ld.segment?.id||ld.at),[[ld.player,ld.castle.beforeGold]]);
  }
  const balance=before=>`<div class="flowBalance"><small>手持ちG</small><span>${num(before)}</span><i>→</i><b data-counter="cash">${num(before)}</b></div>`;
  function sealChip(label,lit,newly){return `<div class="sealChip ${lit?'lit':''} ${newly?'newSeal':''}"><span>${label}</span></div>`;}
  function healingHTML(targets,s){
    if(!targets.length)return '<div class="healTargets"><span class="noHeal">回復対象なし</span></div>';
    const pages=[];for(let i=0;i<targets.length;i+=3)pages.push(targets.slice(i,i+3));
    return `<div class="healingSummary"><span class="healingCount">${targets.length}領地を回復</span><div class="healViewport" aria-hidden="true">${pages.map((page,i)=>`<div class="healPage ${i===0?'active':''}" data-page="${i}">${page.map(t=>`<span class="healTarget" title="土地${t.tile+1} ${esc(t.name)} +${num(t.hp)}HP">${creature(t.cid,s)}<b>+${num(t.hp)}</b></span>`).join('')}</div>`).join('')}</div>${pages.length>1?`<div class="healPages" aria-hidden="true">${pages.map((_,i)=>`<i class="${i===0?'active':''}"></i>`).join('')}</div>`:''}<span class="healAccessible">${targets.map(t=>`土地${t.tile+1} ${esc(t.name)} +${num(t.hp)}HP`).join('、')}</span></div>`;
  }

  async function reward(kind,ev,p,s,{ms,onHud,key}){
    if(!p)return;mount();hideDirection();activeMoney=true;const token=generation;
    const amount=Number(ev.total ?? ev.gold)||0,after=Number.isFinite(ev.afterGold)?ev.afterGold:p.gold,before=Number.isFinite(ev.beforeGold)?ev.beforeGold:after-amount;
    hold(key,[[p.id,before]]);
    const targets=(ev.healed||[]).map(h=>{const tile=typeof h==='number'?h:h.tile,cid=h.creatureId||s.owners?.[tile]?.creature||h.creature;return {tile,cid,name:s.catalog.CREATURES[cid]?.name||h.creature||'',hp:typeof h==='number'?10:Number(h.amount ?? (h.before-h.after))};});
    const seal=!!ev.usedSeal,heals=targets.length>0,cave=s.mapId==='twin_gate_cavern',visited=ev.gatesVisited||[],both=visited.includes(12)&&visited.includes(22),gateName=cave?(ev.tile===22?'西門':'東門'):'変化の門',nextName=ev.tile===22?'東門':'西門';
    const html=kind==='castle'?`<div class="returnHeading"><div class="returnSummoner">${art(p)}<span>${esc(p.name)}</span></div><header class="moneyHeader"><span>城へ帰還</span><h2>帰還ボーナス</h2></header><img class="returnCastle" src="/assets/struct_castle.png" alt="城"></div>${seal?`<div class="threeRewards"><article class="returnReward goldReward"><span class="rewardIndex">01</span><h3>ボーナス</h3><div class="bonusIcon"><img src="/assets/ic_gold.png" alt=""></div><strong class="bonusValue">+<span data-counter="total">0</span><em>G</em></strong><div class="goldParts"><span>周回</span><b>+${num(ev.baseBonus ?? ev.gold ?? 0)}G</b><span>領地</span><b>+${num(ev.landBonus || 0)}G</b></div></article><article class="returnReward hpReward ${heals?'':'noTargets'}"><span class="rewardIndex">02</span><h3>HPを回復</h3><div class="bonusIcon"><img src="/assets/cards/stat-hp-icon.svg" alt=""></div><strong class="bonusValue">10<em>HP</em></strong>${healingHTML(targets,s)}</article><article class="returnReward cardReward"><span class="rewardIndex">03</span><h3>カードを選択</h3><div class="bonusIcon"><img src="/assets/ic_hand.png" alt=""></div><strong class="bonusValue">${ev.drew || 0}<em>枚</em></strong><div class="cardChoiceHint">3枚から選択</div></article></div>${balance(before)}`:`<div class="noSeal"><h3>刻印なし</h3><span>帰還ボーナスなし</span></div>`}`:`<header class="moneyHeader"><h2>${gateName}を通過</h2></header><div class="rewardLayout gateLayout"><div class="rewardActor">${art(p)}<b>${esc(p.name)}</b></div><div class="rewardMain"><div class="gateHero"><img class="placeArt" src="/assets/struct_gate.png" alt="門"><div class="sealBlock"><div class="sealRow">${cave?sealChip('東',visited.includes(12)&&ev.tile!==12,ev.tile===12)+sealChip('西',visited.includes(22)&&ev.tile!==22,ev.tile===22):sealChip('刻',false,true)}</div><span class="sealCaption">${cave?(both?'両門の刻印が揃った':gateName+'の刻印を取得'):'刻印を取得'}</span></div><strong class="gateAmount">+<span data-counter="total">0</span><em>G</em></strong></div>${balance(before)}<div class="castleDestination ${cave&&!both?'':'hasCastle'}"><span class="destinationLine"></span><span>${cave&&!both?'次は'+nextName+'へ':'城へ戻ってボーナスをGET'}</span><img src="/assets/${cave&&!both?'struct_gate':'struct_castle'}.png" alt="${cave&&!both?nextName:'城'}"></div></div></div>`;
    let raf=0;
    try{
      reveal('reward',html,kind);host.classList.remove('rewardLit');
      window.BoardActor?.attach(host,p,s,ms);
      host.querySelectorAll('.bonusIcon img').forEach((el,i)=>{el.style.animationDuration=ms(1050)+'ms';el.style.animationDelay=ms(350+i*1100)+'ms';});
      const duration=ms(kind==='castle'?GAME_TIMING.castleDuration(ev):GAME_TIMING.gateNotice),start=performance.now();
      const values=kind==='castle'&&!seal?[]:[['cash',before,after],['total',0,amount]];
      for(const [id,a,b]of values){const el=host.querySelector(`[data-counter="${id}"]`);if(el)el.style.width=Math.max(num(a).length,num(b).length)+'ch';}
      const pages=[...host.querySelectorAll('.healPage')],dots=[...host.querySelectorAll('.healPages i')];let page=0,settled=false;
      const tick=now=>{
        if(token!==generation)return;
        const elapsed=now-start,lead=ms(kind==='castle'?1200:650),k=reduced()?1:Math.max(0,Math.min(1,(elapsed-lead)/ms(1050)));
        if(elapsed>=lead||reduced())host.classList.add('moneyMoving','rewardLit');
        for(const [id,a,b]of values){const el=host.querySelector(`[data-counter="${id}"]`);if(el)el.textContent=num(a+(b-a)*k);}
        if(k===1&&!settled){settled=true;host.classList.add('settled');pending.get(key)?.set(p.id,after);onHud();}
        if(pages.length>1){const next=elapsed<ms(GAME_TIMING.healPageFirst)?0:Math.min(pages.length-1,1+Math.floor((elapsed-ms(GAME_TIMING.healPageFirst))/ms(GAME_TIMING.healPageInterval)));if(next!==page){pages[page].classList.remove('active');dots[page]?.classList.remove('active');page=next;pages[page].classList.add('active');dots[page]?.classList.add('active');}}
        raf=requestAnimationFrame(tick);
      };raf=requestAnimationFrame(tick);
      await delay(Math.max(0,duration-ms(200)));if(token===generation)host.classList.add('leaving');await delay(ms(200));
    }finally{cancelAnimationFrame(raf);if(token===generation){host.hidden=true;window.BoardActor?.clear(host);activeMoney=false;finish({at:key});onHud();}}
  }
  const toll=(ev,getState,opts)=>battle(tollData(ev),getState,opts);

  async function effect(model,s,{ms=n=>n}={}){
    mount();hideDirection();activeMoney=true;const token=generation;let timer;
    try{
      reveal('effects',model.html,model.kind);host.dataset.scene=model.scene;host.dataset.variant=model.kind;
      const p=s.players.find(p=>p.id===model.actor);
      const introScale=Math.min(1,model.duration/3000);
      window.BoardActor?.attach(host,p,s,n=>ms(n*introScale),{impact:model.scene==='start-turn'});
      const pages=[...host.querySelectorAll('.miniPage')],dots=[...host.querySelectorAll('.miniDots i')];let page=0;
      timer=setInterval(()=>{if(token!==generation)return;host.classList.add('illuminated');if(pages.length>1&&page<pages.length-1){pages[page].classList.remove('active');dots[page]?.classList.remove('active');page++;pages[page].classList.add('active');dots[page]?.classList.add('active');}},ms(2200));
      await delay(ms(model.duration-200));if(token!==generation)return;host.classList.add('leaving');await delay(ms(200));
    }finally{clearInterval(timer);if(token===generation){host.hidden=true;window.BoardActor?.clear(host);activeMoney=false;}}
  }
  function inspect(model,s){
    if(activeMoney)return null;
    reveal('inspection',model.html,model.kind||'enemy-land');host.dataset.scene='enemy';host.classList.toggle('landStop',model.kind==='land-stop');
    window.BoardActor?.attach(host,s.players.find(p=>p.id===model.actor),s,n=>n,{compact:true});
    host.querySelector('.standName')?.insertAdjacentHTML('afterbegin','<small class="elOwnerLabel">'+esc(model.actorLabel||'領地主')+'</small>');
    return host;
  }
  function hideInspection(){if(host?.dataset.flow==='inspection'){
    host.hidden=true;window.BoardActor?.clear(host);delete host.dataset.scene;delete host.dataset.flow;
    host.style.removeProperty('left');host.style.removeProperty('top');host.style.removeProperty('--inspect-scale');host.classList.remove('elAnchoredVisible','landStop');
  }}
  function reset(){window.BoardNext?.cancel();generation++;pending.clear();completed.clear();activeMoney=false;hideDirection();hideInspection();if(host){host.hidden=true;window.BoardActor?.clear(host);}}
  addEventListener('pagehide',reset);
  return {direction,hideDirection,prepare,prepareEconomy,hudGold,held,battle,toll,reward,effect,finish,reset,inspect,hideInspection};
})();
