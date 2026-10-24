'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),base='https://summonscode.jp';
const out=path.join(root,'output/release-sfx-20261024');fs.mkdirSync(out,{recursive:true});
const norm=s=>s.replace(/\r\n/g,'\n');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=['public/board.html','public/board_world.js','public/assets/se_attack_hit_b_v1.wav','public/assets/se_pawn_step_b_v1.wav'];
(async()=>{
 const report={at:new Date().toISOString(),base,routes:{},files:{}};
 const rev=Date.now();
 for(const route of ['/','/phone','/api/fixture','/play?guide=done']){
  const r=await fetch(base+route+(route.includes('?')?'&':'?')+'releasecheck='+rev);assert.equal(r.status,200,route);
  report.routes[route]=r.status;
  if(route==='/api/fixture'){report.version=(await r.json()).ver;assert.equal(report.version,'1.69');}
 }
 for(const file of files){
  const url=file==='public/board.html'?'/play?guide=done&':'/'+file.replace(/^public\//,'')+'?';
  const r=await fetch(base+url+'releasecheck='+rev);assert.equal(r.status,200,file);
  const text=file.endsWith('.html')||file.endsWith('.js');
  const actual=text?Buffer.from(norm(await r.text())):Buffer.from(await r.arrayBuffer());
  const expected=text?Buffer.from(norm(fs.readFileSync(path.join(root,file),'utf8'))):fs.readFileSync(path.join(root,file));
  assert.equal(hash(actual),hash(expected),file+' deployed bytes');
  report.files[file]={status:r.status,sha256:hash(actual),bytes:actual.length};
 }
 fs.writeFileSync(path.join(out,'live-assets.json'),JSON.stringify(report,null,2));
 console.log('PASS production routes, v'+report.version+', exact board/renderer and both WAV SHA256 hashes');
})().catch(e=>{console.error(e);process.exit(1)});
