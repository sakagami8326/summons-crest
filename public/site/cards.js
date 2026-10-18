(() => {
  const form = document.querySelector('[data-filter-form]');
  const grid = document.querySelector('[data-card-grid]');
  const stateBox = document.querySelector('[data-catalog-state]');
  const sentinel = document.querySelector('[data-card-sentinel]');
  const dialog = document.querySelector('[data-card-dialog]');
  if (!form || !grid || !dialog) return;

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
  const textKey = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, '');
  const LABELS = {
    kind: { creature:'クリーチャー', spell:'スペル', weapon:'ウェポン' },
    element: { fire:'火属性', water:'水属性', earth:'土属性', wind:'風属性', neutral:'無属性' },
  };
  const BATCH_SIZE = 20;
  let cards = [];
  let filtered = [];
  let rendered = 0;
  let activeCard = null;
  let activeEvolution = false;
  let previousFocus = null;
  const evolutionState = new Map();
  const filterState = { element: new Set() };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const currentFilters = () => ({
    query: textKey(form.elements.query.value),
    kind: new Set(form.elements.kind.value === 'all' ? [] : [form.elements.kind.value]),
    rarity: new Set(form.elements.rarity.value === 'all' ? [] : [form.elements.rarity.value]),
    ...filterState,
  });

  function animateChange(target, frames, duration = 220) {
    if (!target?.animate) return;
    target.getAnimations().forEach(animation => animation.cancel());
    if (reducedMotion.matches) return;
    target.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  function syncFilterButtons() {
    form.querySelectorAll('[data-filter-group]').forEach(group => {
      const selected = filterState[group.dataset.filterGroup];
      group.querySelectorAll('[data-filter-value]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.filterValue === 'all' ? selected.size === 0 : selected.has(button.dataset.filterValue)));
      });
    });
  }

  function syncBulkButtons() {
    const evolvable = cards.filter(card => card.evolution);
    const evolved = evolvable.filter(card => selectedEvolution(card, currentFilters())).length;
    document.querySelectorAll('[data-all-evolution]').forEach(button => {
      button.disabled = evolvable.length === 0;
      button.setAttribute('aria-pressed', String(evolvable.length > 0 && (button.dataset.allEvolution === 'evolution' ? evolved === evolvable.length : evolved === 0)));
    });
  }

  function cardSearch(card, evolved = false) {
    const side = evolved && card.evolution ? card.evolution : card;
    return textKey([side.name, side.effect, card.name, LABELS.kind[card.kind], LABELS.element[card.element], card.rarity].join(' '));
  }

  function selectedEvolution(card, filters) {
    if (!card.evolution) return false;
    if (evolutionState.has(card.id)) return evolutionState.get(card.id);
    if (filters.query) {
      const baseMatch = cardSearch(card, false).includes(filters.query);
      const evolutionMatch = cardSearch(card, true).includes(filters.query);
      if (!baseMatch && evolutionMatch) return true;
    }
    return evolutionState.get(card.id) === true;
  }

  function visualHtml(card, evolved = false) {
    const side = evolved && card.evolution ? card.evolution : card;
    const name = escapeHtml(side.name);
    const effect = escapeHtml(side.effect || '効果なし');
    const art = side.artPath || card.artPath;
    const artHtml = art
      ? `<img src="${escapeHtml(art)}" alt="${name}" loading="lazy" decoding="async" width="1024" height="1024">`
      : `<span class="game-card__fallback">${name.slice(0, 2)}</span>`;
    if (card.kind === 'creature') {
      return `<div class="game-card game-card--creature" data-element="${escapeHtml(card.element)}">
        <img class="game-card__background" src="/assets/cards/bg-${escapeHtml(card.element)}.webp" alt="" loading="lazy" decoding="async" width="1024" height="1536">
        <div class="game-card__header"><strong class="game-card__name">${name}</strong></div>
        <div class="game-card__art">${artHtml}</div><span class="game-card__cost">${side.cost ?? card.cost}G</span>
        <div class="game-card__info"><div class="game-card__stats">
          <span class="game-card__stat"><img src="/assets/cards/stat-at-icon.svg" alt="AT" width="64" height="64">${side.at}</span>
          <span class="game-card__stat"><img src="/assets/cards/stat-hp-icon.svg" alt="HP" width="64" height="64">${side.hp}</span>
        </div><p class="game-card__effect">${effect}</p></div></div>`;
    }
    if (card.kind === 'spell') {
      return `<div class="game-card game-card--spell${card.id === 'sp_evolve' ? ' game-card--evolve' : ''}">
        <img class="game-card__background" src="/assets/cards/bg-spell-v1.webp" alt="" loading="lazy" decoding="async" width="1024" height="1536">
        <div class="game-card__header"><strong class="game-card__name">${name}</strong></div>
        <div class="game-card__art">${artHtml}</div><span class="game-card__cost">${side.cost ?? card.cost}G</span>
        <div class="game-card__info"><p class="game-card__effect">${effect}</p></div>${card.exileAfterUse ? '<span class="game-card__exile">廃棄</span>' : ''}</div>`;
    }
    const power = card.at ? `AT＋${card.at}` : card.hp ? `DF＋${card.hp}` : '能力';
    return `<div class="game-card game-card--weapon">
      <img class="game-card__background" src="/assets/cards/bg-weapon-v1.webp" alt="" loading="lazy" decoding="async" width="1024" height="1536">
      <div class="game-card__header"><strong class="game-card__name">${name}</strong></div>
      <div class="game-card__art">${artHtml}</div><span class="game-card__cost">${side.cost ?? card.cost}G</span>
      <div class="game-card__info"><p class="game-card__power">${power}</p><p class="game-card__effect">${effect}</p></div>${card.exileAfterUse ? '<span class="game-card__exile">廃棄</span>' : ''}</div>`;
  }

  function cardHtml(card, filters) {
    const evolved = selectedEvolution(card, filters);
    const side = evolved && card.evolution ? card.evolution : card;
    const modes = card.evolution ? `<div class="catalog-card__evolution" aria-label="${escapeHtml(card.name)}の進化表示">
      <button type="button" data-evolution="base" aria-pressed="${!evolved}" title="進化前・進化後を切り替え">進化前</button>
      <button type="button" data-evolution="evolution" aria-pressed="${evolved}" title="進化前・進化後を切り替え">進化後</button></div>` : '';
    return `<article class="catalog-card" data-card-id="${escapeHtml(card.id)}">
      <button class="catalog-card__open" type="button" data-open-card aria-label="${escapeHtml(side.name)}の詳細を見る">
        ${visualHtml(card, evolved)}
      </button><div class="catalog-card__details"><span class="catalog-card__caption"><b>${escapeHtml(side.name)}</b>${escapeHtml(LABELS.kind[card.kind])}</span>${modes}</div></article>`;
  }

  function appendBatch() {
    if (rendered >= filtered.length) return;
    const filters = currentFilters();
    const fragment = document.createDocumentFragment();
    filtered.slice(rendered, rendered + BATCH_SIZE).forEach(card => {
      const host = document.createElement('div');
      host.innerHTML = cardHtml(card, filters);
      fragment.appendChild(host.firstElementChild);
    });
    rendered = Math.min(rendered + BATCH_SIZE, filtered.length);
    grid.appendChild(fragment);
  }

  function applyFilters() {
    const filters = currentFilters();
    filtered = cards.filter(card => {
      const queryMatch = !filters.query || cardSearch(card, false).includes(filters.query) || cardSearch(card, true).includes(filters.query);
      const kindMatch = !filters.kind.size || filters.kind.has(card.kind);
      const elementMatch = !filters.element.size || filters.element.has(card.element);
      const rarityMatch = !filters.rarity.size || filters.rarity.has(card.rarity);
      return queryMatch && kindMatch && elementMatch && rarityMatch;
    });
    rendered = 0;
    grid.replaceChildren();
    $('[data-result-count]').textContent = filtered.length.toLocaleString('ja-JP');
    $('[data-result-summary]').textContent = `${cards.length}種中 ${filtered.length}種を表示`;
    stateBox.hidden = filtered.length > 0;
    if (!filtered.length) stateBox.textContent = '条件に一致するカードがありません。';
    appendBatch();
    syncBulkButtons();
    animateChange(grid, [{ opacity: .35, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }]);
  }

  function updateCardElement(host, card, evolved) {
    evolutionState.set(card.id, evolved);
    const open = host.querySelector('[data-open-card]');
    const side = evolved ? card.evolution : card;
    open.innerHTML = visualHtml(card, evolved);
    open.setAttribute('aria-label', `${side.name}の詳細を見る`);
    const caption = host.querySelector('.catalog-card__caption');
    caption.innerHTML = `<b>${escapeHtml(side.name)}</b>${escapeHtml(LABELS.kind[card.kind])}`;
    host.querySelectorAll('[data-evolution]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.evolution === 'evolution') === evolved)));
    animateChange(open, [{ opacity: .4, transform: 'perspective(700px) rotateY(-12deg) scale(.98)' }, { opacity: 1, transform: 'perspective(700px) rotateY(0) scale(1)' }], 280);
  }

  function modalMeta(card, evolved) {
    const side = evolved && card.evolution ? card.evolution : card;
    const items = [];
    if (card.element) items.push(['属性', LABELS.element[card.element]]);
    if (card.rarity) items.push(['レアリティ', card.rarity]);
    items.push(['コスト', `${side.cost ?? card.cost}G`]);
    if (card.kind === 'creature') items.push(['AT', side.at], ['HP', side.hp]);
    else if (card.kind === 'weapon') items.push([card.at ? 'AT補正' : card.hp ? 'DF補正' : '種別', card.at ? `＋${card.at}` : card.hp ? `＋${card.hp}` : '妨害']);
    return items.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  }

  function syncDialogUrl() {
    if (!activeCard) return;
    const url = new URL(location.href);
    url.searchParams.set('card', activeCard.id);
    if (activeEvolution) url.searchParams.set('evolved', '1'); else url.searchParams.delete('evolved');
    history.replaceState(null, '', url);
  }

  function renderDialog() {
    if (!activeCard) return;
    if (!activeCard.evolution) activeEvolution = false;
    const side = activeEvolution && activeCard.evolution ? activeCard.evolution : activeCard;
    $('[data-dialog-card]').innerHTML = visualHtml(activeCard, activeEvolution);
    $('[data-dialog-kind]').textContent = `${LABELS.kind[activeCard.kind]}${activeCard.element ? ` / ${LABELS.element[activeCard.element]}` : ''}`;
    $('[data-dialog-name]').textContent = side.name;
    $('[data-dialog-effect]').textContent = side.effect || '効果なし';
    $('[data-dialog-meta]').innerHTML = modalMeta(activeCard, activeEvolution);
    const modes = $('[data-dialog-modes]');
    modes.hidden = !activeCard.evolution;
    modes.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.dialogMode === 'evolution') === activeEvolution)));
    const index = filtered.findIndex(card => card.id === activeCard.id);
    $('[data-dialog-position]').textContent = `${Math.max(0, index) + 1} / ${filtered.length}`;
    syncDialogUrl();
    animateChange($('[data-dialog-card]'), [{ opacity: .4, transform: 'translateX(10px)' }, { opacity: 1, transform: 'translateX(0)' }]);
  }

  function openDialog(card, evolved = false) {
    if (!card) return;
    previousFocus = document.activeElement;
    activeCard = card;
    activeEvolution = !!evolved && !!card.evolution;
    renderDialog();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('modal-open');
    $('[data-dialog-close]').focus();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    document.body.classList.remove('modal-open');
    const url = new URL(location.href);
    url.searchParams.delete('card');
    url.searchParams.delete('evolved');
    history.replaceState(null, '', url);
    previousFocus?.focus?.();
    activeCard = null;
  }

  function moveDialog(step) {
    if (!activeCard || !filtered.length) return;
    const index = filtered.findIndex(card => card.id === activeCard.id);
    activeCard = filtered[(index + step + filtered.length) % filtered.length];
    activeEvolution = selectedEvolution(activeCard, currentFilters());
    renderDialog();
  }

  grid.addEventListener('click', event => {
    const host = event.target.closest('[data-card-id]');
    if (!host) return;
    const card = cards.find(item => item.id === host.dataset.cardId);
    const mode = event.target.closest('[data-evolution]');
    if (mode && card?.evolution) {
      const evolved = host.querySelector('[data-evolution="evolution"]').getAttribute('aria-pressed') === 'true';
      updateCardElement(host, card, !evolved);
      syncBulkButtons();
      return;
    }
    if (event.target.closest('[data-open-card]')) {
      const evolved = host.querySelector('[data-evolution="evolution"]')?.getAttribute('aria-pressed') === 'true';
      openDialog(card, evolved);
    }
  });

  let searchTimer = 0;
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('click', event => {
    const button = event.target.closest('[data-filter-value]');
    if (!button) return;
    window.clearTimeout(searchTimer);
    const selected = filterState[button.closest('[data-filter-group]').dataset.filterGroup];
    const value = button.dataset.filterValue;
    if (value === 'all') selected.clear();
    else if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    syncFilterButtons();
    applyFilters();
  });
  form.addEventListener('input', event => {
    if (event.target.name !== 'query') return;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(applyFilters, 100);
  });
  form.addEventListener('change', event => {
    if (event.target.tagName !== 'SELECT') return;
    window.clearTimeout(searchTimer);
    applyFilters();
  });
  form.addEventListener('reset', () => {
    window.clearTimeout(searchTimer);
    Object.values(filterState).forEach(selected => selected.clear());
    syncFilterButtons();
    window.setTimeout(applyFilters);
  });
  document.querySelectorAll('[data-all-evolution]').forEach(button => button.addEventListener('click', () => {
    const evolved = button.dataset.allEvolution === 'evolution';
    cards.filter(card => card.evolution).forEach(card => evolutionState.set(card.id, evolved));
    grid.querySelectorAll('[data-card-id]').forEach(host => {
      const card = cards.find(item => item.id === host.dataset.cardId);
      if (card.evolution) updateCardElement(host, card, evolved);
    });
    syncBulkButtons();
    $('[data-evolution-status]').textContent = evolved ? '進化できるカードをすべて進化後に切り替えました。' : 'すべて進化前に戻しました。';
  }));
  $('[data-dialog-close]').addEventListener('click', closeDialog);
  $('[data-dialog-prev]').addEventListener('click', () => moveDialog(-1));
  $('[data-dialog-next]').addEventListener('click', () => moveDialog(1));
  dialog.querySelectorAll('[data-dialog-mode]').forEach(button => button.addEventListener('click', () => {
    activeEvolution = !activeEvolution;
    evolutionState.set(activeCard.id, activeEvolution);
    const host = Array.from(grid.querySelectorAll('[data-card-id]')).find(item => item.dataset.cardId === activeCard.id);
    if (host) updateCardElement(host, activeCard, activeEvolution);
    syncBulkButtons();
    renderDialog();
  }));
  dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  document.addEventListener('keydown', event => {
    if (!dialog.open) return;
    if (event.key === 'ArrowLeft') moveDialog(-1);
    if (event.key === 'ArrowRight') moveDialog(1);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) appendBatch();
    }, { rootMargin: '800px 0px' }).observe(sentinel);
  }

  fetch('/api/catalog', { headers: { Accept: 'application/json' } }).then(response => {
    if (!response.ok) throw new Error('catalog_unavailable');
    return response.json();
  }).then(data => {
    cards = Array.isArray(data.cards) ? data.cards : [];
    $('[data-version]').textContent = data.version || '1.56';
    $('[data-total]').textContent = data.counts?.total ?? cards.length;
    $('[data-evolutions]').textContent = data.counts?.evolutions ?? cards.filter(card => card.evolution).length;
    stateBox.hidden = true;
    applyFilters();
    const requested = new URL(location.href).searchParams.get('card');
    if (requested) {
      const card = cards.find(item => item.id === requested);
      if (card) openDialog(card, new URL(location.href).searchParams.get('evolved') === '1');
    }
  }).catch(() => {
    stateBox.hidden = false;
    stateBox.textContent = 'カード情報を読み込めませんでした。時間をおいて再度お試しください。';
    $('[data-result-count]').textContent = '0';
    $('[data-result-summary]').textContent = '読み込みエラー';
  });
})();
