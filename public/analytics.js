(() => {
  'use strict';

  const measurementId = 'G-WTXTTTFSEF';
  const officialHosts = new Set(['summonscode.jp', 'www.summonscode.jp']);
  if (!officialHosts.has(window.location.hostname)) return;

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
