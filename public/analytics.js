(() => {
  'use strict';

  const measurementId = 'G-WTXTTTFSEF';
  const officialHosts = new Set(['summonscode.jp', 'www.summonscode.jp']);
  const enabled = officialHosts.has(window.location.hostname);
  const onceStorageKey = 'sc_analytics_once_v1';

  const cleanParams = params => Object.fromEntries(Object.entries(params || {})
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 100) : value]));

  const readOnce = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(onceStorageKey) || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (error) {
      return {};
    }
  };

  const writeOnce = entries => {
    try {
      const recent = Object.fromEntries(Object.entries(entries)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 100));
      window.localStorage.setItem(onceStorageKey, JSON.stringify(recent));
    } catch (error) {}
  };

  const track = (eventName, params = {}) => {
    if (!enabled || !/^[a-z][a-z0-9_]{0,39}$/.test(eventName) || typeof window.gtag !== 'function') return false;
    window.gtag('event', eventName, Object.assign(cleanParams(params), { transport_type: 'beacon' }));
    return true;
  };

  const trackOnce = (key, eventName, params = {}) => {
    if (!enabled || !key) return false;
    const entries = readOnce();
    if (entries[key]) return false;
    if (!track(eventName, params)) return false;
    entries[key] = Date.now();
    writeOnce(entries);
    return true;
  };

  window.SummonsAnalytics = Object.freeze({ track, trackOnce });
  if (!enabled) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(tag);

  const safeLocation = `${window.location.origin}${window.location.pathname}`;
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    page_location: safeLocation,
    page_path: window.location.pathname,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: true,
  });
})();
