(() => {
  const search = document.querySelector('[data-rules-search]');
  const sections = [...document.querySelectorAll('[data-rule-section]')];
  const result = document.querySelector('[data-rules-result]');
  const empty = document.querySelector('[data-rules-empty]');
  const clear = document.querySelector('[data-rules-clear]');
  const toc = document.querySelector('[data-rules-toc]');
  const tocLinks = [...document.querySelectorAll('[data-rules-toc] a')];
  if (!search) return;

  if (window.matchMedia('(max-width: 52rem)').matches) toc?.removeAttribute('open');

  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, '');
  function filterRules() {
    const query = normalize(search.value);
    let visible = 0;
    sections.forEach(section => {
      const match = !query || normalize(section.textContent).includes(query);
      section.hidden = !match;
      const link = tocLinks.find(item => item.hash === `#${section.id}`);
      if (link) link.hidden = !match;
      if (match) visible++;
    });
    empty.hidden = visible > 0;
    result.textContent = query ? `${visible}件の項目が見つかりました` : '';
  }
  let timer = 0;
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(filterRules, 100);
  });
  clear?.addEventListener('click', () => { search.value = ''; filterRules(); search.focus(); });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        tocLinks.forEach(link => link.classList.toggle('is-current', link.hash === `#${entry.target.id}`));
      });
    }, { rootMargin: '-22% 0px -68%', threshold: 0 });
    sections.forEach(section => observer.observe(section));
  }
})();
