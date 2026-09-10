const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','process','console','setInterval',src+'\nreturn {server};')(require,__dirname,process,{log:()=>{}},()=>{});
const out=path.join(__dirname,'output/site-audio-news');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(resolve=>G.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+G.server.address().port;
 const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
 const watch=p=>p.on('pageerror',e=>errors.push(e.message));
 try{
  const news=require('./site-news');
  const home=await (await fetch(base)).text();assert.equal((home.match(/class="news-row"/g)||[]).length,3);assert.ok(!home.includes('NEWS_LATEST'));
  for(const [filter,count]of [['',4],['notice',2],['update',2],['bad',4]]){const r=await fetch(base+'/news?category='+filter);assert.equal(r.status,200);assert.equal(((await r.text()).match(/class="news-row"/g)||[]).length,count);}
  const a=await fetch(base+'/news?category=notice'),b=await fetch(base+'/news?category=update',{headers:{'If-None-Match':a.headers.get('etag')}});assert.equal(b.status,200);assert.notEqual(a.headers.get('etag'),b.headers.get('etag'));
  for(const e of news.entries){const r=await fetch(base+'/news/'+e.slug),s=await r.text();assert.equal(r.status,200);assert.ok(s.includes(e.title));assert.ok(s.includes('news-category--'+e.category));assert.ok(s.includes('href="/news"'));assert.ok(s.includes('rel="canonical"'));}
  assert.equal((await fetch(base+'/news/no-such-article')).status,404);
  const p=await browser.newPage({viewport:{width:1440,height:900}});watch(p);const requests=[];p.on('request',r=>requests.push(r.url()));
  await p.goto(base);await p.locator('.site-audio-gate').waitFor();assert.equal(requests.filter(u=>u.includes('bgm_select')).length,0);
  await p.screenshot({path:path.join(out,'sound-choice.png')});await p.locator('[data-audio="off"]').click();assert.equal(await p.evaluate(()=>document.activeElement.tagName),'MAIN');
  await p.locator('#news').scrollIntoViewIfNeeded();await p.waitForFunction(()=>getComputedStyle(document.querySelector('#news .section-heading')).opacity==='1');await p.screenshot({path:path.join(out,'home-news.png')});
  await p.getByRole('link',{name:'更新情報一覧を見る'}).click();assert.equal(await p.locator('.site-audio-gate').count(),0);assert.equal(await p.locator('.news-row').count(),4);assert.equal(requests.filter(u=>u.includes('bgm_select')).length,0);
  await p.getByRole('link',{name:'アップデート',exact:true}).click();assert.equal(await p.locator('.news-row').count(),2);
  await p.screenshot({path:path.join(out,'news-list.png')});await p.locator('.news-row').first().click();await p.screenshot({path:path.join(out,'article.png')});
  await p.locator('.site-bgm').click();await p.waitForFunction(()=>document.querySelector('.site-bgm').textContent==='BGM ON');assert.ok(requests.some(u=>u.includes('bgm_select')));
  await p.waitForFunction(()=>JSON.parse(sessionStorage.getItem('sc_site_audio_v1')).position>.5);
  const position=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('sc_site_audio_v1')).position);
  await p.goto(base+'/cards');assert.equal(await p.locator('.site-audio-gate').count(),0);
  await p.waitForFunction(()=>['BGM ON','BGMを再開'].includes(document.querySelector('.site-bgm').textContent));
  if(await p.locator('.site-bgm').innerText()==='BGMを再開')await p.locator('.site-bgm').click();
  await p.waitForFunction(pos=>JSON.parse(sessionStorage.getItem('sc_site_audio_v1')).position>=pos,position);
  // Simulate visibility to verify lifecycle without relying on headless tab activation.
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await p.locator('.site-bgm').innerText(),'BGMを再開');
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await p.waitForFunction(()=>document.querySelector('.site-bgm').textContent==='BGM ON');
  await p.locator('.site-bgm').click();assert.equal(await p.locator('.site-bgm').innerText(),'BGM OFF');await p.goto(base+'/rules');assert.equal(await p.locator('.site-bgm').innerText(),'BGM OFF');
  const blocked=await browser.newPage();watch(blocked);await blocked.addInitScript(()=>{window.originalMediaPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('blocked','NotAllowedError'));};});await blocked.goto(base+'/news');await blocked.locator('[data-audio="on"]').click();assert.equal(await blocked.locator('.site-bgm').innerText(),'BGMを再開');assert.equal(await blocked.locator('.site-audio-gate').count(),0);await blocked.evaluate(()=>{HTMLMediaElement.prototype.play=window.originalMediaPlay;});await blocked.locator('.site-bgm').click();await blocked.waitForFunction(()=>document.querySelector('.site-bgm').textContent==='BGM ON');
  const m=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});watch(m);await m.goto(base);await m.locator('[data-audio="off"]').focus();await m.keyboard.press('Tab');assert.equal(await m.evaluate(()=>document.activeElement.dataset.audio),'on');await m.screenshot({path:path.join(out,'mobile-choice.png')});await m.locator('[data-audio="off"]').click();
  for(const width of [320,390,768,900,1100]){await m.setViewportSize({width,height:844});assert.ok(await m.locator('.site-bgm').isVisible());assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const rects=await m.locator('.site-header__logo,.site-bgm,.site-header__play,.nav-toggle').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right};}).sort((a,b)=>a.x-b.x));for(let i=1;i<rects.length;i++)assert.ok(rects[i].x>=rects[i-1].right-1,'header controls must not overlap');}
  await m.setViewportSize({width:390,height:844});await m.goto(base+'/news');await m.screenshot({path:path.join(out,'mobile-news.png'),fullPage:true});assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const noStorage=await browser.newPage();await noStorage.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('denied');};Storage.prototype.setItem=()=>{throw Error('denied');};});watch(noStorage);await noStorage.goto(base);await noStorage.locator('[data-audio="off"]').click();assert.equal(await noStorage.locator('.site-audio-gate').count(),0);
  const noJS=await browser.newPage({javaScriptEnabled:false});await noJS.goto(base+'/news');assert.equal(await noJS.locator('.news-row').count(),4);await noJS.locator('.news-row').first().click();assert.match(noJS.url(),/start-guide$/);
  for(const route of ['/play','/phone','/start']){const html=await (await fetch(base+route)).text();assert.ok(!html.includes('/site/site-audio.js'));}
  assert.deepEqual(errors,[]);console.log('SITE AUDIO / NEWS: HTTP, real BGM, controls, lifecycle, denial, mobile and no-JS checks passed');
 }finally{await browser.close();await new Promise(resolve=>G.server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
