const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('public/phone.html','utf8');
const helper=html.slice(html.indexOf('async function enterPhoneFullscreen()'),html.indexOf("$('fsBtn').onclick = toggleFullscreen;"));
const join=html.slice(html.indexOf("$('joinBtn').onclick = async () => {"),html.indexOf('function readSavedSession()'));
async function check(mode){
 const calls=[],els={joinBtn:{},err:{},codeIn:{value:'abcd'},nameIn:{value:'参加者'}};
 const c={document:{fullscreenElement:mode==='already'?{}:null,documentElement:{},exitFullscreen:async()=>calls.push('exit')},
 screen:{orientation:{lock:async orientation=>{calls.push(orientation);if(mode==='lockDenied')throw Error('unsupported');}}},
 cancelHandGesture(){},$:(id)=>els[id],presetRoom:null,room:null,pid:null,window:{},
 localStorage:{setItem(){}},enterGame:()=>calls.push('joined'),
 fetch:async(url,opts)=>{calls.push('fetch');assert.equal(url,'/api/join');assert.deepEqual(JSON.parse(opts.body),{room:'ABCD',name:'参加者'});return{json:async()=>mode==='joinError'?{error:'ルームがありません'}:{room:'ABCD',playerId:'p'}};}};
 if(mode!=='unsupported')c.document.documentElement.requestFullscreen=options=>{
  calls.push('fullscreen');assert.equal(options.navigationUI,'hide');
  if(mode==='throws')throw Error('denied');
  if(mode==='denied')return Promise.reject(Error('denied'));
  if(mode==='pending')return new Promise(()=>{});
  c.document.fullscreenElement={};return Promise.resolve();
 };
 vm.createContext(c);vm.runInContext(helper+join,c);
 await els.joinBtn.onclick();await Promise.resolve();
 assert.equal(calls.includes('exit'),false,'joining never toggles fullscreen off');
 if(!['unsupported','already'].includes(mode))assert(calls.indexOf('fullscreen')<calls.indexOf('fetch'),'fullscreen starts synchronously before network');
 assert.equal(calls.includes('joined'),mode!=='joinError','join succeeds independently of fullscreen and orientation');
 if(['normal','already','lockDenied','joinError'].includes(mode))assert(calls.includes('landscape'));
 if(mode==='joinError')assert.equal(els.err.textContent,'ルームがありません');
 if(mode==='normal'){await c.toggleFullscreen();assert(calls.includes('exit'),'manual toggle can still exit');}
}
(async()=>{for(const m of ['normal','already','unsupported','denied','throws','pending','lockDenied','joinError'])await check(m);console.log('PASS phone join fullscreen: tap-before-network, landscape, already fullscreen, unsupported/rejected/pending APIs, join errors and manual exit');})().catch(e=>{console.error(e);process.exitCode=1;});
