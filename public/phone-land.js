/* Shared phone land inspection. Choices and combat values come from the server. */
window.PhoneLandUI=(()=>{
const titles={upgrade:'強化する領地を選択',sell:'売却する領地を選択',ult_lia:'炎の渦を放つ領地を選択',ult_nerasio_land:'属性を変える領地を選択',ult_mio:'移動先を選択',move_a:'移動する領地を選択',move_b:'移動先を選択',step_a:'移動する領地を選択',step_b:'移動先を選択',swap_land:'交代する領地を選択',marlow_src:'マーローの領地を選択',marlow_dest:'風渡りの移動先を選択',mermaid_heal:'回復する領地を選択',abyss_mark:'深淵標を置く領地を選択',curse_target:'衰弱を放つ領地を選択',quake_target:'地割れを放つ領地を選択',spell_target:'効果の対象を選択'};
function tileTargets(p){const out={};for(const o of p?.options||[]){const m=/^(up|ct|qt|mt|mv|mb|sw|sl|st|sd|tg|lu|nu|mh|ms|md|am):(\d+)$/.exec(o.id);if(m)out[+m[2]]=o.id;}return out;}
function decisionModel(s,pid,p,tile){
 if(!p)return {hint:'',actions:[]};
 const targets=tileTargets(p),id=targets[tile],multi=['ult_lia','ult_nerasio_land'].includes(p.type),chosen=p.selected||[],max=p.type==='ult_lia'?3:2;
 const label=multi?(chosen.includes(tile)?'選択から外す':'選択に追加'):p.type==='sell'?'この領地を売却':p.type==='upgrade'?'この領地を選択':'ここに決定';
 const actions=[{id:id||'',label,disabled:!id||(multi&&!chosen.includes(tile)&&chosen.length>=max)}];
 const nonTiles=p.options.filter(o=>!Object.values(targets).includes(o.id));
 for(const o of nonTiles)actions.push({id:o.id,label:o.id.endsWith(':confirm')?'決定 ('+chosen.length+')':o.id==='marlow:move'?'風渡り':/cancel$|^pass$/.test(o.id)?'やめる':o.label,disabled:false});
 let hint=id?(multi?'マスを確認して選択に追加':p.type==='upgrade'?'次に強化レベルを選択':p.type==='sell'?'売却 ＋'+s.landStats?.[tile]?.saleValue+'G':'選択内容を確認して決定'):'このマスは選択対象ではありません';
 if(p.type==='sell')hint=id?'売却 ＋'+s.landStats?.[tile]?.saleValue+'G ／ 不足 '+Math.max(0,-(s.players.find(x=>x.id===pid)?.gold||0))+'G':hint;
 return {hint,actions};
}
function create(host,hooks){
const root=document.createElement('div');root.id='phoneLand';root.hidden=true;root.innerHTML="<main data-pl=\"app\"><header><div class=\"heading\"><h1 data-pl=\"title\">領地を確認</h1></div><span data-pl=\"count\" hidden></span><button data-pl=\"close\" class=\"close\" aria-label=\"閉じる\"><svg viewBox=\"0 0 24 24\"><path d=\"M6 6L18 18M18 6L6 18\"/></svg></button></header>\n<div class=\"workspace\"><nav data-pl=\"playerFilters\" aria-label=\"プレイヤーの領地をハイライト\"></nav><section class=\"mapPanel\"><div data-pl=\"mapArea\"></div></section><div class=\"detailColumn\"><section class=\"detailPanel\" aria-label=\"領地の詳細\"><div data-pl=\"detail\"></div><footer data-pl=\"decision\"></footer></section></div></div><div data-pl=\"toast\" role=\"status\"></div></main>";host.append(root);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={fire:'#ff825b',water:'#67bfff',earth:'#e1c160',wind:'#65ddd0',neutral:'#c9b8e4'}, names={fire:'火',water:'水',earth:'土',wind:'風',neutral:'無'},structures={castle:'城',shrine:'祠',gate:'変化の門',market:'市場'};
let data,playerId,pending=null,selected=null,mode='view',filter=null,busy=false,key='',error='';
const $=id=>root.querySelector('[data-pl="'+id+'"]');
const icon=e=>`<span class="element" role="img" aria-label="${names[e]||'無'}属性" style="--element:${colors[e]||colors.neutral};--symbol:url('/assets/element-${e==='water'?'water-v2':e||'neutral'}.svg')"></span>`;
function creature(i){const o=data.owners[i];if(!o)return null;const base=o.creature.replace(/_f$/,'');const c=data.catalog.CREATURES[base]||data.catalog.CREATURES[o.creature];const evolved=/_f$/.test(o.creature)||(o.level>=data.evoLevel&&!!c.evo);return {...c,evolved,name:evolved&&c.evo?c.evo:c.name,art:`/assets/${evolved?'e':'c'}_${base}.png`,effect:evolved?(c.evoFx||c.fx):c.fx};}
const owner=i=>data.players.find(p=>p.id===data.owners[i]?.player);
const mine=i=>data.owners[i]?.player===playerId;
const allowed=i=>!pending||!!tileTargets(pending)[i];
const matches=i=>!filter||data.owners[i]?.player===filter;
function ownerHTML(i){const p=owner(i);return p?`<span class="owner"><img src="/assets/pawn_${p.charId}.${p.charId==='adel'?'webp':'png'}" alt=""><span class="ownerIdentity"><small>所持者</small><b>${esc(p.name)}</b></span>${p.id===playerId?'<small>自分</small>':''}</span>`:'<span class="owner emptyOwner">持ち主なし</span>';}
function select(i){selected=i;error='';renderMap();renderDetail();if(pending?.type==='upgrade'&&allowed(i))hooks.inspect?.(i);}
function renderPlayers(){
 $('playerFilters').innerHTML=data.players.map(p=>{const elem=data.catalog.CHARS[p.charId]?.elem||'neutral';return '<button class="playerFilter '+(filter===p.id?'active':'')+'" data-player="'+p.id+'" aria-label="'+esc(p.name)+'の領地をハイライト" aria-pressed="'+(filter===p.id)+'" style="--player:'+p.color+';--portrait-bg:url(/assets/cards/bg-'+elem+'.webp)"><img src="/assets/pawn_'+p.charId+'.'+(p.charId==='adel'?'webp':'png')+'" alt="">'+icon(elem)+'</button>';}).join('');
 root.querySelectorAll('[data-player]').forEach(el=>el.onclick=()=>{filter=filter===el.dataset.player?null:el.dataset.player;if(filter){const first=data.owners.findIndex(o=>o?.player===filter);if(first>=0)selected=first;}renderPlayers();renderMap();renderDetail();});
}
const abyssAt=i=>(data.abyssMarks||[]).find(m=>m.tile===i);
const landIcon=e=>'<span class="landIcon" style="--tile-bg:url(/assets/cards/bg-'+e+'.webp)">'+icon(e)+'</span>';
function renderMap(){const map=SummonsMaps[data.mapId]||SummonsMaps.starting_corridor,cell=Math.min((296-(map.width-1)*4)/map.width,(296-(map.height-1)*4)/map.height);$('mapArea').innerHTML='<div class="mapGrid" style="--cols:'+map.width+';--rows:'+map.height+';width:'+(cell*map.width+(map.width-1)*4)+'px;height:'+(cell*map.height+(map.height-1)*4)+'px">'+data.tiles.map((t,i)=>{const c=creature(i),p=owner(i),o=data.owners[i];return '<button class="tile '+(selected===i?'selected ':'')+(filter&&matches(i)?'playerHighlight ':'')+(mode!=='view'&&allowed(i)&&matches(i)?'eligible ':'')+(!matches(i)?'muted':'')+'" data-tile="'+i+'" aria-label="'+(i+1)+'番 '+esc(c?c.name:structures[t.t]||names[t.e]+'属性の空き地')+' '+esc(p?.name||'')+(o?' レベル'+o.level:'')+'" aria-pressed="'+(selected===i)+'" style="grid-column:'+(map.geo[i][0]+1)+';grid-row:'+(map.geo[i][1]+1)+';--element:'+(colors[t.e]||'#b7a78b')+';--owner:'+(p?.color||'#635a44')+'">'+(t.t==='land'?icon(t.e):'')+(c?'<img class="tileArt" src="'+c.art+'" alt="">':t.t!=='land'?'<img class="tileStruct" src="/assets/struct_'+t.t+'.png" alt="">':'')+(o?'<span class="tileLevel"><small>Lv.</small><b>'+o.level+'</b></span>':'')+(abyssAt(i)?'<img class="landAbyss" src="/assets/abyss-mark-v1.webp" alt="深淵標">':'')+(pending?.selected?.includes(i)?'<span class="pickedMark">✓</span>':'')+(i===data.players.find(p=>p.id===playerId)?.pos?'<i class="youDot" title="現在地"></i>':'')+'</button>';}).join('')+'</div>';
 root.querySelectorAll('[data-tile]').forEach(el=>el.onclick=()=>select(Number(el.dataset.tile)));
}
const eventInfo={
 castle:{timing:'通過・停止',intro:'刻印を持って城へ帰還すると、3つのボーナス',rows:[['ic_gold.png','Gボーナス','周回数×100G ＋ 100G ＋ 所有地価の合計×10%（四捨五入）'],['ic_hand.png','カードを1枚獲得','ランダムな3枚から1枚を選び、自分の山札へ追加'],['cards/stat-hp-icon.svg','領地のHPを回復','自領地の全クリーチャーの負傷を10回復（最大HPまで）']],note:'刻印は帰還時に消費。刻印なしではボーナスなし。総資産8,000G以上で城を通過すると勝利。停止時は自領地を選んで強化できます。'},
 shrine:{timing:'停止',intro:'祠に止まると、Gとカードを獲得',rows:[['ic_gold.png','＋100G','所持金を100G獲得'],['ic_hand.png','カードを1枚獲得','ランダムな3枚から1枚を選び、自分の山札へ追加'],['struct_shrine.png','巡礼数＋1','祠に止まった回数が、大巡礼者ボーナスの判定に使われます。']],note:'通過だけでは効果は発生しません。'},
 gate:{timing:'通過・停止',intro:'通過時に刻印とG、停止時に恩恵を選択',rows:[['ic_gold.png','＋200G・刻印を獲得','刻印を持っていないときに獲得。城へ持ち帰ると帰還ボーナス'],['ic_hand.png','停止時は、いずれか1つ','自分の領地を選んで強化 ／ ランダムな3枚から1枚獲得'],['cards/stat-at-icon.svg','鍛錬：150G','停止時の選択肢。手札の進化可能なクリーチャー1枚を進化']],note:'強化・鍛錬には所持金などの条件があります。何もしないこともできます。'},
 market:{timing:'停止',intro:'カードの購入や、不要なカードの廃棄',rows:[['ic_hand.png','ランダム商品5枠','クリーチャー・スペル・ウェポンが並びます。価格は商品ごとに表示'],['cards/stat-at-icon.svg','常設ウェポン','ソード・シールド・ディスアームを購入できます。'],['ic_gold.png','カード廃棄：80G','手札・捨て札から1枚を選んで廃棄できます。']],note:'商品ごとに1回購入できます。水鏡の市場が有効なら全品半額。通過だけでは利用できません。'}
};
function eventHTML(type){const e=JSON.parse(JSON.stringify(eventInfo[type])),r=data.landRules||{};
 if(type==='castle'){e.rows[0][2]='周回数×'+r.castleBonusPerLap+'G ＋ '+r.castleLandFixed+'G ＋ 所有地価の合計×'+Math.round(r.castleLandRate*100)+'%（四捨五入）';if(data.mapId==='twin_gate_cavern')e.intro='両方の門を通過して城へ帰還すると、3つのボーナス';}
 if(type==='shrine'){e.rows[0][1]='＋'+r.shrineBonus+'G';e.rows[0][2]='所持金を'+r.shrineBonus+'G獲得';}
 if(type==='gate'){e.rows[0][1]='＋'+r.gateBonus+'G・刻印を獲得';e.rows[2][1]='鍛錬：'+r.forgeCost+'G';if(data.mapId==='twin_gate_cavern'){e.rows[0][1]='未通過の門で＋'+r.gateBonus+'G';e.rows[0][2]='東西の両門を通ると刻印が完成。城へ持ち帰ると帰還ボーナス';}}
 if(type==='market')e.rows[2][1]='カード廃棄：'+r.forgetCost+'G';
 return '<div class="eventHead"><img src="/assets/struct_'+type+'.png" alt=""><div><span>'+e.timing+'</span><h2>'+structures[type]+'</h2><p>'+e.intro+'</p></div></div><div class="eventRows">'+e.rows.map(r=>'<article><img src="/assets/'+r[0]+'" alt=""><div><h3>'+r[1]+'</h3><p>'+r[2]+'</p></div></article>').join('')+'</div>';}
function fitDetail(){
 const el=$('detail');el.classList.remove('compact','tight');
 const overlaps=()=>{const hero=el.querySelector('.creatureHero'),terrain=el.querySelector('.terrain');if(!hero||!terrain)return false;const edge=terrain.getBoundingClientRect().top;return [...hero.querySelectorAll('h2,.stat,.total,.creatureArt')].some(x=>x.getBoundingClientRect().bottom>edge-2);};
 if(el.scrollHeight>el.clientHeight+1||overlaps())el.classList.add('compact');
 if(el.scrollHeight>el.clientHeight+1||overlaps())el.classList.add('tight');
}
function fitCanvas(){root.style.setProperty('--ui-scale',Math.min(1,innerWidth/800,innerHeight/390));if(data)fitDetail();}
addEventListener('resize',()=>{if(!root.hidden)fitCanvas();});
function renderDetail(){const i=selected,o=data.owners[i],t=data.tiles[i],c=creature(i),s=data.landStats?.[i]||{hp:'?',maxHp:'?',df:'?',total:'?',at:'?'};$('detail').classList.toggle('eventDetail',!!eventInfo[t.t]);
 if(c){const match=data.landCombat[i]?.affinity!=='mismatch';const status=[data.curses[i]?`衰弱の呪い：HP −${data.curses[i].hp}`:'',data.tileFx[i]?.vortex?'炎の渦':'',data.tileFx[i]?.uplift?'リストア':'',data.barrier?.[o.player]?'結界：侵略不可':'',o.shade?'死影 '+o.shade:'',abyssAt(i)?'深淵標 ＋'+abyssAt(i).bonus+'G':''].filter(Boolean);
 $('detail').innerHTML=`<div class="detailTop">${ownerHTML(i)}</div><header class="landHeader"><div class="landLevel">${landIcon(t.e)}<span>Lv.<b>${o.level}</b></span></div><span class="toll"><small>通行料</small><img src="/assets/ic_gold.png" alt=""><b>${data.tolls[i]}</b>G</span></header><div class="creatureHero" style="--element:${colors[c.elem]}"><div class="creatureVisual"><img class="creatureArt" src="${c.art}" alt="${esc(c.name)}"><h2>${icon(c.elem)}${esc(c.name)}</h2>${c.evolved?'<small class="evolved">進化</small>':''}</div><div class="numbers"><div class="total"><small>HP + DF</small><strong>${s.total}</strong></div><div class="stat"><img src="/assets/cards/stat-hp-icon.svg" alt=""><small>残HP</small><b>${s.hp}</b><em>/ ${s.maxHp}</em></div><div class="stat"><svg viewBox="0 0 40 44" aria-hidden="true"><path d="M20 3 35 9v14Q34 33 20 40Q6 33 5 23V9Z"/></svg><small>DF</small><b>${s.df}</b></div><div class="stat"><img src="/assets/cards/stat-at-icon.svg" alt=""><small>AT</small><b>${s.at}</b></div></div></div><div class="terrain ${match?'match':'mismatch'}" style="--element:${colors[t.e]}"><div class="affinity">${landIcon(t.e)}<span class="matchMark">${match?'✓':'×'}</span>${icon(c.elem)}<small>${data.landCombat[i]?.affinity==='universal'?'適応':match?'一致':'不一致'}</small></div><span class="terrainDf">地形 <b>DF +${data.landCombat[i]?.appliedBonus||0}</b></span></div><section class="effect"><h3>固有能力</h3><p>${esc(data.landCombat[i]?.effect?.text||c.effect||'固有効果なし')}</p>${status.length?`<div class="statusBadges">${status.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}</section>`;

 }else if(eventInfo[t.t]){$('detail').innerHTML=eventHTML(t.t);
 }else{$('detail').innerHTML=`<div class="detailTop">${ownerHTML(i)}</div><div class="emptyHero">${t.t==='land'?`<div class="bigLand">${landIcon(t.e)}</div>`:`<img src="/assets/struct_${t.t}.png" alt="">`}<h2>${t.t==='land'?names[t.e]+'属性の空き地':structures[t.t]}</h2><p>${t.t==='land'?'クリーチャーを配置できる領地です。':'イベントマスです。'}</p></div>`;}
 renderDecision();
 fitDetail();
 root.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.style.opacity='0';});
}

function renderDecision(){
 const model=decisionModel(data,playerId,pending,selected),wrap=$('decision');wrap.hidden=!pending;
 const contextKey=key;
 const button=a=>'<button data-land-action="'+esc(a.id)+'" '+(busy||a.disabled?'disabled':'')+'>'+esc(a.label)+(['upgrade','sell'].includes(pending?.type)&&a===model.actions[0]?'<img class="landForward" src="/assets/ui/arrow-ornate.svg" alt="">':'')+'</button>';
 wrap.innerHTML=pending?'<div class="decisionHint" role="status">'+esc(error||model.hint)+'</div><div class="landActions">'+model.actions.map(button).join('')+'</div>':'';
 root.querySelectorAll('[data-land-action]').forEach(b=>b.onclick=()=>{if(busy||contextKey!==key)return;const m=decisionModel(data,playerId,pending,selected),a=m.actions.find(a=>a.id===b.dataset.landAction&&!a.disabled);if(!a)return;busy=true;renderDecision();hooks.submit(a.id);});
}
function renderAll(){
 $('title').textContent=pending?(titles[pending.type]||'対象の領地を選択'):'領地を確認';
 $('title').title=pending?.prompt||'';
 const multi=pending&&['ult_lia','ult_nerasio_land'].includes(pending.type);
 $('count').hidden=!multi;$('count').textContent=multi?'選択 '+(pending.selected||[]).length+' / '+(pending.type==='ult_lia'?3:2):'';
 const cancel=pending?.options.find(o=>/cancel$|^pass$|^back$/.test(o.id));$('close').hidden=!!pending&&!cancel;$('close').disabled=busy;
 $('close').onclick=()=>{if(busy)return;if(!pending)hooks.close();else if(cancel){busy=true;renderDecision();hooks.submit(cancel.id);}};
 renderPlayers();renderMap();renderDetail();fitCanvas();
}
return {
 show(s,pid,p,locked=false){
  const next=[s.code,s.stateInstanceId,pid,s.turnEpoch,p?.type||'view',p?.promptId||''].join('|');
  if(next!==key){const keep=p&&pending&&p.type===pending.type&&['ult_lia','ult_nerasio_land'].includes(p.type)&&pid===playerId&&s.turnEpoch===data?.turnEpoch&&s.code===data?.code&&s.stateInstanceId===data?.stateInstanceId;error='';if(!keep){selected=null;filter=p?.type==='upgrade'?pid:null;}key=next;}
  data=s;playerId=pid;pending=p||null;mode=p?.type||'view';busy=locked;
  if(selected==null||!s.tiles[selected])selected=Number(Object.keys(tileTargets(p))[0]??s.owners.findIndex(o=>o?.player===pid));
  if(selected<0)selected=s.players.find(x=>x.id===pid)?.pos||0;
  root.hidden=false;renderAll();
 },
 hide(){root.hidden=true;key='';selected=null;filter=null;pending=null;},
 setBusy(value){busy=value;renderDecision();$('close').disabled=busy;},
 setError(text){error=text;busy=false;renderDecision();$('close').disabled=false;},
 get root(){return root;}
};

}
return {create,tileTargets,decisionModel};
})();
