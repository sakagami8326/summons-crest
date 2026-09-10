(() => {
  'use strict';
  const key='sc_site_audio_v1';
  const header=document.querySelector('[data-header]');
  if(!header)return;
  let saved={};try{saved=JSON.parse(sessionStorage.getItem(key)||'{}')||{};}catch(_){}
  let enabled=saved.choice==='on', audio=null, generation=0, dialog=null;
  let position=Number.isFinite(saved.position)&&saved.position>=0?saved.position:0;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='site-bgm';
  toggle.setAttribute('aria-label','BGM OFF');toggle.textContent='BGM OFF';
  header.insertBefore(toggle,header.querySelector('.site-header__play'));header.classList.add('has-site-audio');
  function save(){try{sessionStorage.setItem(key,JSON.stringify({choice:enabled?'on':'off',position:audio?audio.currentTime:position}));}catch(_){} }
  function label(text){toggle.textContent=text;toggle.setAttribute('aria-label',text);toggle.setAttribute('aria-pressed',String(!!audio&&!audio.paused));}
  function stop(){generation++;if(audio){audio.pause();position=audio.currentTime;}save();label(enabled?'BGMを再開':'BGM OFF');}
  async function play(){
    enabled=true;save();const attempt=++generation;
    if(document.hidden){label('BGMを再開');return;}
    if(!audio){
      audio=new Audio();audio.preload='none';audio.loop=true;audio.volume=.35;
      audio.addEventListener('loadedmetadata',()=>{if(position>0&&Number.isFinite(audio.duration))audio.currentTime=position%audio.duration;});
      audio.addEventListener('timeupdate',save);
      audio.src='/assets/bgm_select.mp3';
    }
    label('BGMを再開');
    try{await audio.play();if(attempt!==generation||!enabled||document.hidden){if(!enabled||document.hidden)audio.pause();return;}label('BGM ON');}
    catch(_){if(attempt===generation)label('BGMを再開');}
  }
  toggle.addEventListener('click',()=>{if(enabled&&audio&&!audio.paused){enabled=false;stop();}else play();});
  document.addEventListener('visibilitychange',()=>{if(dialog)return;if(document.hidden)stop();else if(enabled)play();});
  window.addEventListener('pagehide',()=>{if(!dialog)stop();});
  window.addEventListener('pageshow',event=>{if(event.persisted&&enabled&&!dialog)play();});
  function enter(on){
    enabled=on;save();dialog.close();dialog.remove();dialog=null;
    const main=document.querySelector('main');if(main){main.setAttribute('tabindex','-1');main.focus({preventScroll:true});}
    if(on)play();else label('BGM OFF');
  }
  if(saved.choice==='on'){play();return;}
  if(saved.choice==='off')return;
  dialog=document.createElement('dialog');dialog.className='site-audio-gate';dialog.setAttribute('aria-labelledby','site-audio-intro');
  const icon='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 12h6l7-6v20l-7-6H3zM21 10q8 6 0 12"/></svg>';
  dialog.innerHTML=`<div class="site-audio-gate__content"><p id="site-audio-intro">SUMMONS CODE公式サイトでは<br class="audio-mobile-break">BGMが流れます。</p><div class="site-audio-choices"><button type="button" data-audio="on">${icon}<span>ON</span></button><button type="button" data-audio="off">${icon}<span>OFF</span></button></div></div>`;
  dialog.querySelector('[data-audio="off"] svg').insertAdjacentHTML('beforeend','<path d="M3 3l26 26"/>');
  dialog.addEventListener('cancel',event=>{event.preventDefault();enter(false);});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const first=dialog.querySelector('[data-audio="on"]'),last=dialog.querySelector('[data-audio="off"]');
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  dialog.querySelectorAll('[data-audio]').forEach(b=>b.addEventListener('click',()=>enter(b.dataset.audio==='on')));
  document.body.append(dialog);dialog.showModal();
})();
