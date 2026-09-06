/* Shared, read-only rendering of server-computed routes. No private card data. */
window.SummonsMapUI = (() => {
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get=s=>SummonsMaps[s?.mapId || 'starting_corridor'];
  const colors={fire:'#b94727',water:'#296ba5',earth:'#997521',wind:'#317c69'};
  const names={fire:'火',water:'水',earth:'土',wind:'風',castle:'城',market:'店',gate:'門',shrine:'祠'};
  function routes(s,pend,selected,point,size=22){
    if(!pend)return '';
    const current=s.players.find(p=>s.pending[p.id]===pend)?.pos;
    if(current==null)return '';
    let out='<defs><marker id="routeArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#ffe393"/></marker></defs>';
    const chosen=pend.options.find(o=>o.id===selected);
    if(chosen){
      const fixed=new Set(chosen.prefix.slice(1).map((t,i)=>chosen.prefix[i]+':'+t));
      for(const [a,b] of chosen.edges){const pa=point(a),pb=point(b);
        out+=`<path d="M${pa.x},${pa.y}L${pb.x},${pb.y}" fill="none" stroke="#7de0ee" stroke-width="4" ${fixed.has(a+':'+b)?'':'stroke-dasharray="7 6"'} opacity=".9"/>`;
      }
      chosen.destinations.forEach(d=>{const p=point(d.tile);out+=`<circle cx="${p.x}" cy="${p.y}" r="${size}" fill="none" stroke="#7de0ee" stroke-width="3"/><text x="${p.x}" y="${p.y+size+14}" text-anchor="middle" fill="#fff3c9" font-size="${size*.65}" stroke="#081220" stroke-width="3" paint-order="stroke">${d.victory?'勝利判定':d.forcedStop?'強制停止':d.toll+'G'}</text>`;});
    }
    for(const o of pend.options){
      const a=point(current),b=point(o.tile),dx=b.x-a.x,dy=b.y-a.y;
      const x=a.x+dx*.62,y=a.y+dy*.62;
      out+=`<path d="M${a.x+dx*.15},${a.y+dy*.15}L${a.x+dx*.78},${a.y+dy*.78}" stroke="#071525" stroke-width="11" fill="none"/><path d="M${a.x+dx*.15},${a.y+dy*.15}L${a.x+dx*.78},${a.y+dy*.78}" stroke="#ffe393" stroke-width="${o.id===selected?6:4}" fill="none" marker-end="url(#routeArrow)"/><circle cx="${x}" cy="${y-size}" r="${size*.62}" fill="#11182c" stroke="#ffe393" stroke-width="2"/><text x="${x}" y="${y-size+size*.23}" text-anchor="middle" font-size="${size*.8}" font-weight="bold" fill="#fff3bd">${o.number}</text>`;
    }
    return out;
  }
  function mini(s,pend,selected){
    const map=get(s), point=i=>({x:30+map.geo[i][0]*50,y:24+map.geo[i][1]*34});
    let out='';
    map.neighbors.forEach((ns,i)=>ns.filter(j=>j>i).forEach(j=>{const a=point(i),b=point(j);out+=`<path d="M${a.x},${a.y}L${b.x},${b.y}" stroke="#5c6377" stroke-width="2"/>`;}));
    s.tiles.forEach((t,i)=>{const p=point(i),o=s.owners[i],owner=s.players.find(q=>q.id===o?.player);out+=`<rect x="${p.x-18}" y="${p.y-12}" width="36" height="24" rx="3" fill="${colors[t.e]||'#3b3657'}" stroke="${owner?.color||'#777185'}" stroke-width="${o?3:1}"/><text x="${p.x}" y="${p.y+6}" fill="#fff4de" font-size="17" text-anchor="middle">${names[t.e||t.t]}</text>`;});
    out+=routes(s,pend,selected,point,17);
    return `<svg role="img" aria-label="${esc(map.name)}の進路候補" viewBox="0 0 ${map.width*50+10} ${map.height*34+14}" style="width:100%;height:100%">${out}</svg>`;
  }
  function gates(s,p){return get(s).branching?get(s).gates.map(i=>`<span class="sealIc ${(p.gatesVisited||[]).includes(i)?'has':''}">${i===22?'西':'東'}${(p.gatesVisited||[]).includes(i)?'✓':'−'}</span>`).join(' '):'';}
  return {get,esc,mini,routes,gates};
})();
