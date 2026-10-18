'use strict';
// Local, read-only previews of the actual board/phone components. Not a game route.
const fs=require('fs'),path=require('path'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..'),gameRequire=createRequire(path.join(root,'server.js'));
const source=fs.readFileSync(path.join(root,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',source+';return {server,makeFixtureRoom,resolveTile,publicState};')
 (gameRequire,root,()=>0,()=>0);
function fixture(evolved,phone){
 const r=G.makeFixtureRoom();r.turn=0;r.phase='playing';r.pending={};r.turnTransition=r.windSupply=r.shopVisit=null;
 r.owners.fill(null);r.elemOv={21:'fire'};r.curses={};r.tileFx={};r.barrier={};r.botMode=false;
 for(const key of Object.keys(r))if(key.startsWith('last'))r[key]=null;
 r.players[0].pos=21;r.players[0].hand=['magado','weapon','gecko'];r.players[0].gold=500;
 r.players[1].charId='redani';r.players[1].name='レダーニ';
 r.owners[21]={player:'fx1',creature:'hibami',level:evolved?3:1,dmg:0};
 G.resolveTile(r,r.players[0]);for(const pd of Object.values(r.pending))pd.availableAt=0;
 return G.publicState(r,phone?'fx0':null);
}
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>炎威 メッセージプレビュー</title>
<style>*{box-sizing:border-box}body{margin:0;background:#080d15;color:#eee6d2;font-family:'Yu Mincho',serif}header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid #c5ad7355}h1{font-size:17px;margin:0 14px 0 0}button,a{background:#121d29;border:1px solid #8e805c;color:inherit;padding:8px 14px;font:14px inherit;cursor:pointer;text-decoration:none}button[aria-pressed=true]{background:#e3ca89;color:#10131c}small{color:#b5b1a5}main{height:calc(100dvh - 100px);display:grid;place-items:center;padding:10px}iframe{width:100%;height:100%;border:0;background:#080d15}main.phone iframe{width:844px;max-width:100%;height:390px;max-height:100%}p{margin:8px 20px;font-size:12px;color:#b5b1a5}</style>
<header><h1>【炎威】メッセージプレビュー</h1><button data-stage="base">ヒバミ −10</button><button data-stage="evolved">エンラージャ −20</button><button data-view="board">テレビ盤面</button><button data-view="phone">スマホ画面</button><a href="/cards?card=hibami#catalog" target="_blank">カード図鑑</a></header><p>実際のゲーム画面を使用した表示確認用です。ここでの操作は対戦に反映されません。</p><main><iframe title="ゲーム内メッセージ" allow="autoplay"></iframe></main>
<script>let stage='base',view='board';const q=new URLSearchParams(location.search);if(q.get('stage')==='evolved')stage='evolved';if(q.get('view')==='phone')view='phone';function show(){document.querySelector('main').className=view;document.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.stage===stage));document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));document.querySelector('iframe').src=(view==='phone'?'/phone?fixture=result':'/play?fixture=1&guide=done')+'&hibami-preview=1&stage='+stage;history.replaceState(null,'','?stage='+stage+'&view='+view)}document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>{stage=b.dataset.stage;show()});document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;show()});show();</script></html>`;
const handler=G.server.listeners('request')[0];G.server.removeAllListeners('request');
G.server.on('request',(req,res)=>{
 const url=new URL(req.url,'http://localhost'),referer=new URL(req.headers.referer||'http://localhost');
 if(url.pathname==='/preview/hibami'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(page);}
 if(url.pathname==='/api/fixture'&&referer.searchParams.has('hibami-preview')){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  return res.end(JSON.stringify(fixture(referer.searchParams.get('stage')==='evolved',referer.pathname==='/phone')));
 }
 if(url.pathname==='/api/action'&&referer.searchParams.has('hibami-preview')){
  res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');
 }
 return handler(req,res);
});
if(require.main===module)G.server.listen(Number(process.env.PORT||4372),'127.0.0.1',()=>console.log('Hibami preview: http://127.0.0.1:'+G.server.address().port+'/preview/hibami'));
module.exports={server:G.server,fixture};
