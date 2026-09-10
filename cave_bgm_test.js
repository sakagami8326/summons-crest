const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const board=fs.readFileSync('public/board.html','utf8');
const source=board.slice(board.indexOf('let bgmN ='),board.indexOf('// BGMが不意に止まった場合'));
class Audio {constructor(src=''){this.src=src;this.paused=true;this.currentTime=0;this.volume=1;this.muted=false;}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}}
const elements=new Map(),ctx=vm.createContext({Audio,state:null,Date,setInterval,clearInterval,document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{style:{},classList:{remove(){}}});return elements.get(id);}}});
vm.runInContext(source+'\nthis.api={initAudio,setBgm,restoreBoardBgm,crossfadeBgmTo,setAudioMuted,audioList,current:()=>bgmCur,cave:()=>caveBgm};',ctx);
(async()=>{
 const a=ctx.api;a.initAudio();a.setBgm('select');assert.ok(a.current().src.endsWith('bgm_select.mp3'));assert.equal(Object.keys(a.cave()).length,0);
 ctx.state={mapId:'starting_corridor',phase:'playing',players:[{points:1}],reachAt:9,target:10};a.restoreBoardBgm();assert.ok(a.current().src.endsWith('bgm_normal.mp3'));assert.equal(Object.keys(a.cave()).length,0);
 ctx.state.mapId='twin_gate_cavern';a.restoreBoardBgm();assert.ok(a.current().src.endsWith('cavern-normal-v1.mp3'));assert.ok(a.current().loop);assert.equal(a.current().volume,.35);assert.equal(a.current().preload,'none');
 ctx.state.players[0].points=9;a.restoreBoardBgm();assert.ok(a.current().src.endsWith('cavern-reach-v1.mp3'));
 a.setBgm('battle');assert.ok(a.current().src.endsWith('bgm_battle.mp3'));a.restoreBoardBgm(1);assert.ok(a.current().src.endsWith('cavern-reach-v1.mp3'));await new Promise(r=>setTimeout(r,55));assert.equal(a.current().volume,.35);
 a.setAudioMuted(true);assert.ok(a.audioList().every(track=>track.paused));a.setAudioMuted(false);assert.ok(!a.current().paused);
 ctx.state.players[0].bankrupt=true;a.restoreBoardBgm();assert.ok(a.current().src.endsWith('cavern-normal-v1.mp3'));
 ctx.state.mapId='starting_corridor';ctx.state.players[0].bankrupt=false;a.restoreBoardBgm();assert.ok(a.current().src.endsWith('bgm_reach.mp3'));
 a.setBgm('select');assert.ok(a.current().src.endsWith('bgm_select.mp3'));a.setBgm(null);assert.equal(a.current(),null);
 for(const kind of ['normal','reach'])assert.ok(fs.statSync(`public/assets/bgm-twin-gate-cavern-${kind}-v1.mp3`).size>0);
 console.log('CAVE BGM: map selection, reach, battle return, crossfade, mute and other-map regression passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
