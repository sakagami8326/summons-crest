/* Read-only land inspection; the server controls legal selections. */
window.BoardLandStop=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const img=(f,alt='')=>'<img src="/assets/'+f+'" alt="'+esc(alt)+'">';
 const gold=n=>'<span class="lsGold">'+img('ic_gold.png')+'<b>'+Number(n).toLocaleString()+'<em>G</em></b></span>';
 function model(s){const d=s.landStop,p=s.players.find(p=>p.id===d.player),tile=EnemyLand.landIcon(d.element);let html;
  if(d.kind==='empty')html='<header class="lsHeading"><h2>空き地</h2></header><div class="lsEmpty">'+tile+'<span>'+esc({fire:'火',water:'水',wind:'風',earth:'土'}[d.element]||'無')+'</span></div><div class="lsPlacement">'+img('ic_hand.png')+'<b>'+(d.canSummon?'クリーチャーを配置':'配置できるクリーチャーがない')+'</b></div>';
  else{
   const o=s.owners[d.tile],c=s.catalog.CREATURES[o.creature],base=o.creature.replace(/_f$/,''),evolved=/_f$/.test(o.creature)||(o.level>=s.evoLevel&&!!c.evo),name=evolved&&c.evo?c.evo:c.name,b=d.stats;
   html='<header class="lsHeading">'+tile+'<h2>Lv.<b>'+o.level+'</b></h2><div class="lsCurrentToll"><small>通行料</small>'+gold(s.tolls[d.tile])+'</div></header>'+
    '<div class="lsCreature">'+img('cards/'+(evolved?'e':'c')+'_'+base+'.webp',name)+'<div><small>HP + DF</small><strong>'+b.total+'</strong><span>HP '+b.hp+' / DF '+b.df+'</span></div></div><h2 class="lsCreatureName">'+esc(name)+'</h2>'+
    '<div class="lsUpgradeGuide">'+(d.canUpgrade?'自分の領地を選んで強化':d.canMove?'マーローを移動':'強化できる領地がない')+'</div>'+
    (o.level>=d.maxLevel?'<div class="lsMax">このマスは最大レベル</div>':'');
  }
  return {actor:p.id,actorLabel:d.kind==='empty'?'停止中':'領地主',kind:'land-stop',html};
 }
 return {model};
})();
