/* Approved 01 player target cards. Candidate IDs and public hand counts come from the server. */
window.PhonePlayerTarget=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors={fire:'#ff8b66',water:'#72c4ff',earth:'#e4c367',wind:'#79e3d4',neutral:'#d8c8ec'};
 const labels={fire:'火',water:'水',earth:'土',wind:'風',neutral:'無'};
 const hand=n=>`<div class="ptHand"><span><img src="/assets/ic_hand.png" alt="">手札</span><strong>${n}<small>枚</small></strong></div>`;
 function model(s,pid){
  const p=s?.pending?.[pid],me=s?.players?.find(q=>q.id===pid);
  if(s?.phase!=='playing'||!me||me.bankrupt||!['censor_target','toxy_target'].includes(p?.type))return null;
  const players=s.players.filter(q=>q.id!==pid&&!q.bankrupt).map(q=>({...q,count:Math.max(0,Number(q.handCount)||0),option:p.options.find(o=>o.player===q.id)}));
  return {s,p,me,players,censor:p.type==='censor_target',cancel:p.options.find(o=>o.id==='censor:cancel'),
   context:JSON.stringify([s.code,s.stateInstanceId,pid,s.turnEpoch,p.turnEpoch,p.promptId,p.type,p.options.map(o=>[o.id,o.player])])};
 }
 return class {
  static model=model;
  constructor(api){this.api=api;this.epoch=0;this.context='';this.key='';this.selected=null;this.busy=false;this.error='';this.host=document.createElement('section');this.host.id='phonePlayerTarget';this.host.hidden=true;this.host.setAttribute('role','dialog');this.host.setAttribute('aria-modal','true');document.body.append(this.host);}
  current(){return model(this.api.state(),this.api.playerId());}
  get active(){return !this.host.hidden;}
  sync(){const m=this.current();if(this.active&&(!m||m.context!==this.context||!this.api.ready(m.p)))this.hide();}
  hide(){if(!this.active)return;this.epoch++;this.host.hidden=true;this.context='';this.key='';this.selected=null;this.busy=false;this.error='';this.api.handAccess(false);document.body.classList.remove('playerTargetActive');}
  show(){
   const m=this.current();if(!m||!this.api.ready(m.p)){this.hide();return false;}
   if(this.context!==m.context){this.hide();this.context=m.context;this.selected=null;this.busy=false;this.error='';this.key='';}
   const chosen=m.players.find(q=>q.id===this.selected&&q.option&&q.count);if(!chosen)this.selected=null;
   const {s,censor,players}=m,title=censor?'禁書検閲':'瘴気連鎖';
   const cost=m.me.effectiveSpellCosts?.sp_censor??s.catalog.SPELLS.sp_censor.cost;
   const key=JSON.stringify([m.context,players.map(q=>[q.id,q.name,q.charId,q.count,!!q.option]),cost,m.p.effect?.creature]);
   this.host.hidden=false;document.body.classList.add('playerTargetActive');this.api.cancelGesture();this.api.handAccess(true);
   if(key!==this.key){
    this.host.setAttribute('aria-label',title+'の対象選択');
    this.host.innerHTML=`<header class="ptHeader"><div class="ptEffect"><img class="ptSource ${censor?'censor':'toxy'}" src="${censor?'/assets/cards/spell-censor-art-v2.webp':'/assets/'+(m.p.effect?.creature==='toxy_f'?'e':'c')+'_toxy.png'}" alt="${title}"><div><h1>${title}</h1><p>${censor?'手札2枚を見て、1枚捨てさせる':'手札をランダムに1枚捨てさせる'}</p></div></div><div class="ptExtra">${censor?`<span><img src="/assets/ic_gold.png" alt="">${cost}G</span><span><img src="/assets/ic_hand.png" alt="">自分は1枚ドロー</span>`:''}</div>${m.cancel?'<button class="ptClose" aria-label="使用をやめる"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>':''}</header><div class="ptGrid" role="group" aria-label="対象のプレイヤー">${players.map((q,i)=>{
     const char=s.catalog.CHARS[q.charId],elem=char?.elem||'neutral';
     return `<button class="ptPlayer" data-player="${esc(q.id)}" aria-pressed="false" style="--element:${colors[elem]};--bg:url('/assets/cards/bg-${elem}.webp');--order:${i}"><div class="ptPlayerName"><span class="ptElement" role="img" aria-label="${labels[elem]}属性" style="--icon:url('/assets/element-${elem==='water'?'water-v2':elem}.svg')"></span><strong>${esc(q.name)}</strong></div><div class="ptPortrait"><img src="/assets/pawn_${esc(q.charId)}.${q.charId==='adel'?'webp':'png'}" alt="${esc(char?.name||'召喚士')}"></div>${hand(q.count)}<span class="ptSelected" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span>${!q.count?'<span class="ptUnavailable">手札なし</span>':''}</button>`;
    }).join('')}</div><footer class="ptFooter"><p id="ptSelection" aria-live="polite"></p><button id="ptConfirm" disabled><span></span><img src="/assets/ui/arrow-ornate.svg" alt=""></button></footer>`;
    this.host.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>{if(this.busy)return;const q=this.current()?.players.find(q=>q.id===b.dataset.player&&q.option&&q.count);if(!q)return;this.selected=q.id;this.error='';this.show();});
    this.host.querySelector('#ptConfirm').onclick=()=>this.submit(this.current()?.players.find(q=>q.id===this.selected)?.option?.id);
    this.host.querySelector('.ptClose')?.addEventListener('click',()=>this.submit(this.current()?.cancel?.id));this.key=key;
   }
   this.host.querySelectorAll('[data-player]').forEach(b=>{const q=players.find(q=>q.id===b.dataset.player);b.disabled=this.busy||!q?.option||!q.count;b.setAttribute('aria-pressed',String(q?.id===this.selected));});
   const confirm=this.host.querySelector('#ptConfirm');confirm.disabled=this.busy||!chosen;
   confirm.querySelector('span').textContent=this.busy?'送信中…':chosen?(censor?'この相手の手札を見る':'この相手の手札を捨てさせる'):'相手を選択';
   const selection=this.host.querySelector('#ptSelection');selection.classList.toggle('ptError',!!this.error);selection.innerHTML=this.error?esc(this.error):chosen?esc(chosen.name)+hand(chosen.count):'相手を選択';
   if(censor)this.host.querySelector('.ptEffect p').textContent=chosen?.count===1?'手札1枚を見て、捨てさせる':'手札2枚を見て、1枚捨てさせる';
   const close=this.host.querySelector('.ptClose');if(close)close.disabled=this.busy;return true;
  }
  async submit(id){
   const m=this.current();if(!id||!this.active||this.busy||!m||m.context!==this.context||!this.api.ready(m.p)||!m.p.options.some(o=>o.id===id&&(o===m.cancel||m.players.some(q=>q.option?.id===id&&q.count))))return;
   const epoch=++this.epoch,context=this.context;this.busy=true;this.error='';this.show();
   try{const response=await this.api.choose(id);if(!response?.ok)throw Error('action failed');}
   catch(e){if(epoch===this.epoch&&this.active&&this.current()?.context===context){this.busy=false;this.error='送信できませんでした。もう一度お試しください。';this.show();}}
   // Remain locked after success until the authoritative snapshot replaces this prompt.
  }
 };
})();
