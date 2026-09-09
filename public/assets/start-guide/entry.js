(() => {
  'use strict';
  const context=document.currentScript.dataset.context;
  const D=window.SummonsDevice, device=D.current();
  let role=null;
  try { role=sessionStorage.getItem(D.roleKey); } catch (_) {}
  if(context==='board') {
    const boardRequested=new URLSearchParams(location.search).get('screen')==='board';
    if(device==='phone'||(device==='tablet'&&!boardRequested&&role!=='board')) {
      location.replace('/start?entry=1');
      return;
    }
    if(device==='tablet'&&boardRequested) { try {sessionStorage.setItem(D.roleKey,'board');}catch(_){} }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    let dialog=null, opener=null;
    function close() { if(!dialog)return;dialog.close();dialog.remove();dialog=null;opener?.focus(); }
    function open(event) {
      if(dialog)return;
      opener=event?.currentTarget||document.getElementById('titleCreate');
      dialog=document.createElement('dialog');dialog.className='sc-guide-dialog';dialog.setAttribute('aria-label','ゲームの始め方');
      const frame=document.createElement('iframe');frame.title='ゲームの始め方・画面の準備';frame.src='/start?embedded=1&context='+context;
      const closeButton=document.createElement('button');closeButton.className='sc-guide-close';closeButton.textContent='閉じる';closeButton.setAttribute('aria-label','始め方を閉じる');
      closeButton.onclick=()=>{try{localStorage.setItem(D.seenKey,'done');}catch(_){}close();};
      dialog.append(closeButton,frame);document.body.append(dialog);
      dialog.addEventListener('cancel',()=>{try{localStorage.setItem(D.seenKey,'done');}catch(_){}close();});
      dialog.showModal();frame.addEventListener('load',()=>frame.contentWindow.focus());
    }
    document.querySelectorAll('[data-start-guide]').forEach(button=>button.addEventListener('click',open));
    window.addEventListener('message',event=>{
      if(!dialog||event.origin!==location.origin||event.source!==dialog.querySelector('iframe').contentWindow)return;
      if(event.data?.type==='summons-guide-close')close();
      if(event.data?.type==='summons-guide-controller') {close();location.assign('/phone');}
      if(event.data?.type==='summons-guide-board' && device==='tablet') {close();location.assign('/play?screen=board');}
    });
    if(context==='board') {
      let seen=false;try{seen=localStorage.getItem(D.seenKey)==='done';}catch(_){}
      const url=new URL(location.href);
      if(url.searchParams.get('guide')==='done') {seen=true;url.searchParams.delete('guide');history.replaceState(null,'',url.pathname+url.search+url.hash);}
      if(!seen)open();
    } else {
      // QR entry and reconnect keep their existing form and priority.
      const hint=document.getElementById('joinSetupHint');
      if(hint&&new URLSearchParams(location.search).has('room'))hint.hidden=true;
    }
  });
})();
