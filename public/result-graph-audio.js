// A continuous, progress-driven rising sweep. No repeated note attacks during growth.
(function (root) {
  'use strict';
  root.createResultGraphAudio = function () {
    let context = null, muted = false, sweep = null, completed = false;
    const voices = new Set();
    function unlock() {
      const AudioContext = root.AudioContext || root.webkitAudioContext;
      if (!AudioContext || muted) return;
      try {
        if (!context) context = new AudioContext();
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch (_) { /* Sound must never block result playback. */ }
    }
    function stop() {
      if (!context) return;
      for (const voice of voices) {
        try {
          voice.gain.gain.cancelScheduledValues(context.currentTime);
          voice.gain.gain.setTargetAtTime(0, context.currentTime, .008);
          voice.osc.stop(context.currentTime + .035);
        } catch (_) {}
      }
      voices.clear();
      sweep = null;
    }
    function tone(frequency, length, volume) {
      if (!context || context.state !== 'running' || muted) return;
      const now = context.currentTime, osc = context.createOscillator(), gain = context.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.018, now + length);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + length);
      osc.connect(gain); gain.connect(context.destination);
      const voice = { osc, gain }; voices.add(voice);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); voices.delete(voice); };
      osc.start(now); osc.stop(now + length + .025);
    }
    function update(progress, active) {
      if (!active || muted) { stop(); return; }
      if (completed || !context || context.state !== 'running') return;
      const now = context.currentTime;
      const frequency = 220 * Math.pow(6, Math.min(1, Math.max(0, progress)));
      if (!sweep) {
        sweep = [1, 2].map((harmonic, i) => {
          const osc = context.createOscillator(), gain = context.createGain();
          osc.type = 'sine'; osc.frequency.setValueAtTime(frequency * harmonic, now);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(i === 0 ? .012 : .0017, now + .12);
          osc.connect(gain); gain.connect(context.destination);
          const voice = { osc, gain, harmonic }; voices.add(voice);
          osc.onended = () => { osc.disconnect(); gain.disconnect(); voices.delete(voice); };
          osc.start(now);
          return voice;
        });
      }
      sweep.forEach(voice => voice.osc.frequency.setTargetAtTime(frequency * voice.harmonic, now, .045));
    }
    return {
      unlock, update, stop,
      reset() { stop(); completed = false; },
      setMuted(value) { muted = !!value; if (muted) stop(); else unlock(); },
      finish() {
        if (completed) return;
        completed = true; stop();
        tone(880, .23, .013); tone(1320, .27, .006);
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
