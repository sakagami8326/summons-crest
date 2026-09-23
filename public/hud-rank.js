(() => {
'use strict';
const crownSource=`<svg class="rvCrown" viewBox="0 0 180 150" aria-hidden="true">
   <defs>
    <linearGradient id="podiumGold" x1="0" y1="0" x2=".85" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#fff4c1"/><stop offset=".23" stop-color="#e2b451"/><stop offset=".43" stop-color="#fff0a6"/><stop offset=".62" stop-color="#aa671e"/><stop offset=".83" stop-color="#f5d27c"/><stop offset="1" stop-color="#9c591a"/></linearGradient>
    <linearGradient id="podiumRim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff8d2"/><stop offset=".2" stop-color="#eac779"/><stop offset=".48" stop-color="#8c4d19"/><stop offset=".65" stop-color="#e1ae4c"/><stop offset="1" stop-color="#fff0a0"/></linearGradient>
    <linearGradient id="podiumVelvet" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#406575"/><stop offset=".45" stop-color="#1b3545"/><stop offset="1" stop-color="#091824"/></linearGradient>
   </defs>
   <path d="M25 49Q42 79 54 50Q69 76 90 23Q111 76 126 50Q138 79 155 49L140 125Q90 144 40 125Z" fill="#613815" stroke="#44220e" stroke-width="5" stroke-linejoin="round"/>
   <path d="M27 50Q44 79 55 52Q70 78 90 25Q110 78 125 52Q136 79 153 50L138 120Q90 137 42 120Z" fill="url(#podiumVelvet)"/>
   <path d="M19 44Q39 67 46 75Q57 86 53 48Q71 82 80 52L90 20L100 52Q109 82 127 48Q123 86 134 75Q141 67 161 44L143 114Q90 132 37 114Z" fill="url(#podiumGold)" stroke="#f9dda0" stroke-width="1.8" stroke-linejoin="round"/>
   <g fill="url(#podiumGold)" stroke="#c5903e" stroke-width="1.3"><circle cx="18" cy="42" r="6"/><circle cx="53" cy="46" r="4.6"/><circle cx="127" cy="46" r="4.6"/><circle cx="162" cy="42" r="6"/></g>
   <circle cx="90" cy="16" r="6" fill="url(#podiumGold)" stroke="#ffedb0" stroke-width="1.5"/>
   <path d="M36 108Q90 123 144 108L140 133Q90 147 40 133Z" fill="url(#podiumRim)" stroke="#703d15" stroke-width="2"/>
   <path d="M40 114Q90 127 140 114L137 129Q90 141 43 129Z" fill="url(#podiumGold)" stroke="#f7d88d" stroke-width="1.3"/>
   <path d="M37 109Q90 124 143 109M41 133Q90 147 139 133" fill="none" stroke="#fff0b2" stroke-width="2"/>
  </svg>`;
function crown(rank,id){
 if(rank===4)return '';
 let svg=crownSource.replace('class="rvCrown"','class="rkCrown"');
 const uid='rank-'+id+'-'+rank+'-';svg=svg.replaceAll('podium',uid);
 if(rank>1){
  const silver=['#f9fdff','#a3adb9','#edf3fa','#667382','#d0d9e3','#65717e'];
  const bronze=['#ffe0b9','#c68c59','#f3c591','#754830','#dba56f','#754529'];
  const tones=rank===2?silver:bronze;
  ['#fff4c1','#e2b451','#fff0a6','#aa671e','#f5d27c','#9c591a'].forEach((c,i)=>svg=svg.replaceAll(c,tones[i]));
  const accents=rank===2?{'#fff8d2':'#f9fdff','#eac779':'#c9d5e1','#8c4d19':'#586571','#e1ae4c':'#a1b2c5','#fff0a0':'#e6f2ff','#613815':'#424c58','#44220e':'#28313b','#f9dda0':'#dce8f4','#c5903e':'#9ba9ba','#ffedb0':'#f1f8ff','#703d15':'#4e5965','#f7d88d':'#d7e0eb','#fff0b2':'#f0f6ff'}:{'#fff8d2':'#ffdfb9','#eac779':'#daaa7c','#8c4d19':'#76462d','#e1ae4c':'#bb7d4e','#fff0a0':'#f5cea7','#f9dda0':'#e4b389','#c5903e':'#a97148','#ffedb0':'#ffdbb2','#f7d88d':'#eac199','#fff0b2':'#ffe0b9'};
  for(const [a,b]of Object.entries(accents))svg=svg.replaceAll(a,b);
 }
 return svg+'<b>'+rank+'<small>'+['','st','nd','rd'][rank]+'</small></b>';
}

const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const running=new Map();
function capture(hud){
 const before=new Map();
 hud.querySelectorAll('.plate').forEach(el=>{
  const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);
  before.set(el.id,{top:parseFloat(el.style.top)||0,x:m.m41,y:m.m42,rank:Number(el.dataset.rank)});
 });
 return before;
}
function settle(el){const entry=running.get(el);if(!entry)return;entry.animation.cancel();clearTimeout(entry.timer);running.delete(el);el.style.zIndex='';}
function animate(hud,before){
 hud.querySelectorAll('.plate').forEach(el=>{
  const old=before.get(el.id),top=parseFloat(el.style.top)||0,rank=Number(el.dataset.rank);
  if(!old||(old.top===top&&old.rank===rank))return;
  const dy=old.top+old.y-top,up=old.rank>rank;
  settle(el);
  if(reduced.matches||document.hidden)return;
  el.style.zIndex=up?'6':'3';
  const x=up?78:0;
  const animation=el.animate([
   {transform:`translate(${old.x}px,${dy}px) scale(1)`,offset:0},
   {transform:`translate(${x}px,${dy}px) scale(${up?1.035:.98})`,offset:.22},
   {transform:`translate(${x}px,0) scale(${up?1.035:.98})`,offset:.76},
   {transform:'translate(0,0) scale(1)',offset:1}
  ],{duration:1440,easing:'cubic-bezier(.4,0,.2,1)'});
  const entry={animation,timer:null};running.set(el,entry);
  if(up)entry.timer=setTimeout(()=>{
   if(running.get(el)!==entry)return;
   el.querySelector('.rkShine')?.animate([{transform:'translateX(-140%)',opacity:0},{transform:'translateX(-65%)',opacity:.85,offset:.35},{transform:'translateX(140%)',opacity:0}],{duration:540,easing:'ease-out'});
   el.querySelector('.rankBadge')?.animate([{transform:'scale(.85)',filter:'brightness(1.8)'},{transform:'scale(1.16)',offset:.45},{transform:'scale(1)',filter:'brightness(1)'}],{duration:500,easing:'ease-out'});
  },1220);
  animation.onfinish=()=>{if(running.get(el)===entry){running.delete(el);el.style.zIndex='';}};
 });
}
function stop(){for(const el of running.keys())settle(el);}
reduced.addEventListener('change',stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.SummonsHudRank={crown,capture,animate};
})();
