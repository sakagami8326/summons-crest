(() => {
  'use strict';
  const D = window.SummonsDevice;
  const params = new URLSearchParams(location.search);
  const embedded = params.get('embedded') === '1' && parent !== window;
  const context = params.get('context') === 'phone' ? 'phone' : 'board';
  const device = D.current();
  const root = document.getElementById('guide');
  const readRole = () => { try { return sessionStorage.getItem(D.roleKey); } catch (_) { return null; } };
  const saveRole = role => { try { sessionStorage.setItem(D.roleKey, role); } catch (_) {} };
  let role = device === 'phone' || (embedded && context === 'phone') ? 'phone' : device === 'tablet' ? readRole() : 'board';
  if (embedded && context === 'board' && device === 'tablet') role = 'board';
  if (!embedded && device === 'tablet' && role === 'board' && params.get('entry') === '1') {
    location.replace('/play?screen=board'); return;
  }
  let mode = device === 'tablet' && !role ? 'role' : 'choose';
  let method = ['pc','pc-tv','fire-tv','google-tv'].includes(params.get('method')) ? params.get('method') : '';
  let display = 'tv', os = 'windows', step = 0;
  if (method && mode !== 'role') mode = method === 'pc-tv' ? 'display' : 'slides';
  const titles = { pc:'PCの画面で遊ぶ', 'pc-tv':'PCを外部画面に映す', 'fire-tv':'Fire TVで開く', 'google-tv':'Google TVで開く' };
  const address = 'https://summonscode.jp/play';
  function boardTiles(x, y, w, h) {
    const colors = ['#b9604b','#427baf','#55927d','#b49a59'];
    let s = '';
    for (let r=0;r<3;r++) for(let c=0;c<4;c++) s += `<rect x="${x+c*w/4+2}" y="${y+r*h/3+2}" width="${w/4-4}" height="${h/3-4}" rx="2" fill="${colors[(r+c)%4]}" opacity=".85"/>`;
    return s;
  }
  function monitor(x,y,w,h,laptop) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#091828" stroke="#a0bad0" stroke-width="3"/><rect x="${x+6}" y="${y+6}" width="${w-12}" height="${h-14}" rx="2" fill="#1a344d"/>${boardTiles(x+9,y+9,w-18,h-20)}${laptop ? `<path d="M${x-10} ${y+h+4}h${w+20}l-9 9H${x-1}z" fill="#8ea5b8"/><path d="M${x+w*.35} ${y+h+5}h${w*.3}" stroke="#30475d" stroke-width="3"/>` : `<path d="M${x+w*.45} ${y+h+1}v14h${w*.1}v-14" fill="#819ab0"/><path d="M${x+w*.25} ${y+h+18}h${w*.5}" stroke="#a0bad0" stroke-width="4" stroke-linecap="round"/>`}`;
  }
  function phone(x,y){return `<rect x="${x}" y="${y}" width="38" height="67" rx="7" fill="#081727" stroke="#a0bad0" stroke-width="2"/><rect x="${x+5}" y="${y+10}" width="28" height="45" rx="2" fill="#17344d" stroke="#d2b575"/><path d="M${x+19} ${y+20}l8 13-8 12-8-12z" fill="#d1b16c"/><path d="M${x+14} ${y+5}h10" stroke="#a0bad0"/>`;}
  function art(kind) {
    let s='';
    if(kind==='phones') s=phone(80,36)+phone(132,36);
    else if(kind==='pc') s=monitor(25,30,144,90,true)+phone(193,59);
    else if(kind==='tv') s=monitor(45,22,166,102,false);
    else if(kind==='pc-tv') s=monitor(10,61,82,51,true)+monitor(126,25,118,76,false)+'<path d="M83 122H109V80H124" fill="none" stroke="#ebc575" stroke-width="3"/><text x="98" y="144" fill="#ebc575" font-size="12">HDMI</text>';
    else if(kind==='projector') s=monitor(5,84,62,40,true)+'<path d="M65 124h21V105h12" fill="none" stroke="#ebc575" stroke-width="3"/><rect x="97" y="89" width="49" height="26" rx="5" fill="#55728b" stroke="#b5c9da"/><circle cx="133" cy="100" r="7" fill="#b9e2ec"/><path d="M140 94L179 44V106L140 106" fill="#9cdeef" opacity=".14"/><path d="M174 35h77M178 35v77h69V35M212 112v31m-20 0h40" stroke="#d3dce4" stroke-width="3" fill="none"/>'+boardTiles(182,41,61,64)+'<text x="81" y="140" fill="#b3c7d9" font-size="11">プロジェクター</text>';
    else if(kind==='stream') s=monitor(12,24,165,103,false)+'<rect x="195" y="52" width="23" height="71" rx="10" fill="#3e5368" stroke="#92adc3"/><circle cx="207" cy="70" r="7" fill="#11283d" stroke="#b1c3d1"/><circle cx="207" cy="96" r="3" fill="#b3c8d9"/><rect x="225" y="105" width="17" height="33" rx="3" fill="#72879a"/><path d="M229 105v-8h9v8" fill="#e3c989"/>';
    else if(kind==='cable') s='<rect x="30" y="30" width="50" height="35" rx="5" fill="#47617a"/><path d="M37 30V16h36v14" fill="#d5c48d"/><path d="M55 65v30q0 30 35 30h80q35 0 35-30V65" fill="none" stroke="#9fbed5" stroke-width="8"/><rect x="180" y="30" width="50" height="35" rx="5" fill="#47617a"/><path d="M187 30V16h36v14" fill="#d5c48d"/><text x="90" y="87" fill="#ebc575" font-size="22">HDMI</text>';
    else if(kind==='input') s=monitor(10,24,153,98,false)+'<rect x="27" y="38" width="120" height="65" rx="4" fill="#0b2037"/><text x="41" y="62" fill="#b4cadd" font-size="14">入力切替</text><rect x="35" y="70" width="104" height="23" rx="3" fill="#e7c577"/><text x="54" y="87" fill="#172339" font-size="14">HDMI 1</text><rect x="194" y="35" width="29" height="89" rx="11" fill="#4c647a"/><circle cx="208" cy="56" r="7" fill="#ebc575"/>';
    else if(kind==='browser') s='<rect x="14" y="20" width="230" height="122" rx="8" fill="#152e46" stroke="#8eaac1" stroke-width="3"/><path d="M15 50h229" stroke="#8eaac1"/><circle cx="28" cy="35" r="3" fill="#ddbe7c"/><rect x="42" y="27" width="189" height="17" rx="3" fill="#091725"/><text x="47" y="39" fill="#d9e7ed" font-size="10">summonscode.jp/play</text><text x="55" y="91" fill="#ebc575" font-size="18" font-family="Georgia,serif">SUMMONS CODE</text><rect x="87" y="106" width="83" height="17" rx="4" fill="#d7b76f"/>';
    return `<svg class="art" viewBox="${kind==='phones'?'70 25 110 95':'0 0 260 160'}" aria-hidden="true" focusable="false">${s}</svg>`;
  }
  function roles() { return `<div class="roles"><figure>${art('tv')}<figcaption>盤面を見る画面</figcaption></figure><span class="plus" aria-hidden="true">＋</span><figure class="phones">${art('phones')}<figcaption>各自のスマホ</figcaption></figure></div>`; }
  function button(action,text,primary=false) { return `<button class="button${primary?' primary':''}" data-action="${action}">${text}</button>`; }
  function card(action,title,sub,detail,kind,featured=false) {
    return `<button class="choice${featured?' featured':''}" data-action="${action}">${art(kind)}<h2>${title}</h2>${Array.isArray(sub)?`<div class="equipment-badges" aria-label="準備するもの">${sub.map(label=>`<span class="badge equipment">${label}</span>`).join('')}</div>`:`<p>${sub}</p>`}${!Array.isArray(sub)&&detail?`<p>${detail}</p>`:''}<span class="choice-bottom">準備のしかたを見る <span aria-hidden="true">›</span></span></button>`;
  }
  function header(stage=1) { return `<header class="guide-header"><div class="guide-title-group"><img class="brand" src="/assets/summons-code-gold.svg" alt="SUMMONS CODE" width="196" height="65"><p class="guide-title">遊び方</p></div><div class="header-actions"><span class="progress"><b>STEP ${stage} / 3</b>　${['画面の準備','ルーム作成','スマホで参加'][stage-1]}</span><button class="button primary skip-button" data-action="finish">遊び方をスキップ <span aria-hidden="true">›</span></button></div></header>`; }
  function footer() { return `<footer class="footer"><div class="link-row"><a href="/" target="_blank" rel="noopener">公式ホームページ</a><a href="/rules" target="_blank" rel="noopener">遊び方・ルール</a>${device==='tablet'?'<button class="text-button role-change" data-action="role">端末の役割を変更</button>':''}</div></footer>`; }
  function urlPanel() { return `<div class="url-panel"><label for="game-url">盤面用の端末で入力するURL</label><div class="url-row"><input id="game-url" value="${address}" readonly aria-label="盤面用の端末で入力するURL"><button class="button" data-action="copy">コピー</button></div><span id="copy-status" class="copy-status" role="status">PC・テレビ側のブラウザのアドレス欄に入力してください。</span></div>`; }
  function urlExample() { return `<div class="url-panel url-example"><p class="small">盤面用の端末で開くURL</p><code>${address}</code><p class="small">ここでは手順をご紹介しています。今この画面で入力やコピーをする必要はありません。</p></div>`; }
  function troubleshooting() { return `<details><summary>画面が映らないとき</summary><ul><li>ケーブルの両端がPCと表示機器に差し込まれているか確認します。</li><li>テレビ・プロジェクターの入力番号と、ケーブルを挿したHDMI番号を合わせます。</li><li>PCの画面設定を「複製」または「ミラーリング」にします。</li><li>USB-Cなどの変換アダプターは、PCとアダプターの両方が映像出力に対応している必要があります。</li></ul></details>`; }
  function screens() {
    let prep;
    if(method==='pc') prep=[];
    else if(method==='pc-tv') prep=[
      {title:'映像ケーブルを用意する',kind:'cable',body:`PCと${display==='projector'?'プロジェクター':'テレビ・モニター'}の端子を確認します。基本の例は<strong>HDMIケーブル</strong>です。`,small:'PCにHDMI端子がない場合は、映像出力に対応した変換アダプター・ケーブルを使います。USB-C端子なら必ず映像が出るわけではありません。'},
      {title:display==='projector'?'PCをプロジェクターにつなぐ':'PCをテレビ・モニターにつなぐ',kind:display==='projector'?'projector':'pc-tv',body:display==='projector'?'PCとプロジェクターを映像ケーブルで接続し、プロジェクターからスクリーンへ映します。':'PCとテレビ・モニターを映像ケーブルで接続します。',small:'スマホをこのケーブルにつなぐ必要はありません。'},
      {title:'表示機器の入力を切り替える',kind:'input',body:`${display==='projector'?'プロジェクター':'テレビ・モニター'}の<strong>「入力切替」</strong>で、ケーブルを挿した<strong>「HDMI 1」</strong>などを選びます。`,small:'入力番号は機器によって異なります。端子の横に書かれた番号を確認してください。'},
      {title:'PCと同じ画面を映す',kind:display==='projector'?'projector':'pc-tv',body:os==='windows'?'PCで <kbd>Windows</kbd> ＋ <kbd>P</kbd> を押し、<strong>「複製」</strong>を選びます。':'Macの<strong>「システム設定」→「ディスプレイ」</strong>で接続した画面を選び、ミラーリングに設定します。',small:'まずはPCと同じ画面を映す設定にすると、操作しやすくなります。設定名はOSのバージョンで異なる場合があります。',os:true,help:true}];
    else prep=[
      {title:`${method==='fire-tv'?'Fire TV':'Google TV'}のホーム画面を表示`,kind:'stream',body:method==='fire-tv'?'Fire TVの電源とネット接続を確認し、テレビ・プロジェクターの入力をFire TVの接続先へ切り替えます。':'Google TV搭載テレビではホーム画面を開きます。外付け機器の場合は電源とネット接続を確認し、テレビ・プロジェクターの入力を接続先へ切り替えます。',small:'スクリーンに映す場合は、接続機器をプロジェクターに接続して使用します。機器同士の対応端子も確認してください。'},
      {title:'テレビ用のブラウザを開く',kind:'browser',body:method==='fire-tv'?'アプリ一覧から<strong>Silkブラウザ</strong>を開きます。未導入の場合はアプリ検索で「Silk」を探してください。':'アプリ検索でテレビ対応ブラウザを探します。<strong>TV Bro</strong>を検証対象としています。利用できる機器では導入して開きます。',small:'ゲーム専用アプリは不要ですが、ブラウザアプリの導入が必要な場合があります。ブラウザが見つからないときは「別の方法を選ぶ」からPCを使う方法へ戻れます。'},
      {title:'ブラウザにゲームURLを入力',kind:'browser',body:'リモコンでブラウザの<strong>アドレス欄</strong>を選び、ゲームURLを入力すると、タイトル画面が表示されます。',url:true,small:'これはスマホの映像を転送する操作ではありません。テレビ側のブラウザでゲームを開きます。'},
      {title:'タイトルを確認する',image:'../start-guide/title-screen-v2.webp',body:'SUMMONS CODEのタイトルが表示されたら、リモコンでルーム作成へ進みます。',small:'表示や操作がうまくいかない場合は、PCを使う方法を選んでください。'}];
    return prep.concat([
      {stage:2,title:'盤面側でルームを作る',highlightRoom:true,image:'../start-guide/title-screen-v2.webp',body:'<strong>「ルームを作る」</strong>または<strong>「BOT戦」</strong>を選び、マップを決めてルームを作成します。',small:'通常対戦は2〜4人。BOT戦なら1人＋BOTで遊べます。どちらも参加者の操作にはスマホを使います。'},
      {stage:3,title:'スマホでQRを読み取り、参加する',image:'how-step-qr-redani-v154-768.webp',body:'盤面に表示されたQRコードを<strong>各自のスマホ</strong>で読み取り、名前を入力して<strong>「参加する」</strong>を押します。',small:'QRから開けばルームコードの入力は不要です。QRが使えない場合は「ルームコードで参加する」から4文字のコードを入力します。参加後はスマホを横向きにし、画面の案内に沿って召喚士を確定。全員の準備ができたら、盤面側で「ゲーム開始」を押します。'}
    ]);
  }
  function render(focus=true) {
    let html='';
    if(mode==='role') html=header()+`<section class="role-choice"><h1 class="step-heading" tabindex="-1">このタブレットをどう使いますか？</h1><p class="note">みんなで見る盤面にも、手元の操作用にも使えます。</p><div class="choices">${card('role-board','盤面を表示する','みんなで見る画面にする','各自のスマホで操作します','tv')}${card('role-phone','操作用として参加する','手札やサイコロを操作','別の端末に盤面を表示します','phones')}</div></section>`+footer();
    else if(mode==='choose') html=header()+`<section class="intro"><div><h1 tabindex="-1">遊ぶ環境を選ぶ</h1><p>みんなで見る画面と、操作するスマホを用意しましょう。</p></div>${roles()}</section><div class="choices">${card('method-pc','PCの画面で遊ぶ',['PC','各自のスマホ'],'テレビへの接続は不要','pc',true)}${card('method-pc-tv','PCをテレビ・モニター・<br>スクリーンに映す',['PC','表示機器','映像ケーブル','各自のスマホ'],'スクリーンにはプロジェクターで投映','pc-tv')}${card('stream','Fire TV・Google TVで開く',['テレビ・プロジェクター','対応ブラウザ','各自のスマホ'],'PCを使わずに盤面を表示','stream',false,true)}</div><p class="note">どの方法でも、操作には各自のスマホを使います。<br>1人でBOT戦をする場合も、盤面用の画面と操作用スマホが必要です。</p>`+footer();
    else if(mode==='display'||mode==='stream') {
      const isDisplay=mode==='display';
      html=header()+`<section class="subchoices"><p class="breadcrumbs">画面の準備 ／ ${isDisplay?'PCを外部画面に映す':'テレビ用ブラウザを使う'}</p><h1 class="step-heading" tabindex="-1">${isDisplay?'どの画面に映しますか？':'どちらの機器を使いますか？'}</h1><div class="choices">${isDisplay?card('display-tv','テレビ・モニター','PC → ケーブル → 外部画面','入力切替と画面設定をご案内','pc-tv')+card('display-projector','プロジェクター＋スクリーン','PC → プロジェクター → スクリーン','スクリーンだけでは表示できません','projector'):card('method-fire-tv','Fire TV','Silkブラウザを利用','機種・ブラウザによって利用可否が異なります','stream',false,true)+card('method-google-tv','Google TV','TV Broを検証対象にしています','搭載テレビ・外付け接続機器','stream',false,true)}</div><div class="step-nav">${button('choose','‹ 別の方法を選ぶ')}</div></section>`+footer();
    } else if(mode==='slides') {
      const all=screens(), item=all[step], stage=item.stage||1, count=all.length-2;
      const body=item.body.startsWith('<ol>')?item.body:`<p>${item.body}</p>`;
      html=header(stage)+`<section><div class="step-top"><p class="breadcrumbs">${titles[method]} ／ ${stage===1?`準備 ${step+1} / ${count}`:`STEP ${stage} / 3`}</p><h1 class="step-heading" tabindex="-1">${item.title}</h1></div><div class="step-layout"><figure class="step-visual">${item.image?`<div class="${item.highlightRoom?'annotated-screen':'reference-screen'}"><img src="/assets/site/${item.image}" alt="${item.title}の参考画面${item.highlightRoom?'。「ルームを作る」と「BOT戦」を赤枠で表示':''}" decoding="async">${item.highlightRoom?'<span class="room-highlight normal-room" aria-hidden="true"></span><span class="room-highlight bot-room" aria-hidden="true"></span>':''}</div>`:art(item.kind)}<figcaption>${item.highlightRoom?'赤枠の「ルームを作る」または「BOT戦」を選びます。':item.image?'操作する端末と、ボタンの名前を確認しましょう。':'機器・接続の図解（設定画面の再現ではありません）'}</figcaption></figure><div class="step-copy">${item.os?`<div class="tabs" aria-label="PCの種類"><button class="button" data-action="os-windows" aria-pressed="${os==='windows'}">Windows</button><button class="button" data-action="os-mac" aria-pressed="${os==='mac'}">Mac</button></div>`:''}${body}${item.small?`<p class="small">${item.small}</p>`:''}${item.url?urlExample():''}${item.help?troubleshooting():''}${step===count-1?'<p class="small ready-hint">画面の準備ができたあとの流れを、次の「ルーム作成」でご紹介します。</p>':''}</div></div><nav class="step-nav" aria-label="説明のページ移動">${button('prev','‹ 戻る')}<div class="nav-right"><button class="text-button" data-action="choose">別の方法を選ぶ</button>${button(step===all.length-1?'finish':'next',step===all.length-1?(role==='board'?'ゲームに進む':'準備の説明を終える'):'次へ ›',true)}</div></nav></section>`+footer();
    } else html=header()+`<section class="complete"><h1 class="step-heading" tabindex="-1">スマホ・タブレットは<br>コントローラーになります</h1>${roles()}<p>盤面用の端末でゲームを開いて、ルームを作成してください。<br>表示されたQRをこの端末で読み取ると参加できます。</p>${urlPanel()}${button('choose','準備の説明をもう一度見る')}</section>`+footer();
    root.innerHTML=html;
    if(focus) { root.querySelector('h1')?.focus({preventScroll:true}); window.scrollTo(0,0); }
  }
  function finish() {
    try { localStorage.setItem(D.seenKey,'done'); } catch (_) {}
    if(embedded) { parent.postMessage({type:'summons-guide-close'},location.origin); return; }
    if(role==='board' && device!=='phone') { location.assign(device==='tablet'?'/play?screen=board&guide=done':'/play?guide=done'); return; }
    mode='complete';render();
  }
  root.addEventListener('click',async event=>{
    const target=event.target.closest('[data-action]'); if(!target) return;
    const action=target.dataset.action;
    if(action==='finish') return finish();
    if(action==='copy') {
      const input=document.getElementById('game-url'), status=document.getElementById('copy-status');
      try { await navigator.clipboard.writeText(input.value); status.textContent='コピーしました。盤面用の端末で開いてください。'; }
      catch (_) { input.focus();input.select();status.textContent='URLを選択しました。長押し、またはコピー操作でコピーしてください。'; }
      return;
    }
    if(action==='role') mode='role';
    else if(action.startsWith('role-')) {
      role=action.slice(5);saveRole(role);
      if(embedded && context==='board' && role==='phone'){parent.postMessage({type:'summons-guide-controller'},location.origin);return;}
      if(embedded && context==='phone' && role==='board'){parent.postMessage({type:'summons-guide-board'},location.origin);return;}
      if(!embedded && role==='phone'){location.assign('/phone');return;}
      mode=method?(method==='pc-tv'?'display':'slides'):'choose';step=0;
    } else if(action==='choose') {mode='choose';method='';step=0;}
    else if(action==='stream') mode='stream';
    else if(action.startsWith('method-')) {method=action.slice(7);step=0;mode=method==='pc-tv'?'display':'slides';}
    else if(action.startsWith('display-')) {display=action.slice(8);step=0;mode='slides';}
    else if(action==='next') step++;
    else if(action==='prev') {if(step>0)step--;else mode=method==='pc-tv'?'display':method==='pc'?'choose':'stream';}
    else if(action.startsWith('os-')) {os=action.slice(3);render(false);root.querySelector(`[data-action="${action}"]`)?.focus();return;}
    render();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&embedded){event.preventDefault();finish();return;}
    const controls=[...root.querySelectorAll('button:not(:disabled),a,input,summary')].filter(el=>el.getClientRects().length);
    if(event.key==='Tab'&&embedded&&controls.length){const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===document.body)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||/INPUT/.test(document.activeElement.tagName))return;
    const current=document.activeElement,rect=current.getBoundingClientRect();
    if(!controls.includes(current)){const first=root.querySelector('.choice')||controls[0];if(first){event.preventDefault();first.focus();}return;}
    const horizontal=event.key==='ArrowLeft'||event.key==='ArrowRight',forward=event.key==='ArrowRight'||event.key==='ArrowDown';
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    const next=controls.filter(el=>el!==current).map(el=>{const r=el.getBoundingClientRect(),dx=r.x+r.width/2-x,dy=r.y+r.height/2-y;return {el,primary:horizontal?dx:dy,secondary:horizontal?dy:dx};}).filter(v=>forward?v.primary>5:v.primary< -5).sort((a,b)=>(Math.abs(a.primary)+Math.abs(a.secondary)*2)-(Math.abs(b.primary)+Math.abs(b.secondary)*2))[0];
    if(next){event.preventDefault();next.el.focus();}
  });
  render();
})();
