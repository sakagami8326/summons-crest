(() => {
  'use strict';

  const header = document.querySelector('[data-header]');
  const nav = document.querySelector('[data-nav]');
  const navToggle = document.querySelector('[data-nav-toggle]');

  const closeNav = () => {
    if (!nav || !navToggle) return;
    nav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'メニューを開く');
    document.body.classList.remove('nav-open');
  };

  navToggle?.addEventListener('click', () => {
    const open = navToggle.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    document.body.classList.toggle('nav-open', open);
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNav));
  window.addEventListener('resize', () => { if (window.innerWidth > 832) closeNav(); });
  window.addEventListener('scroll', () => header?.classList.toggle('is-scrolled', window.scrollY > 32), { passive: true });

  document.querySelectorAll('[data-game-cta]').forEach(link => {
    link.addEventListener('click', () => {
      window.SummonsAnalytics?.track('game_start_cta_click', {
        cta_location: link.dataset.gameCta || 'unknown',
      });
    });
  });

  document.querySelectorAll('[data-youtube-player]').forEach(player => {
    const trigger = player.querySelector('[data-youtube-play]');
    trigger?.addEventListener('click', () => {
      const videoId = player.dataset.videoId || '';
      if (player.classList.contains('is-playing') || !/^[\w-]{11}$/.test(videoId)) return;
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
      frame.title = '1分でわかる SUMMONS CODE';
      frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allowFullscreen = true;
      player.classList.add('is-playing');
      player.replaceChildren(frame);
    }, { once: true });
  });

  const cardShowcase = document.querySelector('[data-card-showcase]');
  if (cardShowcase) {
    const cards = [...cardShowcase.querySelectorAll('figure')];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const order = [...cards];
    let evolutionRunning = false;
    let carouselMoving = false;
    const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

    const positionCards = (items = order) => {
      items.forEach((card, index) => {
        const slot = index - 4;
        card.style.setProperty('--slot', slot);
        card.classList.toggle('is-featured', slot === 0);
      });
    };

    const advanceCards = async () => {
      if (document.hidden || reducedMotion.matches || evolutionRunning || carouselMoving) return;
      carouselMoving = true;
      const exiting = order[0];
      const incoming = exiting.cloneNode(true);
      incoming.classList.add('is-recycling', 'is-conveyor-clone');
      incoming.classList.remove('is-featured');
      incoming.setAttribute('aria-hidden', 'true');
      incoming.style.setProperty('--slot', 5);
      cardShowcase.appendChild(incoming);
      void incoming.offsetWidth;
      incoming.classList.remove('is-recycling');
      order.forEach((card, index) => {
        const slot = index - 5;
        card.style.setProperty('--slot', slot);
        card.classList.toggle('is-featured', slot === 0);
      });
      incoming.style.setProperty('--slot', 4);
      await wait(720);
      order.shift();
      order.push(exiting);
      exiting.classList.add('is-recycling');
      exiting.style.setProperty('--slot', 4);
      exiting.classList.remove('is-featured');
      void exiting.offsetWidth;
      incoming.remove();
      window.requestAnimationFrame(() => exiting.classList.remove('is-recycling'));
      carouselMoving = false;
    };

    const runEvolutionWave = async () => {
      if (document.hidden || reducedMotion.matches || evolutionRunning) return;
      if (carouselMoving) {
        window.setTimeout(runEvolutionWave, 800);
        return;
      }
      evolutionRunning = true;
      const evolvable = order.filter(card => card.hasAttribute('data-card-evolves'));
      for (const card of evolvable) {
        card.classList.add('is-flipped');
        await wait(140);
      }
      await wait(2000);
      for (const card of evolvable) {
        card.classList.remove('is-flipped');
        await wait(140);
      }
      await wait(450);
      evolutionRunning = false;
    };

    positionCards();
    window.setInterval(advanceCards, 4000);
    const scheduleEvolutionWave = () => {
      runEvolutionWave();
      window.setTimeout(scheduleEvolutionWave, 16000);
    };
    window.setTimeout(scheduleEvolutionWave, 8000);
  }

  const carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    const slides = [...carousel.querySelectorAll('.summoner-slide')];
    const dots = carousel.querySelector('[data-carousel-dots]');
    const stage = carousel.querySelector('[data-carousel-stage]');
    const info = {
      name: carousel.querySelector('[data-summoner-name]'),
      elem: carousel.querySelector('[data-summoner-elem]'),
      style: carousel.querySelector('[data-summoner-style]'),
      ult: carousel.querySelector('[data-summoner-ult]'),
      desc: carousel.querySelector('[data-summoner-desc]')
    };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = 0;
    let timer = 0;
    let paused = false;
    let pointerStart = null;

    slides.forEach((slide, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `${slide.dataset.name}を表示`);
      button.addEventListener('click', () => { show(index); restart(); });
      dots?.appendChild(button);
    });
    const dotButtons = [...(dots?.querySelectorAll('button') || [])];

    const wrappedDistance = (index, current) => {
      let distance = index - current;
      const half = slides.length / 2;
      if (distance > half) distance -= slides.length;
      if (distance < -half) distance += slides.length;
      return distance;
    };

    const show = index => {
      active = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const d = wrappedDistance(i, active);
        slide.className = 'summoner-slide';
        if (d === 0) slide.classList.add('is-active');
        else if (d === -1) slide.classList.add('is-prev');
        else if (d === 1) slide.classList.add('is-next');
        else if (d === -2) slide.classList.add('is-far-prev');
        else if (d === 2) slide.classList.add('is-far-next');
        slide.setAttribute('aria-hidden', String(d !== 0));
      });
      dotButtons.forEach((dot, i) => dot.setAttribute('aria-current', String(i === active)));
      const slide = slides[active];
      if (!slide) return;
      info.name.textContent = slide.dataset.name;
      info.elem.textContent = slide.dataset.elem;
      info.style.textContent = slide.dataset.style;
      info.ult.textContent = `固有スキル「${slide.dataset.ult}」`;
      info.desc.textContent = slide.dataset.desc;
    };

    const stop = () => { window.clearInterval(timer); timer = 0; };
    const start = () => {
      stop();
      if (paused || reducedMotion.matches || document.hidden) return;
      timer = window.setInterval(() => show(active + 1), 5000);
    };
    const restart = () => { stop(); start(); };
    const setPaused = value => { paused = value; value ? stop() : start(); };

    carousel.querySelector('[data-carousel-prev]')?.addEventListener('click', () => { show(active - 1); restart(); });
    carousel.querySelector('[data-carousel-next]')?.addEventListener('click', () => { show(active + 1); restart(); });
    carousel.addEventListener('mouseenter', () => setPaused(true));
    carousel.addEventListener('mouseleave', () => setPaused(false));
    carousel.addEventListener('focusin', () => setPaused(true));
    carousel.addEventListener('focusout', event => { if (!carousel.contains(event.relatedTarget)) setPaused(false); });
    stage?.addEventListener('pointerdown', event => { pointerStart = event.clientX; setPaused(true); });
    stage?.addEventListener('pointerup', event => {
      if (pointerStart !== null && Math.abs(event.clientX - pointerStart) > 42) show(active + (event.clientX < pointerStart ? 1 : -1));
      pointerStart = null;
      setPaused(false);
    });
    stage?.addEventListener('pointercancel', () => { pointerStart = null; setPaused(false); });
    document.addEventListener('visibilitychange', start);
    reducedMotion.addEventListener?.('change', start);
    show(0);
    start();
  }

  const feedbackForm = document.querySelector('[data-feedback-form]');
  if (feedbackForm) {
    const panel = document.querySelector('[data-feedback-panel]');
    const message = feedbackForm.querySelector('[name="message"]');
    const website = feedbackForm.querySelector('[name="website"]');
    const count = feedbackForm.querySelector('[data-feedback-count]');
    const status = feedbackForm.querySelector('[data-feedback-status]');
    const submit = feedbackForm.querySelector('[data-feedback-submit]');
    const submitCopy = submit?.querySelector('.feedback-submit__copy');
    const complete = panel?.querySelector('[data-feedback-complete]');
    const again = panel?.querySelector('[data-feedback-again]');
    const categoryFieldset = feedbackForm.querySelector('fieldset');
    const setCount = () => { if (count && message) count.textContent = `${message.value.length.toLocaleString('ja-JP')} / 1,200`; };
    const setError = (text, target) => {
      if (status) status.textContent = text;
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
    };
    const clearError = () => {
      if (status) status.textContent = '';
      message?.removeAttribute('aria-invalid');
      categoryFieldset?.removeAttribute('aria-invalid');
    };
    message?.addEventListener('input', () => { setCount(); message.removeAttribute('aria-invalid'); });
    feedbackForm.querySelectorAll('[name="category"]').forEach(radio => radio.addEventListener('change', () => {
      categoryFieldset?.removeAttribute('aria-invalid');
    }));
    setCount();

    feedbackForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit?.disabled) return;
      clearError();
      const selected = feedbackForm.querySelector('[name="category"]:checked');
      const body = message?.value.trim() || '';
      if (!selected) {
        if (status) status.textContent = 'ご意見の種類を選んでください。';
        categoryFieldset?.setAttribute('aria-invalid', 'true');
        feedbackForm.querySelector('[name="category"]')?.focus();
        return;
      }
      if (!body) return setError('内容を入力してください。', message);
      if (body.length > 1200) return setError('内容は1,200文字以内で入力してください。', message);

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      if (submit) submit.disabled = true;
      if (submitCopy) submitCopy.textContent = '送信しています…';
      try {
        const response = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: selected.value, message: body, website: website?.value || '' }),
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true) throw new Error(result.error || '送信できませんでした。');
        window.SummonsAnalytics?.track('feedback_submit_success', {
          feedback_category: selected.value,
        });
        feedbackForm.hidden = true;
        if (complete) {
          complete.hidden = false;
          complete.focus();
        }
      } catch (error) {
        const text = error?.name === 'AbortError'
          ? '通信に時間がかかっています。入力内容はそのままです。もう一度お試しください。'
          : (error?.message || '送信できませんでした。入力内容を残したまま再送できます。');
        setError(text, status);
      } finally {
        window.clearTimeout(timeout);
        if (submit) submit.disabled = false;
        if (submitCopy) submitCopy.textContent = 'この内容で送信する';
      }
    });

    again?.addEventListener('click', () => {
      feedbackForm.reset();
      clearError();
      setCount();
      if (complete) complete.hidden = true;
      feedbackForm.hidden = false;
      feedbackForm.querySelector('[name="category"]')?.focus();
    });
  }

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .12 });
    revealItems.forEach(item => revealObserver.observe(item));
  } else revealItems.forEach(item => item.classList.add('is-visible'));

  const launcher = document.querySelector('[data-game-launcher]');
  const footer = document.querySelector('.site-footer');
  const launcherRetreatZones = document.querySelectorAll('#news, #feedback, .final-cta, .site-footer');
  if (launcher && footer && 'IntersectionObserver' in window) {
    const visibleZones = new Set();
    const footerObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visibleZones.add(entry.target) : visibleZones.delete(entry.target));
      launcher.classList.toggle('is-raised', visibleZones.size > 0);
    }, { threshold: .05 });
    launcherRetreatZones.forEach(zone => footerObserver.observe(zone));
  }
})();
