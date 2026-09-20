/* Shared horizontal card selector. Server option IDs remain authoritative. */
window.PhoneCardPicker = class {
  constructor(api) {
    this.api = api; this.signature = ''; this.busy = false; this.zone = 0;
    const close = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    this.host = document.createElement('section'); this.host.id = 'uxPicker'; this.host.hidden = true;
    this.host.setAttribute('aria-label', 'カード選択');
    this.host.innerHTML = `<header class="uxPickerHead"><div class="uxTitle"><img src="/assets/ic_hand.png" alt=""><h2 id="uxTitle"></h2><span id="uxCount"></span></div><div class="uxHeadRight"><span id="uxGold"></span><button id="uxClose" aria-label="やめる">${close}</button></div></header><nav id="uxZones" aria-label="カードの置き場"></nav><div class="uxRailWrap"><div id="uxRail"></div></div><footer class="uxPickerFoot"><button id="uxLeft" aria-label="左へ">‹</button><div id="uxRailProgress"><i></i></div><button id="uxRight" aria-label="右へ">›</button><button id="uxBatch"></button></footer><div id="uxPickError" role="alert"></div>`;
    document.body.append(this.host);
    this.dialog = document.createElement('dialog'); this.dialog.id = 'uxPickDialog';
    this.dialog.setAttribute('aria-labelledby', 'uxPickName');
    this.dialog.innerHTML = `<button class="uxDialogClose" aria-label="戻る">${close}</button><div id="uxPickFace"></div><div class="uxPickActions"><h2 id="uxPickName"></h2><div id="uxPickCost"></div><p id="uxPickEffect"></p><button id="uxConfirm"></button><button id="uxBack">戻る</button></div>`;
    document.body.append(this.dialog);
    this.$ = id => document.getElementById(id);
    this.rail = this.$('uxRail');
    this.$('uxClose').onclick = () => this.submit(this.config.cancelId);
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
    return p ? JSON.stringify([s?.phase,s?.turn,p.type,p.turnEpoch,p.promptId]) : '';
  }
  sync() {
    if (!this.host.hidden && this.contextKey !== this.context()) this.hide();
  }
  hide() { this.host.hidden=true; this.dialog.close(); this.signature=''; this.chosen=null; }
  show(config) {
    const context = this.context();
    const signature = JSON.stringify([context,config,this.api.player().gold,this.api.player().hand]);
    this.config = config;
    if (!this.host.hidden && signature === this.signature) return;
    const changed = this.lastType !== this.api.pending()?.type;
    this.lastType = this.api.pending()?.type;
    this.signature=signature; this.contextKey=context;
    if (changed) this.zone=0;
    this.zone=Math.min(this.zone,Math.max(0,config.sections.length-1));
    this.chosen=null; this.dialog.close(); this.api.cancelGesture();
    this.host.hidden=false;
    this.$('uxTitle').textContent=config.title;
    this.$('uxClose').hidden=!config.cancelId;
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
    if(sections.length>1) sections.forEach((s,i)=>{
      const button=document.createElement('button');button.textContent=`${s.name} ${s.entries.reduce((n,e)=>n+(e.n||1),0)}`;
      button.setAttribute('aria-pressed',i===this.zone);button.onclick=()=>{this.zone=i;this.paint();};this.$('uxZones').append(button);
    });
    this.rail.innerHTML=sec.entries.map((e,i)=>this.api.card(e.card,i,e)).join('') || '<div class="uxEmpty">0枚</div>';
    this.rail.querySelectorAll(':scope > .card').forEach((el,i)=>{
      const e=sec.entries[i], disabled=e.disabled || e.cost > this.api.player().gold;
      const decoration=this.api.decoration?.(e.card);
      if(decoration){el.classList.add('rarity-UR');el.insertAdjacentHTML('beforeend',decoration);}
      el.classList.toggle('uxUnaffordable',!!disabled);el.classList.toggle('uxSelected',!!e.selected);
      el.setAttribute('role','button');el.tabIndex=0;
      el.setAttribute('aria-label',e.name || this.api.name(e.card));el.dataset.selectable=String(!disabled && !!e.pickId);
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
    this.$('uxPickFace').innerHTML=this.api.bigCard(entry.card,entry);
    this.$('uxPickName').textContent=(entry.name || this.api.name(entry.card))+(entry.location?' ／ '+entry.location:'');
    this.$('uxPickEffect').textContent=entry.effect ?? this.api.effect(entry.card);
    this.$('uxPickCost').innerHTML=entry.cost!=null?`<img src="/assets/ic_gold.png" alt="G"> ${entry.cost}`:'';
    const confirm=this.$('uxConfirm');confirm.hidden=!entry.pickId;
    confirm.disabled=!!entry.disabled || entry.cost>this.api.player().gold;
    confirm.textContent=entry.disabled ? (entry.disabledLabel || '選択できません') : entry.cost>this.api.player().gold?'ゴールド不足':entry.selected?'選択を外す':this.config.action;
    confirm.classList.toggle('danger',!!this.config.danger);
    if(!this.dialog.open)this.dialog.showModal();
    requestAnimationFrame(()=>this.api.fit(this.$('uxPickFace')));
    this.api.preview?.(entry);
  }
  async submit(id) {
    if(!id||this.busy||this.contextKey!==this.context())return;
    const p=this.api.pending();
    if(!p?.options.some(o=>o.id===id))return;
    if(this.chosen?.pickId===id && (this.chosen.disabled || this.chosen.cost>this.api.player().gold))return;
    this.busy=true;this.$('uxConfirm').disabled=true;this.$('uxBatch').disabled=true;this.$('uxClose').disabled=true;
    this.$('uxPickError').textContent='';
    try {
      const result=await this.api.choose(id);
      if(result && !result.ok && result.status!==409)throw Error('通信できませんでした。もう一度お試しください');
      this.dialog.close();this.chosen=null;
    } catch(e) {
      this.$('uxPickError').textContent=e.message;
      // Keep retry feedback visible even while the modal is open.
      this.$('uxPickEffect').textContent=e.message;
    } finally {
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
