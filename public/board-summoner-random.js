/* Server timestamps keep every random/BOT slot in the same selection sequence. */
window.BoardSummonerRandom = (() => {
  let snapshot=null, clockOffset=0, pendingAck='', retry=null;
  const images=new Map(), reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function warm(s) {
    const ids=Object.entries(s.catalog.CHARS).filter(([,c])=>c.selectable!==false&&!c.upcoming).map(([id])=>id);
    return Promise.all(ids.flatMap(id=>[`summoner-still-${id}.webp`,`board-pawns-v2/${id}.webp`]).map(file=>{
      if(!images.has(file))images.set(file,new Promise(resolve=>{
        const image=new Image();image.onload=()=>{(image.decode?image.decode():Promise.resolve()).catch(()=>{}).finally(resolve);};image.onerror=resolve;image.src='/assets/'+file;
      }));
      return images.get(file);
    }));
  }
  async function acknowledge(key) {
    if(pendingAck!==key||snapshot?.phase!=='select'||snapshot.selectionDraw?.phase!=='preparing'||!boardToken)return;
    if(duelPlaying||document.hidden){retry=setTimeout(()=>acknowledge(key),100);return;}
    try {
      const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:code,token:boardToken,type:'selection_draw_ready',drawId:snapshot.selectionDraw.id,reducedMotion:reduced()})});
      if(!response.ok&&response.status!==409)throw Error('selection draw');
    }catch(e){retry=setTimeout(()=>acknowledge(key),700);}
  }
  function animate() {
    const draw=snapshot?.selectionDraw;
    if(snapshot?.phase!=='select'||draw?.phase!=='rolling')return;
    const now=Date.now()+clockOffset;
    for(const target of draw.targets){
      const face=document.querySelector(`.selectionDrawFrames[data-player="${target.playerId}"]`);if(!face)continue;
      const t=Math.max(0,Math.min(1,(now-draw.startedAt)/(target.stopAt-draw.startedAt))),position=(1-Math.pow(1-t,3))*(target.sequence.length-1);
      const index=reduced()?target.sequence.length-1:Math.floor(position),phase=position-Math.floor(position);
      [...face.children].forEach((image,i)=>image.classList.toggle('selectionCurrent',i===index));
      face.style.opacity=reduced()?String(t):'1';
      face.style.filter=reduced()?'':`brightness(${1+.12*Math.max(0,1-phase*6)})`;
    }
  }
  function update(s) {
    if(snapshot!==s){snapshot=s;clockOffset=Number(s.serverNow||Date.now())-Date.now();}
    if(s.phase!=='select'){pendingAck='';clearTimeout(retry);return;}
    void warm(s);
    const draw=s.selectionDraw,key=draw?s.stateInstanceId+':'+draw.id:'';
    if(draw?.phase==='preparing'&&pendingAck!==key){pendingAck=key;clearTimeout(retry);warm(s).then(()=>acknowledge(key));}
    if(draw?.phase!=='preparing'){pendingAck='';clearTimeout(retry);}
    for(const p of s.players){
      const slot=document.querySelector(`[data-player-slot="${p.id}"]`);if(!slot||p.charId)continue;
      if(!p.isBot&&!p.randomSelection){
        slot.innerHTML=`<div class="scChosenMeta"><div class="scPlayerPlate"><span>${esc(p.name)}</span></div><div class="scChosenName">召喚士選択中</div></div>`;continue;
      }
      const target=draw?.phase==='rolling'?draw.targets.find(t=>t.playerId===p.id):null;
      slot.classList.add('selectionRandomSlot');
      slot.innerHTML=`<div class="scSelectedFace"><div class="scPortrait">${target
        ?`<div class="selectionDrawFrames" data-player="${esc(p.id)}">${target.sequence.map(id=>`<img src="/assets/summoner-still-${id}.webp" alt="">`).join('')}</div>`
        :'<div class="selectionRandomFace"><span class="selectionRandomGlyph" aria-hidden="true">?</span></div>'}</div><div class="scChosenMeta"><div class="scPlayerPlate"><span>${esc(p.name)}</span>${p.isBot?'<span class="scBotBadge">BOT</span>':''}</div><div class="scChosenName">ランダム</div></div></div>`;
    }
    animate();
  }
  const tick=()=>{animate();requestAnimationFrame(tick);};requestAnimationFrame(tick);
  return {update};
})();
