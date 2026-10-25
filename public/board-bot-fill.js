(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'botFillDialog';
  dialog.setAttribute('aria-labelledby', 'botFillHeading');
  dialog.setAttribute('aria-describedby', 'botFillCopy');
  dialog.innerHTML = `<i class="botFillCorner tl" aria-hidden="true"></i><i class="botFillCorner br" aria-hidden="true"></i>
    <header><h2 id="botFillHeading">BOTを追加しますか？</h2><button id="botFillClose" type="button" aria-label="ロビーに戻る"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <p id="botFillCopy"></p><p id="botFillError" role="alert" hidden></p>
    <div class="botFillActions"><button id="botFillYes" type="button">BOTを追加する</button><button id="botFillNo" type="button">BOTを追加しない</button></div>
    <button id="botFillBack" type="button">戻る</button>`;
  document.body.append(dialog);
  const find = id => document.getElementById(id);
  const startButton = find('startBtn');
  let busy = false, confirmedCount = 0, dialogRoom = '';
  const count = () => (state?.players || []).filter(p => !p.isBot).length;
  function render(n = count()) {
    confirmedCount = n;
    find('botFillCopy').textContent = n >= 4 ? '4人そろいました。BOTを追加せずに進めます。'
      : n >= 2 ? `BOTを${4 - n}体追加すると、4人で遊べます。` : '2人以上参加すると開始できます。';
    find('botFillYes').hidden = n >= 4 || n < 2;
    find('botFillNo').textContent = n >= 4 ? 'キャラ選択へ' : 'BOTを追加しない';
    for (const id of ['botFillYes', 'botFillNo']) find(id).disabled = busy || n < 2;
    for (const id of ['botFillBack', 'botFillClose']) find(id).disabled = busy;
    dialog.setAttribute('aria-busy', String(busy));
    if (dialog.open && find('botFillYes').hidden && document.activeElement === find('botFillYes')) find('botFillNo').focus();
  }
  function show() {
    dialogRoom = code;
    find('botFillError').hidden = true;
    render();
    if (!dialog.open) dialog.showModal();
    (find('botFillYes').hidden ? find('botFillNo') : find('botFillYes')).focus();
  }
  function close() {
    if (busy) return;
    dialog.close();
    startButton.focus();
  }
  async function submit(fillBots) {
    if (busy || !state || state.phase !== 'lobby') return;
    const expectedHumanCount = dialog.open ? confirmedCount : count();
    busy = true;
    startButton.disabled = true;
    find('botFillError').hidden = true;
    render(expectedHumanCount);
    try {
      const res = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: code, type: 'start_select', fillBots, expectedHumanCount, token: boardToken }) });
      const out = await res.json();
      if (!res.ok || out.error) {
        const error = new Error(out.error || 'キャラ選択へ進めませんでした。もう一度お試しください。');
        error.humanCount = out.humanCount;
        throw error;
      }
      if (dialog.open) dialog.close();
    } catch (error) {
      // A newer SSE state may already have advanced the room after a lost response.
      if (state?.phase !== 'lobby') return;
      if (!dialog.open) show();
      render(Number.isInteger(error.humanCount) ? error.humanCount : count());
      find('botFillError').textContent = error.message === 'Failed to fetch'
        ? '通信できませんでした。接続を確認して、もう一度お試しください。' : error.message;
      find('botFillError').hidden = false;
    } finally {
      busy = false;
      if (dialog.open) render(confirmedCount);
      startButton.disabled = state?.phase !== 'lobby' || (state.botMode ? count() !== 1 : count() < 2);
    }
  }
  find('botFillYes').onclick = () => submit(true);
  find('botFillNo').onclick = () => submit(false);
  find('botFillBack').onclick = close;
  find('botFillClose').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  window.BoardBotFill = {
    start() {
      if (busy || !state || state.phase !== 'lobby') return;
      if (!state.botMode && count() >= 2 && count() < 4) show();
      else submit(false);
    },
    update() {
      if (!dialog.open) return;
      if (dialogRoom !== code || state?.phase !== 'lobby') { dialog.close(); return; }
      if (count() !== confirmedCount) {
        render();
        find('botFillError').textContent = '参加人数が変わりました。もう一度確認してください。';
        find('botFillError').hidden = false;
      }
    }
  };
})();
