const fs = require('fs');
const path = require('path');

let src = fs.readFileSync('server.js', 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + ';return {VERSION,CHARS,ULTS,CHAR_DECKS,makeRoom,startSelect,handleChoose,assignBotCharacters,validateSave};')(
  require, __dirname, process, { log:()=>{}, error:console.error }, ()=>0);

let pass = 0;
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
  pass++;
};

ok(Number(G.VERSION) >= 1.20, 'version is v1.20 or newer');
ok(G.CHARS.villa && G.CHARS.villa.name === 'ヴィラ' && G.CHARS.villa.elem === 'wind',
  'Villa is published as a wind summoner');
ok(G.CHARS.villa.selectable !== false && !G.CHARS.villa.upcoming && G.CHAR_DECKS.villa?.length === 12,
  'Villa is formally selectable with a 12-card starter deck');
ok(G.ULTS.villa && G.ULTS.villa.name === '墓守の協奏曲' && G.ULTS.villa.desc.includes('廃棄枚数だけ進み'),
  'Villa ultimate rule is published');

const room = G.makeRoom();
room.players = [{ id:'p1', name:'甲' }, { id:'p2', name:'乙' }];
G.startSelect(room);
ok(room.pending.p1.options.some(o => o.id === 'villa') && room.pending.p2.options.some(o => o.id === 'villa'),
  'Villa is present in human selection options');
G.handleChoose(room, 'p1', 'villa');
ok(room.players[0].charId === 'villa' && room.players[0].confirmed,
  'Villa choice is accepted');

for (let n = 0; n < 20; n++) {
  const botRoom = G.makeRoom();
  botRoom.botMode = true;
  botRoom.players = [
    { id:'human', name:'人間', charId:'redani', confirmed:true },
    { id:'b1', name:'BOT A', isBot:true }, { id:'b2', name:'BOT B', isBot:true }, { id:'b3', name:'BOT C', isBot:true },
  ];
  G.assignBotCharacters(botRoom, 'redani');
  ok(botRoom.players.filter(p => p.isBot).every(p => p.charId),
    'all BOT assignments use selectable summoners including Villa');
}

for (const asset of ['full_villa.png','p_villa.png','f_villa.png','summoner-still-villa.webp','ult_villa.webp'])
  ok(fs.existsSync(path.join(__dirname, 'public', 'assets', asset)), `${asset} exists`);

const phone = fs.readFileSync('public/phone.html', 'utf8');
const board = fs.readFileSync('public/board.html', 'utf8');
ok(/grid-template-columns:repeat\(4,minmax\(0,1fr\)\); grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/.test(phone),
  'phone selection uses a 4 by 2 grid');
ok(phone.includes('csUpcoming revealed') && phone.includes("openCharDetail(el.dataset.id, true)"),
  'phone keeps forward-compatible summoner preview support');
ok(/Array\.from\(\{ length:4 \}/.test(board) && board.includes('data-player-slot=') &&
   board.includes('scPortrait') && board.includes('scPawnWrap'),
  'TV selection renders four player slots with portraits and pawns');
ok(board.includes('/assets/p_${cid}.png') && board.includes('/assets/summoner-still-${cid}.webp'),
  'TV selection connects the pawn and still assets');

console.log(`V1.20 VILLA ALL ${pass} CHECKS PASSED`);
