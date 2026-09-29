(()=>{
 const $=id=>document.getElementById(id);
 function render(){const settings=BoardAudioSettings.value;
  for(const c of ['bgm','se']){const stem=c==='bgm'?'soundBgm':'soundSe';$(stem).value=settings[c];$(stem).style.setProperty('--fill',settings[c]+'%');$(stem+'Value').innerHTML=settings[c]+'<span>%</span>';$(stem+'Play').disabled=!settings.enabled||settings[c]===0;}
  $('soundMaster').setAttribute('aria-checked',String(settings.enabled));$('soundMaster').querySelector('b').textContent=settings.enabled?'ON':'OFF';
  $('soundEnable').hidden=!settings.enabled||!boardAudioBlocked;$('soundHint').hidden=settings.enabled&&boardAudioBlocked;
 }
 function enableAudio(){initAudio();setAudioMuted(false);if(!bgmCur)restoreBoardBgm();if(bgmCur)bgmCur.play().then(audioStarted).catch(reportAudioBlocked);render();}
 $('soundMaster').onclick=()=>{if(bgmMuted)enableAudio();else setAudioMuted(true);render();};
 for(const c of ['bgm','se']){const stem=c==='bgm'?'soundBgm':'soundSe';$(stem).oninput=()=>{BoardAudioSettings.set({[c]:Number($(stem).value)});applyBoardAudioVolume();render();};}
 $('soundBgmPlay').onclick=enableAudio;
 $('soundSePlay').onclick=()=>{initAudio();playSe(seSummon);};
 const retry=document.createElement('button');retry.id='soundEnable';retry.textContent='音を有効にする';retry.hidden=true;retry.onclick=enableAudio;$('soundHint').after(retry);
 document.addEventListener('board-audio-change',render);
 const oldRoomOpen=$('optBtn').onclick;
 const roomMenu=$('optMenu'),roomLabel=roomMenu.firstElementChild,summary=document.createElement('div'),details=document.createElement('div');
 summary.className='settingsRoomSummary';details.className='settingsRoomDetails';roomLabel.textContent='ルームコード';
 details.append(roomLabel,$('optCode'),$('optPhoneUrl'));summary.append(details,$('optQr'));roomMenu.prepend(summary);$('settingsRoom').append(roomMenu);
 const roomActions=document.createElement('div');roomActions.className='settingsRoomActions';roomActions.append($('optSaveQuit'),$('optBotSpeed'));summary.after(roomActions);
 function tab(name,focus=false){for(const n of ['Room','Audio']){const active=n===name;$('settings'+n).hidden=!active;$('settings'+n+'Tab').setAttribute('aria-selected',String(active));$('settings'+n+'Tab').tabIndex=active?0:-1;}if(focus)$('settings'+name+'Tab').focus();}
 for(const name of ['Room','Audio']){$('settings'+name+'Tab').onclick=()=>tab(name);$('settings'+name+'Tab').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();tab(e.key==='Home'?'Room':e.key==='End'?'Audio':name==='Room'?'Audio':'Room',true);}};}
 $('optBtn').setAttribute('aria-haspopup','dialog');$('optBtn').setAttribute('aria-controls','soundPanel');$('optBtn').setAttribute('aria-expanded','false');
 function show(open){const panel=$('soundPanel');if(open&&!panel.open){roomMenu.style.display='none';oldRoomOpen();tab('Room');panel.showModal();}else if(!open&&panel.open){panel.close();roomMenu.style.display='none';}$('optBtn').setAttribute('aria-expanded',String(open));if(open)$('soundClose').focus();else $('optBtn').focus();}
 $('soundClose').onclick=()=>show(false);$('optBtn').onclick=()=>show(true);$('optClose').onclick=()=>show(false);
 $('soundPanel').addEventListener('cancel',e=>{e.preventDefault();show(false);});
 $('soundPanel').addEventListener('click',e=>{if(e.target!==$('soundPanel'))return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)show(false);});
 $('soundReset').onclick=()=>{BoardAudioSettings.set({bgm:70,se:70});applyBoardAudioVolume();render();};
 render();
})();
