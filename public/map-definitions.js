(function(root, factory) {
  const maps = factory();
  if (typeof module === 'object' && module.exports) module.exports = maps;
  else root.SummonsMaps = maps;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const legacyGeo = [[4,7],[3,7],[2,7],[1,7],[0,7],[0,6],[0,5],[0,4],[0,3],[0,2],[0,1],[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[7,1],[7,2],[7,3],[7,4],[7,5],[7,6],[7,7],[6,7],[5,7]];
  const legacy = ['castle','fire','fire','fire','shrine','fire','fire','wind','market','wind','wind','shrine','wind','wind','earth','gate','earth','earth','shrine','earth','earth','water','water','market','water','shrine','water','water'];
  const caveGeo = [];
  for(let x=0;x<=6;x++) caveGeo.push([x,0]);
  for(let y=1;y<=8;y++) caveGeo.push([6,y]);
  for(let x=5;x>=0;x--) caveGeo.push([x,8]);
  for(let y=7;y>=1;y--) caveGeo.push([0,y]);
  for(let x=1;x<=5;x++) caveGeo.push([x,4]);
  const cave = ['market','earth','wind','wind','fire','fire','market','water','shrine','earth','earth','wind','gate','water','shrine','earth','wind','castle','fire','water','shrine','earth','gate','fire','wind','fire','shrine','water','water','wind','fire','earth','water'];
  function make(id,name,types,geo,extra) {
    const tiles = types.map(t=>['fire','water','earth','wind'].includes(t)?{t:'land',e:t}:{t});
    const neighbors = geo.map(([x,y],i)=>geo.flatMap(([a,b],j)=>i!==j&&Math.abs(x-a)+Math.abs(y-b)===1?[j]:[]));
    return Object.assign({id,name,tiles,geo,neighbors,castle:types.indexOf('castle'),gates:types.flatMap((t,i)=>t==='gate'?[i]:[]),width:Math.max(...geo.map(c=>c[0]))+1,height:Math.max(...geo.map(c=>c[1]))+1},extra);
  }
  const maps = {
    starting_corridor:make('starting_corridor','始まりの回廊',legacy,legacyGeo,{branching:false,gateBonus:200,background:'/assets/bg.jpg',preview:'/assets/maps/starting-corridor-preview-v1.webp',description:'分岐のない基本マップ。土地の確保と強化が勝負の鍵。',lapSteps:[28]}),
    twin_gate_cavern:make('twin_gate_cavern','双門の洞窟',cave,caveGeo,{branching:true,gateBonus:100,background:'/assets/maps/twin-gate-cavern-v1.webp',preview:'/assets/maps/twin-gate-cavern-preview-v1.webp',description:'近道か、施設への寄り道か。両方の門を通って城へ帰還。',lapSteps:[20,28]})
  };
  maps.starting_corridor.neighbors=legacy.map((_,i)=>[(i+27)%28,(i+1)%28]);
  function freeze(o){Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(o);}
  return freeze(maps);
});
