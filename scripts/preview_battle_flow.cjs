'use strict';
const fs=require('fs'),path=require('path'),{G,fixture}=require('../battle_presentation_test');
const handler=G.server.listeners('request')[0];G.server.removeAllListeners('request');
G.server.on('request',(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/preview/battle-data'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(fixture(u.searchParams.get('mode')||'pick',u.searchParams.get('scenario')||'swordgear')));}
 if(u.pathname==='/preview/battle-flow'){
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>戦闘表示プレビュー</title><style>body{margin:0;background:#080d15;color:#eee6d2;font-family:serif}header{padding:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}button,select{padding:8px;background:#16212d;color:inherit;border:1px solid #9b8351}iframe{display:block;width:100vw;height:calc(100vh - 66px);border:0}</style><header><b>戦闘表示プレビュー</b><select id="scenario"><option value="swordgear">ソードギア／炭鎧</option><option value="survive">生還</option><option value="dead">破壊</option></select><button data-mode="pick">クリーチャー選択前</button><button data-mode="support">ウェポン選択中</button><button data-mode="result">公開から戦闘終了まで再生</button></header><iframe title="実際の戦闘画面" src="/play?fixture=1&guide=done&battle-flow=pick"></iframe><script>const f=document.querySelector('iframe');document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>f.src='/play?fixture=1&guide=done&battle-flow='+b.dataset.mode+'&scenario='+document.querySelector('select').value);</script></html>`);
 }
 if((u.pathname==='/play'||u.pathname==='/board')&&u.searchParams.has('battle-flow')){
 const script=`<script>addEventListener('load',()=>{const t=setInterval(async()=>{if(typeof state==='undefined'||!state?.catalog)return;clearInterval(t);const q=new URLSearchParams(location.search),mode=q.get('battle-flow'),d=await fetch('/preview/battle-data?mode='+mode+'&scenario='+(q.get('scenario')||'swordgear')).then(r=>r.json());state=d.state;activeBattleKey=null;battlePlayingKey=null;activeBattleData=null;renderBattlePreview(state.battlePreview);document.querySelector('#battle').classList.add('on');window.battleFlowReady=true;if(d.result){await playBattle(d.result);window.battleFlowDone=true;}},100);});<\/script>`;
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'../public/board.html'),'utf8').replace('</body>',script+'</body>'));
 }
 return handler(req,res);
});
G.server.listen(4374,'127.0.0.1',()=>console.log('Battle preview: http://127.0.0.1:4374/preview/battle-flow'));
