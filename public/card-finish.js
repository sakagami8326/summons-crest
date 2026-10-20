/* Metadata belongs to the card face, never the shared anonymous card back. */
window.CardFinish=(()=>{
 const selector='[data-finish-rarity],.cardFinishMeta,.titleCard,.site-game-card,[data-finish-card-id]';
 let catalog=null;const observed=new Set();
 const visibility=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)e.target.classList.toggle('finishOffscreen',!e.isIntersecting)}):null;
 function finish(el,rarity){if(!el)return;rarity=rarity==='L'?'UR':rarity||'N';el.dataset.finishRarity=rarity;el.querySelectorAll(':scope>.cardFinishLayers,:scope>.cardFinishPaper').forEach(e=>e.remove());el.classList.toggle('cardFinished',rarity==='R'||rarity==='UR');if(!el.classList.contains('cardFinished')){visibility?.unobserve(el);observed.delete(el);return;}
  if(el.querySelector(':scope>.ccInfo,:scope>.spInfo,:scope>.suInfo,:scope>.scInfo,:scope>.game-card__info')){const p=document.createElement('span');p.className='cardFinishPaper';p.setAttribute('aria-hidden','true');el.append(p)}
  const layer=document.createElement('span');layer.className='cardFinishLayers';layer.setAttribute('aria-hidden','true');layer.innerHTML=rarity==='R'?'<i class="cardFinishWhite"></i><i class="cardFinishStars"></i>':'<i class="cardFinishShards"></i><i class="cardFinishPrism"></i>';el.append(layer);visibility?.observe(el);observed.add(el);
 }
 function identify(el){if(el.matches('.cardFinishMeta')){const p=el.parentElement;if(p&&p.dataset.finishRarity!==el.dataset.rarity)finish(p,el.dataset.rarity);else if(p&&!p.querySelector(':scope>.cardFinishLayers')&&['R','UR'].includes(el.dataset.rarity))finish(p,el.dataset.rarity);return;}
  if(el.hasAttribute('data-finish-rarity')){if(el.dataset.finishApplied!==el.dataset.finishRarity||!el.querySelector(':scope>.cardFinishLayers')&&['R','UR'].includes(el.dataset.finishRarity)){finish(el,el.dataset.finishRarity);el.dataset.finishApplied=el.dataset.finishRarity;}return;}
  if(catalog){const src=el.querySelector('img[src*="/c_"],img[src*="/e_"]')?.getAttribute('src')||'',id=src.match(/\/(?:c|e)_([^/.]+)\./)?.[1];const card=catalog.get(el.dataset.finishCardId||id);if(card)finish(el,card.rarity);}
 }
 function scan(root){if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;if(root.matches?.(selector))identify(root);root.querySelectorAll(selector).forEach(identify);if(root.shadowRoot)scan(root.shadowRoot);root.querySelectorAll('review-game-card').forEach(el=>{if(el.shadowRoot)scan(el.shadowRoot)});}
 function start(){scan(document);const observer=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1&&!n.matches('.cardFinishLayers,.cardFinishPaper,.cardFinishLayers *'))scan(n);for(const el of observed)if(!el.isConnected){visibility?.unobserve(el);observed.delete(el)}});observer.observe(document.body,{childList:true,subtree:true});
  if(document.querySelector('.titleCard,.site-game-card,[data-finish-card-id]'))fetch('/api/catalog',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('catalog');return r.json()}).then(d=>{catalog=new Map(d.cards.map(c=>[c.id,c]));scan(document)}).catch(()=>{});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();return{apply:finish,scan};
})();
