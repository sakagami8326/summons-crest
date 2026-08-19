// v1.09 regression: cinematic ultimate cut-in and delayed server resolution.
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require','__dirname','process','console','setInterval',
  src + '\n;return {VERSION,TILES,makeRoom,handleChoose,resolveUltSequence,publicState,serializeRoom,startBattle};')(
  require,__dirname,process,console,()=>{});
let pass = 0;
const ok = (v,n) => { if (!v) throw new Error('FAIL: '+n); pass++; };
const eq = (a,b,n) => ok(JSON.stringify(a)===JSON.stringify(b),`${n} (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);
ok(Number(G.VERSION) >= 1.09,'version');
function roomFor(charId) {
  const r=G.makeRoom(); r.phase='playing'; r.pending={}; r.log=[]; r.turn=0;
  const p={id:'p1',name:'P1',charId,gold:500,pos:0,dir:1,lap:1,hand:[],deck:[],discard:[],exile:[],
    battleWins:0,shrineVisits:0,ultUsed:false,spellCast:false,bankrupt:false};
  r.players=[p]; r.pending[p.id]={type:'roll',options:[{id:'ult'}]}; return {r,p};
}
{
  const {r,p}=roomFor('grease');
  G.handleChoose(r,p.id,'ult');
  ok(p.ultUsed && r.ultSequence && !r.ultSequence.resolved,'activation creates unresolved sequence');
  eq(r.pending[p.id].type,'ult_resolve','input is locked during cut-in');
  ok(!r.barrier[p.id],'effect is not applied before cut-in ends');
  ok(r.ultSequence.resolveAt-r.ultSequence.startedAt===5000,'cut-in lasts 5 seconds');
  const pub=G.publicState(r,p.id).ultSequence;
  ok(pub && !('data' in pub),'private resolution payload is not public');
  ok(G.serializeRoom(r).room.ultSequence.id===r.ultSequence.id,'sequence is saved');
  G.resolveUltSequence(r);
  ok(r.barrier[p.id] && !r.ultSequence,'effect resolves once after cut-in');
}
{
  const {r,p}=roomFor('adel');
  r.owners[1]={player:p.id,level:1,creature:'survey',dmg:20};
  G.handleChoose(r,p.id,'ult');
  eq(r.owners[1].dmg,20,'Adele healing is delayed');
  G.resolveUltSequence(r);
  ok(r.owners[1].dmg===0 && r.owners[1].iceWard,'Adele resolves healing and ward');
}
{
  const {r,p}=roomFor('linnei');
  p.pos=5;
  G.handleChoose(r,p.id,'ult');
  ok(r.ultSequence && !r.shopVisit,'Linnei shop waits for the cut-in');
  G.resolveUltSequence(r);
  eq(p.pos,5,'Linnei opens the shop without moving');
  ok(r.halfMarket===p.id && r.shopVisit?.half && r.shopVisit.player===p.id,'Linnei opens a half-price shop at the current tile');
  eq(r.pending[p.id].type,'market','Linnei continues into the normal shop flow');
}
const board=fs.readFileSync(path.join(__dirname,'public','board.html'),'utf8');
const phone=fs.readFileSync(path.join(__dirname,'public','phone.html'),'utf8');
const boardWorld=fs.readFileSync(path.join(__dirname,'public','board_world.js'),'utf8');
{
  const {r,p}=roomFor('grease');
  const d={id:'p2',name:'P2',charId:'mio',gold:500,pos:1,dir:1,lap:1,hand:[],deck:[],discard:[],exile:[],battleWins:0,shrineVisits:0,ultUsed:false,spellCast:false,bankrupt:false};
  r.players.push(d); r.owners[1]={player:d.id,level:1,creature:'nome'}; r.elemOv[1]='water';
  G.startBattle(r,p,1);
  eq(G.publicState(r,p.id).battlePreview.terrainElem,'water','battle preview persists overridden terrain element');
}
ok(board.includes("'/assets/ult_' + u.charId + '.webp'") && board.includes('se_ult_cutin.mp3'),'TV uses new art and sound');
ok(board.includes('UltFxWorld.play') && phone.includes('UltFxWorld.play'),'TV and phone use Phaser sparkles');
ok(board.includes("level >= (state.evoLevel || 3) && !!base.evo"),'battle card only requests evolved art when evolution exists');
ok(board.includes('animation:ultInfo 2.9s 1.45s'),'effect message remains readable longer');
ok(board.includes('.tvShopArt img') && board.includes('object-fit:contain'),'TV shop keeps product art inside its frame');
ok(board.includes("artKind = item.kind === 'support'"),'TV shop distinguishes support, spell, and creature art');
ok(board.includes('tvShopCardBg') && board.includes('tsCost') && board.includes('tsInfo'),'TV shop renders complete card faces');
ok(phone.includes('#phoneUltSlash { display:none; }') && phone.includes('phoneUltFlash'),'phone cut-in exits with flash without horizontal slash');
ok(board.includes("statLabel('at')") && board.includes("statLabel('hp')"),'battle uses AT and HP symbols with labels');
ok(phone.includes('inlineStatSymbol') && phone.includes('stat-at-icon.svg'),'phone territory details use stat symbols');
for(const file of ['stat-at-icon.svg','stat-hp-icon.svg']) {
  const icon=fs.readFileSync(path.join(__dirname,'public','assets','cards',file),'utf8');
  ok(icon.includes('fill="#F2D062"'),'stat symbol uses white-gold fill: '+file);
  ok(!icon.includes('data-name=') && !icon.includes('<g id='),'stat symbol removes Illustrator metadata: '+file);
}
const atIcon=fs.readFileSync(path.join(__dirname,'public','assets','cards','stat-at-icon.svg'),'utf8');
ok(atIcon.includes('viewBox="-24 -25 513 539"'),'AT symbol has safe viewBox padding');
ok(board.includes('.tvShopCard .tsBrush') && board.includes('brush-boundary-b-paper.png'),'TV shop uses shared card brush');
ok(!board.includes('.tvShopCard .tsRule') && !board.includes('class="tsRule"'),'TV shop creature card omits the stat/effect divider');
ok(board.includes('.tvShopCard { position:relative; aspect-ratio:5/7; border:0;'),'TV shop removes extra outer border');
ok(!board.includes('.tvShopCard::after'),'TV shop removes extra inner border');
ok(board.includes('.tvShopArt.support { top:12%; left:8%; width:84%; height:50%;'),'TV shop contains support art');
ok(phone.includes('height:min(41.5dvh'),'phone shop enlarges product cards');
ok(board.includes('.statIconDisk { width:100%; aspect-ratio:1;') && phone.includes('.statIconDisk { width:100%; aspect-ratio:1;'),
  'card stat pedestals remain perfect circles');
ok(board.includes('.statIconDisk img { display:block; width:100%; height:100%; object-fit:contain;') &&
  phone.includes('.statIconDisk img { display:block; width:100%; height:100%; object-fit:contain;'),
  'card stat symbols stay contained inside padded pedestals');
ok(board.includes('.atk .bside { transform:rotate(3deg)') && board.includes('.def .bside { transform:rotate(-3deg)'),
  'battle cards face inward');
ok(board.includes('id="bAtkDetail"') && board.includes('id="bDefDetail"') && board.includes('battleDetailHTML'),
  'battle shows persistent side detail panels');
ok(board.includes('function attackMeterHTML(baseAt, at)') && board.includes("at > 100 ? ' over'"),
  'battle AT meter uses 100 cap and overflow state');
ok(board.includes('attackBase') && board.includes('attackBonus'),'battle AT meter separates base and bonus');
ok(board.includes('.attackBar { position:relative; display:flex; width:100%; height:2.35vh;') &&
  board.includes('.durabilityBar { position:relative; display:flex; width:100%; height:2.35vh;'),
  'battle AT and HP bars use matching heights');
ok(!board.includes('class="attackNum"') && !board.includes('class="durabilityNum"'),
  'battle bars omit embedded numeric labels');
ok(board.includes('.bsValues { display:none; }'),
  'fighter-local battle values are hidden in favor of the central comparison');
ok(board.includes('.def .battleDetail { text-align:left; }') && board.includes('align-self:start; margin-top:0;') &&
  board.includes('transform:translateY(-5vh);'),
  'battle detail panels are enlarged, upper aligned, and left aligned');
ok(board.includes('id="battleCompare"') && board.includes('id="bCmpAtkAt"') && board.includes('id="bCmpDefHp"') &&
  board.includes('function updateBattleCompare()'),
  'battle comparison values are centered between attacker and defender bars');
ok(board.includes('id="bCmpAtkAtBar"') && board.includes('id="bCmpDefHpBar"') && board.includes('function updateBattleCompare()') &&
  board.includes("mirrorBar('bAtkStats', '.attackBar', 'bCmpAtkAtBar')"),
  'battle comparison bars and values share the same central grid rows');
ok(board.includes('id="bCmpTerrain"') && board.includes('battleState.terrainElem') && board.includes('ELEM[elem]'),
  'battle comparison shows the defending land element below the HP symbol');
ok(board.includes('<span>領地の属性</span><span id="bCmpTerrain"'),
  'defending land element appears to the right of its label');
ok(board.includes('Number.isFinite(Number(from))') && board.includes('Number.isFinite(Number(to))'),
  'battle stat count-up falls back safely when old payload values are missing');
ok(board.includes('battleTeam.atk { grid-template-columns') && board.includes('battleFighter'),
  'battle uses detail support fighter layout');
ok(board.includes('.tvShopArt.support { top:12%; left:8%; width:84%; height:50%; padding:0;') &&
  board.includes('.tvShopArt.support img {') &&
  board.includes('width:100%; height:100%; object-fit:contain;'),
  'TV shop keeps every support art clear of the lower brush');
ok(src.includes('terrainElem: tileElem(r, b.tile)') && board.includes("terrain.style.setProperty('--terrain-color', RUNE[elem]"),
  'battle terrain element persists in the payload and colors its label band');
ok(board.includes('id="bCmpAtkDf"') && board.includes('id="bCmpDefDf"') && board.includes('ウェポン DF+'),
  'battle weapon DF gains appear below the HP bar in blue');
ok(board.includes('spell-dice-${die[1]}.webp') && phone.includes('const spellAsset = c =>'),
  'dice spell cards resolve their dedicated WebP assets across shop and phone views');
ok(board.includes('const dedicatedArt = state.catalog.SPELLS[item.card] ? dedicatedSpellAsset(item.card) : null') &&
  board.includes("const artMarkup = dedicatedSpell ? ''") && board.includes("tvShopCardBg${dedicatedSpell ? ' dedicatedSpell' : ''}"),
  'dice and weaken use their dedicated image directly without the generic spell background');
const renamedSpellArt = {
  sp_step:['ムーブ','spell-step-art-v1.webp'],
  sp_move:['スイッチ','spell-move-art-v1.webp'],
  sp_insight:['ダブルドロー','spell-insight-art-v1.webp'],
  sp_swap:['チェンジ','spell-swap-art-v1.webp']
};
for (const [id,[name,file]] of Object.entries(renamedSpellArt)) {
  ok(src.includes(`${id}:`) && src.includes(`name: '${name}'`),`${id} uses its new card name`);
  ok(fs.existsSync(path.join(__dirname,'public','assets','cards',file)),`${id} completed spell art exists`);
  ok(board.includes(`${id}:'/assets/cards/${file}'`) && phone.includes(`${id}:'/assets/cards/${file}'`),
    `${id} completed art is wired to TV and phone card renderers`);
}
const shiftedSpellArt = {
  sp_volcanic_core:['フレイム・シフト','spell-flame-shift-art-v1.webp'],
  sp_abyssal_pearl:['アクア・シフト','spell-aqua-shift-art-v1.webp'],
  sp_earth_mother_stone:['アース・シフト','spell-earth-shift-art-v1.webp'],
  sp_sky_crystal:['ウィンド・シフト','spell-wind-shift-art-v1.webp']
};
for (const [id,[name,file]] of Object.entries(shiftedSpellArt)) {
  ok(src.includes(`${id}:`) && src.includes(`name: '${name}'`),`${id} uses its Shift-series name`);
  ok(fs.existsSync(path.join(__dirname,'public','assets','cards',file)),`${id} Shift art exists`);
  ok(board.includes(`${id}:'/assets/cards/${file}'`) && phone.includes(`${id}:'/assets/cards/${file}'`),
    `${id} Shift art is wired to TV and phone card renderers`);
}
const renamedCoreSpellArt = {
  sp_gold:['ゴールド','spell-gold-art-v1.webp'],
  sp_gale:['ダブルロール','spell-double-roll-art-v1.webp'],
  sp_quake:['地割れ','spell-quake-art-v1.webp'],
  sp_ward:['バリア','spell-barrier-art-v1.webp']
};
for (const [id,[name,file]] of Object.entries(renamedCoreSpellArt)) {
  ok(src.includes(`${id}:`) && src.includes(`name: '${name}'`),`${id} uses its finalized short name`);
  ok(fs.existsSync(path.join(__dirname,'public','assets','cards',file)),`${id} finalized art exists`);
  ok(board.includes(`${id}:'/assets/cards/${file}'`) && phone.includes(`${id}:'/assets/cards/${file}'`),
    `${id} finalized art is wired to TV and phone card renderers`);
}
const completedCombatSpellArt = {
  sp_flame_vortex:['炎の渦','spell-flame-vortex-art-v1.webp'],
  sp_bloodstained_blade:['血染めの刃','spell-bloodstained-blade-art-v1.webp'],
  sp_wind_shift:['風向転換','spell-wind-turn-art-v1.webp']
};
for (const [id,[name,file]] of Object.entries(completedCombatSpellArt)) {
  ok(src.includes(`${id}:`) && src.includes(`name: '${name}'`),`${id} retains its finalized name`);
  ok(fs.existsSync(path.join(__dirname,'public','assets','cards',file)),`${id} completed art exists`);
  ok(board.includes(`${id}:'/assets/cards/${file}'`) && phone.includes(`${id}:'/assets/cards/${file}'`),
    `${id} completed art is wired to TV and phone card renderers`);
}
ok(fs.existsSync(path.join(__dirname,'public','assets','cards','spell-restore-art-v1.webp')),
  'Restore dedicated art exists');
ok(board.includes("sp_bedrock_uplift:'/assets/cards/spell-restore-art-v1.webp'") &&
   phone.includes("sp_bedrock_uplift:'/assets/cards/spell-restore-art-v1.webp'"),
  'Restore dedicated art is wired to TV and phone card renderers');
ok(src.includes("sp_bedrock_uplift:    { name: 'リストア'") && !src.includes("name: '岩盤隆起'"),
  'bedrock uplift is renamed Restore while keeping its card ID');
ok(!src.includes('sp_cornucopia:') && !board.includes("'sp_cornucopia'") && !phone.includes("'sp_cornucopia'"),
  'Cornucopia is removed from the live catalog and client card lists');
for (const oldName of ['火山核','深海珠','地母石','天空晶','移動の呪文','転移の呪文','ひらめきの呪文','交代の呪文',
  '黄金の呪文','疾風の呪文','地割れの呪文','加護の呪文'])
  ok(!src.includes(oldName),`server catalog no longer exposes old card name: ${oldName}`);
ok(board.includes('/assets/cards/shop-remove-v2.webp') && phone.includes('/assets/cards/shop-remove-v2.webp') &&
  board.includes('tvShopRemoveTitle">カードを削除') && phone.includes('removeTitle">カードを削除') &&
  fs.existsSync(path.join(__dirname,'public','assets','cards','shop-remove-v2.webp')),
  'shop card removal uses the supplied art on a navy titled card on TV and phone');
ok(board.includes("sf.spell && sf.spell.startsWith('ult_')") && board.includes('playInternalAbilityFx(sf)') &&
  !board.includes("playSpellPresentation({ spell:'ult_adel'") && boardWorld.includes("sid === 'ult_adel'"),
  'ultimate board effects bypass the generic spell-card presentation');
ok(!board.includes('class="scRule"') && !phone.includes('class="ccRule"'),
  'creature cards omit the stat/effect divider asset');
ok(board.includes("sfrontB${creature ? ' creatureSupport' : ''}") && board.includes('.sfrontB.creatureSupport img { width:100%; height:100%;'),
  'creature support card shows contained creature art');
ok(board.includes("+ (creature ? '' : '<div>' + battleSupportName(sup) + '</div>' + battleSupportExile(sup))"),
  'creature support card omits support labels while ordinary support shows its exile badge');
for(const id of ['redani','linnei','grease','mio','adel','lia','villa'])
  ok(fs.existsSync(path.join(__dirname,'public','assets',`ult_${id}.webp`)),`${id} cut-in asset exists`);
ok(fs.existsSync(path.join(__dirname,'public','assets','se_ult_cutin.mp3')),'cut-in sound exists');
console.log(`V1.09 ULT CUT-IN ALL ${pass} CHECKS PASSED`);
