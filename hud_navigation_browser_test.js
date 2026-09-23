const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs');
const base=process.env.TEST_BASE||'http://127.0.0.1:4291',out='output/ui-release-integration';
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
for(const width of [1440,390,320,844]){
const p=await b.newPage({viewport:{width,height:width===844?390:900}});p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>sessionStorage.setItem('sc_site_audio_v1','{"choice":"off"}'));
await p.goto(base+'/',{waitUntil:'networkidle'});
assert.equal(await p.locator('.nv-header').count(),1);assert.equal(await p.locator('.nv-compare').count(),0);
if(width===1440){await p.locator('.nv-group-toggle').first().click();assert(await p.locator('#nv-group-0').isVisible());await p.keyboard.press('Escape');assert(!await p.locator('#nv-group-0').isVisible());}
else{
await p.locator('.nv-menu').click();await p.waitForTimeout(650);
assert.equal(await p.locator('.mc-hero').count(),0);
assert(await p.locator('.mc-close').evaluate(e=>{const r=e.getBoundingClientRect(),s=e.querySelector('svg').getBoundingClientRect();return Math.abs(r.x+r.width/2-s.x-s.width/2)<1&&Math.abs(r.y+r.height/2-s.y-s.height/2)<1}));
await p.locator('.mc-tile summary').first().click();await p.waitForTimeout(500);assert(await p.locator('.mc-tile').first().evaluate(e=>e.open));
await p.locator('.mc-tile summary').nth(1).click();await p.waitForTimeout(500);assert(!(await p.locator('.mc-tile').first().evaluate(e=>e.open)));
assert(await p.locator('.nv-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth));
await p.screenshot({path:`${out}/menu-${width}.png`});await p.locator('.mc-close').click();await p.waitForTimeout(50);assert(await p.locator('.nv-dialog').evaluate(e=>e.open&&e.classList.contains('mc-leaving')));await p.waitForTimeout(260);assert(!(await p.locator('.nv-dialog').evaluate(e=>e.open)));
await p.locator('.nv-menu').click();await p.keyboard.press('Escape');await p.waitForTimeout(260);assert.equal(await p.locator('.nv-menu').getAttribute('aria-expanded'),'false');
}
await p.screenshot({path:`${out}/site-${width}.png`});await p.close();console.log('PASS navigation',width);
}
for(const route of ['/cards','/rules','/news','/about','/news/2026-09-20-mio-update']){const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>sessionStorage.setItem('sc_site_audio_v1','{"choice":"off"}'));await p.goto(base+route);assert.equal(await p.locator('.nv-header').count(),1,route);assert.equal(await p.locator('.site-bgm').count(),1);await p.close();}console.log('PASS shared navigation subpages');
const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>localStorage.setItem('sc_start_guide_v1','done'));await p.goto(base+'/play?fixture=1&guide=done');await p.waitForFunction(()=>typeof state!=='undefined'&&state?.players?.length&&document.querySelector('#hud .plate'));
await p.evaluate(()=>{state.players.forEach((p,i)=>p.points=[8400,7200,6400,4300][i]);renderHUD();});await p.waitForTimeout(2200);
assert.equal(await p.locator('.rkCrown').count(),3);assert.equal(await p.locator('.rankBadge[data-rank="4"] svg').count(),0);assert.equal(await p.locator('#hud .reach').count(),0);assert.equal(await p.locator('.rkGoalNotice').count(),2);
await p.evaluate(()=>{state.players[2].points=9100;renderHUD();});await p.waitForTimeout(500);assert(await p.locator('#hud .plate').evaluateAll(es=>es.some(e=>e.getAnimations().length>0)));await p.screenshot({path:`${out}/hud-overtake.png`});
// Frequent state updates during motion must neither restart nor erase the movement.
await p.evaluate(()=>renderHUD());await p.waitForTimeout(1600);assert.equal(await p.evaluate(()=>document.getElementById('plate-'+state.players[2].id).dataset.rank),'1');
// Reversal during an active overtake settles at the newest authoritative rank.
await p.evaluate(()=>{state.players[2].points=5000;renderHUD();});await p.waitForTimeout(300);await p.evaluate(()=>{state.players[2].points=9300;renderHUD();});await p.waitForTimeout(2000);
for(const [width,height]of [[1920,1080],[1440,900],[1280,720]]){
await p.setViewportSize({width,height});await p.evaluate(()=>{state.players.forEach((p,i)=>p.points=9000+i*100);renderHUD();});await p.waitForTimeout(1800);
assert(await p.locator('#hud .plate').evaluateAll(es=>{const rs=es.map(e=>e.getBoundingClientRect()).sort((a,b)=>a.top-b.top);return rs.every((r,i)=>r.top>=0&&r.bottom<innerHeight&&(!i||r.top>=rs[i-1].bottom));}));
assert(await p.locator('.rkGoalNotice').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth&&e.getBoundingClientRect().top>=e.closest('.plate').querySelector('.row3').getBoundingClientRect().bottom)));
assert(await p.evaluate(()=>document.getElementById('titleBonusPanel').getBoundingClientRect().bottom<=document.getElementById('leftUtility').getBoundingClientRect().top));
await p.screenshot({path:`${out}/hud-${width}.png`});}
await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>{state.target=10000;state.players[0].points=11000;renderHUD();});assert.equal(await p.locator('#hud .plate').evaluateAll(es=>es.reduce((n,e)=>n+e.getAnimations().length,0)),0);assert((await p.locator('.rkGoalNotice span').first().textContent()).includes('10000G'));
assert.deepEqual(errors,[]);console.log('PASS HUD crowns, overtake/reversal, thresholds, reduced motion, dynamic target and all-near-goal layouts');await p.close();
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
