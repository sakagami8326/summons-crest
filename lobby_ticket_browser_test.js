const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','process','console','setInterval',source+'\nreturn {server,rooms};')(require,__dirname,process,{log:()=>{}},()=>{});
const out=path.join(__dirname,'output/qr-lobby-integration');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>G.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+G.server.address().port;
 const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
 try{
 for(const bot of [false,true]){
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript(()=>localStorage.setItem('sc_start_guide_v1','done'));
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/play');await p.locator(bot?'#titleBot':'#titleCreate').click();await p.locator('#mapSelectCreate').click();
  await p.waitForFunction(()=>state?.phase==='lobby');
  const room=await p.locator('#bigcode').innerText();assert.equal(await p.locator('#startBtn').isDisabled(),true);
  assert.equal(await p.locator('#lobby .ticketWordmark').innerText(),'SUMMONS CODE');
  assert.equal(await p.locator('#lt-tip').innerText(),'移動侵略で、相手の領地に切り込む。');
  assert.equal(await p.locator('#lt-count').innerText(),bot?'0 / 1':'0 / 4');
  assert.equal(await p.locator('#lobby .botSlot').count(),bot?3:0);
  assert.ok(await p.evaluate(()=>{const expected=document.createElement('div');expected.innerHTML=QR.svg(phoneUrlG,5);return document.getElementById('qrBox').innerHTML===expected.innerHTML;}));
  assert.match(await p.locator('#phoneUrl').textContent(),new RegExp('/phone\\?room='+room));
  const phones=[];
  for(let i=0;i<(bot?1:2);i++){
   const c=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});phones.push(c);
   const q=await c.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(base+'/phone?room='+room);
   await q.locator('#nameIn').fill('参加'+i);await q.locator('#joinBtn').click();await q.waitForFunction(()=>!!pid);
   await p.waitForFunction(n=>document.querySelectorAll('#lobby .humanSlot.isJoined').length===n,i+1);
   assert.equal(await p.locator('#lobby .arriving').count(),1);
   assert.equal(await p.locator('#startBtn').isDisabled(),!bot&&i===0);
  }
  await p.evaluate(()=>{window.__slot=document.querySelector('#lt-slots .isJoined');render();render();});
  assert.ok(await p.evaluate(()=>window.__slot===document.querySelector('#lt-slots .isJoined')),'repeated broadcasts preserve nodes and do not replay');
  await p.waitForTimeout(1300);
  assert.ok(await p.locator('#lobby .humanSlot.isJoined').first().evaluate(el=>{
   const glyph=getComputedStyle(el.querySelector('.slotGlyph')),halo=getComputedStyle(el.querySelector('.arrivalHalo'));
   return glyph.borderTopWidth==='0px'&&glyph.paddingLeft==='0px'&&halo.opacity==='0';
  }),'arrival ends without legacy player-name borders around the person icon');
  await p.screenshot({path:path.join(out,bot?'bot.png':'normal.png')});
  for(const [width,height] of [[1280,720],[1000,860]]){
   await p.setViewportSize({width,height});
   assert.ok(await p.locator('#lobbyCancel').evaluate(e=>{const r=e.getBoundingClientRect(),s=e.querySelector('svg').getBoundingClientRect();return Math.abs((r.left+r.right)-(s.left+s.right))<1&&Math.abs((r.top+r.bottom)-(s.top+s.bottom))<1;}));
   assert.ok(await p.locator('#startBtn').evaluate(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight&&r.right<=innerWidth;}));
   await p.screenshot({path:path.join(out,(bot?'bot':'normal')+'-'+width+'.png')});
  }
  await p.locator('#lt-next').click();assert.equal(await p.locator('#lt-summonerName').innerText(),'グリース');
  if(!bot)await p.waitForFunction(()=>document.getElementById('lt-summonerName').textContent==='レダーニ',null,{timeout:10000});
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.arrivalHalo').first().evaluate(e=>getComputedStyle(e).display),'none');
  await p.reload();await p.locator('#titleResume').click();await p.waitForFunction(()=>state?.phase==='lobby');
  assert.equal(await p.locator('#lobby .arriving').count(),0,'resume does not replay old arrivals');
  await p.locator('#lobbyGuide').click();await p.locator('.sc-guide-dialog').waitFor();await p.keyboard.press('Escape');
  await p.locator('#startBtn').click();await p.waitForFunction(()=>state?.phase==='select');assert.ok(await p.locator('#lobby').isHidden());
  const token=await p.evaluate(()=>boardToken);await fetch(base+'/api/close',{method:'POST',body:JSON.stringify({room,token})});
  await p.goto(base+'/play');await p.locator('#titleCreate').click();await p.locator('#mapSelectCreate').click();await p.waitForFunction(()=>state?.phase==='lobby');
  const closing=await p.locator('#bigcode').innerText();await p.locator('#lobbyCancel').click();await p.locator('#titleCreate').waitFor();
  assert.equal(G.rooms.has(closing),false,'close button closes the authenticated room');
  for(const c of phones)await c.close();await ctx.close();
 }
 assert.deepEqual(errors,[]);console.log('LOBBY TICKET BROWSER PASSED: real phone joins, normal/BOT, QR, duplicate updates, reconnect, guide, selection, responsive, centered close, reduced motion');
 }finally{await browser.close();G.server.closeAllConnections();await new Promise(r=>G.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
