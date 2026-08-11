// v1.09: shared white-gold Phaser sparkle overlay for ultimate cut-ins.
window.UltFxWorld = (() => {
  let game = null, scene = null, ready = false, pending = false, live = [];
  const W = 1280, H = 720;
  function init() {
    if (game || typeof Phaser === 'undefined') return;
    game = new Phaser.Game({ type: Phaser.AUTO, parent: 'ultFxHost', width: W, height: H,
      transparent: true, banner: false, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: { create: function () { scene = this; ready = true; if (pending) play(); } } });
  }
  function clear() {
    for (const p of live) if (p && p.scene) p.destroy();
    live = [];
  }
  function spark(x, y, fast, delay) {
    const radius = fast ? 2 + Math.random() * 4 : 1.2 + Math.random() * 3;
    const p = scene.add.circle(x, y, radius, Math.random() < .28 ? 0xffe39a : 0xffffff, .15)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
    live.push(p);
    scene.tweens.add({ targets: p, x: x + (fast ? 330 : 110) + Math.random() * 180,
      y: y - (fast ? 100 : 35) - Math.random() * 100, alpha: { from: .15, to: .95 },
      scale: { from: .45, to: 1.5 }, duration: fast ? 420 : 1500 + Math.random() * 900,
      delay, yoyo: !fast, repeat: fast ? 0 : 1,
      onComplete: () => { if (p.scene) p.destroy(); } });
  }
  function play(reduced = false) {
    if (!game) init();
    if (!ready) { pending = true; return; }
    pending = false; clear();
    const count = reduced ? 12 : 48;
    for (let i = 0; i < count; i++) spark(Math.random() * W, H * (.2 + Math.random() * .75), false, Math.random() * 550);
    if (!reduced) for (let i = 0; i < 20; i++) spark(W * (.25 + Math.random() * .35), H * (.35 + Math.random() * .35), true, 80 + Math.random() * 180);
  }
  function stop() { pending = false; clear(); }
  return { init, play, stop, isReady: () => ready };
})();
