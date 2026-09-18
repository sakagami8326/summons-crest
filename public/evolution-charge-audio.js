// Energy charge follows presentation time, including pause, seeking and slow playback.
(() => {
  const clamp = x => Math.max(0, Math.min(1, x));
  function makeVoice(ctx, destination) {
    const bus = ctx.createGain(); bus.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value=-15; limiter.knee.value=14; limiter.ratio.value=5;
    limiter.attack.value=.004; limiter.release.value=.12;
    bus.connect(limiter); limiter.connect(destination);
    const sources=[],nodes=[bus,limiter];
    function tone(type,frequency,volume,detune=0) {
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=type;osc.frequency.value=frequency;osc.detune.value=detune;gain.gain.value=volume;
      osc.connect(gain);gain.connect(bus);osc.start();sources.push(osc);nodes.push(gain);
      return {osc,gain};
    }
    const bass=tone('sine',46,.28),body=tone('triangle',95,.13,-5),twin=tone('sine',96,.18,5),shine=tone('sine',285,.025);
    const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),data=buffer.getChannelData(0);
    let seed=162,low=0;
    for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;low=.88*low+.12*(seed/2147483648-1);data[i]=low*2.7;}
    const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),air=ctx.createGain();
    noise.buffer=buffer;noise.loop=true;filter.type='bandpass';filter.Q.value=.65;filter.frequency.value=420;air.gain.value=.15;
    noise.connect(filter);filter.connect(air);air.connect(bus);noise.start();sources.push(noise);nodes.push(filter,air);
    function params(q) {
      q=clamp(q);const rise=q*q,fadeIn=clamp(q/.09),release=clamp((1-q)/.035);
      return {pitch:92*Math.pow(6.4,rise),bass:46+25*q,cutoff:420+3900*rise,
        gain:(.12+.53*Math.pow(q,1.35))*fadeIn*release,
        air:.10+.42*rise,shine:.018+.07*rise};
    }
    function set(q,when=ctx.currentTime,smooth=true) {
      const p=params(q),apply=(a,v)=>smooth?a.setTargetAtTime(v,when,.018):a.setValueAtTime(v,when);
      apply(body.osc.frequency,p.pitch);apply(twin.osc.frequency,p.pitch*1.008);
      apply(bass.osc.frequency,p.bass);apply(shine.osc.frequency,p.pitch*3);
      apply(filter.frequency,p.cutoff);apply(air.gain,p.air);apply(shine.gain.gain,p.shine);
      // A soft, accelerating pulse suggests increasing pressure without hard clicking.
      const pulse=1-.13*(.5+.5*Math.sin(2*Math.PI*(2*q+9*q*q)));
      apply(bus.gain,p.gain*pulse);
    }
    let stopped=false;
    function stop(){if(stopped)return;stopped=true;const now=ctx.currentTime;bus.gain.cancelScheduledValues(now);bus.gain.setTargetAtTime(0,now,.012);
      sources.forEach(s=>{s.onended=()=>{s.disconnect();};s.stop(now+.08)});
      sources[0].addEventListener('ended',()=>nodes.forEach(n=>n.disconnect()));}
    return {set,stop,params};
  }
  class EvolutionChargeAudio {
    constructor(){this.context=null;this.voice=null;}
    async unlock(){const A=window.AudioContext||window.webkitAudioContext;if(!A)return false;
      this.context ||= new A();if(this.context.state==='suspended')await this.context.resume();return this.context.state==='running';}
    update(t,duration,enabled){if(!enabled||t>=duration||!this.context||this.context.state!=='running'){this.stop();return;}
      this.voice ||= makeVoice(this.context,this.context.destination);this.voice.set(t/duration);}
    stop(){if(this.voice){this.voice.stop();this.voice=null;}}
  }
  window.EvolutionChargeAudio=EvolutionChargeAudio;
  window.makeEvolutionChargeVoice=makeVoice;
})();
