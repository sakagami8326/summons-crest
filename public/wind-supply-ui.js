/* Shared movement-reward presentation. Card identities are supplied only to the owner's phone. */
window.WindSupplyUI = (() => {
  const byId = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const shown = new Set(), delivered = new Set();
  let noticeSeen, phoneBusy = false, toastTimer;
  function mount(surface) {
    if (byId(surface === 'board' ? 'windSupplyWindow' : 'windPhoneWindow')) return;
    const holder = document.createElement('div');
    holder.innerHTML = surface === 'board'
      ? `<section id="windSupplyWindow" role="status" aria-live="polite"><img id="windSupplyPortrait" alt=""><div id="windSupplyWords"><div id="windSupplyOwner"></div><h2 id="windSupplyTitle">風の補給</h2><p id="windSupplyResult">カードを<strong>1枚</strong>引いた！</p></div></section>`
      : `<div id="windPhoneShade"></div><section id="windPhoneWindow" role="status" aria-live="polite"><img id="windPhoneSource" alt=""><div id="windPhoneMessage"><div id="windPhoneWho"></div><h2>風の補給</h2><p>カードを<strong>1枚</strong><br>引いた！</p><small id="windPhoneHint">手札にカードを補給</small></div><div id="windPhoneDraw"></div></section><div id="windPhoneToast" role="status"></div>`;
    document.body.append(holder);
  }
  const key = (s, e) => `${s.code || ''}:${e.id}`;
  function portrait(el, e, s) {
    const evolved = e.source.creature.endsWith('_f');
    el.src = `/assets/cards/${evolved ? 'e' : 'c'}_poponga.webp`;
    el.alt = s.catalog.CREATURES[e.source.creature].name;
    return el.alt;
  }
  async function ack(a, e, type) {
    for (let n = 0; n < 2; n++) {
      try {
        const res = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: a.room, token: a.token, playerId: a.playerId, effectId: e.id, type }) });
        if (res.ok) return;
      } catch (_) { /* A server deadline also releases disconnected displays. */ }
      await wait(300);
    }
  }
  function board(s, a) {
    const e = s.windSupply;
    if (!e?.active || e.boardDone || shown.has(key(s,e))) return;
    const id = key(s,e); shown.add(id); mount('board');
    a.queue(4, async () => {
      if (!a.current()?.windSupply?.active || a.current().windSupply.id !== e.id) return;
      await ack(a, e, 'wind_supply_started');
      const name = portrait(byId('windSupplyPortrait'), e, s);
      byId('windSupplyOwner').textContent = (s.players.find(p => p.id === e.player)?.name || '') + 'の ' + name;
      byId('windSupplyWindow').classList.add('on');
      try { await wait(3000); }
      finally { byId('windSupplyWindow').classList.remove('on'); await ack(a, e, 'wind_supply_complete'); }
    }, { id, at: e.at, actorId: e.player, kind: 'wind-supply' });
  }
  function hand(s, pid, cards) {
    const copy = cards.slice(), e = s?.windSupply;
    if (e?.active && e.player === pid && e.card && !e.phoneDone && !delivered.has(key(s,e))) {
      const i = copy.lastIndexOf(e.card); if (i >= 0) copy.splice(i,1);
    }
    return copy;
  }
  function toast(text) {
    clearTimeout(toastTimer); byId('windPhoneToast').textContent = text;
    byId('windPhoneToast').classList.add('on');
    toastTimer = setTimeout(() => byId('windPhoneToast').classList.remove('on'), 2600);
  }
  function phone(s, a) {
    const e = s.windSupply, id = e && key(s,e);
    if (noticeSeen !== undefined && e && id !== noticeSeen && e.player === a.playerId && !e.count) {
      mount('phone'); toast('風の補給：山札・捨て札にカードがありません');
    }
    noticeSeen = id || '';
    if (!e?.active || !e.startedAt || e.phoneDone || e.player !== a.playerId || !e.card || shown.has(id) || phoneBusy) return;
    shown.add(id); phoneBusy = true; mount('phone');
    playPhone(s, a, e).catch(error => console.error('wind supply presentation', error));
  }
  async function playPhone(s, a, e) {
    const id = key(s,e); let flying, target;
    const current = () => a.current()?.windSupply?.id === e.id && a.current().windSupply.active;
    document.body.classList.add('windSupplyPlaying');
    try {
      clearTimeout(toastTimer); byId('windPhoneToast').classList.remove('on');
      a.cancelGesture();
      const name = portrait(byId('windPhoneSource'), e, s);
      byId('windPhoneWho').textContent = name + 'の効果';
      byId('windPhoneHint').textContent = '手札にカードを補給';
      byId('windPhoneDraw').classList.remove('revealed');
      byId('windPhoneDraw').innerHTML = a.card(e.card);
      byId('windPhoneShade').classList.add('on'); byId('windPhoneWindow').classList.add('on');
      await wait(900); if (!current()) return;
      byId('windPhoneDraw').classList.add('revealed'); a.fit(byId('windPhoneDraw'));
      byId('windPhoneHint').textContent = 'あなたが引いたカード';
      await wait(1900); if (!current()) return;
      const source = byId('windPhoneDraw').getBoundingClientRect();
      flying = document.createElement('div'); flying.id = 'windPhoneFlying'; flying.innerHTML = a.card(e.card);
      Object.assign(flying.style, { left: source.x+'px', top: source.y+'px', width: source.width+'px', height: source.height+'px' });
      document.body.append(flying); delivered.add(id); a.renderHand(); a.layoutHand();
      // Repeated card IDs are separate copies; the newly appended copy is the last matching node.
      target = [...byId('hand').querySelectorAll('.card')].filter(el => el.dataset.c === e.card).at(-1);
      if (target) {
        target.style.visibility = 'hidden'; target.style.animation = 'none';
        target.scrollIntoView({ block:'nearest', inline:'nearest', behavior:'instant' }); await frame();
      }
      byId('windPhoneWindow').classList.remove('on'); byId('windPhoneShade').classList.remove('on');
      const dest = target?.getBoundingClientRect(), reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
      if (dest && source.width && source.height && !reduced) {
        await flying.animate([{transform:'translate(0,0) scale(1)'},
          {transform:`translate(${dest.x-source.x}px,${dest.y-source.y}px) scale(${dest.width/source.width},${dest.height/source.height})`}],
          {duration:650,easing:'cubic-bezier(.3,.05,.2,1)',fill:'forwards'}).finished;
      } else await wait(200);
      if (current()) toast(`手札に1枚追加（${e.beforeCount} → ${e.afterCount}枚）`);
    } finally {
      if (target) { target.style.visibility = ''; target.style.animation = ''; target.classList.add('windReceived'); }
      flying?.remove(); delivered.add(id); a.renderHand();
      byId('windPhoneWindow').classList.remove('on'); byId('windPhoneShade').classList.remove('on');
      document.body.classList.remove('windSupplyPlaying'); phoneBusy = false;
      await ack(a, e, 'wind_supply_complete');
    }
  }
  return { board, phone, hand };
})();
