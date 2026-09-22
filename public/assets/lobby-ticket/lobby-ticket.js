/* Accepted horizontal ticket and light-ring arrival. Presentation only. */
window.SummonsLobbyTicket = (() => {
const characters=[['mio','ミオ','MIO','移動・機動侵略','移動侵略で、相手の領地に切り込む。','wind'],['grease','グリース','GREASE','進化・戦線交代','進化で育てて、交代でつなぐ。','earth'],['redani','レダーニ','REDANI','武器・火力侵略','ウェポンを手に、攻め込もう。','fire'],['linnei','リンネイ','LINNEI','経済・通行料','通行料を積み重ね、資産を築く。','water'],['adel','アーデル','ADEL','回復・防衛','回復と守りで、領地を維持。','water'],['nerasio','ネラシオ','NERASIO','地脈・属性連鎖','土地の属性を変えて、連鎖を作る。','earth'],['lia','リーア','LIA','負傷・火力侵略','炎の渦で傷つけ、追撃を狙う。','fire'],['villa','ヴィラ','VILLA','廃棄・回収','廃棄したカードも、次の一手に。','wind']];
const elements={wind:['風','#5BE0D0','element-wind.svg'],earth:['土','#D9B64F','element-earth.svg'],fire:['火','#FF7A45','element-fire.svg'],water:['水','#56A8E8','element-water-v2.svg']};
const person='<svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 24v-3a8 8 0 0 1 16 0v3z"/></svg>';
const botIcon='<svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2 22 8v12l-10 6L2 20V8zM7 11h10v7H7zM9 8v3m6-3V8m-6 7h1m4 0h1"/></svg>';
const root=document.getElementById('lobby'), $=id=>document.getElementById('lt-'+id);
const scene=root.querySelector('.scene'), start=document.getElementById('startBtn');
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
let room=null, active=false, snapshot=null, previousIds=new Set(), current=0, elapsed=0, last=0, frame=0;
function fit(){const r=root.getBoundingClientRect();if(r.width&&r.height)scene.style.setProperty('--scale',Math.min(r.width/1440,r.height/810));}
function show(n){
  current=(n+characters.length)%characters.length;elapsed=0;
  const [id,name,english,style,tip,element]=characters[current],el=elements[element];
  $('summonerArt').src='/assets/full_'+id+'.png';$('summonerArt').alt=name;
  $('summonerName').textContent=name;root.querySelector('.ghostName').textContent=english;
  root.querySelector('.tipStyle').textContent=style;$('tip').textContent=tip;
  root.querySelector('.summoner').style.setProperty('--accent',el[1]);
  $('elementLogo').style.setProperty('--element-art',`url('/assets/${el[2]}')`);
  $('elementLogo').style.backgroundColor=el[1];$('elementLogo').setAttribute('aria-label',el[0]+'属性');
  for(const part of root.querySelectorAll('.tipArt,.tipCopy')){part.classList.remove('swap');void part.offsetWidth;part.classList.add('swap');}
  $('dots').replaceChildren(...characters.map((c,i)=>{const b=document.createElement('button');b.setAttribute('aria-label',c[1]+'を紹介');b.setAttribute('aria-pressed',String(i===current));b.className=i===current?'active':'';b.onclick=()=>show(i);return b;}));
  $('progress').style.width='0%';
}
function tick(now){
  frame=0;if(!active||document.hidden||reduce.matches)return;
  elapsed+=Math.min(100,now-last);last=now;
  if(elapsed>=7000)show(current+1);
  $('progress').style.width=elapsed/7000*100+'%';frame=requestAnimationFrame(tick);
}
function syncClock(){cancelAnimationFrame(frame);frame=0;if(active&&!document.hidden&&!reduce.matches){last=performance.now();frame=requestAnimationFrame(tick);}}
function update(state,code){
  const nextActive=state.phase==='lobby';
  if(active!==nextActive){active=nextActive;syncClock();}
  if(!active)return;
  if(room!==code){room=code;snapshot=null;previousIds=new Set();show(0);}
  fit();const map=SummonsMapUI.get(state);
  scene.style.setProperty('--lobby-map',`url('${map.background}')`);
  root.querySelector('.mapName').textContent=map.name;
  $('modeLabel').textContent=state.botMode?'BOT戦':'通常対戦';
  const humans=state.players.filter(p=>!p.isBot),limit=state.botMode?1:4;
  const key=JSON.stringify([code,!!state.botMode,humans.map(p=>[p.id,p.name])]);
  if(key===snapshot)return;
  // A reconnect's initial snapshot is already present; only subsequent new IDs arrive.
  const arrivals=snapshot===null?[]:humans.filter(p=>!previousIds.has(p.id)).map(p=>p.id);
  const wasDisabled=start.disabled;start.disabled=state.botMode?humans.length!==1:state.players.length<2;
  start.classList.toggle('ready',wasDisabled&&!start.disabled&&arrivals.length>0);
  $('slots').replaceChildren(...Array.from({length:limit},(_,i)=>{
    const p=humans[i],slot=document.createElement('span');
    slot.className='slot humanSlot'+(p?' isJoined':'')+(p&&arrivals.includes(p.id)?' arriving':'');
    if(p)slot.dataset.playerId=p.id;
    slot.setAttribute('aria-label',p?p.name+' 参加済み':'参加待ち');slot.title=p?p.name:'参加待ち';
    slot.innerHTML='<span class="slotGlyph">'+person+'</span><span class="arrivalHalo" aria-hidden="true"></span><span class="arrivalSpark" aria-hidden="true"></span>';
    return slot;
  }));
  if(state.botMode){
    const divider=document.createElement('span');divider.className='botDivider';divider.setAttribute('aria-hidden','true');
    const bots=document.createElement('span');bots.className='botGroup';bots.innerHTML=[0,1,2].map(()=>'<span class="slot botSlot" aria-label="BOT">'+botIcon+'</span>').join('')+'<small>BOT ×3</small>';
    $('slots').append(divider,bots);
  }
  $('count').innerHTML='<span class="currentCount">'+humans.length+'</span><span> / '+limit+'</span>';
  $('count').classList.remove('countArrive');if(arrivals.length){void $('count').offsetWidth;$('count').classList.add('countArrive');}
  document.getElementById('joined').textContent=humans.map(p=>p.name).join('・');
  document.getElementById('lobbySetupHint').textContent=`${humans.length} / ${limit} 人参加中。`+(start.disabled?(state.botMode?'1人参加すると開始できます。':'2人以上で開始できます。'):'キャラ選択へ進めます。');
  snapshot=key;previousIds=new Set(humans.map(p=>p.id));
}
$('next').onclick=()=>show(current+1);$('prev').onclick=()=>show(current-1);
addEventListener('resize',fit);document.addEventListener('visibilitychange',syncClock);
reduce.addEventListener('change',syncClock);addEventListener('pagehide',()=>{active=false;syncClock();});
show(0);fit();
return {update};
})();
