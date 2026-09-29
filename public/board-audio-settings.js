/* Device-local preferences. Read before any board audio is initialized. */
(()=>{
 const key='sc_board_audio_v1',defaults={enabled:false,bgm:70,se:70};let value={...defaults};
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved){if(typeof saved.enabled==='boolean')value.enabled=saved.enabled;for(const name of ['bgm','se'])if(Number.isFinite(saved[name]))value[name]=Math.round(Math.max(0,Math.min(100,saved[name])));}}catch{}
 window.BoardAudioSettings={get value(){return {...value}},set(patch){for(const name of ['bgm','se'])if(Number.isFinite(patch[name]))value[name]=Math.round(Math.max(0,Math.min(100,patch[name])));if(typeof patch.enabled==='boolean')value.enabled=patch.enabled;try{localStorage.setItem(key,JSON.stringify(value));}catch{}return {...value}},defaults};
})();
