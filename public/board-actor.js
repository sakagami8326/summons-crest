/* Shared, display-only actor treatment. Dedicated art can be replaced per character. */
window.BoardActor = (() => {
  const ids = ['redani','linnei','grease','mio','lia','adel','villa','nerasio','noir'];
  const dedicated = Object.fromEntries(ids.map(id=>[id,`/assets/board-actors/${id}.png`]));
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let shade, timer;
  function clear(host) {
    clearTimeout(timer);shade?.classList.remove('active');
    host.querySelectorAll('.actorStand,.cutinStage,.crestStage,.motionFx,.ringLayer').forEach(e=>e.remove());
    for(const key of ['actor','owner','side','motion','layers','emblem','element'])delete host.dataset[key];
  }
  function attach(host,p,s,ms=n=>n,{compact=false,impact=false}={}) {
    clear(host);if(!p||!ids.includes(p.charId))return;
    const character=s.catalog.CHARS[p.charId],elem=['fire','water','earth','wind'].includes(character?.elem)?character.elem:'neutral';
    Object.assign(host.dataset,{actor:p.id,owner:'g',side:'right',motion:impact?'impact':'calm',layers:'stagger',emblem:'focus',element:elem});
    host.style.setProperty('--actor-bg',`url('/assets/cards/bg-${elem}.webp')`);
    host.style.setProperty('--actor-icon',elem==='neutral'?'none':`url('/assets/element-${elem==='water'?'water-v2':elem}.svg')`);
    const palette={fire:['#923a22','#ffd19a'],water:['#235784','#b8e5ff'],earth:['#71612c','#f2dfa2'],wind:['#145d60','#c4fff0'],neutral:['#61526f','#e7dafa']}[elem];
    host.style.setProperty('--actor-color',palette[0]);host.style.setProperty('--actor-light',palette[1]);
    host.insertAdjacentHTML('afterbegin','<div class="cutinStage" aria-hidden="true"><div class="cutinBand"></div></div><div class="crestStage" aria-hidden="true"><div class="cutinCrest"></div></div>');
    host.insertAdjacentHTML('beforeend',`<aside class="actorStand" aria-label="${esc(p.name)}"><div class="standBackdrop" aria-hidden="true"></div><div class="standArt"><img src="${dedicated[p.charId]||'/assets/full_'+p.charId+'.png'}" alt="${esc(character?.name)}"></div><div class="standName"><b>${esc(p.name)}</b></div></aside><div class="ringLayer" aria-hidden="true"><i class="motionRing"></i></div><div class="motionFx" aria-hidden="true">${Array.from({length:9},(_,i)=>`<i class="cutinSpark" style="--angle:${i*40}deg;--distance:${110+i%3*35}px"></i>`).join('')}</div>`);
    const portrait=host.querySelector('.standArt img');portrait.onerror=()=>{portrait.onerror=null;portrait.src='/assets/full_'+p.charId+'.png';};
    if(compact)return; // Persistent land inspection has no full-screen entrance or shade.
    if(!impact){
      for(const a of host.getAnimations({subtree:true}))a.playbackRate=1000/Math.max(1,ms(1000));
      return;
    }
    if(!shade){shade=document.createElement('div');shade.id='boardActorShade';shade.setAttribute('aria-hidden','true');document.body.append(shade);}
    shade.classList.remove('active');void shade.offsetWidth;shade.classList.add('active');
    // Keep the intro in sync with the existing BOT presentation speed.
    const rate=1000/Math.max(1,ms(1000));
    for(const a of [...host.getAnimations({subtree:true}),...shade.getAnimations()])a.playbackRate=rate;
    timer=setTimeout(()=>shade.classList.remove('active'),ms(1500));
  }
  return {attach,clear,dedicated};
})();
