// v1.30 regression: Nerasio and the permanent two-land Heaven-Earth Transmutation ultimate.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')
  .replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require','__dirname','process','console','setInterval','setTimeout','clearTimeout',
  src + '\n;return {VERSION,TILES,CHARS,ULTS,CHAR_DECKS,makeRoom,startSelect,askRoll,handleChoose,' +
  'resolveUltSequence,tileElem,chainCount,serializeRoom,publicState,botChooseOption,rooms};')(
  require,__dirname,process,{log:()=>{},error:console.error},()=>0,()=>0,()=>{});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
const landTiles = G.TILES.map((t, i) => t.t === 'land' ? i : null).filter(i => i !== null);

function roomFor() {
  const r = G.makeRoom();
  r.phase = 'playing'; r.pending = {}; r.turn = 0; r.log = [];
  const p = { id:'p1', name:'ネラシオ使い', charId:'nerasio', confirmed:true, color:'#C49545',
    gold:500, pos:0, dir:1, lap:1, hand:[], deck:[], discard:[], exile:[], resolving:[],
    battleWins:0, shrineVisits:0, ultUsed:false, spellCast:false, bankrupt:false };
  const q = { id:'p2', name:'相手', charId:'redani', confirmed:true, color:'#D85A30',
    gold:500, pos:0, dir:1, lap:1, hand:[], deck:[], discard:[], exile:[], resolving:[],
    battleWins:0, shrineVisits:0, ultUsed:false, spellCast:false, bankrupt:false };
  r.players = [p, q];
  r.pending[p.id] = { type:'roll', prompt:'あなたの手番です', options:[{id:'roll'},{id:'ult'}] };
  return {r,p,q};
}

ok(Number(G.VERSION) >= 1.30, 'version is v1.30 or newer');
eq([G.CHARS.nerasio.name,G.CHARS.nerasio.elem,G.CHARS.nerasio.selectable,G.CHARS.nerasio.upcoming],
  ['ネラシオ','earth',true,false], 'Nerasio is a selectable earth summoner');
ok(G.ULTS.nerasio.name === '天地転成' && G.ULTS.nerasio.desc.includes('1〜2か所'),
  'ultimate name and two-land rule are published');
ok(G.CHAR_DECKS.nerasio.length === 12 && G.CHAR_DECKS.nerasio.filter(c => c === 'komao').length === 2,
  'earth-chain starter deck has 12 cards and two Komao');

{
  const r = G.makeRoom();
  r.players = [{id:'p1',name:'甲'},{id:'p2',name:'乙'}];
  G.startSelect(r);
  ok(r.pending.p1.options.some(o => o.id === 'nerasio'), 'human selection includes Nerasio');
  G.rooms.delete(r.code);
}

// No owned land means the ultimate is not offered; one owned normal land enables it.
{
  const {r,p} = roomFor();
  G.askRoll(r,p);
  ok(!r.pending[p.id].options.some(o => o.id === 'ult'), 'ultimate is unavailable without an owned land');
  r.owners[landTiles[0]] = {player:p.id,level:1,creature:'komao'};
  G.askRoll(r,p);
  ok(r.pending[p.id].options.some(o => o.id === 'ult'), 'ultimate is available with an owned land');
  G.rooms.delete(r.code);
}

// Select two lands, select an element, then resolve after the common cut-in.
{
  const {r,p,q} = roomFor();
  const [a,b,c] = landTiles;
  const first = {player:p.id,level:4,creature:'komao_f',dmg:17,shade:30,custom:{kept:true}};
  const second = {player:p.id,level:2,creature:'nome',dmg:8,iceWard:true};
  r.owners[a] = first; r.owners[b] = second;
  r.owners[c] = {player:q.id,level:3,creature:'gecko',dmg:6};

  G.handleChoose(r,p.id,'ult');
  eq(r.pending[p.id].type,'ult_nerasio_land','ultimate opens the own-land map');
  ok(!p.ultUsed,'opening the selector does not consume the ultimate');
  ok(r.pending[p.id].options.some(o => o.id === 'nu:' + a) &&
     !r.pending[p.id].options.some(o => o.id === 'nu:' + c), 'only owned normal lands are candidates');
  G.handleChoose(r,p.id,'nu:' + a);
  G.handleChoose(r,p.id,'nu:' + b);
  eq(r.pending[p.id].selected,[a,b],'two distinct lands can be selected');
  ok(!r.pending[p.id].options.some(o => o.id === 'nu:' + c), 'a third or enemy land cannot be selected');
  const saved = G.serializeRoom(r);
  eq(saved.room.pending[p.id].selected,[a,b],'selected lands persist in a save');
  G.handleChoose(r,p.id,'nu:confirm');
  eq(r.pending[p.id].type,'ult_nerasio_elem','confirmation advances to element selection');
  ok(r.pending[p.id].options.filter(o => /^ne:(fire|water|earth|wind)$/.test(o.id)).length === 4,
    'all four destination elements are offered');
  G.handleChoose(r,p.id,'ne:water');
  ok(p.ultUsed && r.ultSequence && r.pending[p.id].type === 'ult_resolve',
    'choosing the element consumes the ultimate and starts the cut-in');
  eq(r.ultSequence.data,{targets:[a,b],elem:'water'},'private resolution payload stores targets and element');
  ok(!('data' in G.publicState(r,p.id).ultSequence),'resolution target data is not publicly exposed');
  G.resolveUltSequence(r);
  eq([G.tileElem(r,a),G.tileElem(r,b)],['water','water'],'both selected lands permanently change element');
  ok(r.owners[a] === first && r.owners[b] === second,'placement objects are preserved by reference');
  eq([first.level,first.creature,first.dmg,first.shade,first.custom.kept,second.iceWard],
    [4,'komao_f',17,30,true,true],'level, wound, creature, and accumulated states are preserved');
  ok(G.chainCount(r,p.id,'water') >= 2,'new element immediately contributes to chains');
  eq(r.pending[p.id].type,'roll','resolution returns to the normal roll selection');
  G.rooms.delete(r.code);
}

// Cancel and back operations do not spend the once-per-game action.
{
  const {r,p} = roomFor();
  const a = landTiles[0];
  r.owners[a] = {player:p.id,level:1,creature:'komao'};
  G.handleChoose(r,p.id,'ult');
  G.handleChoose(r,p.id,'nu:' + a);
  G.handleChoose(r,p.id,'nu:confirm');
  G.handleChoose(r,p.id,'ne:cancel');
  eq(r.pending[p.id].type,'ult_nerasio_land','element cancel returns to land selection');
  G.handleChoose(r,p.id,'nu:cancel');
  ok(!p.ultUsed && r.pending[p.id].type === 'roll','cancel returns to roll without consuming the ultimate');
  G.rooms.delete(r.code);
}

// BOT completes both multi-select and element selection using legal options.
{
  const {r,p} = roomFor();
  r.owners[landTiles[0]] = {player:p.id,level:1,creature:'komao'};
  r.owners[landTiles[1]] = {player:p.id,level:3,creature:'nome'};
  G.handleChoose(r,p.id,'ult');
  for (let guard=0; r.pending[p.id].type === 'ult_nerasio_land' && guard<5; guard++) {
    const pend = r.pending[p.id], choice = G.botChooseOption(r,p,pend);
    ok(pend.options.some(o => o.id === choice), 'BOT land choice is legal');
    G.handleChoose(r,p.id,choice);
  }
  const elemPend = r.pending[p.id];
  eq(elemPend.type,'ult_nerasio_elem','BOT finishes selecting one or two lands');
  const elemChoice = G.botChooseOption(r,p,elemPend);
  ok(elemPend.options.some(o => o.id === elemChoice) && elemChoice !== 'ne:cancel','BOT element choice is legal');
  G.handleChoose(r,p.id,elemChoice);
  ok(r.ultSequence?.charId === 'nerasio','BOT starts Nerasio cut-in sequence');
  G.rooms.delete(r.code);
}

const phone = fs.readFileSync(path.join(__dirname,'public','phone.html'),'utf8');
ok(phone.includes("'ult_nerasio_land'") && phone.includes("p.type === 'ult_nerasio_elem'"),
  'phone implements map selection and element selection');
ok(phone.includes('選択中 ${selected.length}/${multiMax}') && phone.includes('multiMax = p.type === \'ult_nerasio_land\' ? 2 : 3'),
  'phone clearly displays the two-land selection limit');
ok(!phone.includes('data-id="upcoming-earth"'),'obsolete upcoming earth placeholder is removed');
for (const asset of ['full_nerasio.png','p_nerasio.png','f_nerasio.png','hud_nerasio.png',
  'summoner-still-nerasio.webp','ult_nerasio.webp'])
  ok(fs.existsSync(path.join(__dirname,'public','assets',asset)), asset + ' exists');

console.log(`V1.30 NERASIO ALL ${pass} CHECKS PASSED`);
