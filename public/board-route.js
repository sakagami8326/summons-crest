/* Board-only route view. Options and destinations always come from the server. */
window.BoardRoute = (() => {
  let layer,markup='',barKey='';
  const esc=s=>SummonsMapUI.esc(s);
  function hide(){if(layer)layer.hidden=true;if(typeof PW!=='undefined')PW.setRouteDestinations([]);}
  function lines(edges,origin,point){
    const chains=[],distance=new Map([[origin,0]]);let chain;
    for(const [from,to]of edges){const a=point(from),b=point(to),start=distance.get(from)||0;
      if(!chain||chain.end!==from){chain={end:from,offset:start,points:[a]};chains.push(chain)}
      chain.points.push(b);chain.end=to;if(!distance.has(to))distance.set(to,start+Math.hypot(b.x-a.x,b.y-a.y));
    }
    return chains.map(c=>`<path class="gdChosen" style="--dash-phase:${-c.offset%24}px" d="${c.points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')}"/>`).join('');
  }
  function draw(s,actor,pd,selected,point){
    const tip=(from,to,cls='')=>{const a=point(from),b=point(to),angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;return `<g class="gdTipAnchor ${cls}" data-from="${from}" data-tile="${to}" transform="translate(${b.x},${b.y}) rotate(${angle})"><path class="gdRouteTip" d="M-18 -11L0 0 -18 11"/></g>`};
    const start=point(actor.pos),chosen=pd.options.find(o=>o.id===selected);let html='';
    if(chosen){html+=lines(chosen.edges,actor.pos,point);const ends=new Set(chosen.destinations.map(d=>d.tile));html+=chosen.edges.filter(([,to])=>ends.has(to)).map(([from,to])=>tip(from,to,'gdChosenTip')).join('');}
    html+=pd.options.map(o=>{const p=point(o.tile),dx=p.x-start.x,dy=p.y-start.y,a={x:start.x+dx*.23,y:start.y+dy*.23},length=Math.hypot(dx,dy)||1,label={x:p.x+Math.sign(dx)*Math.abs(dy)/length*43,y:p.y-Math.abs(dx)/length*43};return `<g data-tile="${o.tile}" class="gdBranch ${selected===o.id?'selected':''} ${selected&&selected!==o.id?'dim':''}">${selected===o.id?'':`<path class="gdRouteLine" d="M${a.x} ${a.y} L${p.x} ${p.y}"/>${tip(actor.pos,o.tile)}`}<g class="gdNumberAnchor" transform="translate(${label.x},${label.y})"><circle r="21"/><text y="8" text-anchor="middle">${o.number}</text></g></g>`}).join('');
    return {html,destinations:chosen?.destinations||[]};
  }
  function update(s,{blocked=false,point,glow=()=>{}}={}) {
    const actor=s?.players.find(p=>s.pending?.[p.id]?.type==='route_choice'),pd=actor&&s.pending[actor.id];
    if(!pd||s.phase!=='playing'||blocked){if(layer)layer.hidden=true;glow([]);return;}
    if(!layer){layer=document.createElement('div');layer.id='gdLayer';layer.innerHTML='<svg class="gdMapMarks gdRoutes" aria-label="進路の候補"></svg><section class="gdBar gdFrame" role="status"></section>';document.body.append(layer);}
    layer.hidden=false;
    const key=JSON.stringify([s.code,s.stateInstanceId,pd.promptId,actor.name,actor.charId,pd.remainingSteps]);
    if(key!==barKey){
      const element=s.catalog.CHARS[actor.charId]?.elem||'neutral';
      layer.querySelector('.gdBar').innerHTML=['tl','tr','bl','br'].map(c=>'<i class="gdCorner '+c+'"></i>').join('')+`<div class="routeActor" style="--route-bg:url('/assets/cards/bg-${element}.webp')"><div></div><img src="/assets/board-actors/${actor.charId}.png" alt="${esc(s.catalog.CHARS[actor.charId]?.name)}"></div><div class="routeHeading"><small>${esc(actor.name)}</small><h2>進む道を選択</h2></div><div class="gdRemaining"><small>残り</small><strong>${Number(pd.remainingSteps)}<em>歩</em></strong></div><span class="gdPhone"><i aria-hidden="true"></i>スマホで選択</span>`;barKey=key;
    }
    const preview=s.routePreview,selected=preview?.player===actor.id&&preview.promptId===pd.promptId?preview.optionId:null;
    const result=draw(s,actor,pd,selected,point),svg=layer.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    if(markup!==result.html){svg.innerHTML=result.html;markup=result.html;}
    glow(result.destinations.map(d=>({tile:d.tile,level:s.owners[d.tile]?.level||1})));
  }
  addEventListener('pagehide',hide);
  return {update,hide,draw,lines};
})();
