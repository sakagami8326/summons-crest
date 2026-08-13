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

ok(G.VERSION === '1.20', 'version is 1.20');
ok(G.CHARS.villa && G.CHARS.villa.name === 'ヴィラ' && G.CHARS.villa.elem === 'wind',
  'Villa is published as a wind summoner');
ok(G.CHARS.villa.selectable === false && G.CHARS.villa.upcoming === true && !G.CHAR_DECKS.villa,
  'Villa remains unavailable without a starter deck');
ok(G.ULTS.villa && G.ULTS.villa.name === '墓守の協奏曲' && G.ULTS.villa.desc === '効果調整中',
  'Villa ultimate placeholder is published');

const room = G.makeRoom();
room.players = [{ id:'p1', name:'甲' }, { id:'p2', name:'乙' }];
G.startSelect(room);
ok(room.pending.p1.options.every(o => o.id !== 'villa') && room.pending.p2.options.every(o => o.id !== 'villa'),
  'Villa is absent from human selection options');
G.handleChoose(room, 'p1', 'villa');
ok(!room.players[0].charId && !room.players[0].confirmed,
  'forged Villa choice is ignored');

for (let n = 0; n < 20; n++) {
  const botRoom = G.makeRoom();
  botRoom.botMode = true;
  botRoom.players = [
    { id:'human', name:'人間', charId:'redani', confirmed:true },
    { id:'b1', name:'BOT A', isBot:true }, { id:'b2', name:'BOT B', isBot:true }, { id:'b3', name:'BOT C', isBot:true },
  ];
  G.assignBotCharacters(botRoom, 'redani');
  ok(botRoom.players.filter(p => p.isBot).every(p => p.charId && p.charId !== 'villa'),
    'Villa is absent from BOT assignments');
}

for (const asset of ['full_villa.png','p_villa.png','f_villa.png','summoner-still-villa.webp','ult_villa.webp'])
  ok(fs.existsSync(path.join(__dirname, 'public', 'assets', asset)), `${asset} exists`);

const phone = fs.readFileSync('public/phone.html', 'utf8');
const board = fs.readFileSync('public/board.html', 'utf8');
ok(/grid-template-columns:repeat\(4,minmax\(0,1fr\)\); grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/.test(phone),
  'phone selection uses a 4 by 2 grid');
ok(phone.includes('土属性召喚士・準備中') && phone.includes('csUpcoming revealed'),
  'phone shows the eighth placeholder and revealed Villa preview');
ok(phone.includes('性能は現在調整中です。正式実装まで選択できません。') &&
   phone.includes("openCharDetail(el.dataset.id, true)"),
  'Villa opens a read-only preview');
ok(/Array\.from\(\{ length:4 \}/.test(board) && board.includes('data-player-slot=') &&
   board.includes('scPortrait') && board.includes('scPawnWrap'),
  'TV selection renders four player slots with portraits and pawns');
ok(board.includes('/assets/p_${cid}.png') && board.includes('/assets/summoner-still-${cid}.webp'),
  'TV selection connects the pawn and still assets');

console.log(`V1.20 VILLA ALL ${pass} CHECKS PASSED`);
