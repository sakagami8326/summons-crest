window.PhoneUpgrade=(()=>{
 const U=UpgradeUI;
 function model(s,pid){
  const p=s?.pending?.[pid],me=s?.players?.find(q=>q.id===pid),d=p?.upgrade;
  if(s?.phase!=='playing'||me?.bankrupt||p?.type!=='upgrade_lv'||!d||d.actor!==pid)return null;
  return {p,me,d,context:JSON.stringify([s.code,s.stateInstanceId,pid,s.turnEpoch,p.turnEpoch,p.promptId,p.options.map(o=>o.id)])};
 }
 return class {
  static model=model;
  constructor(api){this.api=api;this.context='';this.busy=false;this.selected=null;this.epoch=0;this.error='';
   this.host=document.createElement('section');this.host.id='phoneUpgrade';this.host.hidden=true;
   this.host.setAttribute('role','dialog');this.host.setAttribute('aria-modal','true');this.host.setAttribute('aria-label','強化レベルを選択');document.body.append(this.host);
   this.scale=()=>this.host.style.setProperty('--scale',Math.min(document.documentElement.clientWidth/844,document.documentElement.clientHeight/390));
   window.addEventListener('resize',this.scale);
  }
  current(){return model(this.api.state(),this.api.playerId());}
  get active(){return !this.host.hidden;}
  sync(){const m=this.current();if(this.active&&(!m||m.context!==this.context||!this.api.ready(m.p)))this.hide();}
  hide(){if(!this.active)return;this.epoch++;this.host.hidden=true;this.context='';this.selected=null;this.busy=false;this.error='';this.api.handAccess(false);document.body.classList.remove('upgradeActive');}
  option(m,level){return m?.p.options.find(o=>o.id===`ul:${m.d.tile}:${level}`);}
  show(){
   const m=this.current();if(!m||!this.api.ready(m.p)){this.hide();return false;}
   const {d,me,p}=m;
   if(m.context!==this.context){
    this.hide();this.context=m.context;this.host.style.setProperty('--element',U.colors[d.element]);
    const stats=t=>`<div class="choiceStats"><span><small>通行料</small>${U.gold(t.toll)}</span><span><small>HP＋DF</small><b>${t.total}</b></span></div>`;
    this.host.innerHTML=`<header class="phoneHeading"><button class="back" aria-label="領地の選択へ戻る">${U.arrow('backArrow')}</button><h1>強化レベルを選択</h1><div class="wallet"><small>所持金</small>${U.gold(me.gold)}</div></header><div class="phoneBody"><section class="currentLand"><div class="currentTitle">${U.land(d.element)}<span>Lv.<b>${d.before.level}</b></span><small>現在</small></div><div class="heroArt">${U.creature(d,d.before)}</div><h2>${U.esc(d.before.evolved?d.evoName:d.name)}</h2>${stats(d.before)}${d.discount?`<div class="discount">${U.land(d.element)}${d.discount===.1?'全属性の領地：費用10%OFF':'同属性の領地：費用20%OFF'}</div>`:''}</section><section class="levelList" role="group" aria-label="強化後のレベル">${d.levels.map(t=>`<button class="levelChoice" data-level="${t.level}" aria-pressed="false"><div class="choiceHeading">${U.land(d.element,t.level)}<span>Lv.<b>${t.level}</b></span>${t.level===4?'<small class="maxTag">MAX</small>':''}</div>${t.evolves?'<span class="evolveTag">進化</span>':''}<div class="choiceArt">${U.creature(d,t)}</div>${stats(t)}<div class="choiceCost"><label>強化費用</label>${U.gold(t.cost)}${!this.option(m,t.level)?'<small>所持金不足</small>':''}</div><span class="choiceCheck" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span></button>`).join('')}</section></div><footer class="phoneFooter"><button class="skip">今回は強化しない</button><div class="summary" aria-live="polite"></div><button class="upgradeConfirm" disabled><span>レベルを選択</span>${U.arrow()}</button></footer>`;
    this.host.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{if(this.busy||!this.option(this.current(),+b.dataset.level))return;this.selected=+b.dataset.level;this.error='';this.show();});
    this.host.querySelector('.back').onclick=()=>this.submit('ul:back');
    this.host.querySelector('.skip').onclick=()=>this.submit('ul:cancel');
    this.host.querySelector('.upgradeConfirm').onclick=()=>this.submit(this.option(this.current(),this.selected)?.id);
   }
   this.host.hidden=false;document.body.classList.add('upgradeActive');this.api.cancelGesture();this.api.handAccess(true);this.scale();
   const chosen=d.levels.find(t=>t.level===this.selected&&this.option(m,t.level));
   this.host.querySelectorAll('[data-level]').forEach(b=>{b.disabled=this.busy||!this.option(m,+b.dataset.level);b.setAttribute('aria-pressed',String(+b.dataset.level===this.selected));});
   const confirm=this.host.querySelector('.upgradeConfirm');confirm.disabled=this.busy||!chosen;confirm.querySelector('span').textContent=this.busy?'送信中…':chosen?'Lv.'+chosen.level+'に強化':'レベルを選択';
   this.host.querySelector('.summary').innerHTML=this.error?U.esc(this.error):chosen?`Lv.${d.before.level}<span>→</span><b>Lv.${chosen.level}</b>${U.gold(chosen.cost)}`:'強化後のレベルを選択';
   this.host.querySelector('.back').disabled=this.busy||!p.options.some(o=>o.id==='ul:back');this.host.querySelector('.skip').disabled=this.busy||!p.options.some(o=>o.id==='ul:cancel');return true;
  }
  async submit(id){
   const m=this.current();if(!m||!id||!this.active||this.busy||m.context!==this.context||!this.api.ready(m.p)||!m.p.options.some(o=>o.id===id))return;
   const epoch=++this.epoch,context=this.context;this.busy=true;this.error='';this.show();
   try{const r=await this.api.choose(id);if(!r?.ok)throw Error('action failed');}
   catch(e){if(epoch===this.epoch&&this.active&&this.current()?.context===context){this.busy=false;this.error='送信できませんでした。再度お試しください。';this.show();}}
  }
 };
})();
