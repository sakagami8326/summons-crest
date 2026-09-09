// Run with NODE_PATH set to the bundled Playwright packages (same as v158_browser_test).
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','process','console','setInterval',src+'\nreturn {server,rooms};')(require,__dirname,process,{log:()=>{}},()=>{});
const out=path.join(__dirname,'output/start-guide');fs.mkdirSync(out,{recursive:true});
const phoneUA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
(async()=>{
  await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
  const errors=[];const watch=p=>p.on('pageerror',e=>errors.push(e.message));
  const post=async(url,body)=>(await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  try{
    const ctx=await browser.newContext({viewport:{width:1440,height:900}}),p=await ctx.newPage();watch(p);
    await p.goto(base+'/play');let f=p.frameLocator('.sc-guide-dialog iframe');
    await f.getByRole('heading',{name:'遊ぶ環境を選ぶ'}).waitFor();assert.equal(await f.locator('.choices>.choice').count(),3);
    await p.setViewportSize({width:1920,height:1080});
    assert.ok(await p.locator('.sc-guide-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.left-(innerWidth-r.right))<2&&Math.abs(r.top-(innerHeight-r.bottom))<2;}),'guide dialog is centered on wide screens');
    await p.screenshot({path:path.join(out,'desktop-centered-1080.png')});
    await p.setViewportSize({width:1440,height:900});
    await f.locator('h1').focus();await p.keyboard.press('ArrowDown');assert.equal(await f.locator('[data-action="method-pc"]').evaluate(el=>el===document.activeElement),true);
    await p.screenshot({path:path.join(out,'desktop.png')});
    await p.setViewportSize({width:1280,height:720});await p.screenshot({path:path.join(out,'desktop-720.png')});
    await f.locator('[data-action="method-pc-tv"]').click();await f.locator('[data-action="display-projector"]').click();
    await f.locator('[data-action="next"]').click();await f.getByRole('heading',{name:'PCをプロジェクターにつなぐ'}).waitFor();
    await p.screenshot({path:path.join(out,'projector.png')});
    await f.locator('[data-action="next"]').click();await f.locator('[data-action="next"]').click();
    await f.locator('[data-action="os-mac"]').click();assert.match(await f.locator('.step-copy').innerText(),/ミラーリング/);
    await f.locator('[data-action="choose"]').click();await f.locator('[data-action="stream"]').click();
    await f.locator('[data-action="method-google-tv"]').click();assert.equal(await f.locator('.badge.pending').count(),0);
    await f.locator('[data-action="next"]').click();assert.match(await f.locator('.step-copy').innerText(),/TV Bro/);
    await f.locator('[data-action="choose"]').click();await f.locator('[data-action="method-pc"]').click();
    await f.getByRole('heading',{name:'盤面側でルームを作る'}).waitFor();
    await f.locator('[data-action="next"]').click();
    await f.getByRole('heading',{name:'スマホでQRを読み取り、参加する'}).waitFor();
    await f.locator('.step-nav [data-action="finish"]').click();await p.locator('dialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>localStorage.getItem('sc_start_guide_v1')),'done');
    assert.equal(await p.evaluate(()=>document.activeElement.id),'titleCreate');
    await p.reload();assert.equal(await p.locator('dialog').count(),0);
    await p.locator('#titleGuide').click();f=p.frameLocator('iframe');await f.getByRole('heading',{name:'遊ぶ環境を選ぶ'}).waitFor();
    await f.locator('[data-action="method-pc"]').focus();await p.keyboard.press('ArrowRight');
    assert.notEqual(await f.locator('[data-action="method-pc"]').evaluate(el=>el===document.activeElement),true);
    await p.keyboard.press('Escape');await p.locator('dialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>document.activeElement.id),'titleGuide');
    await p.screenshot({path:path.join(out,'title.png')});
    const mobileCtx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:phoneUA});
    const m=await mobileCtx.newPage();watch(m);const requests=[];m.on('request',r=>requests.push(r.url()));
    await m.goto(base+'/play?screen=board');await m.getByRole('heading',{name:'遊ぶ環境を選ぶ'}).waitFor();assert.match(m.url(),/\/start/);
    assert.ok(!requests.some(u=>/board_world|phaser|full_redani|map-definitions/.test(u)));
    const imageBytes=await m.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.initiatorType==='img').reduce((n,r)=>n+r.encodedBodySize,0));assert.ok(imageBytes<100000);
    assert.equal(await m.locator('.footer>.button').count(),0);
    assert.equal(await m.locator('.guide-title').innerText(),'遊び方');
    assert.ok(await m.getByRole('button',{name:'遊び方をスキップ'}).isVisible());
    await m.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
    assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await m.setViewportSize({width:320,height:640});assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await m.screenshot({path:path.join(out,'mobile-320.png')});await m.setViewportSize({width:390,height:844});
    for(const route of ['pc','pc-tv','fire-tv','google-tv','unknown']) {await m.goto(base+'/start?method='+route);await m.locator('h1').waitFor();assert.equal(await m.locator('iframe').count(),0);if(route==='unknown')assert.equal(await m.locator('.choices>.choice').count(),3);}
    await m.goto(base+'/start?method=pc');await m.getByRole('heading',{name:'盤面側でルームを作る'}).waitFor();
    assert.equal(await m.locator('[data-action="copy"]').count(),0);assert.equal(await m.locator('#game-url').count(),0);
    assert.equal(await m.locator('.room-highlight').count(),2);
    await m.screenshot({path:path.join(out,'room-highlight.png'),fullPage:true});
    await m.locator('header [data-action="finish"]').click();
    await m.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('denied'))},configurable:true}));
    await m.locator('[data-action="copy"]').click();assert.match(await m.locator('#copy-status').innerText(),/URLを選択/);
    assert.match(await m.locator('h1').innerText(),/コントローラー/);assert.equal(await m.locator('[href^="/play"]').count(),0);
    await m.setViewportSize({width:844,height:390});await m.goto(base+'/start');assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const tablet=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605 Safari'});
    const t=await tablet.newPage();watch(t);await t.goto(base+'/play');await t.getByRole('heading',{name:'このタブレットをどう使いますか？'}).waitFor();
    await t.locator('[data-action="role-board"]').click();await t.locator('header [data-action="finish"]').click();await t.waitForURL(/screen=board/);
    await t.goto(base+'/play');await t.waitForURL(/screen=board/);assert.equal(await t.locator('dialog').count(),0);
    await t.locator('#titleGuide').click();const tf=t.frameLocator('iframe');await tf.locator('[data-action="role"]').click();await tf.locator('[data-action="role-phone"]').click();await t.waitForURL('**/phone');
    await t.locator('#joinGuide').click();await t.frameLocator('iframe').locator('[data-action="role"]').click();await t.frameLocator('iframe').locator('[data-action="role-board"]').click();await t.waitForURL(/screen=board/);
    const ipad=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18 Safari/605.1.15'});
    await ipad.addInitScript(()=>{Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});});
    const ip=await ipad.newPage();watch(ip);await ip.goto(base+'/play');await ip.getByRole('heading',{name:'このタブレットをどう使いますか？'}).waitFor();
    const noStorage=await browser.newContext();await noStorage.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('blocked');};Storage.prototype.getItem=function(){throw new Error('blocked');};});
    const n=await noStorage.newPage();watch(n);await n.goto(base+'/start?method=pc');await n.locator('header [data-action="finish"]').click();await n.waitForURL('**/play');assert.equal(await n.locator('dialog').count(),0);
    for(const ua of ['Mozilla/5.0 (Linux; Android 9; AFTMM) Silk/130 Mobile Safari','Mozilla/5.0 (Linux; Android 12; Chromecast) Chrome/130 Mobile Safari']){
      const c=await browser.newContext({viewport:{width:1280,height:720},userAgent:ua});const tv=await c.newPage();watch(tv);await tv.goto(base+'/play');await tv.frameLocator('iframe').getByRole('heading',{name:'遊ぶ環境を選ぶ'}).waitFor();assert.equal(new URL(tv.url()).pathname,'/play');await c.close();
    }
    // Exercise the actual board and phone controls for both human and BOT games.
    for(const bot of [false,true]) {
      await p.goto(base+'/play');await p.locator(bot?'#titleBot':'#titleCreate').click();await p.locator('#mapSelectCreate').click();await p.waitForFunction(()=>!!code);
      const code=await p.locator('#bigcode').innerText();const phones=[];
      for(let i=0;i<(bot?1:2);i++){
        const c=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,userAgent:phoneUA}),q=await c.newPage();watch(q);phones.push(q);
        await q.goto(base+(i===1?'/phone':'/phone?room='+code));await q.locator('#joinBtn').waitFor();assert.equal(await q.locator('dialog').count(),0);
        if(i===1){await q.locator('#codeIn').fill(code);}else{assert.ok(await q.locator('#codeIn').isHidden());}
        await q.setViewportSize({width:390,height:844});assert.ok(await q.locator('#rotate').isHidden());await q.setViewportSize({width:844,height:390});
        await q.locator('#nameIn').fill('案内'+i);await q.locator('#joinBtn').click();await q.waitForFunction(()=>!!pid);
      }
      await p.locator('#startBtn').click();
      for(let i=0;i<phones.length;i++) {const q=phones[i];await q.locator('#csRow [data-id="'+(i?'adel':'redani')+'"]').click();await q.locator('#charChoose').click();}
      await p.locator('#selectionStartBtn').click();await p.waitForFunction(()=>state?.phase==='playing');
      const q=phones[0],pid=await q.evaluate(()=>window.localStorage.getItem('sc_session'));
      await q.reload();await q.waitForFunction(()=>!!pid);assert.equal(await q.evaluate(()=>window.localStorage.getItem('sc_session')),pid);assert.equal(await q.locator('dialog').count(),0);
      const another=await post('/api/create',{});await q.goto(base+'/phone?room='+another.code);assert.ok(await q.locator('#join').isVisible());assert.equal(await q.locator('#codeIn').inputValue(),another.code);
      await post('/api/close',{room:another.code,token:another.boardToken});await q.reload();await q.locator('#codeIn').waitFor({state:'visible'});assert.match(await q.locator('#err').innerText(),/見つかりません/);
      await q.goto(base+'/phone?room=oops!');assert.match(await q.locator('#err').innerText(),/正しくありません/);
      const token=await p.evaluate(()=>boardToken);await post('/api/close',{room:code,token});for(const q of phones)await q.context().close();
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'START GUIDE BROWSER PASSED',initialMobileImageBytes:imageBytes,screenshots:out}));
  }finally{await browser.close();G.server.closeAllConnections();await new Promise(resolve=>G.server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
