// Entry routing and lightweight guide contracts. No browser dependency.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const D=require('./public/assets/start-guide/device');
const cases=[
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari','iPhone',5,'phone'],
  ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari','Linux arm',5,'phone'],
  ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)','iPad',5,'tablet'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605 Safari','MacIntel',5,'tablet'],
  ['Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/130 Safari','Linux',5,'tablet'],
  ['Mozilla/5.0 (Linux; Android 9; AFTMM) Silk/130 Mobile Safari','Linux',0,'tv'],
  ['Mozilla/5.0 (Linux; Android 12; Chromecast) Chrome/130 Mobile Safari','Linux',0,'tv'],
  ['Mozilla/5.0 (Linux; Android 11) TV Bro Mobile Safari','Linux',0,'tv'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130','Win32',10,'desktop']
];
for(const [ua,platform,touch,want]of cases)assert.equal(D.classify(ua,platform,touch),want);
const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','process','console','setInterval',src+'\nreturn {server};')(require,__dirname,process,{log:()=>{}},()=>{});
(async()=>{
  await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+G.server.address().port;
  try{
    for(const [ua,, ,want]of cases.filter((_,i)=>i!==3)) {
      const r=await fetch(base+'/play',{headers:{'User-Agent':ua},redirect:'manual'});
      assert.match(r.headers.get('vary'),/User-Agent/);
      if(want==='phone'||want==='tablet'){assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/start?entry=1');assert.equal(r.headers.get('cache-control'),'no-store');}
      else {assert.equal(r.status,200);assert.match(await r.text(),/id="titleCreate"/);}
    }
    const blocked=await fetch(base+'/play?screen=board',{headers:{'User-Agent':cases[0][0]},redirect:'manual'});assert.equal(blocked.status,302);
    const tablet=await fetch(base+'/play?screen=board',{headers:{'User-Agent':cases[2][0]}});assert.match(await tablet.text(),/id="titleCreate"/);
    const guide=await (await fetch(base+'/start')).text();assert.ok(!/board_world|phaser|full_redani/.test(guide));
    for(const file of ['device.js','guide.js','guide.css','entry.js','entry.css']) assert.equal((await fetch(base+'/assets/start-guide/'+file)).status,200);
    const scripts=fs.statSync(path.join(__dirname,'public/assets/start-guide/guide.js')).size+fs.statSync(path.join(__dirname,'public/assets/start-guide/guide.css')).size;
    assert.ok(scripts<70000,'guide code stays dependency-free and small');
    console.log('START GUIDE: device/routing/asset checks passed');
  }finally{await new Promise(resolve=>G.server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
