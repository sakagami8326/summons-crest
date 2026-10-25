/* Keep the board, HUD and modal dialogs in the same fullscreen document. */
(() => {
  const button = document.getElementById('boardFullscreenBtn');
  const status = document.getElementById('boardFullscreenStatus');
  const root = document.documentElement;
  const enter = root.requestFullscreen || root.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const supported = !!(enter && exit) && document.fullscreenEnabled !== false && document.webkitFullscreenEnabled !== false;
  const active = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  let busy = false;

  function render() {
    const on = active();
    button.disabled = busy || !supported;
    button.setAttribute('aria-pressed', String(on));
    button.querySelector('span').textContent = on ? '全画面を解除' : '全画面';
    button.title = !supported ? 'このブラウザーでは全画面表示を利用できません' : on ? '全画面を解除（Escでも解除できます）' : '全画面にする';
    button.querySelector('path').setAttribute('d', on
      ? 'M3 9h6V3m6 0v6h6M9 21v-6H3m18 0h-6v6'
      : 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6');
  }

  button.addEventListener('click', async () => {
    if (busy || !supported) return;
    busy = true;
    status.hidden = true;
    render();
    try {
      // Call directly from the gesture so browser activation is preserved.
      if (active()) await exit.call(document);
      else await enter.call(root);
    } catch (_) {
      status.textContent = active() ? '全画面を解除できませんでした。Escキーでも解除できます。' : '全画面にできませんでした。もう一度「全画面」を押してください。';
      status.hidden = false;
    } finally {
      busy = false;
      render();
    }
  });
  function changed() {
    status.hidden = true;
    render();
  }
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', () => {
    changed();
    resetPresentationCamera('fullscreen-change');
    fitWorld();
  });
  render();
})();
