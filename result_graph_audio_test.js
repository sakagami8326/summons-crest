const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('public/result-graph-audio.js','utf8');
let made=0,stopped=0,resumed=0;const contexts=[],oscillators=[];
class AudioContext {
 constructor(){this.currentTime=0;this.state='suspended';this.destination={};contexts.push(this);}
 resume(){resumed++;this.state='running';return Promise.resolve();}
 createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}},connect(){},disconnect(){}};}
 createOscillator(){made++;const pitches=[];const osc={pitches,frequency:{setValueAtTime(v){pitches.push(v);},setTargetAtTime(v){pitches.push(v);},exponentialRampToValueAtTime(v){pitches.push(v);}},connect(){},disconnect(){},start(){},stop(){stopped++;}};oscillators.push(osc);return osc;}
}
const root={AudioContext};new Function('window',source)(root);const a=root.createResultGraphAudio();
a.update(.1,true);assert.equal(made,0,'no unapproved AudioContext starts from animation');
a.unlock();assert.equal(resumed,1);a.reset();a.update(0,true);assert.equal(made,2);
for(let i=1;i<=120;i++)a.update(i/120,true);
assert.equal(made,2,'growth reuses the same oscillators, without repeated note attacks');
assert.equal(oscillators[0].pitches[0],220);assert.equal(oscillators[0].pitches.at(-1),1320);
assert.ok(oscillators[0].pitches.every((v,i,arr)=>i===0||v>=arr[i-1]),'pitch rises smoothly with graph progress');
contexts[0].currentTime=1;a.update(.2,false);assert.equal(made,2);assert.equal(stopped,2,'pause stops both sweep voices');
a.update(.3,true);assert.equal(made,4,'resume starts one new continuous sweep');
assert.ok(Math.abs(oscillators[2].pitches[0]-220*6**.3)<.001,'resume uses current progress pitch');
a.setMuted(true);contexts[0].currentTime=2;a.update(.5,true);a.finish();assert.equal(made,4,'mute covers completion too');
a.setMuted(false);a.reset();a.update(.5,true);assert.equal(made,6);a.finish();assert.equal(made,8);a.finish();assert.equal(made,8,'completion only once');
contexts[0].currentTime=3;a.reset();a.update(.02,true);assert.equal(made,10,'replay can start low again');
const noAudio={};new Function('window',source)(noAudio);const silent=noAudio.createResultGraphAudio();silent.unlock();silent.update(.5,true);silent.finish();silent.stop();
console.log('Result graph audio: progress, pause, mute, replay, finish and unavailable AudioContext passed');
