/* Rotation may grant fullscreen activation; otherwise retry on the next tap. */
window.PhoneOrientationFullscreen={create({enter,button}){
  const landscape=matchMedia('(orientation: landscape)'),touch=matchMedia('(pointer: coarse)');
  let pending=false,busy=false,manualExit=false,wasFullscreen=!!document.fullscreenElement;
  const supported=()=>typeof document.documentElement.requestFullscreen==='function';
  function hint(){button?.classList.toggle('fullscreenSuggested',pending);if(button)button.title=pending?'タップして全画面にする':'全画面';}
  async function attempt(){
    if(busy||manualExit||!landscape.matches||!touch.matches||!supported()||document.fullscreenElement)return;
    busy=true;try{const entered=await enter();pending=!entered&&landscape.matches&&!manualExit;}finally{busy=false;hint();}
  }
  function rotated(){if(!landscape.matches){pending=false;manualExit=false;hint();return;}attempt();}
  landscape.addEventListener('change',rotated);
  document.addEventListener('pointerup',event=>{if(event?.target?.closest?.('#fsBtn,#joinBtn'))return;if(pending)attempt();});
  document.addEventListener('fullscreenchange',()=>{const current=!!document.fullscreenElement;if(wasFullscreen&&!current){manualExit=true;pending=false;}if(current)pending=false;wasFullscreen=current;hint();});
  return {rotated};
}};
