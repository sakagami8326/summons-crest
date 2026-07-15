// Summons Crest 統合サーバー v0.1(段階①: ゲームエンジン)
// 仕様書v0.2準拠: 勝利点12先取 / 土地レベル / 連鎖通行料 / 支援カード付き侵略戦闘 /
// 祠(巡礼称号) / 市場(購入・宝石・秘宝) / 覇者称号 / キャラ選択のダイス競合
// 起動: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '0.30';
const PORT = process.env.PORT || 3000;
const TARGET_PTS = 12;
const RULES = { startGold: 300, castleBonus: 200, shrineBonus: 100, tollUnit: 30,
                levelCost: { 2: 100, 3: 200, 4: 300 }, gemPrice: 80, drawPrice: 100, maxLevel: 4,
                evoLevel: 3, forgeCost: 150 };
const baseId = c => (c || '').replace(/_f$/, '');
const isEvolved = (o) => o.level >= RULES.evoLevel || /_f$/.test(o.creature);

// ===== 盤面(28マス周回) =====
const TILES = [
  { t: 'castle' },
  { t: 'land', e: 'fire' }, { t: 'land', e: 'fire' }, { t: 'land', e: 'fire' },
  { t: 'shrine' },
  { t: 'land', e: 'fire' }, { t: 'land', e: 'fire' }, { t: 'land', e: 'wind' },
  { t: 'market' },
  { t: 'land', e: 'wind' }, { t: 'land', e: 'wind' },
  { t: 'shrine' },
  { t: 'land', e: 'wind' }, { t: 'land', e: 'wind' }, { t: 'land', e: 'earth' },
  { t: 'gate' },
  { t: 'land', e: 'earth' }, { t: 'land', e: 'earth' },
  { t: 'shrine' },
  { t: 'land', e: 'earth' }, { t: 'land', e: 'earth' }, { t: 'land', e: 'water' },
  { t: 'land', e: 'water' },
  { t: 'market' },
  { t: 'land', e: 'water' },
  { t: 'shrine' },
  { t: 'land', e: 'water' }, { t: 'land', e: 'water' },
];

// ===== カードカタログ =====
const CREATURES = {
  // スターター(基本形 → LvMAXで進化)
  gecko:  { name: 'バーンゲッコー', evo: 'サラマンダー',   elem: 'fire',  st: 40, hp: 20, cost: 50, evoSt: 60, evoHp: 35, fx: '【猛攻】攻撃時ST+10', rarity: 'N' },
  orphe:  { name: 'オルフェ',       evo: 'ウンディーネ',   elem: 'water', st: 30, hp: 30, cost: 50, evoSt: 45, evoHp: 50, fx: '【清流】この土地の通行料+20%', rarity: 'N' },
  nome:   { name: 'ノーム',         evo: 'アースゴーレム', elem: 'earth', st: 10, hp: 50, cost: 50, evoSt: 30, evoHp: 75, fx: '【岩壁】防衛時、地形補正2倍', rarity: 'N' },
  gaston: { name: 'ガストン',       evo: 'ガストレイド',   elem: 'wind',  st: 20, hp: 40, cost: 50, evoSt: 40, evoHp: 60, fx: '【旋風】敗北しても消滅せず手札に戻る', rarity: 'N' },
  cleo:   { name: 'クレオ',         evo: 'クレステッド',   elem: null,    st: 30, hp: 30, cost: 40, evoSt: 50, evoHp: 45, fx: '【適応】どの属性でも地形補正を得る', rarity: 'N' },
  // マーケット
  drake:   { name: 'ファイアドレイク', elem: 'fire',  st: 55, hp: 35, cost: 120, rarity: 'R' },
  qbaby:   { name: 'クイーンベビー', evo: 'クイーン', elem: 'fire', st: 35, hp: 30, cost: 120, evoSt: 55, evoHp: 50, fx: '【女王の威光】両隣の自領地の防衛HP+10(進化+20)', rarity: 'L' },
  mermaid: { name: 'マーメイド',       elem: 'water', st: 20, hp: 50, cost: 90, fx: '【真珠】召喚時、宝石1個を得る', rarity: 'N' },
  kbaby:   { name: 'キングベビー', evo: 'キング', elem: 'water', st: 30, hp: 40, cost: 120, evoSt: 50, evoHp: 60, fx: '【王の徴収】通行料受取時+20G(進化+40G)', rarity: 'L' },
  ludi:    { name: 'ルディ', evo: 'シンルー', elem: 'wind', st: 25, hp: 40, cost: 120, evoSt: 45, evoHp: 60, fx: '【雲隠れ】防衛時、相手の支援を無効化', rarity: 'L' },
  garble:  { name: 'ガーブル', evo: 'ガレス・ゲイル', elem: 'wind', st: 35, hp: 25, cost: 120, evoSt: 55, evoHp: 45, fx: '【風刃】攻撃時、相手の地形補正を無視', rarity: 'R' },
  barbaro: { name: 'バルバロ', evo: 'バーグランダ', elem: 'earth', st: 30, hp: 45, cost: 120, evoSt: 50, evoHp: 65, fx: '【逆鱗】防衛成功時、相手から20G奪う(進化40G)', rarity: 'R' },
  detropas:{ name: 'デトロパス', evo: 'クラーケンイービル', elem: 'fire', st: 30, hp: 25, cost: 90, evoSt: 50, evoHp: 45, fx: '【群れ】攻撃時、自分の火の土地×ST+5', rarity: 'N' },
  goagoa:  { name: 'ゴアゴア', evo: 'ノーク・ゴーア', elem: 'water', st: 40, hp: 40, cost: 150, evoSt: 60, evoHp: 65, rarity: 'R' },
  fugorm:  { name: 'フーゴルム', evo: 'ゴーレムアイン', elem: 'earth', st: 35, hp: 40, cost: 100, evoSt: 55, evoHp: 60, fx: '【鍛冶】召喚時、支援「武器」を得る', rarity: 'N' },
  golem:   { name: 'ロックゴーレム',   elem: 'earth', st: 30, hp: 60, cost: 140, rarity: 'R' },
  harpy:   { name: 'ハーピー',         elem: 'wind',  st: 40, hp: 30, cost: 90, fx: '【略奪】侵略成功時、相手から50G奪う', rarity: 'N' },
  griffon: { name: 'グリフォン',       elem: 'wind',  st: 50, hp: 40, cost: 150, rarity: 'R' },
  mimic:   { name: 'ミミック',         elem: null,    st: 30, hp: 30, cost: 70, fx: '【擬態】戦闘時、相手の基礎ST/HPをコピー', rarity: 'N' },
  beruf:   { name: 'ベルーフ・シェイド', evo: 'デスベルーフ', elem: null, st: 20, hp: 50, cost: 90, evoSt: 40, evoHp: 70, fx: '【死影】呪いを受けない', rarity: 'N' },
};
const ITEMS = {
  curse: { name: '衰弱の呪い', hp: 20, cost: 80,
           desc: '敵の土地のクリーチャーのHP-20(あなたの次の手番まで)' },
};
const SUPPORTS = {
  weapon:  { name: '武器',   st: 20, hp: 0,  cost: 60 },
  gweapon: { name: '重武器', st: 40, hp: 0,  cost: 120 },
  shield:  { name: '盾',     st: 0,  hp: 20, cost: 60 },
  gshield: { name: '大盾',   st: 0,  hp: 40, cost: 120 },
  jinx:    { name: '呪具',   st: 0,  hp: 0,  cost: 100, jinx: true },
};
const CHARS = {
  redani: { name: 'レダーニ', color: '#D85A30', elem: 'fire' },
  linnei: { name: 'リンネイ', color: '#378ADD', elem: 'water' },
  grease: { name: 'グリース', color: '#639922', elem: 'earth' },
  mio:    { name: 'ミオ',     color: '#4FA69C', elem: 'wind' },
};
const ULTS = {
  redani: { name: '烈火の進軍', desc: 'サイコロを3個振って移動する' },
  linnei: { name: '水鏡の大商談', desc: '市場へ瞬間移動し、全品半額で買い物' },
  grease: { name: '大地の大結界', desc: '次の手番まで全領地が侵略不可+呪い解除' },
  mio:    { name: '追い風の導き', desc: '好きなマスへ移動して止まる' },
};
for (const [cid, c] of Object.entries({ ...CREATURES }))
  if (c.evo) CREATURES[cid + '_f'] = { name: c.evo, elem: c.elem, st: c.evoSt, hp: c.evoHp,
    cost: c.cost, fx: c.fx, rarity: c.rarity, forged: true };

const MARKET_POOL = ['drake','detropas','qbaby','mermaid','goagoa','kbaby','golem','fugorm','harpy','griffon','mimic','beruf','ludi','garble','barbaro'];
const RARITY_COPIES = { L: 1, R: 2, N: 3 };
function makeDeck() {
  const d = [];
  for (const c of MARKET_POOL)
    for (let i = 0; i < RARITY_COPIES[CREATURES[c].rarity]; i++) d.push(c);
  return d.sort(() => Math.random() - 0.5);
}

// ===== ルーム管理 =====
function refillDeck(r) {
  if (!r.deck.length) {
    r.deck = makeDeck();
    log(r, '📦 市場の山札が補充された');
  }
}
const rooms = new Map();
const code4 = () => {
  const cs = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c; do { c = Array.from({ length: 4 }, () => cs[Math.floor(Math.random() * cs.length)]).join(''); }
  while (rooms.has(c));
  return c;
};

function touch(r) { r.lastActivity = Date.now(); }
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [code, r] of rooms) {
    if ((r.lastActivity || 0) < cutoff) {
      for (const c of r.clients) { try { c.res.end(); } catch (e) {} }
      rooms.delete(code);
      console.log(`ルーム${code}を掃除(60分無操作)`);
    }
  }
}, 10 * 60 * 1000);

function makeRoom() {
  const deck = makeDeck();
  const room = {
    code: code4(), phase: 'lobby', clients: new Set(), players: [],
    owners: TILES.map(() => null),        // { player, level, creature }
    deck, market: deck.splice(0, 5),
    turn: 0, round: 1, log: [],
    pending: {},                          // playerId → { type, prompt, options }
    titles: { conqueror: null, pilgrim: null },
    duel: null, lastBattle: null, winner: null,
    treasureCost: {},                     // playerId → 次の秘宝に必要な宝石数
    curses: {},                           // tileIdx → { by, hp }
  };
  room.lastActivity = Date.now();
  rooms.set(room.code, room);
  return room;
}

function payTo(r, payer, receiver, amount) {
  const paid = Math.min(payer.gold, amount);
  payer.gold -= paid;
  if (receiver) receiver.gold += paid;
  return paid;
}
const log = (r, m) => { r.log.push(m); if (r.log.length > 60) r.log.shift(); };
const cur = r => r.players[r.turn];
const pById = (r, id) => r.players.find(p => p.id === id);

// ===== 得点・称号 =====
function chainCount(r, playerId, elem) {
  return r.owners.reduce((n, o, i) => n + (o && o.player === playerId && TILES[i].e === elem ? 1 : 0), 0);
}
function tollOf(r, i) {
  const o = r.owners[i];
  const base = o.level * chainCount(r, o.player, TILES[i].e) * RULES.tollUnit;
  return baseId(o.creature) === 'orphe' ? Math.round(base * 1.2) : base;
}
function kingBonus(r, receiver) {
  let bonus = 0;
  r.owners.forEach(o => {
    if (o && o.player === receiver.id && baseId(o.creature) === 'kbaby')
      bonus += isEvolved(o) ? 40 : 20;
  });
  if (bonus) {
    receiver.gold += bonus;
    log(r, `【王の徴収】${receiver.name}に追加+${bonus}G`);
  }
  return bonus;
}
function points(r, p) {
  const land = r.owners.reduce((n, o) => n + (o && o.player === p.id ? o.level : 0), 0);
  const titles = (r.titles.conqueror === p.id ? 2 : 0) + (r.titles.pilgrim === p.id ? 2 : 0);
  return land + titles + p.treasures;
}
function updateTitles(r) {
  for (const [key, field, min] of [['conqueror', 'battleWins', 3], ['pilgrim', 'shrineVisits', 4]]) {
    const holder = pById(r, r.titles[key]);
    for (const p of r.players) {
      if (p[field] >= min && (!holder ? true : p[field] > holder[field]) && r.titles[key] !== p.id) {
        r.titles[key] = p.id;
        log(r, `👑 ${p.name}が称号「${key === 'conqueror' ? '覇者' : '大巡礼者'}」を獲得!(+2点)`);
      }
    }
  }
}
function checkVictory(r) {
  for (const p of r.players) {
    if (points(r, p) >= TARGET_PTS) {
      r.phase = 'ended'; r.winner = p.id; r.pending = {};
      log(r, `🏆 ${p.name}が${TARGET_PTS}点に到達! 勝利!`);
      return true;
    }
  }
  return false;
}

// ===== 手番進行 =====
function ask(r, playerId, type, prompt, options) {
  r.pending[playerId] = { type, prompt, options };
}
function askRoll(r, p) {
  const opts = [{ id: 'roll', label: '🎲 サイコロを振る' }];
  if (!p.ultUsed && ULTS[p.charId])
    opts.push({ id: 'ult', label: `固有スキル【${ULTS[p.charId].name}】` });
  if (p.hand.includes('curse') &&
      r.owners.some((o, i) => o && o.player !== p.id && !r.curses[i] && baseId(o.creature) !== 'beruf'))
    opts.push({ id: 'usecurse', label: '☠ 衰弱の呪いを使う' });
  ask(r, p.id, 'roll', 'あなたの手番です', opts);
}
function beginTurn(r) {
  if (r.phase !== 'playing') return;
  const p = cur(r);
  // この人が掛けた呪いは効果終了(「あなたの次の手番まで」)
  for (const [ti, c] of Object.entries(r.curses))
    if (c.by === p.id) { delete r.curses[ti]; log(r, `衰弱の呪い(${ti}番の土地)の効果が切れた`); }
  // この人の結界は効果終了
  if (r.barrier === p.id) { r.barrier = null; log(r, `${p.name}の大結界が解けた`); }
  log(r, `▶ ${p.name}の手番(ラウンド${r.round})`);
  askRoll(r, p);
}
function endTurn(r) {
  r.pending = {};
  updateTitles(r);
  if (checkVictory(r)) return;
  r.turn = (r.turn + 1) % r.players.length;
  if (r.turn === 0) r.round++;
  beginTurn(r);
}

function performMove(r, p, steps, meta, moveLabel) {
  r.lastDice = Object.assign({ player: p.id, at: Date.now() }, meta);
  let bonus = 0;
  for (let s2 = 0; s2 < steps; s2++) {
    p.pos = (p.pos + 1) % TILES.length;
    if (p.pos === 0) bonus += RULES.castleBonus;
  }
  if (bonus) p.gold += bonus;
  r.lastDice.castle = bonus ? { gold: bonus, drew: 1 } : null;
  log(r, `${p.name}は${moveLabel}${bonus ? `(城通過 +${bonus}G、カードを選択!)` : ''}`);
  if (bonus) return startDraft(r, p, 'tile');
  resolveTile(r, p);
}
function doRoll(r, p) {
  const dice = 1 + Math.floor(Math.random() * 6);
  performMove(r, p, dice, { value: dice }, `${dice}を出した`);
}
function resolveTile(r, p) {
  const i = p.pos, tile = TILES[i];
  if (tile.t === 'castle') { log(r, `${p.name}は城に到着`); return askUpgrade(r, p, '城'); }
  if (tile.t === 'gate') { log(r, `${p.name}は門に到着`); return askGate(r, p); }
  if (tile.t === 'shrine') {
    p.gold += RULES.shrineBonus; p.shrineVisits++;
    r.lastEvent = { type: 'shrine', player: p.id, gold: RULES.shrineBonus,
                    visits: p.shrineVisits, at: Date.now() };
    log(r, `${p.name}は祠に参拝(+${RULES.shrineBonus}G / 通算${p.shrineVisits}回)`);
    return endTurn(r);
  }
  if (tile.t === 'market') return askMarket(r, p);

  const o = r.owners[i];
  if (!o) {
    const opts = p.hand.filter(c => CREATURES[c] && CREATURES[c].cost <= p.gold)
      .map(c => ({ id: 'summon:' + c, label: `${CREATURES[c].name}を召喚(−${CREATURES[c].cost}G)` }));
    opts.push({ id: 'pass', label: '見送る' });
    return ask(r, p.id, 'tile', `空き地(${tile.e})に到着`, opts);
  }
  if (o.player === p.id) return askUpgrade(r, p, '自領地');
  // 敵領地
  const enemy = pById(r, o.player);
  const toll = tollOf(r, i);
  const opts = [{ id: 'toll', label: `通行料を払う(−${toll}G)` }];
  if (r.barrier === o.player) {
    log(r, `🛡 ${enemy.name}の大結界により侵略できない!`);
  } else if (p.hand.some(c => CREATURES[c])) opts.push({ id: 'invade', label: '⚔ 侵略する' });
  ask(r, p.id, 'tile', `${enemy.name}の領地(${tile.e} Lv${o.level} / 通行料${toll}G)`, opts);
}

function upCost(r, p, i) {
  const base = RULES.levelCost[r.owners[i].level + 1];
  return TILES[i].e === CHARS[p.charId].elem ? Math.round(base * 0.8) : base;
}
function askUpgrade(r, p, where) {
  const opts = [];
  r.owners.forEach((o, i) => {
    if (o && o.player === p.id && o.level < RULES.maxLevel && p.gold >= upCost(r, p, i)) {
      const aff = TILES[i].e === CHARS[p.charId].elem;
      opts.push({ id: 'up:' + i, label:
        `${TILES[i].e} Lv${o.level}→${o.level + 1}: ${CREATURES[o.creature].name}の土地(−${upCost(r, p, i)}G${aff ? ' 親和-20%' : ''})` });
    }
  });
  if (!opts.length) { log(r, `${p.name}は${where}で休息した(強化できる領地なし)`); return endTurn(r); }
  opts.push({ id: 'pass', label: '強化しない' });
  ask(r, p.id, 'upgrade', `${where}に到着 ─ 好きな領地を強化できる`, opts);
}
function startDraft(r, p, resume) {
  refillDeck(r);
  if (r.deck.length < 3) {
    r.deck.push(...makeDeck());
    log(r, '📦 市場の山札が補充された');
  }
  const cards = r.deck.splice(0, 3);
  const ranks = { N: 0, R: 1, L: 2 };
  const top = cards.reduce((a, c) => ranks[CREATURES[c].rarity] > ranks[a] ? CREATURES[c].rarity : a, 'N');
  r.draft = { player: p.id, cards, resume, aura: top };
  ask(r, p.id, 'draft', 'カードを1枚選んで獲得(残りは山札の底へ)', cards.map(c => ({
    id: 'take:' + c,
    label: `${CREATURES[c].name}(ST${CREATURES[c].st}/HP${CREATURES[c].hp})${CREATURES[c].fx ? ' ' + CREATURES[c].fx : ''}`,
  })));
}
function askGate(r, p) {
  const canUp = r.owners.some((o, i) => o && o.player === p.id &&
    o.level < RULES.maxLevel && p.gold >= upCost(r, p, i));
  const canForge = p.gold >= RULES.forgeCost &&
    p.hand.some(c => CREATURES[c] && CREATURES[c].evo);
  const opts = [];
  if (canUp) opts.push({ id: 'g_up', label: '領地を強化する' });
  opts.push({ id: 'g_draft', label: 'カードを引く(3枚から選択)' });
  if (canForge) opts.push({ id: 'g_forge', label: `鍛錬 ─ 手札のクリーチャーを進化させる(−${RULES.forgeCost}G)` });
  opts.push({ id: 'pass', label: '何もしない' });
  ask(r, p.id, 'gate', '変化の門 ─ 恩恵を選べ', opts);
}
function askForge(r, p) {
  const opts = [];
  p.hand.forEach((c, i) => {
    if (CREATURES[c] && CREATURES[c].evo)
      opts.push({ id: 'fg:' + i, label: `${CREATURES[c].name} → ${CREATURES[c].evo}(ST${CREATURES[c].evoSt}/HP${CREATURES[c].evoHp})` });
  });
  opts.push({ id: 'back', label: 'やめる(門にもどる)' });
  ask(r, p.id, 'forge', `鍛錬 ─ 進化させるクリーチャーを選べ(−${RULES.forgeCost}G)`, opts);
}
function askMarket(r, p) {
  const half = r.halfMarket === p.id;
  const hm = x => half ? Math.round(x / 2) : x;
  const opts = [];
  if (p.gold >= hm(RULES.drawPrice))
    opts.push({ id: 'draw', label: `クリーチャーの札を引く(−${hm(RULES.drawPrice)}G / 3枚から1枚選択)` });
  for (const [id, sp] of Object.entries(SUPPORTS))
    if (hm(sp.cost) <= p.gold) opts.push({ id: 'buys:' + id, label: `支援「${sp.name}」を購入(−${hm(sp.cost)}G)` });
  if (hm(ITEMS.curse.cost) <= p.gold)
    opts.push({ id: 'buyi:curse', label: `☠ 衰弱の呪いを購入(−${hm(ITEMS.curse.cost)}G)` });
  if (p.gold >= hm(RULES.gemPrice) && (half || (p.gemThisStop || 0) < 2))
    opts.push({ id: 'gem', label: `宝石を購入(−${hm(RULES.gemPrice)}G / 所持${p.gems}個)` });
  const need = r.treasureCost[p.id] || 5;
  if (p.gems >= need) opts.push({ id: 'treasure', label: `💎 秘宝と交換(宝石${need}個 → +1点)` });
  opts.push({ id: 'done', label: '市場を出る' });
  ask(r, p.id, 'market', half ? '💧 水鏡の市場 ─ 全品半額セール!' : '市場に到着 ─ 買い物ができます', opts);
}

// ===== 侵略戦闘 =====
function startBattle(r, attacker, tileIdx) {
  const opts = attacker.hand.filter(c => CREATURES[c])
    .map(c => ({ id: 'atk:' + c, label: `${CREATURES[c].name}(ST${CREATURES[c].st})で攻める` }));
  opts.push({ id: 'cancel', label: 'やめて通行料を払う' });
  r.battle = { tile: tileIdx, attacker: attacker.id, defender: r.owners[tileIdx].player,
               atkCreature: null, supports: {} };
  ask(r, attacker.id, 'pick_creature', '侵略! 手札からクリーチャーを選べ', opts);
}
function askSupports(r) {
  const b = r.battle;
  for (const pid of [b.attacker, b.defender]) {
    const p = pById(r, pid);
    const opts = p.hand.filter(c => SUPPORTS[c])
      .map(c => ({ id: 'sup:' + c, label: `${SUPPORTS[c].name}を出す` }));
    opts.push({ id: 'sup:none', label: '支援なしで挑む' });
    ask(r, pid, 'support', '⚔ 支援カードを秘密裏に選べ', opts);
  }
}
function resolveBattle(r) {
  const b = r.battle;
  const atk = pById(r, b.attacker), def = pById(r, b.defender);
  const o = r.owners[b.tile];
  const tile = TILES[b.tile];
  const ac = CREATURES[b.atkCreature], dc = CREATURES[o.creature];
  const defEvolved = isEvolved(o);
  const notes = [];

  // --- 支援カード(呪具・雲隠れによる無効化) ---
  const aSup = b.supports[atk.id] !== 'none' ? SUPPORTS[b.supports[atk.id]] : null;
  const dSup = b.supports[def.id] !== 'none' ? SUPPORTS[b.supports[def.id]] : null;
  let aJinxed = dSup && dSup.jinx, dJinxed = aSup && aSup.jinx;
  if (baseId(o.creature) === 'ludi' && aSup && !aJinxed) {
    aJinxed = true;
    notes.push('【雲隠れ】' + dc.name + 'が相手の支援を無効化!');
  }
  const aEff = aJinxed ? null : aSup, dEff = dJinxed ? null : dSup;

  // --- 擬態(基礎値のコピー) ---
  let aBase = { st: ac.st, hp: ac.hp }, dBase = { st: dc.st, hp: dc.hp };
  if (baseId(b.atkCreature) === 'mimic') { aBase = { st: dc.st, hp: dc.hp }; notes.push('【擬態】ミミックが' + dc.name + 'をコピー!'); }
  if (baseId(o.creature) === 'mimic') { dBase = { st: ac.st, hp: ac.hp }; notes.push('【擬態】ミミックが' + ac.name + 'をコピー!'); }

  // --- 攻撃側ST ---
  let st = aBase.st + (aEff ? aEff.st : 0);
  if (baseId(b.atkCreature) === 'gecko') { st += 10; notes.push('【猛攻】ST+10!'); }
  if (baseId(b.atkCreature) === 'detropas') {
    const fires = r.owners.reduce((n, oo, i) => n + (oo && oo.player === atk.id && TILES[i].e === 'fire' ? 1 : 0), 0);
    if (fires) { st += fires * 5; notes.push(`【群れ】火の領地${fires}つでST+${fires * 5}!`); }
  }

  // --- 防衛側HP(地形・女王・呪い) ---
  let terrain = (dc.elem === tile.e || baseId(o.creature) === 'cleo') ? o.level * 10 : 0;
  if (baseId(o.creature) === 'cleo' && dc.elem !== tile.e) notes.push('【適応】クレオが地形に順応!');
  if (baseId(o.creature) === 'nome' && terrain) { terrain *= 2; notes.push('【岩壁】地形補正2倍!'); }
  if (baseId(b.atkCreature) === 'garble' && terrain) { terrain = 0; notes.push('【風刃】地形補正を無視!'); }
  let queenBonus = 0;
  for (const d of [-1, 1]) {
    const ni = (b.tile + d + 28) % 28;
    const no = r.owners[ni];
    if (no && no.player === def.id && baseId(no.creature) === 'qbaby')
      queenBonus += isEvolved(no) ? 20 : 10;
  }
  if (queenBonus) notes.push(`【女王の威光】防衛HP+${queenBonus}!`);
  const curse = (r.curses[b.tile] && baseId(o.creature) !== 'beruf') ? r.curses[b.tile].hp : 0;
  const hp = dBase.hp + terrain + queenBonus + (dEff ? dEff.hp : 0) - curse;

  // 支援カードは勝敗問わず消費
  for (const [pid, sc] of Object.entries(b.supports))
    if (sc !== 'none') { const pl = pById(r, pid); pl.hand.splice(pl.hand.indexOf(sc), 1); }

  const win = st >= hp;
  r.lastBattle = { tile: b.tile, attacker: atk.id, defender: def.id,
    atkCreature: b.atkCreature, defCreature: o.creature,
    atkSupport: b.supports[atk.id], defSupport: b.supports[def.id],
    st, hp, terrain, curse, notes, win, at: Date.now() };
  log(r, `⚔ ${atk.name}の${ac.name}(ST${st}) vs ${def.name}の${dc.name}(HP${hp})`);
  for (const n of notes) log(r, n);

  if (win) {
    atk.hand.splice(atk.hand.indexOf(b.atkCreature), 1);
    // 旋風: 敗北した防衛側ガストンは手札に帰還
    if (baseId(o.creature) === 'gaston') {
      def.hand.push(o.creature);
      log(r, `【旋風】${def.name}のガストンは風に乗って帰還した`);
    }
    r.owners[b.tile] = { player: atk.id, level: o.level, creature: b.atkCreature };
    atk.battleWins++;
    log(r, `${atk.name}の勝利! Lv${o.level}の土地を奪取した!`);
    if (baseId(b.atkCreature) === 'harpy') {
      const got = payTo(r, def, atk, 50);
      if (got) log(r, `【略奪】ハーピーが${def.name}から${got}Gを奪った!`);
    }
  } else {
    if (baseId(b.atkCreature) === 'gaston') {
      log(r, `【旋風】${atk.name}のガストンは風に乗って帰還した`);
    } else {
      atk.hand.splice(atk.hand.indexOf(b.atkCreature), 1);
    }
    const toll = tollOf(r, b.tile);
    payTo(r, atk, def, toll);
    kingBonus(r, def);
    def.battleWins++;
    log(r, `${def.name}が防衛成功! 通行料${toll}Gも支払わせた`);
    if (baseId(o.creature) === 'barbaro') {
      const extra = payTo(r, atk, def, defEvolved ? 40 : 20);
      if (extra) log(r, `【逆鱗】バーグランダの怒りで追加${extra}Gを支払った!`);
    }
  }
  r.battle = null;
  endTurn(r);
}

// ===== アクションハンドラ =====
function handleChoose(r, playerId, optionId) {
  const p = pById(r, playerId);
  const pend = r.pending[playerId];
  if (!p || !pend || !pend.options.some(o => o.id === optionId)) return;
  delete r.pending[playerId];

  // --- キャラ選択 ---
  if (pend.type === 'select_char') {
    p.charId = optionId; p.confirmed = true;
    log(r, `${p.name}は${CHARS[optionId].name}を選択`);
    return trySelectResolve(r);
  }

  // --- ゲーム中 ---
  if (pend.type === 'roll' && optionId === 'roll') return doRoll(r, p);
  if (pend.type === 'roll' && optionId === 'ult') {
    if (p.charId === 'mio') {
      const opts = TILES.map((t, i) => {
        if (i === p.pos) return null;
        const o = r.owners[i];
        const desc = t.t === 'land'
          ? `${t.e} ${o ? pById(r, o.player).name + 'の領地Lv' + o.level : '空き地'}`
          : { castle: '🏰 城', shrine: '⛩ 祠', market: '🏪 市場', gate: '🚪 門' }[t.t];
        return { id: 'mt:' + i, label: `#${i} ${desc}` };
      }).filter(Boolean);
      opts.push({ id: 'mt:cancel', label: 'やめる' });
      return ask(r, p.id, 'ult_mio', '⚡【追い風の導き】どのマスへ舞い降りる?', opts);
    }
    p.ultUsed = true;
    r.lastUlt = { player: p.id, charId: p.charId, name: ULTS[p.charId].name, at: Date.now() };
    log(r, `⚡ ${p.name}が固有スキル【${ULTS[p.charId].name}】を発動!`);
    if (p.charId === 'redani') {
      const d = [0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6));
      const sum = d[0] + d[1] + d[2];
      return performMove(r, p, sum, { value: d[0], multi: d }, `3つのダイスで${sum}を出した!(${d.join('+')})`);
    }
    if (p.charId === 'linnei') {
      const target = [8, 23].map(m => ({ m, d: (m - p.pos + 28) % 28 })).sort((a, b) => a.d - b.d)[0].m;
      p.pos = target;
      r.halfMarket = p.id;
      log(r, `${p.name}は水鏡を通って市場へ瞬間移動した(全品半額!)`);
      return askMarket(r, p);
    }
    if (p.charId === 'grease') {
      r.barrier = p.id;
      for (const [ti] of Object.entries(r.curses))
        if (r.owners[ti] && r.owners[ti].player === p.id) delete r.curses[ti];
      log(r, `🛡 ${p.name}の全領地に大結界が張られた(次の手番まで侵略不可)`);
      return askRoll(r, p);
    }
    return askRoll(r, p);
  }
  if (pend.type === 'ult_mio') {
    if (optionId === 'mt:cancel') return askRoll(r, p);
    const i = +optionId.slice(3);
    p.ultUsed = true;
    r.lastUlt = { player: p.id, charId: p.charId, name: ULTS.mio.name, at: Date.now() };
    log(r, `⚡ ${p.name}が固有スキル【追い風の導き】を発動! 風に乗って移動する`);
    p.pos = i;
    return resolveTile(r, p);
  }
  if (pend.type === 'roll' && optionId === 'usecurse') {
    const opts = r.owners.map((o, i) => o && o.player !== p.id && !r.curses[i] && baseId(o.creature) !== 'beruf'
      ? { id: 'ct:' + i, label: `${pById(r, o.player).name}の${CREATURES[o.creature].name}(${TILES[i].e} Lv${o.level})` }
      : null).filter(Boolean);
    opts.push({ id: 'ct:cancel', label: 'やめる' });
    return ask(r, p.id, 'curse_target', '☠ どの土地に呪いを掛ける?', opts);
  }
  if (pend.type === 'curse_target') {
    if (optionId !== 'ct:cancel') {
      const i = +optionId.slice(3);
      p.hand.splice(p.hand.indexOf('curse'), 1);
      r.curses[i] = { by: p.id, hp: ITEMS.curse.hp };
      const o = r.owners[i];
      log(r, `☠ ${p.name}が${pById(r, o.player).name}の${CREATURES[o.creature].name}に衰弱の呪いを放った!(HP-${ITEMS.curse.hp})`);
    }
    return beginTurn(r);
  }

  if (pend.type === 'draft') {
    const c = optionId.slice(5);
    const rest = r.draft.cards.filter(x => x !== c);
    // 選ばれなかった2枚は山札の底へ(同じカードが複数枚ある場合も1枚だけ取る)
    const idx = r.draft.cards.indexOf(c);
    r.draft.cards.splice(idx, 1);
    r.deck.push(...r.draft.cards);
    p.hand.push(c);
    log(r, `${p.name}はカードを1枚獲得した(中身は非公開)`);
    const resume = r.draft.resume;
    r.draft = null;
    if (resume === 'tile') return resolveTile(r, p);
    if (resume === 'market') return askMarket(r, p);
    return endTurn(r);
  }

  if (pend.type === 'gate') {
    r.lastEvent = { type: 'gate', player: p.id, choice: optionId, at: Date.now() };
    if (optionId === 'g_up') return askUpgrade(r, p, '門');
    if (optionId === 'g_draft') return startDraft(r, p, 'end');
    if (optionId === 'g_forge') return askForge(r, p);
    return endTurn(r);
  }

  if (pend.type === 'forge') {
    if (optionId === 'back') return askGate(r, p);
    const i = +optionId.slice(3);
    const c = p.hand[i];
    if (!CREATURES[c] || !CREATURES[c].evo || p.gold < RULES.forgeCost) return askGate(r, p);
    p.gold -= RULES.forgeCost;
    p.hand[i] = c + '_f';
    log(r, `⚒ 【鍛錬】${p.name}の${CREATURES[c].name}が${CREATURES[c].evo}に進化した!`);
    return endTurn(r);
  }

  if (pend.type === 'upgrade') {
    if (optionId.startsWith('up:')) {
      const i = +optionId.slice(3);
      const o = r.owners[i];
      p.gold -= upCost(r, p, i); o.level++;
      log(r, `${p.name}は${CREATURES[o.creature].name}の土地をLv${o.level}に育てた` +
        (o.level === RULES.evoLevel && CREATURES[o.creature].evo
          ? ` ─ ${CREATURES[o.creature].name}が${CREATURES[o.creature].evo}に進化!` : ''));
      if (checkVictory(r)) return;
    }
    return endTurn(r);
  }

  if (pend.type === 'tile') {
    const i = p.pos, o = r.owners[i];
    if (optionId.startsWith('summon:')) {
      const c = optionId.slice(7);
      p.gold -= CREATURES[c].cost;
      p.hand.splice(p.hand.indexOf(c), 1);
      r.owners[i] = { player: p.id, level: 1, creature: c };
      log(r, `${p.name}は${CREATURES[c].name}を召喚し、土地を領地化!`);
      if (baseId(c) === 'mermaid') { p.gems++; log(r, `【真珠】${p.name}は宝石を1個得た(所持${p.gems}個)`); }
      if (baseId(c) === 'fugorm') { p.hand.push('weapon'); log(r, `【鍛冶】${p.name}は支援「武器」を得た`); }
      updateTitles(r); if (checkVictory(r)) return; return endTurn(r);
    }
    if (optionId === 'toll') {
      const enemy = pById(r, o.player);
      const toll = tollOf(r, i);
      const paid = payTo(r, p, enemy, toll);
      log(r, `${p.name}は通行料${paid}Gを支払った${paid < toll ? '(所持金不足のため全額)' : ''}`);
      kingBonus(r, enemy);
      return endTurn(r);
    }
    if (optionId === 'invade') return startBattle(r, p, i);
    return endTurn(r); // pass
  }

  if (pend.type === 'pick_creature') {
    if (optionId === 'cancel') {
      const o = r.owners[p.pos];
      const enemy = pById(r, o.player);
      const toll = tollOf(r, p.pos);
      payTo(r, p, enemy, toll); r.battle = null;
      kingBonus(r, enemy);
      log(r, `${p.name}は侵略を取りやめ、通行料${toll}Gを支払った`);
      return endTurn(r);
    }
    r.battle.atkCreature = optionId.slice(4);
    return askSupports(r);
  }

  if (pend.type === 'support') {
    r.battle.supports[playerId] = optionId.slice(4);
    if (Object.keys(r.battle.supports).length === 2) return resolveBattle(r);
    return;
  }

  if (pend.type === 'market') {
    const hm = x => r.halfMarket === p.id ? Math.round(x / 2) : x;
    if (optionId === 'draw') {
      p.gold -= hm(RULES.drawPrice);
      log(r, `${p.name}は市場でクリーチャーの札を求めた`);
      return startDraft(r, p, 'market');
    } else if (optionId.startsWith('buys:')) {
      const s = optionId.slice(5);
      p.gold -= hm(SUPPORTS[s].cost); p.hand.push(s);
      log(r, `${p.name}は支援「${SUPPORTS[s].name}」を購入`);
    } else if (optionId === 'buyi:curse') {
      p.gold -= hm(ITEMS.curse.cost); p.hand.push('curse');
      log(r, `☠ ${p.name}は衰弱の呪いを購入した`);
    } else if (optionId === 'gem') {
      p.gold -= hm(RULES.gemPrice); p.gems++; p.gemThisStop = (p.gemThisStop || 0) + 1;
      log(r, `${p.name}は宝石を購入(所持${p.gems}個)`);
    } else if (optionId === 'treasure') {
      const need = r.treasureCost[p.id] || 5;
      p.gems -= need; p.treasures++;
      r.treasureCost[p.id] = need + 2;
      log(r, `💎 ${p.name}は秘宝を手に入れた!(+1点)`);
      if (checkVictory(r)) return;
    } else { p.gemThisStop = 0; if (r.halfMarket === p.id) r.halfMarket = null; return endTurn(r); }
    return askMarket(r, p);
  }
}

// ===== キャラ選択フェーズ =====
function startSelect(r) {
  r.phase = 'select';
  log(r, 'キャラクター選択を開始');
  for (const p of r.players) askSelect(r, p);
}
function askSelect(r, p) {
  const taken = r.players.filter(x => x.confirmed && x.id !== p.id).map(x => x.charId);
  const opts = Object.entries(CHARS).filter(([id]) => !taken.includes(id))
    .map(([id, c]) => ({ id, label: `${c.name}を使う` }));
  ask(r, p.id, 'select_char', '使用するキャラクターを選んでください', opts);
}
function trySelectResolve(r) {
  if (!r.players.every(p => p.confirmed)) return;
  const groups = Object.keys(CHARS)
    .map(cid => ({ cid, who: r.players.filter(p => p.charId === cid) }))
    .filter(g => g.who.length >= 2);
  if (groups.length === 0) return startGame(r);
  const g = groups[0];
  let rolls, winIdx;
  do {
    rolls = g.who.map(() => 1 + Math.floor(Math.random() * 6));
    const max = Math.max(...rolls);
    winIdx = rolls.filter(v => v === max).length === 1 ? rolls.indexOf(max) : -1;
  } while (winIdx < 0);
  r.duel = { char: g.cid, contenders: g.who.map((p, k) => ({ id: p.id, name: p.name, roll: rolls[k] })),
             winner: g.who[winIdx].id, at: Date.now() };
  log(r, `🎲 ${CHARS[g.cid].name}を巡るダイス勝負! ` +
    g.who.map((p, k) => `${p.name}=${rolls[k]}`).join(' / ') + ` → ${g.who[winIdx].name}が獲得`);
  g.who.forEach((p, k) => {
    if (k !== winIdx) { p.charId = null; p.confirmed = false; askSelect(r, p); }
  });
}
function startGame(r) {
  r.phase = 'playing';
  const order = r.players.slice().sort(() => Math.random() - 0.5);
  r.players = order;
  for (const p of r.players) {
    p.pos = 0; p.gold = RULES.startGold;
    p.hand = ['gecko', 'orphe', 'nome', 'gaston', 'cleo', 'weapon', 'shield'];
    p.gems = 0; p.treasures = 0; p.battleWins = 0; p.shrineVisits = 0; p.ultUsed = false;
    p.color = CHARS[p.charId].color;
  }
  log(r, `全員のキャラが確定! ゲーム開始(手番順: ${r.players.map(p => p.name).join(' → ')})`);
  beginTurn(r);
}

// ===== 公開状態とHTTP =====
function publicState(r, viewerId) {
  return {
    ver: VERSION, code: r.code, phase: r.phase, evoLevel: RULES.evoLevel, turn: r.turn, round: r.round, target: TARGET_PTS,
    tiles: TILES, owners: r.owners, market: r.market, log: r.log,
    titles: r.titles, duel: r.duel, curses: r.curses, lastEvent: r.lastEvent || null,
    barrier: r.barrier || null, lastUlt: r.lastUlt || null, lastBattle: r.lastBattle, lastDice: r.lastDice || null,
    winner: r.winner,
    pending: Object.fromEntries(Object.entries(r.pending).map(([k, v]) =>
      [k, v.type === 'draft' && k !== viewerId
        ? { type: v.type, prompt: v.prompt, options: [], aura: r.draft ? r.draft.aura : null } : v])),
    catalog: { CREATURES, SUPPORTS, ITEMS, CHARS, ULTS },
    players: r.players.map(p => ({
      id: p.id, name: p.name, charId: p.charId || null, confirmed: !!p.confirmed,
      color: p.color || '#888', pos: p.pos || 0, gold: p.gold ?? 0,
      gems: p.gems || 0, treasures: p.treasures || 0,
      battleWins: p.battleWins || 0, shrineVisits: p.shrineVisits || 0, ultUsed: !!p.ultUsed,
      hand: p.id === viewerId ? (p.hand || []) : [],
      handCount: (p.hand || []).length,
      points: r.phase === 'playing' || r.phase === 'ended' ? points(r, p) : 0,
    })),
  };
}
function broadcast(r) {
  for (const c of r.clients) {
    try { c.res.write(`data: ${JSON.stringify(publicState(r, c.viewerId))}\n\n`); }
    catch (e) { r.clients.delete(c); }
  }
}
const readBody = req => new Promise(res => {
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', () => { try { res(JSON.parse(raw || '{}')); } catch (e) { res({}); } });
});
const json = (res, o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
const MIME = { html: 'text/html', png: 'image/png', js: 'text/javascript', svg: 'image/svg+xml', jpg: 'image/jpeg' };
function serveFile(res, rel) {
  const fp = path.join(__dirname, 'public', rel);
  if (!fp.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': (MIME[fp.split('.').pop()] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
}
const lanIP = () => {
  for (const l of Object.values(os.networkInterfaces()))
    for (const it of l || []) if (it.family === 'IPv4' && !it.internal) return it.address;
  return 'localhost';
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  if (p === '/') return serveFile(res, 'board.html');
  if (p === '/phone') return serveFile(res, 'phone.html');
  if (p.startsWith('/assets/')) return serveFile(res, p.slice(1));

  if (p === '/api/create' && req.method === 'POST') {
    const r = makeRoom();
    const base = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL.replace(/\/$/, '')
      : `http://${lanIP()}:${PORT}`;
    return json(res, { code: r.code, phoneUrl: `${base}/phone` });
  }
  if (p === '/api/join' && req.method === 'POST') {
    const b = await readBody(req);
    const r = rooms.get((b.room || '').toUpperCase());
    if (!r) return json(res, { error: 'ルームが見つかりません' }, 404);
    if (r.phase !== 'lobby') return json(res, { error: 'ゲームは開始済みです' }, 400);
    if (r.players.length >= 4) return json(res, { error: '満員です' }, 400);
    const id = 'p' + Math.random().toString(36).slice(2, 8);
    r.players.push({ id, name: (b.name || '名無し').slice(0, 8) });
    touch(r);
    log(r, `${r.players[r.players.length - 1].name}が参加した`);
    broadcast(r);
    return json(res, { playerId: id, room: r.code });
  }
  if (p === '/api/resume' && req.method === 'POST') {
    const b = await readBody(req);
    const r = rooms.get((b.room || '').toUpperCase());
    const pl = r && r.players.find(x => x.id === b.playerId);
    if (!pl) return json(res, { error: 'セッションが見つかりません' }, 404);
    touch(r);
    log(r, `${pl.name}が再入場した`);
    broadcast(r);
    return json(res, { ok: true, name: pl.name, phase: r.phase });
  }
  if (p === '/api/close' && req.method === 'POST') {
    const b = await readBody(req);
    const r = rooms.get((b.room || '').toUpperCase());
    if (r) {
      for (const c of r.clients) { try { c.res.end(); } catch (e) {} }
      rooms.delete(r.code);
      console.log(`ルーム${r.code}を手動クローズ`);
    }
    return json(res, { ok: true });
  }
  if (p === '/api/room') {
    const r = rooms.get((url.searchParams.get('code') || '').toUpperCase());
    if (!r) return json(res, { exists: false });
    const base = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL.replace(/\/$/, '')
      : `http://${lanIP()}:${PORT}`;
    return json(res, { exists: true, phase: r.phase, players: r.players.length,
                       phoneUrl: `${base}/phone` });
  }
  if (p === '/api/action' && req.method === 'POST') {
    const b = await readBody(req);
    const r = rooms.get((b.room || '').toUpperCase());
    if (!r) return json(res, { error: 'no room' }, 404);
    touch(r);
    if (b.type === 'start_select' && r.phase === 'lobby' && r.players.length >= 2) startSelect(r);
    else if (b.type === 'choose') handleChoose(r, b.playerId, b.optionId);
    broadcast(r);
    return json(res, { ok: true });
  }
  if (p === '/api/events') {
    const r = rooms.get((url.searchParams.get('room') || '').toUpperCase());
    if (!r) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const client = { res, viewerId: url.searchParams.get('me') || null };
    r.clients.add(client);
    res.write(`data: ${JSON.stringify(publicState(r, client.viewerId))}\n\n`);
    req.on('close', () => r.clients.delete(client));
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log('Summons Crest 統合サーバー起動');
  console.log(`  共有ボード: http://localhost:${PORT}`);
  console.log(process.env.PUBLIC_URL
    ? `  公開URL: ${process.env.PUBLIC_URL}`
    : `  スマホ参加: http://${lanIP()}:${PORT}/phone`);
});
