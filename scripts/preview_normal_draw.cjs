'use strict';
const fs=require('fs'),path=require('path'),{G}=require('../battle_presentation_test');
const handler=G.server.listeners('request')[0];G.server.removeAllListeners('request');
G.server.on('request',(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/preview/normal-draw'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  return res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>通常ドロープレビュー</title><style>*{box-sizing:border-box}body{margin:0;background:#080d15;color:#f1e6cd;font-family:serif}header{padding:15px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}button,select{font:inherit;padding:9px 14px;background:#14202c;color:inherit;border:1px solid #ac9462}main{display:grid;place-items:center;min-height:calc(100vh - 80px)}iframe{border:1px solid #ac946244;width:844px;height:390px;max-width:100vw}small{color:#b6ad98}</style><header><b>通常ドロー</b><button id="replay">もう一度再生</button><select id="card"><option value="suminoko">スミノコ</option><option value="suminoko_f">クロムクロ</option><option value="weapon">ソード</option><option value="sp_gold">ゴールド</option></select><select id="size"><option value="844,390">844×390</option><option value="667,375">667×375</option><option value="896,414">896×414</option></select><small>採用裏面 → カード表面</small></header><main><iframe title="通常ドローの実画面" src="/phone?fixture=result&normal-draw-preview=1"></iframe></main><script>const f=document.querySelector('iframe');function replay(){f.contentWindow.replayNormalDraw?.(document.querySelector('#card').value)}document.querySelector('#replay').onclick=replay;document.querySelector('#card').onchange=replay;document.querySelector('#size').onchange=e=>{const [w,h]=e.target.value.split(',');f.style.width=w+'px';f.style.height=h+'px';replay()};</script></html>`);
 }
 if(u.pathname==='/phone'&&u.searchParams.has('normal-draw-preview')){
  const script=`<script>window.replayNormalDraw=(card='suminoko')=>{clearTimeout(revealT);revealQueue=[];revealCurrent=null;enqueueCardReveal([card],'draw')};addEventListener('load',()=>{const t=setInterval(()=>{if(typeof state==='undefined'||!state?.catalog)return;clearInterval(t);replayNormalDraw();},100)});<\/script>`;
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'../public/phone.html'),'utf8').replace('</body>',script+'</body>'));
 }
 return handler(req,res);
});
G.server.listen(4375,'127.0.0.1',()=>console.log('Normal draw: http://127.0.0.1:4375/preview/normal-draw'));
