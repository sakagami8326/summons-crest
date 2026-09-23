(() => {
'use strict';
const oldHeader=document.querySelector('.site-header');if(!oldHeader)return;
const audio=oldHeader.querySelector('.site-bgm');
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const close='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const groups=[['ゲーム紹介',[['どんなゲーム？','/#concept'],['召喚士','/#summoners']]],['遊び方',[['はじめ方','/#how-to-play'],['ゲームの仕組み','/#game-system'],['詳しいルール','/rules']]]];
const links=items=>items.map(([label,url])=>`<a href="${url}">${label}${arrow}</a>`).join('');
const sections=groups.map(([label,items])=>`<section><h3>${label}</h3>${links(items)}</section>`).join('')+`<section class="nv-direct">${links([['カード図鑑','/cards'],['お知らせ','/news']])}</section>`;
function header(design){return `<header class="nv-header" data-header data-design="${design}"><a class="nv-logo" href="/" aria-label="SUMMONS CODE ホーム"><img src="/assets/summons-code-white.svg" alt="SUMMONS CODE"></a><nav class="nv-desktop" aria-label="メインメニュー">${groups.map(([label,items],i)=>`<div class="nv-group"><button type="button" class="nv-group-toggle" aria-expanded="false" aria-controls="nv-group-${i}">${label}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="nv-popover" id="nv-group-${i}" hidden>${links(items)}</div></div>`).join('')}<a href="/cards">カード図鑑</a><a href="/news">お知らせ</a></nav><div class="nv-audio-desktop"></div><a class="site-header__play nv-play" href="/play" data-game-cta="header">無料でプレイ${arrow}</a><button class="nv-menu" type="button" aria-haspopup="dialog" aria-controls="nv-dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 17h18"/></svg><span>メニュー</span></button></header><dialog id="nv-dialog" class="nv-dialog" aria-labelledby="nv-title"><div class="nv-dialog-head"><h2 id="nv-title">メニュー</h2><button class="nv-close" type="button" aria-label="メニューを閉じる">${close}</button></div><nav class="nv-dialog-nav" aria-label="サイトメニュー">${sections}</nav><div class="nv-utilities">${links([['ご意見・不具合報告','/#feedback'],['制作について','/about']])}<div class="nv-utility-bottom"><div class="nv-socials"><a href="https://x.com/gamitestman" target="_blank" rel="noopener noreferrer" aria-label="開発者のX">X</a><a href="https://www.youtube.com/@SUMMONSCODE" target="_blank" rel="noopener noreferrer">YouTube</a></div><div class="nv-audio-menu"></div></div></div></dialog>`;}

oldHeader.insertAdjacentHTML('beforebegin',header('a'));
if(audio)document.querySelector('.nv-audio-desktop').append(audio);
oldHeader.remove();
const footer=document.querySelector('.site-footer nav[aria-label="フッターメニュー"],.sub-footer nav[aria-label="フッターメニュー"]');
if(footer){footer.classList.add('nv-footer');footer.innerHTML=links([['ゲーム紹介','/#concept'],['遊び方','/#how-to-play'],['カード図鑑','/cards'],['お知らせ','/news'],['ご意見・不具合報告','/#feedback'],['制作について','/about']]);}
})();
(()=>{
 const header=document.querySelector('.nv-header');if(!header)return;
 const dialog=document.querySelector('.nv-dialog'),menu=document.querySelector('.nv-menu'),close=document.querySelector('.nv-close'),toggles=[...document.querySelectorAll('.nv-group-toggle')];
 const collapse=()=>toggles.forEach(b=>{b.setAttribute('aria-expanded','false');document.getElementById(b.getAttribute('aria-controls')).hidden=true;});
 toggles.forEach(b=>b.addEventListener('click',()=>{const open=b.getAttribute('aria-expanded')==='false';collapse();b.setAttribute('aria-expanded',String(open));document.getElementById(b.getAttribute('aria-controls')).hidden=!open;}));
 document.addEventListener('click',e=>{if(!e.target.closest('.nv-group'))collapse();});
 document.addEventListener('focusin',e=>{if(!e.target.closest('.nv-group'))collapse();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open){const active=toggles.find(b=>b.getAttribute('aria-expanded')==='true');collapse();active?.focus();}});
 document.querySelector('.nv-play').addEventListener('click',()=>window.SummonsAnalytics?.track('game_start_cta_click',{cta_location:'header'}));
 const audio=document.querySelector('.site-bgm');
 function positionAudio(){const drawer=innerWidth<=1150||header.dataset.design==='b';document.querySelector(drawer?'.nv-audio-menu':'.nv-audio-desktop').append(...(audio?[audio]:[]));}
 positionAudio();window.addEventListener('resize',()=>{positionAudio();collapse();if(dialog.open)dialog.close();});
 menu.addEventListener('click',()=>{collapse();dialog.showModal();menu.setAttribute('aria-expanded','true');document.documentElement.style.overflow='hidden';close.focus();});
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)(window.SummonsCloseMenu||(()=>dialog.close()))();}});
 dialog.addEventListener('close',()=>{menu.setAttribute('aria-expanded','false');document.documentElement.style.overflow='';menu.focus({preventScroll:true});});
 dialog.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>dialog.close()));
 document.querySelectorAll('.nv-header a,.nv-dialog a').forEach(a=>{const u=new URL(a.href);if(u.origin===location.origin&&u.pathname===location.pathname&&u.pathname!=='/'&&!u.hash)a.setAttribute('aria-current','page');});
 document.querySelectorAll('.nv-popover a').forEach(a=>a.addEventListener('click',collapse));
})();
(()=>{
const dialog=document.querySelector('.nv-dialog');if(!dialog)return;
const style='sheet';
const chevron='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const external='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
const originalChildren=document.createElement('div');originalChildren.className='mc-original';while(dialog.firstChild)originalChildren.append(dialog.firstChild);dialog.append(originalChildren);
const card=document.createElement('div');card.className='mc-surface';card.innerHTML=`<div class="mc-rail" aria-hidden="true"><span>SUMMONS CODE</span></div><button type="button" class="mc-close" aria-label="メニューを閉じる"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div class="mc-sheet"><div class="mc-head"><img class="mc-logo" src="/assets/summons-code-white.svg" alt="SUMMONS CODE"><h2>メニュー</h2></div><nav class="mc-nav" aria-label="スマホメニュー"><details class="mc-tile" style="--i:0"><summary><span>ゲーム紹介</span>${chevron}<img src="/assets/pawn_mio.png" alt=""></summary><div class="mc-sublinks"><a href="/#concept">どんなゲーム？${chevron}</a><a href="/#summoners">召喚士${chevron}</a></div></details><details class="mc-tile" style="--i:1"><summary><span>遊び方</span>${chevron}<img src="/assets/pawn_grease.png" alt=""></summary><div class="mc-sublinks"><a href="/#how-to-play">はじめ方${chevron}</a><a href="/#game-system">ゲームの仕組み${chevron}</a><a href="/rules">詳しいルール${chevron}</a></div></details><a class="mc-tile mc-cardlink" style="--i:2" href="/cards"><span>カード図鑑</span>${chevron}<img src="/assets/site/cards/c_komao.webp" alt=""></a><a class="mc-tile mc-cardlink" style="--i:3" href="/news"><span>お知らせ</span>${chevron}<img src="/assets/pawn_redani.png" alt=""></a></nav><a class="mc-note" href="https://note.com/gami3game" target="_blank" rel="noopener noreferrer" aria-label="開発者ブログ gami3のnoteを開く（新しいタブ）"><div><strong>開発者ブログ</strong><span>note <small>gami3</small>${external}</span></div><img src="/assets/pawn_grease.png" alt=""></a><div class="mc-foot"><a href="/#feedback">ご意見・不具合報告</a><a href="/about">制作について</a><div class="mc-bottom"><div><a href="https://x.com/gamitestman" target="_blank" rel="noopener noreferrer" aria-label="開発者のX">X</a><a href="https://www.youtube.com/@SUMMONSCODE" target="_blank" rel="noopener noreferrer">YouTube</a></div><div class="mc-audio"></div></div></div></div>`;
dialog.append(card);dialog.dataset.mobileStyle=style==='deal'?'deal':'sheet';
// The existing native dialog supplies modal focus containment and background inertness.
const menu=document.querySelector('.nv-menu'),reduced=matchMedia('(prefers-reduced-motion: reduce)');let closing=false,closeTimer=null;
function closeMenu(){if(closing||!dialog.open)return;closing=true;dialog.classList.add('mc-leaving');closeTimer=setTimeout(()=>{dialog.close();dialog.classList.remove('mc-leaving');closing=false;},reduced.matches?0:220);}
window.SummonsCloseMenu=closeMenu;
dialog.addEventListener('close',()=>{clearTimeout(closeTimer);closing=false;dialog.classList.remove('mc-leaving');});
card.querySelector('.mc-close').addEventListener('click',closeMenu);
dialog.addEventListener('cancel',e=>{if(innerWidth<=1150){e.preventDefault();closeMenu();}});
card.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
const accordions=[...card.querySelectorAll('details')], accordionStates=new Map();
accordions.forEach(d=>{
 const summary=d.querySelector('summary'),panel=d.querySelector('.mc-sublinks');
 accordionStates.set(d,{expanded:d.open,height:null,links:[]});
 summary.setAttribute('aria-expanded',String(d.open));panel.inert=!d.open;
 summary.addEventListener('click',event=>{
  event.preventDefault();const opening=!accordionStates.get(d).expanded;
  if(opening)accordions.forEach(other=>{if(other!==d&&accordionStates.get(other).expanded)expand(other,false);});
  expand(d,opening);
 });
});
function expand(d,opening){
 const state=accordionStates.get(d),summary=d.querySelector('summary'),panel=d.querySelector('.mc-sublinks');
 const start=d.getBoundingClientRect().height;
 state.height?.cancel();state.links.forEach(animation=>animation.cancel());state.links=[];
 state.expanded=opening;summary.setAttribute('aria-expanded',String(opening));d.classList.toggle('mc-expanded',opening);panel.inert=!opening;
 if(reduced.matches){d.open=opening;d.style.height='';state.height=null;return;}
 // Keep the native details open until the closing animation ends, so its contents can animate out.
 d.open=true;
 const border=parseFloat(getComputedStyle(d).borderTopWidth)+parseFloat(getComputedStyle(d).borderBottomWidth);
 const end=summary.getBoundingClientRect().height+(opening?panel.getBoundingClientRect().height:0)+border;
 const animation=d.animate([{height:start+'px'},{height:end+'px'}],{duration:opening?440:260,easing:opening?'cubic-bezier(.22,1,.36,1)':'cubic-bezier(.4,0,.2,1)',fill:'both'});
 state.height=animation;
 [...panel.querySelectorAll('a')].forEach((a,i)=>state.links.push(a.animate(opening?[{opacity:0,transform:'translateX(-12px)'},{opacity:1,transform:'translateX(0)'}]:[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(-6px)'}],{duration:opening?280:150,delay:opening?70+i*45:0,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'})));
 animation.onfinish=()=>{if(state.height!==animation)return;d.open=opening;animation.cancel();state.height=null;state.links.forEach(a=>a.cancel());state.links=[];};
}
window.addEventListener('resize',()=>accordions.forEach(d=>{const s=accordionStates.get(d);s.height?.cancel();s.height=null;s.links.forEach(a=>a.cancel());s.links=[];d.open=s.expanded;}));
const audio=document.querySelector('.site-bgm');function placeAudio(){if(innerWidth<=1150){if(audio)card.querySelector('.mc-audio').append(audio);dialog.setAttribute('aria-label','メニュー');dialog.removeAttribute('aria-labelledby');}else{dialog.removeAttribute('aria-label');dialog.setAttribute('aria-labelledby','nv-title');}}
placeAudio();window.addEventListener('resize',placeAudio);
menu.addEventListener('click',()=>{if(innerWidth<=1150){dialog.scrollTop=0;card.querySelector('.mc-close').focus({preventScroll:true});}});
// Add the same blog banner to the footer so desktop visitors can also find it.
const footer=document.querySelector('.site-footer,.sub-footer');if(footer){const banner=card.querySelector('.mc-note').cloneNode(true);banner.classList.add('mc-note-footer');footer.prepend(banner);}
})();
