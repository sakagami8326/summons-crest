// Preserve the approved source PNGs and precompute the same 512px browser render copies.
const fs=require('fs'),path=require('path'),{chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await b.newPage();
  for(const level of [1,2,3,4]){
   const source=path.join(root,`public/assets/tiles/land-lv${level}.png`),input=fs.readFileSync(source);
   const data=await p.evaluate(async href=>{const img=new Image();img.src=href;await img.decode();const c=document.createElement('canvas'),scale=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);const ctx=c.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];},'data:image/png;base64,'+input.toString('base64'));
   const file=path.join(root,`public/assets/tiles/land-lv${level}-render-v1.webp`);
   await sharp(Buffer.from(data,'base64')).webp({lossless:true,effort:6}).toFile(file);
   console.log(JSON.stringify({level,originalBytes:input.length,renderBytes:fs.statSync(file).size}));
  }
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
