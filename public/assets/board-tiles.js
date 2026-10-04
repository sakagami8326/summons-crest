// Generated PNG sprites remain unchanged. This adapter fits them to the board camera.
window.BoardTiles=(()=>{
 const images={},bounds={1:[107,259,1146,1058],2:[71,199,1182,1077],3:[74,202,1178,1109],4:[17,236,1237,1124]};
 // Inner stone face corners measured in each source PNG: back, right, front, left.
 // Using the image plane keeps runes aligned even when the gold braces change its apparent pitch.
 const faces={1:[[625,336],[979,552],[625,766],[276,552]],2:[[625,285],[959,502],[625,718],[291,502]],3:[[625,294],[946,488],[625,682],[305,488]],4:[[625,334],[988,519],[625,702],[267,519]]};
 // Visible contact corners measured on the bottom silhouette, not the top face.
 const contacts={1:[[107,701],[625,1058],[1146,704]],2:[[71,728],[625,1077],[1182,728]],3:[[74,720],[625,1109],[1178,720]],4:[[17,737],[625,1124],[1237,737]]};
 const sideBands={1:[[[300,687],[526,828]],[[735,828],[970,677]]],2:[[[338,650],[493,751]],[[754,752],[935,636]]],3:[[[362,673],[491,757]],[[755,749],[901,653]]],4:[[[334,706],[500,809]],[[752,812],[928,705]]]};
 function projection(level,geometry){
  const {DW,DH,THICK,TW,TH}=geometry;
  const assetLevel=Math.max(1,level),b=bounds[assetLevel],h=THICK+Math.max(0,level-1)*7,fitX=DW/(b[2]-b[0]+1),sourceFace=faces[assetLevel];
  const ref=faces[3],refBounds=bounds[3],refPitch=(ref[2][1]-ref[0][1])*(DH+THICK+14)/(refBounds[3]-refBounds[1]+1)/((ref[1][0]-ref[3][0])*DW/(refBounds[2]-refBounds[0]+1));
  const sy=assetLevel===4?fitX*(sourceFace[1][0]-sourceFace[3][0])*refPitch/(sourceFace[2][1]-sourceFace[0][1]):(DH+h)/(b[3]-b[1]+1);
  const offsetY=DH+h-(b[3]-b[1]+1)*sy;
  let sx=fitX,shear=0,tx=-b[0]*sx,ty=offsetY-b[1]*sy;
  if(assetLevel>=3){
   // Register both contact edges against the board axes. Keep the existing vertical
   // scale (level height), widening the flared foundation instead of flattening it.
   const [left,front,right]=contacts[assetLevel],pitch=TH/TW;
   const leftSlope=(front[1]-left[1])/(front[0]-left[0]),rightSlope=(front[1]-right[1])/(right[0]-front[0]);
   sx=sy*(leftSlope+rightSlope)/(2*pitch);
   shear=sy*(rightSlope-leftSlope)/2;
   tx=DW/2-front[0]*sx;
   ty=DH+h-sy-front[1]*sy-front[0]*shear;
  }
  const map=([x,y])=>[x*sx+tx,x*shear+y*sy+ty];
  return {assetLevel,b,h,sx,sy,offsetY,sourceFace,shear,tx,ty,map};
 }
 function ground(level,geometry){
  const p=projection(level,geometry),points=contacts[p.assetLevel].map(p.map),front=points[1];
  return {points,angles:[points[0],points[2]].map(v=>Math.atan2(front[1]-v[1],Math.abs(front[0]-v[0]))*180/Math.PI),rise:Math.max(0,level-1)*7};
 }
 let loaded=false;
 // Decode once and embed a render copy; original PNGs and alpha remain unchanged.
 // SVG-as-image cannot load external images, so both renderers share data URLs.
 const ready=(async()=>{
  let timer;
  const load=Promise.all([1,2,3,4].map(level=>new Promise((resolve,reject)=>{
   const img=new Image();
   img.onload=()=>{
    try{
     const canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight));
     canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
     const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,canvas.width,canvas.height);
     images[level]={width:img.naturalWidth,height:img.naturalHeight,href:canvas.toDataURL('image/png')};resolve(true);
    }catch(error){reject(error);}
   };
   img.onerror=()=>reject(new Error('Tile asset unavailable: '+level));
   img.src='/assets/tiles/land-lv'+level+'.png';
  })));
  try{
   loaded=await Promise.race([load.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),10000);})]);
  }catch(error){loaded=false;console.warn('Board tiles: using fallback.',error.message);}
  finally{clearTimeout(timer);}
  return loaded;
 })();
 function svg(i,t,o,ownColor,barrier,pad,geometry){
  const {DW,DH,THICK,ELEM}=geometry;
  const land=t.t==='land',level=land?(o?.level||0):0,assetLevel=Math.max(1,level),a=images[assetLevel],b=bounds[assetLevel],h=THICK+Math.max(0,level-1)*7,cx=DW/2,cy=DH/2;
  const col=({fire:'#ff7a45',water:'#65b9f2',earth:'#e1c45e',wind:'#59e6c5',neutral:'#c9b9ef'})[t.e]||'#c9b9ef';
  const {sx,sy,shear,tx,ty,sourceFace,map}=projection(level,geometry);
  const id='raster-tile-'+i;
  const defs=`<defs><filter id="${id}-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.25"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  const image=`<image href="${a.href}" width="${a.width}" height="${a.height}" transform="matrix(${sx} ${shear} 0 ${sy} ${tx} ${ty})" preserveAspectRatio="none"/>`;
  const face=sourceFace.map(map);
  const center=face.reduce((v,p)=>[v[0]+p[0]/4,v[1]+p[1]/4],[0,0]);
  let attributeColor='';
  if(land){
   const lines=sideBands[assetLevel].map(segment=>segment.map(map).map((p,j)=>(j?'L':'M')+p.join(' ')).join(' ')).join(' ');
   attributeColor=`<g data-tile-color="band"><path d="${lines}" fill="none" stroke="#070d16" stroke-width="4.1" opacity=".65"/><path d="${lines}" fill="none" stroke="${col}" stroke-width="2.5" filter="url(#${id}-glow)"/><path d="${lines}" fill="none" stroke="#f4fffc" stroke-width=".55" opacity=".55"/></g>`;
  }
  const horizontal=[(face[1][0]-face[3][0])/2,(face[1][1]-face[3][1])/2],vertical=[(face[2][0]-face[0][0])/2,(face[2][1]-face[0][1])/2];
  const logoScale=.94/horizontal[0];
  const matrix=`matrix(${horizontal[0]*logoScale} ${horizontal[1]*logoScale} ${vertical[0]*logoScale} ${vertical[1]*logoScale} ${center[0]} ${center[1]})`;
  const glyph=ELEM[t.e]||`<path d="M0 -26 21 0 0 26 -21 0Z" fill="none" stroke="${col}" stroke-width="6"/><path d="M0 -10 8 0 0 10 -8 0Z" fill="${col}"/>`;
  const inset=face.map(p=>p.map((v,axis)=>center[axis]+(v-center[axis])*.83));
  const border=inset.map((p,j)=>(j?'L':'M')+p.join(' ')).join(' ')+' Z';
  const ticks=inset.map(p=>`M${p.join(' ')} L${p.map((v,axis)=>center[axis]+(v-center[axis])*.85).join(' ')}`).join(' ');
  const channels=level?`<g stroke="${col}" fill="none" filter="url(#${id}-glow)" opacity="${level>=3?.82:.65}"><path d="${border}" stroke-width=".8"/><path d="${ticks}" stroke-width=".8"/></g>`:'';
  const logo=land?`<g data-tile-logo="${t.e}" transform="${matrix}" filter="url(#${id}-glow)" opacity="${level?.98:.63}">${glyph}</g>`:'';
  const owner=land&&o?`<g transform="translate(${cx} ${DH+h*.62})"><path d="M0 -3.8 5 0 0 3.8 -5 0Z" fill="${ownColor}" stroke="#efdcb0" stroke-width=".6"/><path d="M-5 0 0 3.8 0 0Z" fill="#000" opacity=".25"/></g>`:'';
  const barrierLine=barrier?`<path d="M${cx} 1 L${DW-2} ${cy} L${cx} ${DH-1} L2 ${cy} Z" fill="none" stroke="#bceaff" stroke-width="1" filter="url(#${id}-glow)"/>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DW+pad*2}" height="${DH+h+pad*2}" viewBox="${-pad} ${-pad} ${DW+pad*2} ${DH+h+pad*2}" overflow="visible">${defs}${image}${attributeColor}${channels}${logo}${owner}${barrierLine}</svg>`;
 }
 return {ready,svg,ground,get revision(){return loaded?'raster-band-v1':'fallback';},get loaded(){return loaded;}};
})();
