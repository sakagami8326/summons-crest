const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
        <div class="game-card__art">${artHtml}</div><span class="game-card__cost">${card.cost}G</span>
        <div class="game-card__info"><div class="game-card__stats">
          <span class="game-card__stat"><img src="/assets/cards/stat-at-icon.svg" alt="AT" width="64" height="64">${side.at}</span>
          <span class="game-card__stat"><img src="/assets/cards/stat-hp-icon.svg" alt="HP" width="64" height="64">${side.hp}</span>
        </div><p class="game-card__effect">${effect}</p></div></div>`;
    }
    if (card.kind === 'spell') {
      return `<div class="game-card game-card--spell${card.id === 'sp_evolve' ? ' game-card--evolve' : ''}">
        <img class="game-card__background" src="/assets/cards/bg-spell-v1.webp" alt="" loading="lazy" decoding="async" width="1024" height="1536">
        <div class="game-card__header"><strong class="game-card__name">${name}</strong></div>
        <div class="game-card__art">${artHtml}</div><span class="game-card__cost">${card.cost}G</span>
        <div class="game-card__info"><p class="game-card__effect">${effect}</p></div>${card.exileAfterUse ? '<span class="game-card__exile">廃棄</span>' : ''}</div>`;
    }
    const power = card.at ? `AT＋${card.at}` : card.hp ? `DF＋${card.hp}` : '能力';
    return `<div class="game-card game-card--weapon">
      <img class="game-card__background" src="/assets/cards/bg-weapon-v1.webp" alt="" loading="lazy" decoding="async" width="1024" height="1536">
      <div class="game-card__header"><strong class="game-card__name">${name}</strong></div>
      <div class="game-card__art">${artHtml}</div><span class="game-card__cost">${card.cost}G</span>
      <div class="game-card__info"><p class="game-card__power">${power}</p><p class="game-card__effect">${effect}</p></div>${card.exileAfterUse ? '<span class="game-card__exile">廃棄</span>' : ''}</div>`;
  }


window.previewCardHtml=visualHtml;
