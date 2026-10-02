/* Enemy land choice: approved 02 layout. All actions and defense values come from the server. */
window.PhoneEnemyChoice=(()=>{
 const colors={fire:'#FF7A45',water:'#56A8E8',earth:'#D9B64F',wind:'#5BE0D0'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const swap='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/></svg>';
 const arrow='<img class="ecArrow" src="/assets/ui/arrow-ornate.svg" alt="">';
 const element=e=>{const id=e||'neutral',labels={fire:'火',water:'水',earth:'土',wind:'風',neutral:'無'};return `<span class="ecElement" role="img" aria-label="${labels[id]}属性" style="--element-color:${colors[id]||'#c9b8e4'};--element-icon:url('/assets/element-${id==='water'?'water-v2':id}.svg')"></span>`;};

 function model(s,pid){
  const p=s?.pending?.[pid],ui=s?.enemyLand,player=s?.players?.find(x=>x.id===pid);
  if(s?.phase!=='playing'||player?.bankrupt||!player||ui?.player!==pid||p?.type!=='tile'||!p.options.some(x=>x.id==='toll'))return null;
  const o=s.owners?.[ui.tile],owner=s.players.find(x=>x.id===o?.player),c=s.catalog.CREATURES[o?.creature];
  if(!o||!owner||!c||owner.id===pid||!ui.stats||!Number.isFinite(s.tolls?.[ui.tile]))return null;
  const base=o.creature.replace(/_f$/,''),baseCard=s.catalog.CREATURES[base]||c;
  const evolved=o.creature.endsWith('_f')||!!(baseCard.evo&&o.level>=s.evoLevel);
  const name=evolved?baseCard.evo||c.name:c.name;
  return {s,p,ui,o,owner,c,name,stats:ui.stats,gold:player.gold,toll:s.tolls[ui.tile],remaining:player.gold-s.tolls[ui.tile],
   allowed:p.options.some(x=>x.id==='invade'),reason:ui.barrier?'結界で侵略できません':player.hand?.some(id=>s.catalog.CREATURES[id])?'現在は侵略できません':'手札にクリーチャーがありません',
   art:'/assets/'+(evolved?'e_':'c_')+base+'.png',
   context:JSON.stringify([s.code,s.stateInstanceId,pid,s.turnEpoch,p.promptId,ui.tile,p.options.map(x=>x.id)])};
 }
 return class {
  static model=model;
  constructor(api){
   this.api=api;this.key='';this.context='';this.viewing=false;this.busy=false;this.epoch=0;
   this.host=document.createElement('section');this.host.id='phoneEnemyChoice';this.host.className='layout-b';this.host.hidden=true;this.host.setAttribute('aria-label','敵領地での行動');document.body.append(this.host);
   this.toggle=document.createElement('button');this.toggle.id='ecHandToggle';this.toggle.hidden=true;this.toggle.setAttribute('aria-controls','phoneEnemyChoice');document.body.append(this.toggle);
   this.toggle.onclick=()=>this.peek(!this.viewing);
  }
  current(){return model(this.api.state(),this.api.playerId());}
  get active(){return !this.host.hidden;}
  get handView(){return this.active&&this.viewing;}
  sync(){const m=this.current();if(this.active&&(!m||m.context!==this.context||!this.api.ready(m.p)))this.hide();}
  hide(){
   if(!this.active)return;
   this.epoch++;this.api.cancelGesture();this.api.closeHandDetail();this.api.handAccess(false);
   this.host.hidden=true;this.host.inert=false;this.toggle.hidden=true;this.toggle.disabled=false;
   this.key='';this.context='';this.viewing=false;this.busy=false;
   document.body.classList.remove('enemyChoiceActive','enemyChoiceHandView');
  }
  peek(value){
   if(!this.active||this.busy)return;
   this.api.cancelGesture();this.viewing=value;if(!value)this.api.closeHandDetail();
   this.applyView();this.api.renderHand();this.toggle.focus({preventScroll:true});
  }
  applyView(){
   this.host.classList.toggle('hand-view',this.viewing);this.host.inert=this.viewing;this.api.handAccess(!this.viewing);
   document.body.classList.add('enemyChoiceActive');document.body.classList.toggle('enemyChoiceHandView',this.viewing);
   this.toggle.innerHTML=swap+'<span>'+(this.viewing?'行動選択に戻る':'手札を確認する')+'</span>';
   this.toggle.setAttribute('aria-expanded',String(this.viewing));this.toggle.disabled=this.busy;
  }
  show(){
   const m=this.current();if(!m||!this.api.ready(m.p)){this.hide();return false;}
   if(this.context!==m.context){this.hide();this.context=m.context;this.viewing=false;this.busy=false;}
   const {s,p,ui,o,owner,c,name,stats,gold,toll,remaining,allowed,reason,art}=m;
   const key=JSON.stringify([m.context,o,c,stats,gold,toll,owner.name,owner.charId,allowed,reason,s.tiles[ui.tile].e]);
   this.host.hidden=false;this.toggle.hidden=false;
   if(key!==this.key){
    this.host.innerHTML=`<header class="ecHead"><h1>敵の領地</h1><div class="ecOwner"><img class="ecOwnerPawn" src="/assets/pawn_${esc(owner.charId)}.${owner.charId==='adel'?'webp':'png'}" alt="${esc(s.catalog.CHARS[owner.charId]?.name||'')}"><div><small>領地の持ち主</small><strong>${esc(owner.name)}</strong></div></div><span class="ecLandLevel">${element(s.tiles[ui.tile].e)}<b>Lv${o.level}</b></span></header><div class="ecBody"><section class="ecEnemy"><div class="ecArt"><img src="${art}" alt="${esc(name)}"></div><div class="ecCreature"><h2>${element(c.elem)}${esc(name)}</h2><div class="ecStats"><span><small>HP＋DF</small><b>${stats.total}</b></span><span class="ecBreakdown">HP ${stats.hp}<i>＋</i>DF ${stats.df}</span><span class="ecCounter"><img src="/assets/cards/stat-at-icon.svg" alt="AT">${stats.at}</span></div></div></section><section class="ecDecisions" aria-label="行動を選択"><button class="ecChoice ecInvade ${allowed?'':'unavailable'}" data-action="invade" ${allowed?'':'disabled'}><div class="ecChoiceIcon"><img src="/assets/cards/stat-at-icon.svg" alt=""></div><div class="ecChoiceText"><h2>${allowed?'侵略する':'侵略不可'}</h2><p>${allowed?'クリーチャーを選ぶ':reason}</p></div><span class="ecTail">${allowed?arrow:''}</span><small class="ecCost">${allowed?'召喚コストが必要':''}</small></button><button class="ecChoice ecPay" data-action="toll"><div class="ecChoiceIcon"><img src="/assets/ic_gold.png" alt=""></div><div class="ecChoiceText"><h2>通行料を払う</h2><p>戦わずに進む</p></div><strong class="ecPayment">−${toll}<small>G</small></strong></button><div class="ecWallet ${remaining<0?'short':''}"><span>所持金 <b>${gold} G</b></span><span>${remaining<0?'不足 <b>'+(-remaining)+' G</b>':'支払い後 <b>'+remaining+' G</b>'}</span></div></section></div>`+ '<p class="ecError" role="alert"></p>';
    this.host.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>this.submit(b.dataset.action));
    this.key=key;
   }
   this.host.querySelectorAll('[data-action]').forEach(b=>b.disabled=this.busy||!p.options.some(x=>x.id===b.dataset.action));
   this.applyView();return true;
  }
  async submit(id){
   const m=this.current();if(!this.active||this.viewing||this.busy||!m||m.context!==this.context||!this.api.ready(m.p)||!m.p.options.some(x=>x.id===id))return;
   const epoch=++this.epoch,context=this.context;this.busy=true;this.show();this.host.querySelector('.ecError').textContent='';
   try{const response=await this.api.choose(id);if(!response?.ok)throw Error('action failed');}
   catch(e){if(epoch===this.epoch&&this.current()?.context===context&&this.active){this.busy=false;this.show();this.host.querySelector('.ecError').textContent='選択を送信できませんでした。もう一度お試しください。';}}
   // A successful response may precede its state notification: stay locked until that state arrives.
  }
 };
})();
