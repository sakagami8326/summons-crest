// Approved Awakening Torrent, anchored to the actual board tile. No private-hand data.
(() => {
  const charge=new EvolutionChargeAudio(); let active=null;
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-Math.pow(1-clamp(x),3),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},noise=(i,n=0)=>{let x=Math.sin(i*127.1+n*311.7)*43758.5453;return x-Math.floor(x)};
  async function play(options) {
    active?.();
    const {bid,base}=options;
    if(!base?.evo || !/^[a-z0-9_]+$/.test(bid))return false;
    const before=new Image(),after=new Image();before.src='/assets/cards/c_'+bid+'.webp';after.src='/assets/cards/e_'+bid+'.webp';
    let cancelled=false,finish=()=>{cancelled=true};active=()=>finish();
    const loaded=await Promise.race([Promise.all([before.decode(),after.decode()]).then(()=>true,()=>false),new Promise(r=>setTimeout(()=>r(false),2000))]);
    if(cancelled||!loaded){if(!cancelled)active=null;return false;}
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    if(!ctx){active=null;return false;}
    canvas.id='evolutionFx';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',base.name+'から'+base.evo+'へ進化');
    canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:65;pointer-events:none';
    document.body.appendChild(canvas);
    let beamTop=0,beamHeight=720;
    const mode=0,defs=[{impact:2.4,color:'#ffc66a',rgb:'255,181,67'}];
function glow(x,y,r,color,a=1){if(r<=0||a<=0)return;ctx.save();ctx.globalAlpha*=a;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore()}
function ring(x,y,r,sy,rotation,alpha,color,detail=false){if(r<1||alpha<=0)return;ctx.save();ctx.translate(x,y);ctx.scale(1,sy);ctx.rotate(rotation);ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();if(detail){ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r*.9,0,Math.PI*2);ctx.stroke();for(let i=0;i<36;i++){const a=i*Math.PI/18;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.92,Math.sin(a)*r*.92);ctx.lineTo(Math.cos(a)*r*(i%3? .95:1.02),Math.sin(a)*r*(i%3?.95:1.02));ctx.stroke()}}ctx.restore()}
function star(x,y,size,a,color){ctx.save();ctx.globalAlpha*=a;ctx.translate(x,y);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.2,-size*.2);ctx.lineTo(size,0);ctx.lineTo(size*.2,size*.2);ctx.lineTo(0,size);ctx.lineTo(-size*.2,size*.2);ctx.lineTo(-size,0);ctx.lineTo(-size*.2,-size*.2);ctx.closePath();ctx.fill();ctx.restore()}
function sprite(img,size,y,a=1,filter='none',dx=0){ctx.save();ctx.globalAlpha*=clamp(a);ctx.filter=filter;ctx.drawImage(img,640-size/2+dx,y-size/2,size,size);ctx.restore()}
function beam(t,p,color){const strength=Math.sin(clamp(p)*Math.PI);ctx.save();ctx.globalCompositeOperation='lighter';const w=12+strength*105;const g=ctx.createLinearGradient(640-w,0,640+w,0);g.addColorStop(0,'transparent');g.addColorStop(.46,color);g.addColorStop(.5,'#fffceb');g.addColorStop(.54,color);g.addColorStop(1,'transparent');ctx.globalAlpha*=.8*strength;ctx.fillStyle=g;ctx.fillRect(640-w,beamTop,w*2,beamHeight);ctx.restore()}
function particles(t,d){const delta=t-d.impact,charge=clamp(t/d.impact);ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<130;i++){const angle=noise(i,6)*Math.PI*2,speed=150+noise(i,7)*600;let x,y,a,size;
 if(delta<0){const cycle=(t*(.6+noise(i,8)) + noise(i,9))%1,r=(1-cycle)*(500-130*charge)+25;x=640+Math.cos(angle)*r;y=350+Math.sin(angle)*r*.65;a=Math.sin(cycle*Math.PI)*charge;size=1+cycle*3}
 else{const r=delta*speed;x=640+Math.cos(angle)*r;y=330+Math.sin(angle)*r*.65+delta*delta*22;a=clamp(1-delta/2.2);size=2+noise(i,10)*4}
 ctx.strokeStyle=`rgba(${d.rgb},${a*.8})`;ctx.lineWidth=size*.55;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(angle)*(delta<0?12:28),y-Math.sin(angle)*(delta<0?9:20));ctx.stroke();star(x,y,size,a,d.color)}ctx.restore()}
function aura(t,d){const delta=t-d.impact,q=clamp(t/d.impact);glow(640,350,180+q*210,`rgba(${d.rgb},.24)`);ring(640,576,180+q*125,.2,t*.4,.25+q*.6,d.color,true);
 if(mode===0){for(let j=0;j<4;j++){const f=(t*.62+j*.25)%1;ring(640,570-f*460,90+f*180,.22,t*(j%2?1:-1),Math.sin(f*Math.PI)*q*.7,d.color)}beam(t,delta<0?q*.8:clamp(1-delta/1.0),d.color)}
 if(mode===2){ring(640,320,235+q*25,1,t*.14,q*.8,d.color,true);ring(640,320,280,1,-t*.11,q*.45,d.color,true);ctx.save();ctx.strokeStyle=d.color;ctx.globalAlpha*=q*.45;ctx.lineWidth=1;ctx.beginPath();for(let j=0;j<=6;j++){const a=j*4*Math.PI/6-Math.PI/2+t*.12;const x=640+Math.cos(a)*235,y=320+Math.sin(a)*235;j?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();ctx.restore();for(let i=0;i<8;i++){const a=i*Math.PI/4+t*.12;star(640+Math.cos(a)*280,320+Math.sin(a)*280,9+q*8,q,d.color)}if(delta>0){for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.save();ctx.globalAlpha*=clamp(1-delta/2)*.23;ctx.fillStyle=d.color;ctx.beginPath();ctx.moveTo(640,320);ctx.lineTo(640+Math.cos(a-.035)*850,320+Math.sin(a-.035)*850);ctx.lineTo(640+Math.cos(a+.035)*850,320+Math.sin(a+.035)*850);ctx.fill();ctx.restore()}}}}
function impact(t,d){const delta=t-d.impact;if(delta<0)return;ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<3;i++){const f=delta-i*.1;if(f<0||f>1.3)continue;ring(640,360,30+ease(f/1.3)*900,mode===1?.48:1,0,(1-f/1.3)*.75,d.color)}glow(640,340,350,`rgba(${d.rgb},.45)`,clamp(1-delta/1.2));ctx.restore()}
function caption(t,d){const delta=t-d.impact,show=smooth((delta-.5)/.5);ctx.save();ctx.textAlign='center';if(delta<-.12){ctx.globalAlpha*=smooth(t/.5)*(1-smooth((t-d.impact+.3)/.3));ctx.font='500 31px serif';ctx.fillStyle='#fff3d5';ctx.fillText(base.name,640,660)}if(show>0){ctx.globalAlpha*=show;const g=ctx.createLinearGradient(250,0,1030,0);g.addColorStop(0,'transparent');g.addColorStop(.25,'#121019ef');g.addColorStop(.75,'#121019ef');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(230,572,820,134);ctx.fillStyle=d.color;ctx.font='13px sans-serif';ctx.letterSpacing='5px';ctx.fillText('EVOLUTION',640,596);ctx.letterSpacing='0px';ctx.font='500 43px serif';ctx.shadowColor=d.color;ctx.shadowBlur=18;ctx.fillStyle='#fff2cc';ctx.fillText(base.evo,640,646);ctx.shadowBlur=0;ctx.font='16px sans-serif';ctx.fillStyle='#cfbea3';ctx.fillText(`AT ${base.st} → ${base.evoSt}    /    HP ${base.hp} → ${base.evoHp}`,640,681)}ctx.restore()}
function drawCreature(t){
  const d=defs[0],delta=t-d.impact,q=clamp(t/d.impact);
  if(delta<.12)sprite(before,440+q*32,353-q*8,1-smooth((delta+.18)/.3),`brightness(${1+q*q*1.8}) drop-shadow(0 0 ${8+q*17}px ${d.color})`);
  if(delta>=0){const r=ease(delta/.65);sprite(after,615-70*r,332,smooth(delta/.2),`drop-shadow(0 0 ${26-12*r}px ${d.color})`);}
}

    return new Promise(resolve=>{
      let raf=0,timer=0,done=false,impactPlayed=false;
      const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,speed=options.speed===2?2:1,prelude=reduced?0:.45,duration=reduced?1.2:prelude+5.8,start=performance.now();
      finish=()=>{if(done)return;done=true;cancelAnimationFrame(raf);clearTimeout(timer);charge.stop();canvas.remove();document.removeEventListener('visibilitychange',hidden);if(active===finish)active=null;resolve(true);};
      active=finish;
      const hidden=()=>{if(document.hidden)finish()};document.addEventListener('visibilitychange',hidden);
      function frame(now){
        if(done)return;
        try{
          const t=Math.min(duration,(now-start)/1000*speed),effectTime=Math.max(0,t-prelude);
          const point=options.anchor?.()||{x:innerWidth/2,y:innerHeight*.58,width:80};
          const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,1.5);
          if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
          ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
          const settle=reduced?0:smooth((effectTime-5)/.8);
          // The cinematic is framed in the viewport. Only the creature returns to the land.
          const scale=Math.min(w/1000,h/780)*.92,ox=w/2-640*scale,oy=h/2-360*scale;
          const darkness=reduced?.88:.92*smooth(t/prelude)*(1-settle);
          ctx.fillStyle=`rgba(4,5,12,${darkness})`;ctx.fillRect(0,0,w,h);
          if(t>=prelude){
            if(reduced){
              ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);sprite(after,545,332);caption(4,defs[0]);ctx.restore();
            }else{
              // Beam bounds are the inverse viewport bounds, never a fixed local rectangle.
              beamTop=-oy/scale;beamHeight=h/scale;
              const fade=1-smooth((effectTime-4.45)/.5),delta=effectTime-2.4;
              if(fade>0){
                ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.globalAlpha=fade;
                aura(effectTime,defs[0]);particles(effectTime,defs[0]);impact(effectTime,defs[0]);ctx.restore();
              }
              if(settle>0){
                const size=545*scale*(1-settle)+(point.width||80)*settle;
                const x=w/2*(1-settle)+point.x*settle;
                const y=(oy+332*scale)*(1-settle)+(point.y-(point.width||80)/2)*settle;
                ctx.drawImage(after,x-size/2,y-size/2,size,size);
              }else{
                ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
                if(delta>=0&&delta<.35){const amount=8*(1-delta/.35);ctx.translate(Math.sin(effectTime*130)*amount,Math.cos(effectTime*99)*amount*.5);}
                drawCreature(effectTime);ctx.restore();
              }
              // Flash is painted in viewport coordinates, covering HUD and board uniformly.
              if(delta>-.07&&delta<.36){
                ctx.fillStyle=`rgba(255,247,222,${Math.max(0,1-Math.abs(delta-.04)/.27)*.85})`;ctx.fillRect(0,0,w,h);
              }
              if(fade>0){ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.globalAlpha=fade;caption(effectTime,defs[0]);ctx.restore();}
            }
          }
          charge.update(effectTime,2.4,!reduced&&t>=prelude&&!!options.soundEnabled?.());
          if(!impactPlayed&&(reduced||effectTime>=2.4)){impactPlayed=true;options.onImpact?.();}
          if(t>=duration)finish();else raf=requestAnimationFrame(frame);
        }catch(e){console.warn('Evolution presentation fallback',e);finish();}
      }
      // A backgrounded/suspended renderer must not hold the presentation queue.
      timer=setTimeout(finish,duration*1000/speed+1200);raf=requestAnimationFrame(frame);
    });
  }
  window.SummonsEvolution={play,cancel:()=>active?.(),stopAudio:()=>charge.stop(),unlockAudio:()=>charge.unlock().catch(()=>false)};
})();
