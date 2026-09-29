(() => {
  'use strict';
  const choiceKey='sc_site_audio_v2',positionKey='sc_site_audio_position_v2',legacyKey='sc_site_audio_v1';
  const header=document.querySelector('[data-header]');
  if(!header)return;
  const valid=value=>value==='on'||value==='off';
  let fallbackChoice=null,sharedUnavailable=false;
  function readChoice(){if(sharedUnavailable)return fallbackChoice;try{const value=JSON.parse(localStorage.getItem(choiceKey)||'null')?.choice;return valid(value)?value:null;}catch(_){return fallbackChoice;}}
  function writeChoice(choice){fallbackChoice=choice;try{localStorage.setItem(choiceKey,JSON.stringify({choice}));sharedUnavailable=false;}catch(_){sharedUnavailable=true;} }
  let legacy={};try{legacy=JSON.parse(sessionStorage.getItem(legacyKey)||'{}')||{};}catch(_){}
  // Migrate once only when no shared preference exists. A newer shared OFF wins.
  let choice=readChoice();if(!choice&&valid(legacy.choice)){writeChoice(legacy.choice);choice=legacy.choice;}
  let position=0;try{const saved=JSON.parse(sessionStorage.getItem(positionKey)||'null');position=Number.isFinite(saved)?saved:legacy.position;}catch(_){}
  position=Number.isFinite(position)&&position>=0?position:0;
  let enabled=choice==='on',audio=null,generation=0,dialog=null;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='site-bgm';
  toggle.setAttribute('aria-label','BGM OFF');toggle.textContent='BGM OFF';
  header.insertBefore(toggle,header.querySelector('.site-header__play'));header.classList.add('has-site-audio');
  // Progress and page lifecycle must never write an ON/OFF preference.
  function savePosition(){if(audio)position=audio.currentTime;try{sessionStorage.setItem(positionKey,JSON.stringify(position));}catch(_){} }
  function label(text){toggle.textContent=text;toggle.setAttribute('aria-label',text);toggle.setAttribute('aria-pressed',String(!!audio&&!audio.paused));}
  function stop(){generation++;if(audio)audio.pause();savePosition();label(enabled?'BGMを再開':'BGM OFF');}
  function dismissGate(){if(!dialog)return;dialog.close();dialog.remove();dialog=null;const main=document.querySelector('main');if(main){main.setAttribute('tabindex','-1');main.focus({preventScroll:true});}}
  async function play(){
    enabled=readChoice()==='on';
    if(!enabled){stop();return;}
    const attempt=++generation;
    if(document.hidden){stop();return;}
    if(!audio){
      audio=new Audio();audio.preload='none';audio.loop=true;audio.volume=.35;
      audio.addEventListener('loadedmetadata',()=>{if(position>0&&Number.isFinite(audio.duration))audio.currentTime=position%audio.duration;});
      audio.addEventListener('timeupdate',savePosition);
      audio.src='/assets/bgm_select.mp3';
    }
    label('BGMを再開');
    try{await audio.play();enabled=readChoice()==='on';if(attempt!==generation||!enabled||document.hidden){if(!enabled||document.hidden)stop();return;}label('BGM ON');}
    catch(_){if(attempt===generation){enabled=readChoice()==='on';if(!enabled)stop();else label('BGMを再開');}}
  }
  function reconcile(resume){const latest=readChoice();enabled=latest==='on';if(latest)dismissGate();if(!enabled||document.hidden)stop();else if(resume)play();else label(audio&&!audio.paused?'BGM ON':'BGMを再開');}
  toggle.addEventListener('click',()=>{if(enabled&&audio&&!audio.paused){writeChoice('off');enabled=false;stop();}else{writeChoice('on');enabled=true;play();}});
  window.addEventListener('storage',event=>{if(event.key===choiceKey||event.key===null)reconcile(false);});
  document.addEventListener('visibilitychange',()=>reconcile(!document.hidden));
  window.addEventListener('pagehide',()=>{enabled=readChoice()==='on';stop();});
  window.addEventListener('pageshow',event=>{if(event.persisted)reconcile(true);});
  window.addEventListener('focus',()=>reconcile(true));
  function enter(on){writeChoice(on?'on':'off');enabled=on;dismissGate();if(on)play();else stop();}
  if(choice==='on'){play();return;}
  if(choice==='off')return;
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
