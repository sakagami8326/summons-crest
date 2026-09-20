// Reuse the phone's current card markup and styles rather than designing preview cards.
const fs=require('fs'),path=require('path');
module.exports=root=>{
 const phone=fs.readFileSync(path.join(root,'public/phone.html'),'utf8');
 const slice=(a,b)=>{const start=phone.indexOf(a),end=phone.indexOf(b,start);if(start<0||end<0)throw Error('Card source marker missing: '+a);return phone.slice(start,end);};
 const css=slice('  .face {','  .face.back {')+slice('  .face.creatureCard {','  /* ULT確認 */');
 const functions=slice('function creatureEffectParts(', 'const afterUiPaint =')+slice('function bigCardHTML(', 'function shopPriceHTML(');
 const art=slice('const GLYPH =','let es = null');
 return `(()=>{
 window.mountExistingGameCards=state=>{
 const ELEM_MINI=ELEM,HAS_ART=new Set(state.catalog.artIds);
 ${art}
 ${functions}
 window.existingGameCardHTML=bigCardHTML;
 const cardCSS=${JSON.stringify(css)};
 window.gameCardRenderer={html:bigCardHTML,fit:fitCreatureNames,css:cardCSS};
 if(customElements.get('review-game-card'))return;
 customElements.define('review-game-card',class extends HTMLElement{
  connectedCallback(){
   if(this.shadowRoot)return;
   const renderer=window.gameCardRenderer;
   const root=this.attachShadow({mode:'open'});
   root.innerHTML='<style>:host{display:block;position:relative;width:100%;height:100%;pointer-events:none}*{box-sizing:border-box;font-family:var(--font-mincho)!important}.canvas{position:absolute;width:300px;height:470px;transform-origin:top left;--weapon-art-scale:.88;--font-mincho:"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif}'+renderer.css+'</style><div class="canvas">'+renderer.html(this.getAttribute('card-id'))+'</div>';
   const canvas=root.querySelector('.canvas');
   const resize=()=>{canvas.style.transform='none';renderer.fit(root);const scale=Math.min(this.clientWidth/300,this.clientHeight/470);canvas.style.left=(this.clientWidth-300*scale)/2+'px';canvas.style.top=(this.clientHeight-470*scale)/2+'px';canvas.style.transform='scale('+scale+')';};
   this.observer=new ResizeObserver(resize);this.observer.observe(this);resize();
  }
  disconnectedCallback(){this.observer?.disconnect();}
 });
 };
})();`;
};
