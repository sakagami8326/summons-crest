// v1.09 regression: cinematic ultimate cut-in and delayed server resolution.
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require','__dirname','process','console','setInterval',
  src + '\n;return {VERSION,TILES,makeRoom,handleChoose,resolveUltSequence,publicState,serializeRoom};')(
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
const board=fs.readFileSync(path.join(__dirname,'public','board.html'),'utf8');
const phone=fs.readFileSync(path.join(__dirname,'public','phone.html'),'utf8');
ok(board.includes("'/assets/ult_' + u.charId + '.webp'") && board.includes('se_ult_cutin.mp3'),'TV uses new art and sound');
ok(board.includes('UltFxWorld.play') && phone.includes('UltFxWorld.play'),'TV and phone use Phaser sparkles');
ok(board.includes("level >= (state.evoLevel || 3) && !!base.evo"),'battle card only requests evolved art when evolution exists');
ok(board.includes('animation:ultInfo 2.9s 1.45s'),'effect message remains readable longer');
ok(board.includes('.tvShopArt img') && board.includes('object-fit:contain'),'TV shop keeps product art inside its frame');
ok(board.includes("artKind = item.kind === 'support'"),'TV shop distinguishes support, spell, and creature art');
ok(board.includes('tvShopCardBg') && board.includes('tsCost') && board.includes('tsInfo'),'TV shop renders complete card faces');
ok(phone.includes('phoneUltSlash') && phone.includes('phoneUltFlash'),'phone cut-in exits with slash and flash');
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
ok(board.includes('.tvShopCard .tsRule') && board.includes('rule-brush.svg'),'TV shop uses shared effect rule');
ok(board.includes('.tvShopCard { position:relative; aspect-ratio:5/7; border:0;'),'TV shop removes extra outer border');
ok(!board.includes('.tvShopCard::after'),'TV shop removes extra inner border');
ok(board.includes('.tvShopArt.support { top:9.5%; left:17%; width:66%; height:47%;'),'TV shop contains support art');
ok(phone.includes('width:min(32.5vw,23dvh)'),'phone shop enlarges product cards');
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
ok(board.includes('id="bCmpTerrain"') && board.includes('state.tiles[b.tile].e') && board.includes('ELEM[elem]'),
  'battle comparison shows the defending land element below the HP symbol');
ok(board.includes('<span>領地の属性</span><span id="bCmpTerrain"'),
  'defending land element appears to the right of its label');
ok(board.includes('Number.isFinite(Number(from))') && board.includes('Number.isFinite(Number(to))'),
  'battle stat count-up falls back safely when old payload values are missing');
ok(board.includes('battleTeam.atk { grid-template-columns') && board.includes('battleFighter'),
  'battle uses detail support fighter layout');
ok(board.includes('.tvShopArt.support { top:9.5%; left:17%; width:66%; height:47%; padding:2% 4% 7%;'),
  'TV shop keeps weapon and shield clear of the lower brush');
ok(board.includes("sfrontB${creature ? ' creatureSupport' : ''}") && board.includes('.sfrontB.creatureSupport img { width:100%; height:100%;'),
  'creature support card shows contained creature art');
ok(board.includes("+ (creature ? '' : '<div>' + battleSupportName(sup) + '</div>')"),
  'creature support card omits support labels and stat icon rows');
for(const id of ['redani','linnei','grease','mio','adel','lia'])
  ok(fs.existsSync(path.join(__dirname,'public','assets',`ult_${id}.webp`)),`${id} cut-in asset exists`);
ok(fs.existsSync(path.join(__dirname,'public','assets','se_ult_cutin.mp3')),'cut-in sound exists');
console.log(`V1.09 ULT CUT-IN ALL ${pass} CHECKS PASSED`);
