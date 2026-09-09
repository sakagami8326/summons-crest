(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SummonsDevice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function classify(ua, platform, touches) {
    ua = String(ua || '');
    // TV browsers can also advertise Android/Mobile. Match TV before handhelds.
    if (/Fire.?TV|\bAFT\w*|GoogleTV|Google TV|Android TV|SmartTV|SMART-TV|HbbTV|Tizen|Web0S|WebOS|TV Bro|TVBro|BRAVIA|\bSHIELD\b|\bChromecast\b/i.test(ua)) return 'tv';
    if (/iPad|Tablet|\bKF[A-Z0-9]+\b/i.test(ua) || ((/Mac/i.test(platform || '') || /Macintosh/i.test(ua)) && Number(touches) > 1)) return 'tablet';
    if (/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'phone';
    if (/Android/i.test(ua)) return 'tablet';
    return 'desktop';
  }
  function current() { return classify(navigator.userAgent, navigator.platform, navigator.maxTouchPoints); }
  return { classify, current, seenKey: 'sc_start_guide_v1', roleKey: 'sc_screen_role_v1' };
});
