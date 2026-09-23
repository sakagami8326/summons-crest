const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const {chromium} = require('playwright');
const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'setInterval', 'setTimeout', source + ';return {server,rooms,makeFixtureRoom,startDraft,broadcast,drawCards,publicState,performMove,resolveTile,continuePostBattle,TILES};')(
  require('module').createRequire(path.join(root, 'server.js')), root, () => 0, () => 0);
const output = path.join(root, 'output/random-draw-inventory');
fs.mkdirSync(output, {recursive:true});

(async () => {
  let browser;
  const errors = [], reports = [];
  try {
    await new Promise(resolve => G.server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + G.server.address().port;
    browser = await chromium.launch({channel:'chrome', headless:true});
    for (const width of [844,667]) {
      const r = G.makeFixtureRoom(), p = r.players[0];
      r.code = 'RDI' + width; r.turn = 0; r.pending = {}; r.turnTransition = null;
      for (const key of ['lastEvent','lastUlt','lastBattle','lastDraw','lastGain','lastDice']) r[key] = null;
      r.owners.fill(null); r.tileFx = {}; p.hand = ['nome']; p.deck = ['shield']; p.discard = []; p.exile = []; p.pickCards = []; p.resolving = [];
      G.rooms.set(r.code, r);
      const page = await browser.newPage({viewport:{width,height:390},isMobile:true,hasTouch:true});
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/phone?guide=done');
      await page.evaluate(code => { room=code;pid='fx0';$('join').style.display='none';document.body.classList.add('ingame');connect(); }, r.code);
      await page.waitForFunction(() => state?.players?.find(p=>p.id===pid)?.inventoryList);
      const expected = ['nome','shield'];
      const inspect = async label => {
        await page.evaluate(() => $('deckBtn').click());
        await page.waitForSelector('#deckOv .overviewGrid');
        await page.waitForFunction(() => [...document.querySelectorAll('#deckOv .miniCanvas')].every(c => c.style.transform && !c.style.transform.includes('(0)')));
        const inventory = await page.locator('#deckOv > .overviewScroll > .overviewGrid > .overviewCard').evaluateAll(cards => cards.map(c=>({id:c.dataset.card,name:c.getAttribute('aria-label'),scale:c.querySelector('.miniCanvas').style.transform,images:[...c.querySelectorAll('img')].map(i=>i.getAttribute('src'))})));
        assert.deepEqual(inventory.map(c=>c.id).sort(),expected.slice().sort(),label);
        assert(inventory.every(c=>c.scale && !c.scale.includes('(0)')),label+' nonzero scale');
        reports.push({width,label,inventory});
        await page.locator('#deckClose').click();
      };
      await inspect('before acquisitions');
      for (const [index,card] of ['samurai_saga','sp_evolve','weapon','samurai_saga'].entries()) {
        r.turn=0; r.turnTransition=null; r.pending={}; r.deck=['samurai_saga','sp_evolve','weapon'];
        if(index===0){
          p.pos=G.TILES.length-1;p.dir=1;p.seal=true;
          G.performMove(r,p,1,{value:1},'城帰還テスト');
          assert.equal(r.pending[p.id].type,'draft');
          r.pending[p.id].availableAt=0;r.lastDice=null;
        }else if(index===1){
          p.pos=G.TILES.findIndex(t=>t.t==='shrine');G.resolveTile(r,p);
          assert.equal(r.pending[p.id].type,'draft');
        }else if(index===2){
          r.battleAfter={winner:p.id,attacker:'fx1',defender:p.id,tile:1,invasionWon:false,mermaidDone:true,recoveryDone:true,frontlineDone:true};
          G.continuePostBattle(r);assert.equal(r.pending[p.id].type,'draft');
        }else G.startDraft(r,p,'battle');
        G.broadcast(r);
        const candidate=page.locator('#uxRail .card[data-option-id="take:'+card+'"]');
        await candidate.waitFor({state:'visible'});
        assert.equal(await candidate.getAttribute('data-c'),card);
        await candidate.tap();
        const catalog=G.publicState(r,p.id).catalog;
        const name=(catalog.CREATURES[card]||catalog.SPELLS[card]||catalog.SUPPORTS[card]).name;
        assert((await page.locator('#uxPickName').innerText()).includes(name));
        await page.locator('#uxConfirm').tap();
        expected.push(card);
        await page.waitForFunction(count=>me().inventoryList.length===count,expected.length);
        assert(p.deck.includes(card),'server acquired '+card);
        await page.waitForFunction(()=>!$('drawModal').classList.contains('on'));
        await inspect('acquired '+index+' '+card);
        // Reconnection must not restore an older deck or lose a duplicate card.
        const connected=page.waitForRequest(req=>req.url().includes('/api/events?'));
        await page.evaluate(()=>{es.close();connect();});
        await connected;
        await page.waitForFunction(()=>es.readyState===EventSource.OPEN);
        await inspect('reconnected '+index+' '+card);
      }
      // A normal hand draw moves a card between zones without removing it from the overview.
      G.drawCards(r,p,2); G.broadcast(r);
      await page.waitForFunction(()=>me().hand.length===3);
      await inspect('moved acquired cards to hand');
      await page.evaluate(()=>$('deckBtn').click());
      await page.screenshot({path:path.join(output,'deck-'+width+'.png')});
      await page.locator('#deckClose').click();
      // A phone can still POST a choice while its event stream is interrupted.
      r.turn=0; r.turnTransition=null; r.pending={}; r.deck=['jaki','sp_gold','shield'];
      G.startDraft(r,p,'battle'); G.broadcast(r);
      await page.locator('#uxRail .card[data-option-id="take:jaki"]').tap();
      await page.evaluate(()=>es.close());
      const action=page.waitForResponse(res=>res.url().endsWith('/api/action')&&res.request().postDataJSON()?.optionId==='take:jaki');
      await page.locator('#uxConfirm').tap();
      const response=await action;
      assert.equal(response.status(),200);
      assert(p.deck.includes('jaki'),'server acquired the card despite event stream interruption');
      await page.waitForFunction(()=>!sharedCardPicker.busy);
      assert(await page.evaluate(()=>me().inventoryList.includes('jaki')),'successful random draw must update phone even when SSE is interrupted');
      expected.push('jaki');
      await page.waitForFunction(()=>!$('drawModal').classList.contains('on'));
      await inspect('acquired with event stream interrupted');
      const ack=await response.json();
      assert(ack.state.players.find(q=>q.id===p.id).inventoryList.includes('jaki'));
      for(const other of ack.state.players.filter(q=>q.id!==p.id)) {
        assert.equal(other.inventoryList,undefined,'ack must not leak another player inventory');
        assert.deepEqual(other.hand,[]);
      }
      await page.evaluate(()=>connect());
      r.turn=0; r.turnTransition=null; r.pending={}; r.deck=['jaki','sp_gold','shield'];
      G.startDraft(r,p,'battle'); G.broadcast(r);
      // Delay the HTTP acknowledgement until a newer SSE snapshot has arrived.
      let latestRevision;
      await page.route('**/api/action',async route=>{
        if(route.request().postDataJSON()?.optionId!=='take:sp_gold')return route.continue();
        const older=await route.fetch();
        p.deck.push('shield');G.broadcast(r);latestRevision=r.stateRev;
        await page.waitForFunction(rev=>state.stateRev===rev,latestRevision);
        await route.fulfill({response:older});
      });
      await page.locator('#uxRail .card[data-option-id="take:sp_gold"]').tap();
      await page.locator('#uxConfirm').tap();
      await page.waitForFunction(()=>!sharedCardPicker.busy);
      expected.push('sp_gold','shield');
      assert.equal(await page.evaluate(()=>state.stateRev),latestRevision,'late acknowledgement must not roll back newer state');
      await page.waitForFunction(()=>!$('drawModal').classList.contains('on'));
      await inspect('newer event preserved after delayed acknowledgement');
      await page.unroute('**/api/action');
      r.turn=0;r.turnTransition=null;r.pending={};r.deck=['samurai_saga','sp_gold','weapon'];
      G.startDraft(r,p,'battle');G.broadcast(r);
      await page.locator('#uxRail .card[data-option-id="take:weapon"]').tap();
      await page.evaluate(()=>es.close());
      await page.route('**/api/action',async route=>{await route.fetch();await route.abort('failed');});
      await page.locator('#uxConfirm').tap();
      await page.waitForFunction(()=>!sharedCardPicker.busy && !sharedCardPicker.dialog.open);
      expected.push('weapon');
      await page.waitForFunction(()=>!$('drawModal').classList.contains('on'));
      await inspect('lost action response reconciled without repeating acquisition');
      await page.close();
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({reports,errors},null,2));
    console.log('PASS random draw choice/API/inventory/overview, duplicate acquisition, reconnect, hand draw, interrupted SSE, acknowledgement privacy and stale-response guard at two landscape sizes');
  } finally { await browser?.close(); G.server.closeAllConnections(); G.server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
