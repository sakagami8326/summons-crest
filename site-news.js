'use strict';
const entries = [
  {date:'2026-09-10',category:'update',title:'ゲームの始め方ガイドを追加しました',slug:'2026-09-10-start-guide'},
  {date:'2026-09-08',category:'update',title:'バグ修正のお知らせと、ご報告へのお礼',slug:'2026-09-08-bug-fixes'},
  {date:'2026-08-31',category:'notice',title:'フィードバックを送れるようになりました',slug:'2026-08-31-feedback'},
  {date:'2026-08-31',category:'notice',title:'SUMMONS CODEを公開しました',slug:'2026-08-31-release'}
];
const labels = {notice:'お知らせ',update:'アップデート'};
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rows(items) {
  return items.map(e=>`<a class="news-row" href="/news/${escape(e.slug)}"><time datetime="${e.date}">${e.date.replaceAll('-','.')}</time><span class="news-category news-category--${e.category}">${labels[e.category]}</span><span class="news-row__title">${escape(e.title)}</span></a>`).join('\n');
}
function render(html, category) {
  const selected=Object.hasOwn(labels,category)?category:'';
  return html.replace('<!-- NEWS_LATEST -->',rows(entries.slice(0,3)))
    .replace('<!-- NEWS_ALL -->',rows(entries.filter(e=>!selected||e.category===selected)))
    .replace('<!-- NEWS_FILTERS -->',[['','すべて'],...Object.entries(labels)].map(([key,label])=>`<a href="/news${key?'?category='+key:''}"${key===selected?' aria-current="page"':''}>${label}</a>`).join(''));
}
module.exports={entries,rows,render,version:JSON.stringify(entries)};
