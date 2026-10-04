/* Shared horizontal card selector. Server option IDs remain authoritative. */
window.PhoneCardPicker = class {
  constructor(api) {
    this.api = api; this.signature = ''; this.busy = false; this.zone = 0;
    const close = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    this.host = document.createElement('section'); this.host.id = 'uxPicker'; this.host.hidden = true;
    this.host.setAttribute('aria-label', 'カード選択');
    this.host.innerHTML = `<header class="uxPickerHead"><div class="uxTitle"><img src="/assets/ic_hand.png" alt=""><h2 id="uxTitle"></h2><span id="uxCount"></span></div><div class="uxHeadRight"><span id="uxGold"></span><button id="uxBrowseHand" hidden></button><button id="uxClose" aria-label="やめる">${close}</button></div></header><nav id="uxZones" aria-label="カードの置き場"></nav><div class="uxRailWrap"><div id="uxRail"></div></div><footer class="uxPickerFoot"><button id="uxLeft" aria-label="左へ">‹</button><div id="uxRailProgress"><i></i></div><button id="uxRight" aria-label="右へ">›</button><button id="uxBatch"></button><button id="uxSkipDraw" hidden>手札に加えない</button></footer><div id="uxPickError" role="alert"></div>`;
    document.body.append(this.host);
    this.dialog = document.createElement('dialog'); this.dialog.id = 'uxPickDialog';
    this.dialog.setAttribute('aria-labelledby', 'uxPickName');
    this.dialog.innerHTML = `<button class="uxDialogClose" aria-label="戻る">${close}</button><div id="uxPickFace"></div><div class="uxPickActions"><div id="uxDetailModes" class="uxEvolutionTabs" hidden></div><h2 id="uxPickName"></h2><div id="uxPickCost"></div><p id="uxPickEffect"></p><button id="uxConfirm"></button><button id="uxBack">戻る</button></div>`;
    document.body.append(this.dialog);
    this.$ = id => document.getElementById(id);
    const purpose=document.createElement('p');purpose.id='uxPurpose';purpose.hidden=true;this.$('uxZones').before(purpose);
    this.rail = this.$('uxRail');
    const swap = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/></svg>';
    this.$('uxBrowseHand').innerHTML=swap+'<span>手札を確認する</span>';
    this.returnDraw=document.createElement('button'); this.returnDraw.id='uxReturnDraw';
    this.returnDraw.innerHTML=swap+'<span>カード選択に戻る</span>'; this.returnDraw.hidden=true;
    this.$('uxBrowseHand').onclick=()=>this.setHandView(true);
    this.returnDraw.onclick=()=>this.setHandView(false);
    this.$('uxSkipDraw').onclick=()=>this.requestCancel();
    this.cancelDialog = document.createElement('dialog'); this.cancelDialog.id = 'uxCancelDialog';
    this.cancelDialog.setAttribute('aria-labelledby','uxCancelTitle');
    this.cancelDialog.innerHTML = `<button class="uxDialogClose" aria-label="戻る">${close}</button><h2 id="uxCancelTitle">カードを獲得せずに進みますか？</h2><div class="uxCancelActions"><button id="uxCancelBack" autofocus>選び直す</button><button id="uxCancelSubmit">獲得せず進む</button></div><p id="uxCancelError" role="alert"></p>`;
    document.body.append(this.cancelDialog);
    const cancelBack = () => { if (!this.busy) this.cancelDialog.close(); };
    this.$('uxCancelBack').onclick = cancelBack;
    this.cancelDialog.querySelector('.uxDialogClose').onclick = cancelBack;
    this.cancelDialog.addEventListener('cancel', e => { if (this.busy) e.preventDefault(); });
    this.cancelDialog.onclick = e => { if (e.target === this.cancelDialog) cancelBack(); };
    this.$('uxCancelSubmit').onclick = () => this.submit(this.cancelChoice);
    this.$('uxClose').onclick = () => this.requestCancel();
    this.$('uxBatch').onclick = () => this.submit(this.config.confirmId);
    this.$('uxConfirm').onclick = () => this.submit(this.chosen?.pickId);
    const back = () => { if (!this.busy) { this.dialog.close(); this.api.preview?.(null); } };
    this.$('uxBack').onclick = back; this.dialog.querySelector('.uxDialogClose').onclick = back;
    this.dialog.addEventListener('cancel', e => { if (this.busy) e.preventDefault(); else this.api.preview?.(null); });
    this.dialog.onclick = e => { if (e.target === this.dialog) back(); };
    this.$('uxLeft').onclick = () => this.rail.scrollBy({left:-this.rail.clientWidth*.7,behavior:'smooth'});
    this.$('uxRight').onclick = () => this.rail.scrollBy({left:this.rail.clientWidth*.7,behavior:'smooth'});
    this.rail.onscroll = () => this.progress();
    let drag = null; this.suppress = 0;
    this.rail.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') drag = {x:e.clientX,left:this.rail.scrollLeft}; });
    this.rail.addEventListener('pointermove', e => {
      if (drag && Math.abs(e.clientX-drag.x)>6) { this.rail.scrollLeft=drag.left-(e.clientX-drag.x); this.suppress=performance.now()+250; e.preventDefault(); }
    });
    addEventListener('pointerup', () => drag = null);
    this.rail.addEventListener('dragstart', e => e.preventDefault());
    addEventListener('resize', () => this.layout());
  }
  context() {
    const p = this.api.pending(), s = this.api.state();
    return p ? JSON.stringify([this.api.identity?.(),s?.stateInstanceId,s?.phase,s?.turn,p.type,p.turnEpoch,p.promptId]) : '';
  }
  sync() {
    if (!this.host.hidden && this.contextKey !== this.context()) this.hide();
  }
  hide() { this.setHandView(false); this.setDrawMode(false); this.host.hidden=true; this.dialog.close(); this.cancelDialog.close(); this.signature=''; this.chosen=null; }
  setDrawMode(active) {
    this.host.classList.toggle('isRandomDraw',active);
    document.body.classList.toggle('randomDrawActive',active);
    this.$('uxBrowseHand').hidden=!active;
    this.$('uxSkipDraw').hidden=!active || !this.config?.cancelId;
    if(active) {
      if(this.returnDraw.parentNode!==document.body)document.body.append(this.returnDraw);
    } else { this.returnDraw.remove(); this.handView=false; }
    this.applyHandView();
  }
  applyHandView() {
    const active=this.host.classList.contains('isRandomDraw'), viewing=active && !!this.handView;
    this.host.classList.toggle('isHandView',viewing); this.host.inert=viewing;
    document.body.classList.toggle('randomDrawHandView',viewing);
    this.returnDraw.hidden=!viewing;
    this.$('uxBrowseHand').setAttribute('aria-expanded',String(viewing));
    this.api.handAccess?.(active && !viewing);
  }
  setHandView(viewing) {
    if(viewing && (this.busy || this.contextKey!==this.context() || !this.config?.drawOverlay))return;
    this.api.cancelGesture(); this.handView=viewing; this.applyHandView();
    if(!viewing)this.api.closeHandDetail?.();
    if(viewing)this.returnDraw.focus({preventScroll:true});
    else if(!this.host.hidden && this.config?.drawOverlay)this.$('uxBrowseHand').focus({preventScroll:true});
  }
  requestCancel() {
    if(this.busy || this.contextKey!==this.context() || !this.config.cancelId)return;
    if(!this.config.confirmCancel)return this.submit(this.config.cancelId);
    this.cancelChoice=this.config.cancelId;
    this.$('uxCancelTitle').textContent=this.config.cancelTitle || 'カードを獲得せずに進みますか？';
    this.$('uxCancelBack').textContent=this.config.cancelBackLabel || '選び直す';
    this.$('uxCancelSubmit').textContent=this.config.cancelSubmitLabel || '獲得せず進む';
    this.$('uxCancelError').textContent='';
    if(!this.cancelDialog.open)this.cancelDialog.showModal();
  }
  show(config) {
    const context = this.context();
    const signature = JSON.stringify([context,config,this.api.player().gold,this.api.player().hand]);
    this.config = config;
    this.setDrawMode(!!config.drawOverlay);
    if (!this.host.hidden && signature === this.signature) return;
    const changed = this.lastType !== this.api.pending()?.type || (['draft','pick_draw','gate_pass_evolve'].includes(this.api.pending()?.type) && this.contextKey !== context);
    this.lastType = this.api.pending()?.type;
    this.signature=signature; this.contextKey=context;
    if (changed) { this.zone=0; this.listEvolved=false; this.setHandView(false); }
    this.zone=Math.min(this.zone,Math.max(0,config.sections.length-1));
    this.chosen=null; this.dialog.close(); this.cancelDialog.close(); this.api.cancelGesture();
    this.host.hidden=false;
    this.$('uxTitle').textContent=config.title;
    this.$('uxCount').hidden=config.showCount===false;
    this.$('uxPurpose').textContent=config.purpose || '';
    this.$('uxPurpose').hidden=!config.purpose;
    this.host.classList.toggle('hasPurpose',!!config.purpose);
    this.host.classList.toggle('isEvolutionChoice',!!config.evolutionPreview);
    this.$('uxClose').hidden=!config.cancelId || !!config.drawOverlay;
    this.$('uxClose').setAttribute('aria-label',config.cancelLabel || 'やめる');
    this.$('uxGold').innerHTML=config.showGold ? `<img src="/assets/ic_gold.png" alt="G"> ${Number(this.api.player().gold).toLocaleString('ja-JP')}` : '';
    this.$('uxBatch').hidden=!config.confirmId;
    this.$('uxBatch').textContent=config.confirmLabel || '決定';
    this.$('uxPickError').textContent='';
    this.paint(!changed);
  }
  paint(preserve=false) {
    const cfg=this.config, sections=cfg.sections, sec=sections[this.zone] || {entries:[]};
    const left=preserve?this.rail.scrollLeft:0;
    this.$('uxCount').textContent=cfg.count || `${sec.entries.reduce((n,e)=>n+(e.n||1),0)}枚`;
    this.$('uxZones').replaceChildren();
    if(cfg.evolutionPreview){
      const guide=document.createElement('p');guide.className='uxEvolutionGuide';
      const coin=document.createElement('img');coin.src='/assets/ic_gold.png';coin.alt='';
      guide.append(coin,document.createTextNode(cfg.evolutionGuide));
      const modes=document.createElement('div');modes.className='uxEvolutionTabs';
      this.modeButtons(modes,!!this.listEvolved,evolved=>{this.listEvolved=evolved;this.paint(true);});
      this.$('uxZones').append(guide,modes);
    }
    if(sections.length>1) sections.forEach((s,i)=>{
      const button=document.createElement('button');button.textContent=`${s.name} ${s.entries.reduce((n,e)=>n+(e.n||1),0)}`;
      button.setAttribute('aria-pressed',i===this.zone);button.onclick=()=>{if(this.busy)return;this.zone=i;this.paint();};this.$('uxZones').append(button);
    });
    this.rail.innerHTML=sec.entries.map((e,i)=>this.api.card(this.displayCard(e.card,this.listEvolved),i,e)).join('') || '<div class="uxEmpty">0枚</div>';
    this.rail.querySelectorAll(':scope > .card').forEach((el,i)=>{
      const e=sec.entries[i], disabled=e.disabled || e.cost > this.api.player().gold;
      const decoration=e.pickId ? this.api.decoration?.(e.card) : '';
      if(decoration){el.classList.add('rarity-UR');el.insertAdjacentHTML('beforeend',decoration);}
      el.classList.toggle('uxUnaffordable',!!disabled);el.classList.toggle('uxSelected',!!e.selected);
      el.setAttribute('role','button');el.tabIndex=0;
      el.setAttribute('aria-label',e.name || this.api.name(this.displayCard(e.card,this.listEvolved)));el.dataset.selectable=String(!disabled && !!e.pickId);
      if(e.pickId)el.dataset.optionId=e.pickId;
      if(e.selected)el.setAttribute('aria-pressed','true');
      if(e.n>1){const badge=document.createElement('span');badge.className='uxMultiplicity';badge.textContent='×'+e.n;el.append(badge);}
      if(e.location || (e.disabled && e.disabledLabel)){const note=document.createElement('span');note.className='uxEntryNote';note.textContent=e.location || e.disabledLabel;el.append(note);}
      if(e.selected){const badge=document.createElement('span');badge.className='uxSelectedMark';badge.innerHTML='<svg viewBox="0 0 24 24" aria-label="選択済み"><path d="m5 12 4 4L19 6"/></svg>';el.append(badge);}
      const open=()=>{if(performance.now()<this.suppress||this.busy)return;this.open(e);};
      el.onclick=open;el.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();open();}};
    });
    this.rail.scrollLeft=left;
    requestAnimationFrame(()=>{this.api.fit(this.rail);this.layout();});
  }
  open(entry) {
    this.chosen=entry;
    this.detailEvolved=!!this.listEvolved;
    this.renderDetail();
    if(!this.dialog.open)this.dialog.showModal();
    this.api.preview?.(entry);
  }
  displayCard(card,evolved) {
    return this.config?.evolutionPreview && evolved ? (this.api.evolution?.(card)?.evolved || card) : card;
  }
  modeButtons(host,evolved,onChange) {
    host.replaceChildren();host.setAttribute('role','group');host.setAttribute('aria-label','進化前後の表示');
    for(const [value,label] of [[false,'進化前'],[true,'進化後']]){
      const button=document.createElement('button');button.textContent=label;
      button.dataset.mode=value?'evo':'base';button.setAttribute('aria-pressed',String(value===evolved));
      button.onclick=()=>{if(!this.busy && this.contextKey===this.context())onChange(value);};
      host.append(button);
    }
  }
  renderDetail() {
    const entry=this.chosen;if(!entry)return;
    const card=this.displayCard(entry.card,this.detailEvolved),modes=this.$('uxDetailModes');
    modes.hidden=!this.config.evolutionPreview || !this.api.evolution?.(entry.card);
    if(!modes.hidden)this.modeButtons(modes,!!this.detailEvolved,evolved=>{this.detailEvolved=evolved;this.renderDetail();});
    this.dialog.classList.toggle('isEvolutionChoice',!modes.hidden);
    this.$('uxPickFace').innerHTML=this.api.bigCard(card,entry);
    this.$('uxPickName').textContent=(entry.name || this.api.name(card))+(entry.location?' ／ '+entry.location:'');
    this.$('uxPickEffect').textContent=entry.effect ?? this.api.effect(card);
    this.$('uxPickCost').innerHTML=entry.cost!=null?`<img src="/assets/ic_gold.png" alt="G"> ${entry.cost}`:'';
    const confirm=this.$('uxConfirm');confirm.hidden=!entry.pickId;
    confirm.disabled=!!entry.disabled || entry.cost>this.api.player().gold;
    confirm.textContent=entry.disabled ? (entry.disabledLabel || '選択できません') : entry.cost>this.api.player().gold?'ゴールド不足':entry.selected?'選択を外す':this.config.action;
    confirm.classList.toggle('danger',!!this.config.danger);
    requestAnimationFrame(()=>this.api.fit(this.$('uxPickFace')));
  }
  async submit(id) {
    if(!id||this.handView||this.busy||this.contextKey!==this.context())return;
    const p=this.api.pending();
    if(!p?.options.some(o=>o.id===id))return;
    if(this.chosen?.pickId===id && (this.chosen.disabled || this.chosen.cost>this.api.player().gold))return;
    this.busy=true;this.$('uxConfirm').disabled=true;this.$('uxBatch').disabled=true;this.$('uxClose').disabled=true;
    this.$('uxPickError').textContent='';
    this.$('uxCancelError').textContent='';
    this.$('uxCancelSubmit').disabled=true; this.$('uxCancelBack').disabled=true;
    this.cancelDialog.querySelector('.uxDialogClose').disabled=true;
    try {
      const result=await this.api.choose(id);
      if(result && !result.ok && result.status!==409)throw Error('通信できませんでした。もう一度お試しください');
      this.dialog.close();this.cancelDialog.close();this.chosen=null;
    } catch(e) {
      this.$('uxPickError').textContent=e.message;
      this.$('uxCancelError').textContent=e.message;
      // Keep retry feedback visible even while the modal is open.
      this.$('uxPickEffect').textContent=e.message;
    } finally {
      this.$('uxCancelSubmit').disabled=false; this.$('uxCancelBack').disabled=false;
      this.cancelDialog.querySelector('.uxDialogClose').disabled=false;
      this.busy=false;this.$('uxConfirm').disabled=false;this.$('uxBatch').disabled=false;this.$('uxClose').disabled=false;
    }
  }
  layout() {
    if(this.host.hidden)return;
    const cards=this.rail.querySelectorAll(':scope > .card');
    this.rail.style.justifyContent='flex-start';
    if(cards.length){
      const w=cards[0].getBoundingClientRect().width, available=this.rail.clientWidth-48;
      const spacing=cards.length<=1?12:Math.max(-w*.10,Math.min(12,(available-cards.length*w)/(cards.length-1)));
      this.rail.style.setProperty('--ux-spacing',spacing+'px');
      // Center short draws without making the leading cards unreachable when overflowing.
      if(this.config.center && cards.length*w+(cards.length-1)*spacing<=available+1)this.rail.style.justifyContent='center';
    }
    this.progress();
  }
  progress() {
    const max=this.rail.scrollWidth-this.rail.clientWidth,bar=this.$('uxRailProgress');
    const pct=Math.max(15,this.rail.clientWidth/Math.max(1,this.rail.scrollWidth)*100);
    bar.style.visibility=max>2?'visible':'hidden';bar.firstElementChild.style.width=pct+'%';
    bar.firstElementChild.style.marginLeft=max>0?this.rail.scrollLeft/max*(100-pct)+'%':'0';
    this.$('uxLeft').disabled=this.rail.scrollLeft<2;this.$('uxRight').disabled=this.rail.scrollLeft>=max-2;
  }
};
