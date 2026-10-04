// Shared artwork and numbers for territory upgrades on the phone and board.
window.UpgradeUI=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors={wind:'#69dacb',fire:'#ff855c',water:'#73bfff',earth:'#dcc06f',neutral:'#d2c1e9'};
 const img=(f,alt='',cls='')=>`<img src="/assets/${f}" alt="${esc(alt)}" class="${cls}">`;
 const arrow=cls=>img('ui/arrow-ornate.svg','',cls||'forward');
 const land=(element,level)=>`<span class="upLand" style="--elem:${colors[element]};--bg:url('/assets/cards/bg-${element}.webp')"><span class="upDiamond"><i style="--glyph:url('/assets/element-${element==='water'?'water-v2':element}.svg')"></i></span>${level?`<b>${level}</b>`:''}</span>`;
 const gold=n=>`<span class="upGold">${img('ic_gold.png')}<b>${Number(n).toLocaleString()}<small>G</small></b></span>`;
 const creature=(d,t)=>img('cards/'+(t.evolved?'e':'c')+'_'+d.creature+'.webp',t.evolved?d.evoName:d.name,'upCreature');
 return {esc,colors,img,arrow,land,gold,creature};
})();
