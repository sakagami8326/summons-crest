// Summons Crest 統合サーバー v0.1(段階①: ゲームエンジン)
// 仕様書v0.2準拠: 勝利点12先取 / 土地レベル / 連鎖通行料 / 支援カード付き侵略戦闘 /
// 祠(巡礼称号) / 市場(購入・宝石・秘宝) / 覇者称号 / キャラ選択のダイス競合
// 起動: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VERSION = '0.75';
const PORT = process.env.PORT || 3000;
const TARGET_PTS = 12;
const RULES = { startGold: 300, castleBonus: 200, gateBonus: 200, shrineBonus: 100, tollUnit: 30,
                levelCost: { 2: 100, 3: 450, 4: 950 }, gemPrice: 80, drawPrice: 100, maxLevel: 4,  // v0.60: Lv3/Lv4強化を大型投資に
                evoLevel: 3, forgeCost: 150,
                startHand: 5, forgetCost: 80 };  // v0.44: 初期5枚+毎ターン1枚ドロー
// キャラ別初期デッキ12枚(初期デッキ仕様案v0.1 第12節)
// v0.53: 黄金・ひらめきを全員1枚、衰弱=レダーニ/交代=リンネイ・グリース/移動=ミオ
const CHAR_DECKS = {
  redani: ['gecko', 'gecko', 'gecko', 'gaston', 'gaston', 'cleo',
           'sp_gold', 'sp_insight', 'sp_weaken',
           'weapon', 'weapon', 'jinx'],
  linnei: ['orphe', 'orphe', 'orphe', 'nome', 'nome', 'cleo',
           'sp_gold', 'sp_insight', 'sp_swap',
           'shield', 'shield', 'jinx'],
  grease: ['nome', 'nome', 'nome', 'orphe', 'orphe', 'cleo',
           'sp_gold', 'sp_insight', 'sp_swap',
           'shield', 'shield', 'jinx'],
  mio:    ['gaston', 'gaston', 'gaston', 'gecko', 'gecko', 'cleo',
           'sp_gold', 'sp_insight', 'sp_step',
           'weapon', 'weapon', 'jinx'],
};
// 廃棄スペル(使用後ゲームから除外)
const EXILE_SPELLS = new Set(['sp_quake', 'sp_ward', 'sp_volcanic_core', 'sp_abyssal_pearl', 'sp_earth_mother_stone', 'sp_sky_crystal', 'sp_cornucopia']);
const shuffle = a => a.sort(() => Math.random() - 0.5);
// 山札から引く(足りなければ捨て札をシャッフルして新しい山札に)
function drawCards(r, p, n) {
  let got = 0;
  while (got < n) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) break;
      p.deck = shuffle(p.discard);
      p.discard = [];
      log(r, `${p.name}の捨て札がシャッフルされ、新しい山札になった`);
    }
    p.hand.push(p.deck.pop());
    got++;
  }
  return got;
}
const baseId = c => (c || '').replace(/_f$/, '');
const isEvolved = (o) => o.level >= RULES.evoLevel || /_f$/.test(o.creature);
// v0.61: 新規獲得カードは捨て札ではなく現在の山札へ加えてシャッフルする(位置は非公開)
function gainToDeck(r, p, cards) {
  p.deck.push(...cards);
  shuffle(p.deck);
  r.lastGain = { player: p.id, n: cards.length, at: stamp(r) };
}

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
  gecko:  { name: 'バーンゲッコー', evo: 'サラマンダー',   elem: 'fire',  st: 40, hp: 25, cost: 50, evoSt: 60, evoHp: 40, fx: '【猛攻】攻撃時AT+10', rarity: 'N' },
  orphe:  { name: 'オルフェ',       evo: 'ウンディーネ',   elem: 'water', st: 30, hp: 30, cost: 50, evoSt: 45, evoHp: 50, fx: '【清流】この土地の通行料+20%', rarity: 'N' },
  nome:   { name: 'ノーム',         evo: 'アースゴーレム', elem: 'earth', st: 10, hp: 50, cost: 50, evoSt: 30, evoHp: 75, fx: '【岩壁】防衛時、地形補正+10(進化+20)', rarity: 'N' },
  gaston: { name: 'ガストン',       evo: 'ガストレイド',   elem: 'wind',  st: 20, hp: 40, cost: 50, evoSt: 40, evoHp: 60, fx: '【旋風】敗北しても消滅せず手札に戻る', rarity: 'N' },
  cleo:   { name: 'クレオ',         evo: 'クレステッド',   elem: null,    st: 30, hp: 30, cost: 50, evoSt: 50, evoHp: 45, fx: '【適応】どの属性でも地形補正を得る', rarity: 'N' },
  // マーケット
  magado:  { name: 'マガドー', evo: 'マグナガルム', elem: 'fire', st: 55, hp: 35, cost: 120, evoSt: 75, evoHp: 55, rarity: 'R' },
  qbaby:   { name: 'クイーンベビー', evo: 'クイーン', elem: 'fire', st: 35, hp: 30, cost: 120, evoSt: 55, evoHp: 50, fx: '【女王の威光】両隣の自領地の防衛DF+10(進化+20)', rarity: 'L' },
  cresteria:{ name: 'クレステリア',    elem: 'water', st: 20, hp: 50, cost: 90, fx: '【真珠】召喚時、宝石1個を得る', rarity: 'N' },
  kbaby:   { name: 'キングベビー', evo: 'キング', elem: 'water', st: 30, hp: 40, cost: 120, evoSt: 50, evoHp: 60, fx: '【王の徴収】この土地の通行料受取時+30G(進化+50G)', rarity: 'L' },
  ludi:    { name: 'ルディ', evo: 'シンルー', elem: 'wind', st: 25, hp: 40, cost: 120, evoSt: 45, evoHp: 60, fx: '【雲隠れ】防衛時、相手の支援を無効化', rarity: 'L' },
  garble:  { name: 'ガーブル', evo: 'ガレス・ゲイル', elem: 'wind', st: 35, hp: 25, cost: 120, evoSt: 55, evoHp: 45, fx: '【風刃】攻撃時、相手の地形補正を無視', rarity: 'R' },
  barbaro: { name: 'バルバロ', evo: 'バーグランダ', elem: 'earth', st: 30, hp: 45, cost: 120, evoSt: 50, evoHp: 65, fx: '【逆鱗】防衛成功時、相手から30G奪う(進化50G)', rarity: 'R' },
  detropas:{ name: 'デトロパス', evo: 'クラーケンイービル', elem: 'fire', st: 30, hp: 25, cost: 90, evoSt: 50, evoHp: 45, fx: '【群れ】攻撃時、自分の火の土地×AT+5', rarity: 'N' },
  goagoa:  { name: 'ゴアゴア', evo: 'ノーク・ゴーア', elem: 'water', st: 40, hp: 40, cost: 140, evoSt: 60, evoHp: 65, fx: '【深海】防衛成功時、自分の負傷を10回復する', rarity: 'R' },
  fugorm:  { name: 'フーゴルム', evo: 'ゴーレムアイン', elem: 'earth', st: 35, hp: 40, cost: 100, evoSt: 55, evoHp: 60, fx: '【鍛冶】召喚時、支援「武器」を得る', rarity: 'N' },
  bedebero:{ name: 'ベデベロ',         elem: 'earth', st: 30, hp: 60, cost: 120, fx: '【不動】受けるスペルダメージを10軽減する', rarity: 'R' },
  zati:    { name: 'ザーティー', evo: 'ザンティアー', elem: 'wind', st: 40, hp: 30, cost: 90, evoSt: 60, evoHp: 50, fx: '【略奪】侵略成功時、相手から50G奪う', rarity: 'N' },
  pakawata:{ name: 'パカワタ',         elem: 'wind',  st: 50, hp: 25, cost: 130, fx: '【先制】防衛時、侵略側より先に攻撃する', rarity: 'R' },
  avalanche:{ name: 'アヴァランチ', evo: 'アヴァランチジャイアント', elem: 'earth', st: 20, hp: 40, cost: 120, evoSt: 30, evoHp: 60, fx: '【双撃】侵略時、同じATで2回続けて攻撃する', rarity: 'L' },
  mimic:   { name: 'ミミック',         elem: null,    st: 30, hp: 30, cost: 70, fx: '【擬態】戦闘時、相手の基礎AT/HPをコピー', rarity: 'N' },
  beruf:   { name: 'ベルーフ・シェイド', evo: 'デスベルーフ', elem: null, st: 20, hp: 50, cost: 90, evoSt: 40, evoHp: 70, fx: '【死影】スペルダメージを受けるたびAT+10(最大+30)。土地を離れるまで持続', rarity: 'N' },
};
const ITEMS = {}; // v0.34: 呪いアイテムは廃止(スペル「衰弱の呪文」に移行)
const SPELLS = {
  sp_gold:   { name: '黄金の呪文', rarity: 'N', cost: 0,
               desc: '現在の周回数×100Gを得る' },
  sp_weaken: { name: '衰弱の呪文', rarity: 'N', cost: 40, hp: 20,
               desc: '敵領地を1つ選び、そのクリーチャーに20ダメージ(回復しない)。HPが0以下になると滅び、土地は空き地になる' },
  sp_gale:   { name: '疾風の呪文', rarity: 'R', cost: 30,
               desc: 'このターン、サイコロを2個振って移動する' },
  sp_quake:  { name: '地割れの呪文', rarity: 'R', cost: 100,
               desc: '敵の領地1つのレベルを1下げる(Lv1には無効)' },
  sp_step:   { name: '移動の呪文', rarity: 'R', cost: 40,
               desc: '自分の領地のクリーチャー1体を隣のマスへ移動。空き地なら新たな領地(Lv1)に、敵領地ならそのまま侵略(通行料なし)' },
  // ---- v0.56 追加スペル(スペル追加仕様v0.53) ----
  sp_volcanic_core:     { name: '火山核', rarity: 'R', cost: 80,
    desc: '自分の領地1つを火属性に変更する' },
  sp_abyssal_pearl:     { name: '深海珠', rarity: 'R', cost: 80,
    desc: '自分の領地1つを水属性に変更する' },
  sp_earth_mother_stone:{ name: '地母石', rarity: 'R', cost: 80,
    desc: '自分の領地1つを土属性に変更する' },
  sp_sky_crystal:       { name: '天空晶', rarity: 'R', cost: 80,
    desc: '自分の領地1つを風属性に変更する' },
  sp_flame_vortex:      { name: '炎の渦', rarity: 'R', cost: 50,
    desc: '敵領地に10ダメージを与える。次にその領地へ侵略するクリーチャーはAT+10' },
  sp_bloodstained_blade:{ name: '血染めの刃', rarity: 'R', cost: 40,
    desc: '次の侵略でAT+10。侵略成功時、相手から30Gを奪う' },
  sp_high_tide:         { name: '満ち潮', rarity: 'R', cost: 50,
    desc: '選んだ水領地で次に受け取る通行料+50%。次の手番まで有効' },
  sp_cornucopia:        { name: '豊穣の角', rarity: 'R', cost: 0,
    desc: '自分の領地1つにつき20Gを得る' },
  sp_bedrock_uplift:    { name: '岩盤隆起', rarity: 'R', cost: 50,
    desc: '自分の土領地の負傷を20回復し、次の戦闘でDF+10' },
  sp_root_prison:       { name: '根の牢獄', rarity: 'R', cost: 40,
    desc: '次にこの領地へ侵略するクリーチャーはAT-20' },
  sp_wind_corridor:     { name: '風の回廊', rarity: 'R', cost: 40,
    desc: '自分の領地のクリーチャーを隣接する土地へ移動する。敵領地なら侵略する(通行料なし)。生き残れば全快して手札へ戻る' },
  sp_wind_shift:        { name: '風向転換', rarity: 'R', cost: 30,
    desc: 'このターンだけ、通常とは逆方向へ移動する' },
  sp_feather_rest:      { name: '羽休め', rarity: 'N', cost: 20,
    desc: '自分の領地のクリーチャーを全回復して手札へ戻す。土地は空き地になる' },
  sp_ward:   { name: '加護の呪文', rarity: 'R', cost: 80,
               desc: 'あなたの次の手番まで、自分の領地は侵略されない' },
  sp_move:   { name: '転移の呪文', rarity: 'R', cost: 40,
               desc: '自分の領地2つのクリーチャーを入れ替える(負傷も一緒に移動)' },
  sp_insight:{ name: 'ひらめきの呪文', rarity: 'N', cost: 40,
               desc: 'カードを2枚引く' },
  sp_swap:   { name: '交代の呪文', rarity: 'R', cost: 30,
               desc: '自分の領地のクリーチャーを手札のクリーチャーと交代する(召喚コスト別途。元のクリーチャーは捨て札へ・負傷は回復)' },
};
const SUPPORTS = {
  weapon:  { name: '武器',   st: 20, hp: 0,  cost: 60 },
  gweapon: { name: '重武器', st: 40, hp: 0,  cost: 120 },
  shield:  { name: '盾',     st: 0,  hp: 20, cost: 60 },
  gshield: { name: '大盾',   st: 0,  hp: 40, cost: 120 },
  jinx:    { name: '呪具',   st: 0,  hp: 0,  cost: 100, jinx: true },
};
const CHARS = {
  redani: { name: 'レダーニ', color: '#D85A30', elem: 'fire',
            style: '侵略・攻撃', deckNote: 'ゲッコー2+武器2 ─ 衰弱で崩して攻める' },
  linnei: { name: 'リンネイ', color: '#378ADD', elem: 'water',
            style: '経済・通行料', deckNote: 'オルフェ2+黄金2 ─ 資金と収入を伸ばす' },
  grease: { name: 'グリース', color: '#639922', elem: 'earth',
            style: '防衛・領地育成', deckNote: 'ノーム2+盾2+加護 ─ 守って育てる' },
  mio:    { name: 'ミオ',     color: '#4FA69C', elem: 'wind',
            style: '移動・機動侵略', deckNote: 'ガストン2+疾風2 ─ 動き回って仕掛ける' },
};
const ULTS = {
  redani: { name: '烈火の進軍', desc: 'サイコロを3個振って移動する' },
  linnei: { name: '水鏡の大商談', desc: '市場へ瞬間移動し、全品半額で買い物' },
  grease: { name: '大地の大結界', desc: '次の自分の手番まで、すべての自分の領地が侵略されなくなる' },
  mio:    { name: '追い風の導き', desc: '好きなマスへ移動して止まる' },
};
for (const [cid, c] of Object.entries({ ...CREATURES }))
  if (c.evo) CREATURES[cid + '_f'] = { name: c.evo, elem: c.elem, st: c.evoSt, hp: c.evoHp,
    cost: c.cost, fx: c.fx, rarity: c.rarity, forged: true };

const MARKET_POOL = ['magado','detropas','qbaby','cresteria','goagoa','kbaby','bedebero','fugorm','zati','pakawata','mimic','beruf','ludi','garble','barbaro','avalanche'];
const RARITY_COPIES = { L: 1, R: 2, N: 3 };
function makeDeck() {
  const d = [];
  for (const c of MARKET_POOL)
    for (let i = 0; i < RARITY_COPIES[CREATURES[c].rarity]; i++) d.push(c);
  for (const [sid, sp] of Object.entries(SPELLS))
    for (let i = 0; i < RARITY_COPIES[sp.rarity]; i++) d.push(sid);
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
    duel: null, lastBattle: null, winner: null, barrier: {},
    elemOv: {},                           // 属性変更スペル: マスi → 'fire'等
    tileFx: {},                           // 土地継続効果: マスi → {vortex,tide:{by},uplift,roots}
    treasureCost: {},                     // playerId → 次の秘宝に必要な宝石数
    curses: {},                           // tileIdx → { by, hp }
    boardToken: crypto.randomBytes(16).toString('hex'),  // v0.62: 盤面だけが持つ保存/復元/クローズ権限
  };
  room.lastActivity = Date.now();
  rooms.set(room.code, room);
  return room;
}

function payTo(r, payer, receiver, amount) {
  // v0.51: 全額を支払う(所持金はマイナスになり得る→強制売却・破産へ)
  payer.gold -= amount;
  if (receiver) receiver.gold += amount;
  return amount;
}
const log = (r, m) => { r.log.push(m); if (r.log.length > 60) r.log.shift(); };
const cur = r => r.players[r.turn];
const pById = (r, id) => r.players.find(p => p.id === id);

// ===== 得点・称号 =====
// イベント刻印: 同一ミリ秒でも必ず増加する(クライアントのat比較による重複排除を確実にする)
function stamp(r) { r.atSeq = Math.max(Date.now(), (r.atSeq || 0) + 1); return r.atSeq; }
function tileElem(r, i) { return (r.elemOv && r.elemOv[i]) || TILES[i].e; }
const ELEM_OF_SPELL = { sp_volcanic_core: 'fire', sp_abyssal_pearl: 'water',
                        sp_earth_mother_stone: 'earth', sp_sky_crystal: 'wind' };
const ELEM_JA = { fire: '火', water: '水', earth: '土', wind: '風' };
function chainCount(r, playerId, elem) {
  return r.owners.reduce((n, o, i) => n + (o && o.player === playerId && tileElem(r, i) === elem ? 1 : 0), 0);
}
function tollOf(r, i) {
  const o = r.owners[i];
  let rate = 1;
  if (baseId(o.creature) === 'orphe') rate += 0.2;                       // 清流
  if (r.tileFx[i] && r.tileFx[i].tide) rate += 0.5;                      // 満ち潮
  return Math.round(landValue(r, i) * 0.25 * rate);
}
// スペルの直接ダメージ処理: 不動(ベデベロ-10)・死影(ベルーフAT+10/最大+30)・撃破は捨て札
// 戻り値: true=撃破して空き地化
function spellDamage(r, i, raw, srcName) {
  const o = r.owners[i];
  if (!o) return false;
  const cE = CREATURES[o.creature];
  let dmg = raw;
  if (baseId(o.creature) === 'bedebero') {
    dmg = Math.max(0, dmg - 10);
    log(r, `【不動】ベデベロは巌のごとく ─ スペルダメージを10軽減(${raw}→${dmg})`);
  }
  if (dmg > 0) o.dmg = (o.dmg || 0) + dmg;
  const baseHp = isEvolved(o) && cE.evo ? cE.evoHp : cE.hp;
  if (baseHp - (o.dmg || 0) <= 0) {
    pById(r, o.player).discard.push(o.creature);  // スペルによる撃破は旋風も発動しない(捨て札)
    r.owners[i] = null;
    r.lastRuin = { tile: i, creature: o.creature, player: o.player, src: srcName, at: stamp(r) };
    log(r, `${cE.name}は${srcName}に蝕まれて滅びた… 土地は空き地になった`);
    return true;
  }
  if (dmg > 0 && baseId(o.creature) === 'beruf' && (o.shade || 0) < 3) {
    o.shade = (o.shade || 0) + 1;
    log(r, `【死影】${cE.name}は受けた痛みを影に変えた(AT+${o.shade * 10})`);
  }
  return false;
}
// 通行料を実際に受け取った時に満ち潮を消費
function consumeTide(r, i) {
  const fx = r.tileFx[i];
  if (fx && fx.tide) { delete fx.tide; log(r, `満ち潮が引いていく…(効果を消費)`); }
}
function kingBonus(r, receiver, tileIdx) {
  const o = r.owners[tileIdx];
  let bonus = 0;
  if (o && o.player === receiver.id && baseId(o.creature) === 'kbaby')
    bonus = isEvolved(o) ? 50 : 30;
  if (bonus) {
    receiver.gold += bonus;
    log(r, `【王の徴収】${receiver.name}に追加+${bonus}G`);
  }
  return bonus;
}
// ===== v0.51 資産経済 =====
const LV_MUL = { 1: 1, 2: 2.5, 3: 10, 4: 36 };  // v0.60: Lv3=10倍(通行料250G)/Lv4=36倍(通行料900G)
const CHAIN_MUL = [0, 1.0, 1.4, 1.8, 2.2, 2.6];  // 同属性所有数→倍率(5以上は2.6)
const ASSET_GOAL = 8000, ASSET_REACH = 7000;
function landValue(r, i) {
  const o = r.owners[i];
  if (!o) return 0;
  const chain = Math.min(5, chainCount(r, o.player, tileElem(r, i)));
  return Math.round(100 * LV_MUL[o.level] * CHAIN_MUL[chain]);
}
// 総資産 = 所持金+地価合計+秘宝600G+称号500G
function points(r, p) {
  const lands = r.owners.reduce((n, o, i) => n + (o && o.player === p.id ? landValue(r, i) : 0), 0);
  const titles = (r.titles.conqueror === p.id ? 500 : 0) + (r.titles.pilgrim === p.id ? 500 : 0);
  return p.gold + lands + titles + p.treasures * 600;
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
  return false;  // v0.51: 勝利判定は「城通過時に総資産8000G以上」のみ(performMove内)
}
function declareWin(r, p, why) {
  r.phase = 'ended'; r.winner = p.id; r.pending = {};
  log(r, `🏆 ${p.name}が${why} 勝利!`);
}

// ===== 手番進行 =====
function ask(r, playerId, type, prompt, options) {
  r.pending[playerId] = { type, prompt, options };
}
function askRoll(r, p) {
  const opts = [{ id: 'roll', label: '🎲 サイコロを振る' }];
  if (!p.ultUsed && ULTS[p.charId])
    opts.push({ id: 'ult', label: `固有スキル【${ULTS[p.charId].name}】` });
  // v0.60: 呪文は1ターンに1回まで(黄金+ひらめきの無限ループ対策)
  for (const sid of p.spellCast ? [] : [...new Set(p.hand.filter(c => SPELLS[c]))]) {
    if (SPELLS[sid].cost > p.gold) continue;
    if (sid === 'sp_weaken' &&
        !r.owners.some(o => o && o.player !== p.id)) continue;
    if (sid === 'sp_quake' &&
        !r.owners.some(o => o && o.player !== p.id && o.level >= 2)) continue;
    if (sid === 'sp_move' &&
        r.owners.filter(o => o && o.player === p.id).length < 2) continue;
    if (sid === 'sp_step' && !stepSources(r, p).length) continue;
    if (sid === 'sp_wind_corridor' && !stepSources(r, p).length) continue;
    if (sid === 'sp_wind_shift' && p.windShift) continue;
    if ((sid === 'sp_volcanic_core' || sid === 'sp_abyssal_pearl' ||
         sid === 'sp_earth_mother_stone' || sid === 'sp_sky_crystal') &&
        !r.owners.some((o, i) => o && o.player === p.id && tileElem(r, i) !== ELEM_OF_SPELL[sid])) continue;
    if (sid === 'sp_flame_vortex' && !r.owners.some(o => o && o.player !== p.id)) continue;
    if (sid === 'sp_high_tide' &&
        !r.owners.some((o, i) => o && o.player === p.id && tileElem(r, i) === 'water')) continue;
    if (sid === 'sp_bedrock_uplift' &&
        !r.owners.some((o, i) => o && o.player === p.id && tileElem(r, i) === 'earth')) continue;
    if ((sid === 'sp_root_prison' || sid === 'sp_feather_rest') &&
        !r.owners.some(o => o && o.player === p.id)) continue;
    if (sid === 'sp_swap' &&
        (!r.owners.some(o => o && o.player === p.id) ||
         !p.hand.some(c => CREATURES[c] && CREATURES[c].cost + SPELLS.sp_swap.cost <= p.gold))) continue;
    opts.push({ id: 'sp:' + sid,
      label: `呪文「${SPELLS[sid].name}」を唱える${SPELLS[sid].cost ? `(−${SPELLS[sid].cost}G)` : ''}` });
  }
  ask(r, p.id, 'roll', 'あなたの手番です', opts);
}
// ===== v0.61 選択ドロー: 手番開始時、山札から2枚見て1枚を手札へ・1枚を捨て札へ =====
// 選択ドロー: 山札からn枚見て1枚を手札へ、残りは捨て札へ。
// after='roll'(既定)=完了後にaskRoll(手番開始のドロー) / 'end'=完了後にendTurn(祠 v0.72)
function startPickDraw(r, p, n = 2, after = 'roll') {
  const done = () => after === 'end' ? endTurn(r) : askRoll(r, p);
  const cards = [];
  for (let k = 0; k < n; k++) {
    if (!p.deck.length && p.discard.length) {
      p.deck = shuffle(p.discard);
      p.discard = [];
      log(r, `${p.name}の捨て札がシャッフルされ、新しい山札になった`);
    }
    if (p.deck.length) cards.push(p.deck.pop());
  }
  if (cards.length <= 1) {
    // 山札+捨て札の合計が1枚以下: 選択画面を出さず自動処理(進行を止めない)
    if (cards.length === 1) {
      p.hand.push(cards[0]);
      r.lastDraw = { player: p.id, n: 1, reason: 'pick', at: stamp(r) };
      log(r, `${p.name}がカードを1枚引いた`);
    }
    return done();
  }
  p.pickCards = cards;  // 選択中カード(山札・手札・捨て札のどれにも属さない)
  p.pickAfter = after;
  // v0.63: 制限時間なし(じっくり選んでよい)
  ask(r, p.id, 'pick_draw', `手札に加えるカードを選んでください(選ばなかった${cards.length - 1}枚は捨て札へ)`,
    cards.map((c, i) => ({ id: 'pd:' + i, card: c,
      label: (CREATURES[c] || SPELLS[c] || SUPPORTS[c] || { name: c }).name })));
}
function resolvePickDraw(r, p, idx) {
  const after = p.pickAfter === 'end' ? 'end' : 'roll';
  p.pickAfter = null;
  const done = () => after === 'end' ? endTurn(r) : askRoll(r, p);
  const cards = p.pickCards;
  if (!cards || !cards.length) return done();
  const take = cards[idx] !== undefined ? idx : 0;
  p.hand.push(cards[take]);
  p.discard.push(...cards.filter((c, i) => i !== take));
  p.pickCards = null;
  r.lastDraw = { player: p.id, n: 1, reason: 'pick', at: stamp(r) };
  log(r, `${p.name}がカードを1枚引いた(残り${cards.length - 1}枚は捨て札へ)`);  // カード名は共有ログに出さない
  return done();
}
function beginTurn(r) {
  if (r.phase !== 'playing') return;
  const p = cur(r);
  p.spellCast = false;  // 呪文は1ターンに1回まで
  p.gale = false;
  p.blade = false;  // 血染めの刃: 次の手番開始まで侵略しなければ解除
  for (const fx of Object.values(r.tileFx))
    if (fx.tide && fx.tide.by === p.id) delete fx.tide;  // 満ち潮: 次の手番開始で解除
  // この人が掛けた呪いは効果終了(「あなたの次の手番まで」)
  for (const [ti, c] of Object.entries(r.curses))
    if (c.by === p.id) { delete r.curses[ti]; log(r, `衰弱の呪い(${ti}番の土地)の効果が切れた`); }
  // この人の結界は効果終了
  if (r.barrier[p.id]) { delete r.barrier[p.id]; log(r, `${p.name}の結界が解けた`); }
  log(r, `▶ ${p.name}の手番(ラウンド${r.round})`);
  startPickDraw(r, p);  // v0.61: 選択ドロー(完了後にaskRollへ)
}
// 所持金がマイナスの人がいれば強制売却→それでも負なら破産。全員0以上ならendTurnへ
function settleAll(r) {
  if (r.phase !== 'playing') return;
  const debtor = r.players.find(q => !q.bankrupt && q.gold < 0);
  if (!debtor) return endTurn(r);
  const lands = [];
  r.owners.forEach((o, i) => { if (o && o.player === debtor.id) lands.push(i); });
  if (!lands.length) return bankrupt(r, debtor);
  const opts = lands.map(i => ({
    id: 'sl:' + i,
    label: `${TILES[i].e} Lv${r.owners[i].level} ${CREATURES[r.owners[i].creature].name}の土地を売却(+${Math.round(landValue(r, i) * 0.7)}G)`,
  }));
  ask(r, debtor.id, 'sell',
    `所持金${debtor.gold}G ─ 0以上になるまで領地を売却する(売却額=地価の70%)`, opts);
}
function bankrupt(r, p) {
  p.bankrupt = true;
  p.gold = 0;
  p.blade = false; p.windShift = false;
  for (const fx of Object.values(r.tileFx))
    if (fx.tide && fx.tide.by === p.id) delete fx.tide;
  r.lastEvent = { type: 'bankrupt', player: p.id, at: stamp(r) };
  log(r, `💥 ${p.name}は破産した! ゲームから脱落…`);
  delete r.pending[p.id];
  const alive = r.players.filter(q => !q.bankrupt);
  if (alive.length === 1) return declareWin(r, alive[0], '最後の生き残りとなった!');
  return endTurn(r);
}
const HAND_LIMIT = 7;
function endTurn(r) {
  // 手札上限: 8枚以上なら7枚になるまで捨てさせてから手番を渡す
  const p = cur(r);
  if (p) p.windShift = false;  // 風向転換はターン終了で解除
  if (p && !p.bankrupt && p.hand && p.hand.length > HAND_LIMIT) {  // 破産者に捨て札選択はさせない
    const opts = [...new Set(p.hand)].map(c => ({
      id: 'ov:' + c,
      label: (CREATURES[c] || SPELLS[c] || SUPPORTS[c] || { name: c }).name,
      card: c,
    }));
    return ask(r, p.id, 'overflow',
      `手札が${p.hand.length}枚 ─ ${HAND_LIMIT}枚になるまで捨てるカードを選ぶ`, opts);
  }
  r.pending = {};
  updateTitles(r);
  if (checkVictory(r)) return;
  do {
    r.turn = (r.turn + 1) % r.players.length;
    if (r.turn === 0) r.round++;
  } while (r.players[r.turn].bankrupt);
  beginTurn(r);
}

const GATE_TILE = TILES.findIndex(t => t.t === 'gate');
function performMove(r, p, steps, meta, moveLabel) {
  // 初回の移動時: ダイスの後に進行方向を選ぶ(矢印UI)
  if (!p.dir) {
    const at = stamp(r);
    r.lastDice = Object.assign({ player: p.id, at, noMove: true }, meta);  // 出目だけ先に見せる
    r.dirPend = { steps, meta: Object.assign({}, meta, { at }), moveLabel };
    return ask(r, p.id, 'direction', `${steps}が出た! どちらの方向へ進む?`, [
      { id: 'dir:1', label: '⬅ 左回りに進む' },
      { id: 'dir:-1', label: '右回りに進む ➡' },
    ]);
  }
  r.lastDice = Object.assign({ player: p.id, at: stamp(r) }, meta);
  const dir = (p.dir || 1) * (p.windShift ? -1 : 1);  // 風向転換: このターンのみ逆方向
  let bonus = 0, gotSeal = false, noSeal = false;
  for (let s2 = 0; s2 < steps; s2++) {
    p.pos = (p.pos + dir + TILES.length) % TILES.length;
    if (p.pos === GATE_TILE && !p.seal) { p.seal = true; gotSeal = true; }
    if (p.pos === 0) {
      p.lap = (p.lap || 1) + 1;  // 刻印の有無に関わらず周回は進む
      if (p.seal) { bonus += RULES.castleBonus; p.seal = false; }
      else noSeal = true;
    }
  }
  if (gotSeal) {
    // v0.59: 門通過で+200Gと刻印を入手(オーナー指示)
    p.gold += RULES.gateBonus;
    r.lastSeal = { player: p.id, gold: RULES.gateBonus, at: stamp(r) };
    log(r, `❖ ${p.name}は門を通過 ─ +${RULES.gateBonus}Gと刻印を得た(城まで持ち帰ると一周ボーナス)`);
  }
  if (bonus) {
    // 領地ボーナス: 所有地価合計の10%
    const lands = r.owners.reduce((n, o, i) => n + (o && o.player === p.id ? landValue(r, i) : 0), 0);
    const lb = Math.round(lands * 0.1);
    p.gold += bonus + lb;
    // 帰還の癒し: 自領地のクリーチャーの負傷を10回復(最大値は超えない)
    const healed = [];
    r.owners.forEach((o, i) => {
      if (o && o.player === p.id && o.dmg > 0) {
        o.dmg = Math.max(0, o.dmg - 10);
        healed.push(i);
      }
    });
    if (healed.length) log(r, `⛨ 帰還の癒し ─ ${p.name}の領地のクリーチャーが回復した(負傷-10 × ${healed.length}体)`);
    r.lastDice.castle = { gold: bonus, landBonus: lb, drew: 1, healed };
    log(r, `${p.name}は${moveLabel}(城通過 +${bonus}G${lb ? `+領地ボーナス${lb}G` : ''}、カードを選択!)`);
    // 勝利判定: ボーナス込みで総資産8000G以上
    if (points(r, p) >= ASSET_GOAL) {
      return declareWin(r, p, `総資産${points(r, p)}Gで城に凱旋!`);
    }
    return startDraft(r, p, 'tile');
  }
  r.lastDice.castle = null;
  if (noSeal) {
    log(r, `${p.name}は${moveLabel} ─ 刻印がないため一周ボーナスなし…`);
    if (points(r, p) >= ASSET_GOAL) return declareWin(r, p, `総資産${points(r, p)}Gで城に凱旋!`);
  } else {
    log(r, `${p.name}は${moveLabel}`);
  }
  resolveTile(r, p);
}
function doRoll(r, p) {
  if (p.gale) {
    p.gale = false;
    const d = [0, 0].map(() => 1 + Math.floor(Math.random() * 6));
    const sum = d[0] + d[1];
    return performMove(r, p, sum, { value: d[0], multi: d }, `疾風に乗って2つのダイスで${sum}を出した!(${d.join('+')})`);
  }
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
                    visits: p.shrineVisits, at: stamp(r) };
    log(r, `${p.name}は祠に参拝(+${RULES.shrineBonus}G / 通算${p.shrineVisits}回)`);
    // v0.74: 祠の導きは門と同じ3枚ドラフト(共通山札から3枚→1枚獲得→自分の山札へ)。完了後に手番終了
    log(r, `⛩ 祠の導き ─ ${p.name}は3枚のカードから1枚を選ぶ`);
    return startDraft(r, p, 'end');
  }
  if (tile.t === 'market') return askMarket(r, p);

  const o = r.owners[i];
  if (!o) {
    const opts = p.hand.filter(c => CREATURES[c] && CREATURES[c].cost <= p.gold)
      .map(c => ({ id: 'summon:' + c, label: `${CREATURES[c].name}を召喚(−${CREATURES[c].cost}G)` }));
    opts.push({ id: 'pass', label: '見送る' });
    return ask(r, p.id, 'tile', `空き地(${tileElem(r, p.pos)})に到着`, opts);
  }
  if (o.player === p.id) return askUpgrade(r, p, '自領地');
  // 敵領地
  const enemy = pById(r, o.player);
  const toll = tollOf(r, i);
  const opts = [{ id: 'toll', label: `通行料を払う(−${toll}G)` }];
  if (r.barrier[o.player]) {
    log(r, `🛡 ${enemy.name}の大結界により侵略できない!`);
    // v0.73: 結界が侵略を阻んだ瞬間(TVの衝撃時発光 ─ plan_phaser4 §8.4)
    r.lastBarrierHit = { tile: i, owner: o.player, by: p.id, at: stamp(r) };
  } else if (p.hand.some(c => CREATURES[c])) opts.push({ id: 'invade', label: '⚔ 侵略する' });
  ask(r, p.id, 'tile', `${enemy.name}の領地(${tileElem(r, p.pos)} Lv${o.level} / 通行料${toll}G)`, opts);
}

function upCost(r, p, i) {
  const base = RULES.levelCost[r.owners[i].level + 1];
  return tileElem(r, i) === CHARS[p.charId].elem ? Math.round(base * 0.8) : base;
}
// 移動の呪文: マスiの隣で移動可能な行き先(空き属性地 or 結界のない敵属性地)
function stepDests(r, p, i) {
  const dests = [];
  for (const d of [-1, 1]) {
    const j = (i + d + TILES.length) % TILES.length;
    const t = TILES[j];
    if (t.t !== 'land') continue;
    const o = r.owners[j];
    if (!o) dests.push(j);
    else if (o.player !== p.id && !r.barrier[o.player]) dests.push(j);
  }
  return dests;
}
function stepSources(r, p) {
  const src = [];
  r.owners.forEach((o, i) => {
    if (o && o.player === p.id && stepDests(r, p, i).length) src.push(i);
  });
  return src;
}
// Lv l→l+1 単段の費用(親和込み)
function upCostTo(r, p, i, lv) {
  const base = RULES.levelCost[lv];
  return tileElem(r, i) === CHARS[p.charId].elem ? Math.round(base * 0.8) : base;
}
// cur+1..target までの累計費用
function upCostRange(r, p, i, target) {
  let sum = 0;
  for (let l = r.owners[i].level + 1; l <= target; l++) sum += upCostTo(r, p, i, l);
  return sum;
}
function askUpgrade(r, p, where) {
  const opts = [];
  r.owners.forEach((o, i) => {
    if (o && o.player === p.id && o.level < RULES.maxLevel && p.gold >= upCostRange(r, p, i, o.level + 1)) {
      const aff = tileElem(r, i) === CHARS[p.charId].elem;
      opts.push({ id: 'up:' + i, label:
        `${TILES[i].e} Lv${o.level}: ${CREATURES[o.creature].name}の土地${aff ? '(親和-20%)' : ''}`, tile: i });
    }
  });
  if (!opts.length) { log(r, `${p.name}は${where}で休息した(強化できる領地なし)`); return endTurn(r); }
  opts.push({ id: 'pass', label: '強化しない' });
  ask(r, p.id, 'upgrade', `${where}に到着 ─ 強化する領地を選ぶ`, opts);
}
function startDraft(r, p, resume) {
  refillDeck(r);
  if (r.deck.length < 3) {
    r.deck.push(...makeDeck());
    log(r, '📦 市場の山札が補充された');
  }
  const cards = r.deck.splice(0, 3);
  const ranks = { N: 0, R: 1, L: 2 };
  const info = c => CREATURES[c] || SPELLS[c];
  const top = cards.reduce((a, c) => ranks[info(c).rarity] > ranks[a] ? info(c).rarity : a, 'N');
  r.draft = { player: p.id, cards, resume, aura: top };
  ask(r, p.id, 'draft', 'カードを1枚選んで獲得(残りは山札の底へ)', cards.map(c => ({
    id: 'take:' + c,
    label: SPELLS[c]
      ? `呪文「${SPELLS[c].name}」 ${SPELLS[c].desc}`
      : `${CREATURES[c].name}(AT${CREATURES[c].st}/HP${CREATURES[c].hp})${CREATURES[c].fx ? ' ' + CREATURES[c].fx : ''}`,
  })).concat([{ id: 'skip', label: 'カードを加えない(3枚とも山札の底へ)' }]));
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
      opts.push({ id: 'fg:' + i, label: `${CREATURES[c].name} → ${CREATURES[c].evo}(AT${CREATURES[c].evoSt}/HP${CREATURES[c].evoHp})` });
  });
  opts.push({ id: 'back', label: 'やめる(門にもどる)' });
  ask(r, p.id, 'forge', `鍛錬 ─ 進化させるクリーチャーを選べ(−${RULES.forgeCost}G)`, opts);
}
function askMarket(r, p) {
  const half = r.halfMarket === p.id;
  const hm = x => half ? Math.round(x / 2) : x;
  const opts = [];
  if (p.gold >= hm(RULES.drawPrice))
    opts.push({ id: 'draw', label: `カードを引く(−${hm(RULES.drawPrice)}G / 3枚から1枚選択)` });
  for (const [id, sp] of Object.entries(SUPPORTS))
    if (hm(sp.cost) <= p.gold) opts.push({ id: 'buys:' + id, label: `支援「${sp.name}」を購入(−${hm(sp.cost)}G)` });
  if (p.gold >= hm(RULES.gemPrice) && (half || (p.gemThisStop || 0) < 2))
    opts.push({ id: 'gem', label: `宝石を購入(−${hm(RULES.gemPrice)}G / 所持${p.gems}個)` });
  const need = r.treasureCost[p.id] || 5;
  if (p.gems >= need) opts.push({ id: 'treasure', label: `💎 秘宝と交換(宝石${need}個 → +1点)` });
  if (p.gold >= RULES.forgetCost && !p.forgetThisStop && (p.hand.length + p.discard.length) > 0)
    opts.push({ id: 'forget', label: `忘却 ─ カードを1枚廃棄(−${RULES.forgetCost}G / この来店で1回)` });
  opts.push({ id: 'done', label: '市場を出る' });
  ask(r, p.id, 'market', half ? '💧 水鏡の市場 ─ 全品半額セール!' : '市場に到着 ─ 買い物ができます', opts);
}

// ===== 侵略戦闘 =====
function startBattle(r, attacker, tileIdx) {
  const opts = attacker.hand.filter(c => CREATURES[c])
    .map(c => ({ id: 'atk:' + c, label: `${CREATURES[c].name}(AT${CREATURES[c].st})で攻める` }));
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

  // --- 進化ステータスの適用(Lv3以上の防衛側/移動の呪文で進出した攻撃側) ---
  const mvSrc = b.moveFrom !== undefined ? r.owners[b.moveFrom] : null;
  const corridor = !!b.corridor;
  const dEvoS = defEvolved && dc.evo ? { st: dc.evoSt, hp: dc.evoHp } : { st: dc.st, hp: dc.hp };
  const aEvo = mvSrc ? isEvolved(mvSrc) : false;
  const aEvoS = aEvo && ac.evo ? { st: ac.evoSt, hp: ac.evoHp } : { st: ac.st, hp: ac.hp };
  // --- 擬態(基礎値のコピー) ---
  let aBase = { st: aEvoS.st, hp: aEvoS.hp }, dBase = { st: dEvoS.st, hp: dEvoS.hp };
  if (baseId(b.atkCreature) === 'mimic') { aBase = { st: dEvoS.st, hp: dEvoS.hp }; notes.push('【擬態】ミミックが' + dc.name + 'をコピー!'); }
  if (baseId(o.creature) === 'mimic') { dBase = { st: aEvoS.st, hp: aEvoS.hp }; notes.push('【擬態】ミミックが' + ac.name + 'をコピー!'); }

  // --- 攻撃側AT ---
  let st = aBase.st + (aEff ? aEff.st : 0);
  if (baseId(b.atkCreature) === 'gecko') { st += 10; notes.push('【猛攻】AT+10!'); }
  if (baseId(b.atkCreature) === 'detropas') {
    const fires = r.owners.reduce((n, oo, i) => n + (oo && oo.player === atk.id && tileElem(r, i) === 'fire' ? 1 : 0), 0);
    if (fires) { st += fires * 5; notes.push(`【群れ】火の領地${fires}つでAT+${fires * 5}!`); }
  }
  // スペル継続効果(プレイヤー→土地の順、最後に最低0へ補正)
  const bFx = r.tileFx[b.tile] || {};
  const atkShade = (mvSrc && mvSrc.shade ? mvSrc.shade : (b.atkShade || 0)) * 10;
  if (atkShade) { st += atkShade; notes.push(`【死影】蓄えた影がATを${atkShade}高める!`); }
  if (atk.blade) { st += 10; notes.push('血染めの刃が侵略者のATを10高めた!'); }
  if (bFx.vortex) { st += 10; notes.push('炎の渦が侵略者を後押し!(AT+10)'); }
  if (bFx.roots) { st -= 20; notes.push('根の牢獄が侵略者を縛る!(AT-20)'); }
  st = Math.max(0, st);

  // --- 防衛側HP(地形・女王・呪い) ---
  const tElem = tileElem(r, b.tile);
  let terrain = (dc.elem === tElem || baseId(o.creature) === 'cleo') ? o.level * 10 : 0;
  if (baseId(o.creature) === 'cleo' && dc.elem !== tElem) notes.push('【適応】クレオが地形に順応!');
  if (baseId(o.creature) === 'nome' && terrain) {
    const rock = defEvolved ? 20 : 10;
    terrain += rock; notes.push(`【岩壁】地形補正+${rock}!`);
  }
  if (baseId(b.atkCreature) === 'garble' && terrain) { terrain = 0; notes.push('【風刃】地形補正を無視!'); }
  let queenBonus = 0;
  for (const d of [-1, 1]) {
    const ni = (b.tile + d + 28) % 28;
    const no = r.owners[ni];
    if (no && no.player === def.id && baseId(no.creature) === 'qbaby')
      queenBonus = Math.max(queenBonus, isEvolved(no) ? 20 : 10);  // 威光は重複しない(最大のみ)
  }
  if (queenBonus) notes.push(`【女王の威光】防衛DF+${queenBonus}!`);
  const curse = (r.curses[b.tile] && baseId(o.creature) !== 'beruf') ? r.curses[b.tile].hp : 0;
  const hp = dBase.hp + terrain + queenBonus + (dEff ? dEff.hp : 0) - curse;

  // 支援カードは勝敗問わず消費
  for (const [pid, sc] of Object.entries(b.supports))
    if (sc !== 'none') { const pl = pById(r, pid); pl.hand.splice(pl.hand.indexOf(sc), 1); pl.exile.push(sc); }  // 支援は使い切り(廃棄)

  // ===== v0.47 戦闘: AT / HP / DF モデル =====
  // DF(防御) = 地形補正+女王+支援HP。ダメージ = AT − DF(最低0)。負傷は軽減後の実ダメージだけ蓄積
  const carried = o.dmg || 0;
  if (carried) notes.push(`負傷を引き継いでいる(−${carried})`);
  const upliftDF = bFx.uplift ? 10 : 0;
  if (upliftDF) notes.push('岩盤隆起が大地を固める!(防衛DF+10)');
  const defDF = terrain + queenBonus + (dEff ? dEff.hp : 0) + upliftDF;
  const effHp = Math.max(1, dBase.hp - curse - carried);   // 現在HP(呪いは一時的な減少)
  const atkDmg = st;                                        // AT = 基礎AT+固有+効果+支援
  const atkDF = aEff ? aEff.hp : 0;
  const atkCarried = mvSrc ? (mvSrc.dmg || 0) : (corridor ? (b.atkCarry || 0) : 0);
  const atkEffHp = Math.max(1, aBase.hp - atkCarried);
  const defShade = (o.shade || 0) * 10;
  if (defShade) notes.push(`【死影】蓄えた影が防衛ATを${defShade}高める!`);
  const defSt = dBase.st + (dEff ? dEff.st : 0) + defShade;

  // ===== v0.57 戦闘シーケンス: 戦闘耐久値 = 現在HP + DF =====
  const hits = baseId(b.atkCreature) === 'avalanche' ? 2 : 1;      // 【双撃】侵略時のみ2回
  if (hits === 2) notes.push('【双撃】同じATで2回続けて攻撃!');
  const preempt = baseId(o.creature) === 'pakawata';               // 【先制】防衛側が先に攻撃
  if (preempt) notes.push('【先制】パカワタは侵略側より先に攻撃する!');
  let atkPool = atkEffHp + atkDF, defPool = effHp + defDF;
  let hitsDone = 0, win = false, atkSurvived = true, counterSt = 0, counterDealt = 0;
  if (preempt) {
    counterSt = defSt;
    atkPool -= counterSt;
    counterDealt = Math.max(0, counterSt - atkDF);
    atkSurvived = atkPool > 0;
  }
  if (atkSurvived) {
    defPool -= atkDmg; hitsDone = 1;
    if (defPool > 0 && hits === 2) { defPool -= atkDmg; hitsDone = 2; }
    win = defPool <= 0;
  }
  const dealt = Math.max(0, hitsDone * atkDmg - defDF);            // DFを超えてHPへ到達した合計
  if (!win && !preempt && atkSurvived) {                           // 通常の反撃(先制は反撃の代わり)
    counterSt = defSt;
    counterDealt = Math.max(0, counterSt - atkDF);
    atkSurvived = counterDealt < atkEffHp;
  }

  r.lastBattle = { tile: b.tile, attacker: atk.id, defender: def.id,
    atkCreature: b.atkCreature, defCreature: o.creature,
    atkSupport: b.supports[atk.id], defSupport: b.supports[def.id],
    st: atkDmg, hp: effHp, df: defDF, dealt,
    atkHp: atkEffHp, atkDf: atkDF, counterSt, counterDealt, atkSurvived,
    hits: hitsDone, preempt,
    moveFrom: b.moveFrom,
    remainHp: win ? 0 : effHp - dealt,
    terrain, curse, notes, win, at: stamp(r) };
  log(r, `⚔ ${atk.name}の${ac.name}(AT${atkDmg}${hitsDone === 2 ? '×2回' : ''}) vs ${def.name}の${dc.name}(HP${effHp}/DF${defDF}) → 実ダメージ${dealt}`);
  for (const n of notes) log(r, n);

  if (win) {
    // 一撃で削り切った → 侵略成功
    if (mvSrc) {
      r.owners[b.moveFrom] = null;  // 元の土地は空き地に(クリーチャーは移動)
    } else if (!corridor) {
      atk.hand.splice(atk.hand.indexOf(b.atkCreature), 1);
    }
    if (baseId(o.creature) === 'gaston') {
      def.hand.push(o.creature);
      log(r, `【旋風】${def.name}のガストンは風に乗って帰還した`);
    } else {
      def.discard.push(o.creature);
    }
    r.owners[b.tile] = (mvSrc || corridor)
      ? { player: atk.id, level: o.level, creature: b.atkCreature, dmg: atkCarried,
          shade: (mvSrc && mvSrc.shade) || b.atkShade || 0 }  // 移動侵略は負傷・死影を維持
      : { player: atk.id, level: o.level, creature: b.atkCreature };  // 手札からの占領は全快
    atk.battleWins++;
    log(r, `${ac.name}の${hitsDone === 2 ? '連撃' : '一撃'}(実ダメージ${dealt})が${dc.name}を討ち取った! Lv${o.level}の土地を奪取!`);
    if (baseId(b.atkCreature) === 'zati') {
      const got = payTo(r, def, atk, 50);
      if (got) log(r, `【略奪】ザーティーが${def.name}から${got}Gを奪った!`);
    }
  } else {
    // 防衛成功(削られたHPは土地に引き継ぐ)+反撃
    o.dmg = carried + dealt;
    if (baseId(o.creature) === 'goagoa' && o.dmg > 0) {
      o.dmg = Math.max(0, o.dmg - 10);
      log(r, `【深海】${dc.name}は深き水に癒される(負傷-10 → ${o.dmg})`);
    }
    log(r, `${dc.name}は${dealt}のダメージに耐えた!(残HP${effHp - dealt})${atkDmg > dealt ? ` ─ DFが${atkDmg - dealt}軽減` : ''}`);
    if (!atkSurvived) {
      if (baseId(b.atkCreature) === 'gaston') {
        if (mvSrc) r.owners[b.moveFrom] = null;
        if (mvSrc || corridor) atk.hand.push(b.atkCreature);
        log(r, `【旋風】反撃を受けたガストンは風に乗って手札へ帰還した`);
      } else if (corridor) {
        atk.discard.push(b.atkCreature);
        log(r, `${dc.name}の反撃(実ダメージ${counterDealt})が${ac.name}を討ち取った!`);
      } else if (mvSrc) {
        r.owners[b.moveFrom] = null;  // 移動侵略で討たれた: 元の土地ごと失う
        atk.discard.push(b.atkCreature);
        log(r, `${dc.name}の反撃(実ダメージ${counterDealt})が${ac.name}を討ち取った! 元の土地も空き地に…`);
      } else {
        atk.hand.splice(atk.hand.indexOf(b.atkCreature), 1);
        atk.discard.push(b.atkCreature);
        log(r, `${dc.name}の反撃(実ダメージ${counterDealt})が${ac.name}を討ち取った!`);
      }
    } else if (corridor) {
      atk.hand.push(b.atkCreature);  // 風の回廊: 生き残れば全快して手札へ
      log(r, `${ac.name}は反撃(実ダメージ${counterDealt})を耐え、全快して手札へ戻った`);
    } else if (mvSrc) {
      mvSrc.dmg = atkCarried + counterDealt;  // 削られた状態で元のマスへ戻る
      log(r, `${ac.name}は反撃(実ダメージ${counterDealt})を受けつつ元の土地へ戻った(負傷${mvSrc.dmg})`);
    } else {
      log(r, `${ac.name}は反撃(実ダメージ${counterDealt})を耐えて帰還した(HPは全快する)`);
    }
    if (!mvSrc && !corridor) {
      const toll = tollOf(r, b.tile);
      payTo(r, atk, def, toll);
      consumeTide(r, b.tile);
      log(r, `${def.name}が防衛成功! 通行料${toll}Gも支払わせた`);
      kingBonus(r, def, b.tile);
    } else {
      log(r, `${def.name}が防衛成功!(移動系スペルによる侵略のため通行料なし)`);
    }
    def.battleWins++;
    if (baseId(o.creature) === 'barbaro') {
      const extra = payTo(r, atk, def, defEvolved ? 50 : 30);
      if (extra) log(r, `【逆鱗】バーグランダの怒りで追加${extra}Gを支払った!`);
    }
  }
  // --- スペル継続効果の後処理 ---
  if (win && atk.blade) {
    const got = payTo(r, def, atk, 30);
    log(r, `血染めの刃が輝く ─ ${atk.name}は${def.name}から${got}Gを奪った!`);
  }
  atk.blade = false;                                  // 侵略したら成否問わず解除
  const endFx = r.tileFx[b.tile];
  if (endFx) { delete endFx.vortex; delete endFx.roots; delete endFx.uplift; }  // 戦闘終了で解除
  r.battle = null;
  // v0.74: 戦勝報酬は共通山札から3枚ドラフト(勝者=攻守どちらでも)。
  // ドラフト完了後にsettleAll→endTurnへ続く(進行を直列化し、r.draftの競合を防ぐ)
  const bWinner = win ? atk : def;
  if (!bWinner.bankrupt) {
    log(r, `戦${win ? '勝' : '果'}の報酬 ─ ${bWinner.name}は3枚のカードから1枚を選ぶ`);
    return startDraft(r, bWinner, 'battle');
  }
  settleAll(r);
}

// ===== アクションハンドラ =====
function handleChoose(r, playerId, optionId) {
  // 強化候補プレビューは本人の何らかの決定で解除(発注書v0.75 §6.3)
  if (r.upgradePreview && r.upgradePreview.player === playerId) r.upgradePreview = null;
  const p = pById(r, playerId);
  const pend = r.pending[playerId];
  if (!p || !pend || !pend.options.some(o => o.id === optionId)) return;
  delete r.pending[playerId];

  // --- 選択ドロー(v0.61) ---
  if (pend.type === 'pick_draw') {
    return resolvePickDraw(r, p, +optionId.slice(3));  // optionIdはpd:0/pd:1のみ(冒頭で検証済み)
  }

  // --- キャラ選択 ---
  if (pend.type === 'select_char') {
    if (optionId === 'unpick') { p.charId = null; p.confirmed = false; return askSelect(r, p); }
    p.charId = optionId; p.confirmed = true;
    if (!r.players.every(q => q.confirmed))
      ask(r, p.id, 'select_wait', '他のプレイヤーを待っています…', [{ id: 'unpick', label: 'キャラを選び直す' }]);
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
    r.lastUlt = { player: p.id, charId: p.charId, name: ULTS[p.charId].name, at: stamp(r) };
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
      r.barrier[p.id] = true;
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
    r.lastUlt = { player: p.id, charId: p.charId, name: ULTS.mio.name, at: stamp(r) };
    log(r, `⚡ ${p.name}が固有スキル【追い風の導き】を発動! 風に乗って移動する`);
    p.pos = i;
    return resolveTile(r, p);
  }
  if (pend.type === 'roll' && optionId.startsWith('sp:')) {
    const sid = optionId.slice(3);
    if (!p.hand.includes(sid) || SPELLS[sid].cost > p.gold) return askRoll(r, p);
    const castLog = () => {
      p.hand.splice(p.hand.indexOf(sid), 1);
      if (EXILE_SPELLS.has(sid)) { p.exile.push(sid); }
      else p.discard.push(sid);
      if (SPELLS[sid].cost) p.gold -= SPELLS[sid].cost;
      p.spellCast = true;
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS[sid].name, desc: SPELLS[sid].desc, at: stamp(r) };
      log(r, `📜 ${p.name}が呪文「${SPELLS[sid].name}」を唱えた!${SPELLS[sid].cost ? `(−${SPELLS[sid].cost}G)` : ''}${EXILE_SPELLS.has(sid) ? '(廃棄)' : ''}`);
    };
    if (sid === 'sp_gold') {
      castLog();
      const gain = (p.lap || 1) * 100;
      p.gold += gain;
      r.lastEvent.desc = `第${p.lap || 1}周 ─ ${gain}Gを獲得(所持${p.gold}G)`;
      log(r, `第${p.lap || 1}周 ─ ${p.name}は${gain}Gを得た(所持${p.gold}G)`);
      return askRoll(r, p);
    }
    if (sid === 'sp_insight') {
      castLog();
      const got = drawCards(r, p, 2);
      if (got) r.lastDraw = { player: p.id, n: got, reason: 'insight', at: stamp(r) };
      log(r, `${p.name}はカードを${got}枚引いた`);
      return askRoll(r, p);
    }
    if (sid === 'sp_gale') {
      castLog();
      p.gale = true;
      log(r, `${p.name}に追い風が吹く…(このターンはダイス2個)`);
      return askRoll(r, p);
    }
    if (sid === 'sp_ward') {
      castLog();
      r.barrier[p.id] = true;
      log(r, `${p.name}の全領地に結界が張られた(次の手番まで侵略不可)`);
      return askRoll(r, p);
    }
    if (sid === 'sp_weaken') {
      const opts = r.owners.map((o, i) => o && o.player !== p.id
        ? { id: 'ct:' + i, label: `${pById(r, o.player).name}の${CREATURES[o.creature].name}(${TILES[i].e} Lv${o.level}${o.dmg ? ' 負傷' + o.dmg : ''})` }
        : null).filter(Boolean);
      opts.push({ id: 'ct:cancel', label: 'やめる' });
      return ask(r, p.id, 'curse_target', '☠ どの土地に衰弱を放つ?(20ダメージ)', opts);
    }
    if (sid === 'sp_move') {
      const opts = r.owners.map((o, i) => o && o.player === p.id
        ? { id: 'mv:' + i, label: `${CREATURES[o.creature].name}(${TILES[i].e} Lv${o.level}${o.dmg ? ' 負傷' + o.dmg : ''})` }
        : null).filter(Boolean);
      opts.push({ id: 'mv:cancel', label: 'やめる' });
      return ask(r, p.id, 'move_a', '転移 ─ 1体目のクリーチャーを選ぶ', opts);
    }
    if (sid === 'sp_swap') {
      const opts = r.owners.map((o, i) => o && o.player === p.id
        ? { id: 'sw:' + i, label: `${CREATURES[o.creature].name}(${TILES[i].e} Lv${o.level}${o.dmg ? ' 負傷' + o.dmg : ''})` }
        : null).filter(Boolean);
      opts.push({ id: 'sw:cancel', label: 'やめる' });
      return ask(r, p.id, 'swap_land', '交代 ─ どの領地のクリーチャーを入れ替える?', opts);
    }
    if (sid === 'sp_cornucopia') {
      castLog();
      const n = r.owners.filter(o => o && o.player === p.id).length;
      const gain = n * 20;
      p.gold += gain;
      r.lastEvent.desc = `領地${n}つ ─ ${gain}Gを獲得`;
      log(r, `豊穣の角があふれ出す! 領地${n}つ ─ ${p.name}は${gain}Gを得た`);
      return askRoll(r, p);
    }
    if (sid === 'sp_bloodstained_blade') {
      castLog();
      p.blade = true;
      log(r, `${p.name}の刃が血に染まる…(次の侵略でAT+10・成功時30G強奪)`);
      return askRoll(r, p);
    }
    if (sid === 'sp_wind_shift') {
      castLog();
      p.windShift = true;
      log(r, `${p.name}は風向転換で逆方向へ進む!(このターンのみ)`);
      return askRoll(r, p);
    }
    if (ELEM_OF_SPELL[sid] || sid === 'sp_flame_vortex' || sid === 'sp_high_tide' ||
        sid === 'sp_bedrock_uplift' || sid === 'sp_root_prison' || sid === 'sp_feather_rest') {
      p.pendSpell = sid;
      let cond;
      if (ELEM_OF_SPELL[sid]) cond = (o, i) => o.player === p.id && tileElem(r, i) !== ELEM_OF_SPELL[sid];
      else if (sid === 'sp_flame_vortex') cond = o => o.player !== p.id;
      else if (sid === 'sp_high_tide') cond = (o, i) => o.player === p.id && tileElem(r, i) === 'water';
      else if (sid === 'sp_bedrock_uplift') cond = (o, i) => o.player === p.id && tileElem(r, i) === 'earth';
      else cond = o => o.player === p.id;
      const opts = r.owners.map((o, i) => o && cond(o, i)
        ? { id: 'tg:' + i, label: `${o.player !== p.id ? pById(r, o.player).name + 'の' : ''}${CREATURES[o.creature].name}(${tileElem(r, i)} Lv${o.level}${o.dmg ? ' 負傷' + o.dmg : ''})` }
        : null).filter(Boolean);
      opts.push({ id: 'tg:cancel', label: 'やめる' });
      return ask(r, p.id, 'spell_target', `「${SPELLS[sid].name}」─ 対象のマスを選ぶ`, opts);
    }
    if (sid === 'sp_wind_corridor') {
      const opts = stepSources(r, p).map(i => ({
        id: 'st:' + i,
        label: `${CREATURES[r.owners[i].creature].name}(${tileElem(r, i)} Lv${r.owners[i].level}${r.owners[i].dmg ? ' 負傷' + r.owners[i].dmg : ''})`,
      }));
      opts.push({ id: 'st:cancel', label: 'やめる' });
      return ask(r, p.id, 'wc_a', '風の回廊 ─ どのクリーチャーを動かす?', opts);
    }
    if (sid === 'sp_step') {
      const opts = stepSources(r, p).map(i => ({
        id: 'st:' + i,
        label: `${CREATURES[r.owners[i].creature].name}(${TILES[i].e} Lv${r.owners[i].level}${r.owners[i].dmg ? ' 負傷' + r.owners[i].dmg : ''})`,
      }));
      opts.push({ id: 'st:cancel', label: 'やめる' });
      return ask(r, p.id, 'step_a', '移動 ─ どのクリーチャーを動かす?', opts);
    }
    if (sid === 'sp_quake') {
      const opts = r.owners.map((o, i) => o && o.player !== p.id && o.level >= 2
        ? { id: 'qt:' + i, label: `${pById(r, o.player).name}の${CREATURES[o.creature].name}(${TILES[i].e} Lv${o.level}→${o.level - 1})` }
        : null).filter(Boolean);
      opts.push({ id: 'qt:cancel', label: 'やめる' });
      return ask(r, p.id, 'quake_target', '⛰ どの領地に地割れを起こす?', opts);
    }
  }
  if (pend.type === 'curse_target') {
    if (optionId !== 'ct:cancel') {
      const i = +optionId.slice(3);
      const o = r.owners[i];
      if (o && o.player !== p.id) {
        p.hand.splice(p.hand.indexOf('sp_weaken'), 1);
        p.discard.push('sp_weaken');
        if (SPELLS.sp_weaken.cost) p.gold -= SPELLS.sp_weaken.cost;
        p.spellCast = true;
        r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_weaken.name,
          desc: `${pById(r, o.player).name}の${CREATURES[o.creature].name}に20ダメージ!`, at: stamp(r) };
        log(r, `☠ ${p.name}が${pById(r, o.player).name}の${CREATURES[o.creature].name}に衰弱の呪文!(20ダメージ)`);
        spellDamage(r, i, SPELLS.sp_weaken.hp, '衰弱');
      }
    }
    return askRoll(r, p);
  }
  if (pend.type === 'forget') {
    if (optionId !== 'fg:cancel') {
      const zone = optionId[1] === 'h' ? p.hand : p.discard;
      const i = +optionId.slice(3);
      if (i < zone.length && p.gold >= RULES.forgetCost) {
        const c = zone.splice(i, 1)[0];
        p.exile.push(c);
        p.gold -= RULES.forgetCost;
        p.forgetThisStop = 1;
        const nameOf = x => (CREATURES[x] || SPELLS[x] || SUPPORTS[x] || { name: x }).name;
        log(r, `${p.name}は「${nameOf(c)}」を忘却した(ゲームから廃棄)`);
      }
    }
    return askMarket(r, p);
  }
  if (pend.type === 'spell_target') {
    const sid = p.pendSpell;
    if (optionId === 'tg:cancel' || !sid || !p.hand.includes(sid) || SPELLS[sid].cost > p.gold) {
      p.pendSpell = null;
      return askRoll(r, p);
    }
    const i = +optionId.slice(3);
    const o = r.owners[i];
    p.pendSpell = null;
    if (!o) return askRoll(r, p);
    const pay = () => {
      p.hand.splice(p.hand.indexOf(sid), 1);
      if (EXILE_SPELLS.has(sid)) p.exile.push(sid); else p.discard.push(sid);
      if (SPELLS[sid].cost) p.gold -= SPELLS[sid].cost;
      p.spellCast = true;
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS[sid].name, desc: SPELLS[sid].desc, at: stamp(r) };
    };
    const fx = () => (r.tileFx[i] = r.tileFx[i] || {});
    if (ELEM_OF_SPELL[sid]) {
      if (o.player !== p.id || tileElem(r, i) === ELEM_OF_SPELL[sid]) return askRoll(r, p);
      pay();
      const el = ELEM_OF_SPELL[sid];
      if (TILES[i].e === el) delete r.elemOv[i]; else r.elemOv[i] = el;
      r.lastEvent.desc = `${p.name}の領地(${i}番)が${ELEM_JA[el]}属性に変化!(連鎖・地価を再計算)`;
      log(r, `📜 ${p.name}が${SPELLS[sid].name}を使用。マス${i}が${ELEM_JA[el]}属性に変化した!(連鎖・地価を再計算)`);
    } else if (sid === 'sp_flame_vortex') {
      if (o.player === p.id) return askRoll(r, p);
      pay();
      fx().vortex = true;
      r.lastEvent.desc = `${pById(r, o.player).name}の${CREATURES[o.creature].name}に10ダメージ! 次の侵略者はAT+10`;
      log(r, `🔥 炎の渦がマス${i}を包む。${CREATURES[o.creature].name}に10ダメージ! 次の侵略者はAT+10`);
      spellDamage(r, i, 10, '炎の渦');
    } else if (sid === 'sp_high_tide') {
      if (o.player !== p.id || tileElem(r, i) !== 'water') return askRoll(r, p);
      pay();
      fx().tide = { by: p.id };
      r.lastEvent.desc = `${p.name}の水領地(${i}番)で次に受け取る通行料+50%(次の手番まで)`;
      log(r, `🌊 満ち潮! マス${i}で次に受け取る通行料+50%(次の手番まで)`);
    } else if (sid === 'sp_bedrock_uplift') {
      if (o.player !== p.id || tileElem(r, i) !== 'earth') return askRoll(r, p);
      pay();
      const before = o.dmg || 0;
      o.dmg = Math.max(0, before - 20);
      fx().uplift = true;
      r.lastEvent.desc = `${CREATURES[o.creature].name}の負傷${before}→${o.dmg}。次の戦闘でDF+10`;
      log(r, `⛰ 岩盤隆起! ${CREATURES[o.creature].name}の負傷${before}→${o.dmg}。次の戦闘でDF+10`);
    } else if (sid === 'sp_root_prison') {
      if (o.player !== p.id) return askRoll(r, p);
      pay();
      fx().roots = true;
      r.lastEvent.desc = `${p.name}の領地(${i}番)を守る。次に侵略するクリーチャーはAT-20`;
      log(r, `🌿 根の牢獄がマス${i}を守る。次にこの領地へ侵略するクリーチャーはAT-20`);
    } else if (sid === 'sp_feather_rest') {
      if (o.player !== p.id) return askRoll(r, p);
      pay();
      let c = o.creature;
      if (isEvolved(o) && CREATURES[baseId(c)].evo && !/_f$/.test(c)) c = baseId(c) + '_f';  // 進化状態を維持
      p.hand.push(c);
      r.owners[i] = null;
      delete r.tileFx[i];
      r.lastEvent.desc = `${CREATURES[c].name}は全回復して${p.name}の手札へ。マス${i}は空き地に`;
      log(r, `🪶 羽休め ─ ${CREATURES[c].name}は全回復して${p.name}の手札へ戻った。マス${i}は空き地に`);
    }
    return askRoll(r, p);
  }
  if (pend.type === 'wc_a') {
    if (optionId === 'st:cancel') return askRoll(r, p);
    const i = +optionId.slice(3);
    if (!r.owners[i] || r.owners[i].player !== p.id) return askRoll(r, p);
    p.stepI = i;
    const opts = stepDests(r, p, i).map(j => {
      const o = r.owners[j];
      return { id: 'sd:' + j, label: o
        ? `${pById(r, o.player).name}の${CREATURES[o.creature].name}(${tileElem(r, j)} Lv${o.level})へ侵略!`
        : `空き地(${tileElem(r, j)})へ移動して取得` };
    });
    opts.push({ id: 'sd:cancel', label: 'やめる' });
    return ask(r, p.id, 'wc_b', '風の回廊 ─ どちらのマスへ?', opts);
  }
  if (pend.type === 'wc_b') {
    if (optionId === 'sd:cancel') { p.stepI = null; return askRoll(r, p); }
    const i = p.stepI, j = +optionId.slice(3);
    const src = r.owners[i];
    if (src && src.player === p.id && p.hand.includes('sp_wind_corridor') &&
        stepDests(r, p, i).includes(j) && SPELLS.sp_wind_corridor.cost <= p.gold) {
      p.hand.splice(p.hand.indexOf('sp_wind_corridor'), 1);
      p.discard.push('sp_wind_corridor');
      p.gold -= SPELLS.sp_wind_corridor.cost;
      p.spellCast = true;
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_wind_corridor.name,
        desc: r.owners[j] ? `${CREATURES[src.creature].name}が隣の敵領地へ侵略開始!(通行料なし)`
                          : `${CREATURES[src.creature].name}が隣の空き地へ渡り、Lv1の領地に`, at: stamp(r) };
      p.stepI = null;
      // 進化状態を維持したまま土地から引き剥がす(解決時点で移動元は空き地へ)
      let c = src.creature;
      if (isEvolved(src) && CREATURES[baseId(c)].evo && !/_f$/.test(c)) c = baseId(c) + '_f';
      const carry = src.dmg || 0;
      const carryShade = src.shade || 0;
      r.owners[i] = null;
      delete r.tileFx[i];
      const dest = r.owners[j];
      if (!dest) {
        r.owners[j] = { player: p.id, level: 1, creature: c, dmg: carry, shade: carryShade };
        log(r, `🌬 風の回廊! ${CREATURES[c].name}が隣の空き地(${tileElem(r, j)})へ渡り、Lv1の領地とした`);
        return askRoll(r, p);
      }
      log(r, `🌬 風の回廊から侵略開始! ${CREATURES[c].name}が${pById(r, dest.player).name}の領地へ攻め込む(通行料なし)`);
      r.battle = { tile: j, attacker: p.id, defender: dest.player,
                   atkCreature: c, corridor: true, atkCarry: carry, atkShade: carryShade, supports: {} };
      return askSupports(r);
    }
    p.stepI = null;
    return askRoll(r, p);
  }
  if (pend.type === 'step_a') {
    if (optionId === 'st:cancel') return askRoll(r, p);
    const i = +optionId.slice(3);
    if (!r.owners[i] || r.owners[i].player !== p.id) return askRoll(r, p);
    p.stepI = i;
    const opts = stepDests(r, p, i).map(j => {
      const o = r.owners[j];
      return { id: 'sd:' + j, label: o
        ? `${pById(r, o.player).name}の${CREATURES[o.creature].name}(${TILES[j].e} Lv${o.level})へ侵略!`
        : `空き地(${TILES[j].e})へ移動して取得` };
    });
    opts.push({ id: 'sd:cancel', label: 'やめる' });
    return ask(r, p.id, 'step_b', '移動 ─ どちらのマスへ?', opts);
  }
  if (pend.type === 'step_b') {
    if (optionId === 'sd:cancel') { p.stepI = null; return askRoll(r, p); }
    const i = p.stepI, j = +optionId.slice(3);
    const src = r.owners[i];
    if (src && src.player === p.id && p.hand.includes('sp_step') &&
        stepDests(r, p, i).includes(j) && SPELLS.sp_step.cost <= p.gold) {
      p.hand.splice(p.hand.indexOf('sp_step'), 1);
      p.discard.push('sp_step');
      p.gold -= SPELLS.sp_step.cost;
      p.spellCast = true;
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_step.name,
        desc: r.owners[j] ? `${CREATURES[src.creature].name}が隣の敵領地へ侵略!(通行料なし)`
                          : `${CREATURES[src.creature].name}が隣の空き地へ進出し、Lv1の領地に`, at: stamp(r) };
      p.stepI = null;
      const dest = r.owners[j];
      if (!dest) {
        // 空き地へ移動: Lv1で取得・負傷維持・元は空き地に
        r.owners[j] = { player: p.id, level: 1, creature: src.creature, dmg: src.dmg || 0 };
        r.owners[i] = null;
        log(r, `📜 ${p.name}の移動の呪文! ${CREATURES[r.owners[j].creature].name}が隣の空き地(${TILES[j].e})へ進出し、Lv1の領地とした`);
        return askRoll(r, p);
      }
      // 敵領地へ: そのまま侵略(通行料なし)。攻撃クリーチャーは土地から出撃
      log(r, `📜 ${p.name}の移動の呪文! ${CREATURES[src.creature].name}が隣の${pById(r, dest.player).name}の領地へ攻め込む!(通行料なし)`);
      r.battle = { tile: j, attacker: p.id, defender: dest.player,
                   atkCreature: src.creature, moveFrom: i, supports: {} };
      return askSupports(r);
    }
    p.stepI = null;
    return askRoll(r, p);
  }
  if (pend.type === 'move_a') {
    if (optionId === 'mv:cancel') return askRoll(r, p);
    p.moveA = +optionId.slice(3);
    const opts = r.owners.map((o, i) => o && o.player === p.id && i !== p.moveA
      ? { id: 'mb:' + i, label: `${CREATURES[o.creature].name}(${TILES[i].e} Lv${o.level}${o.dmg ? ' 負傷' + o.dmg : ''})` }
      : null).filter(Boolean);
    opts.push({ id: 'mb:cancel', label: 'やめる' });
    return ask(r, p.id, 'move_b', '転移 ─ 入れ替える相手のクリーチャーを選ぶ', opts);
  }
  if (pend.type === 'move_b') {
    if (optionId !== 'mb:cancel' && p.hand.includes('sp_move')) {
      const a = p.moveA, bI = +optionId.slice(3);
      const oa = r.owners[a], ob = r.owners[bI];
      if (oa && ob && oa.player === p.id && ob.player === p.id) {
        [oa.creature, ob.creature] = [ob.creature, oa.creature];
        [oa.dmg, ob.dmg] = [ob.dmg || 0, oa.dmg || 0];
        p.hand.splice(p.hand.indexOf('sp_move'), 1);
        p.discard.push('sp_move');
        p.gold -= SPELLS.sp_move.cost;
        p.spellCast = true;
        r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_move.name,
          desc: `${CREATURES[ob.creature].name}と${CREATURES[oa.creature].name}が入れ替わった`, at: stamp(r) };
        log(r, `📜 ${p.name}が転移の呪文! ${CREATURES[ob.creature].name}と${CREATURES[oa.creature].name}が入れ替わった(−${SPELLS.sp_move.cost}G)`);
      }
    }
    p.moveA = null;
    return askRoll(r, p);
  }
  if (pend.type === 'swap_land') {
    if (optionId === 'sw:cancel') return askRoll(r, p);
    p.swapI = +optionId.slice(3);
    const budget = p.gold - SPELLS.sp_swap.cost;
    const opts = [...new Set(p.hand.filter(c => CREATURES[c] && CREATURES[c].cost <= budget))].map(c =>
      ({ id: 'sp2:' + c, label: `${CREATURES[c].name}(AT${CREATURES[c].st}/HP${CREATURES[c].hp} −${CREATURES[c].cost}G)` }));
    opts.push({ id: 'sp2:cancel', label: 'やめる' });
    return ask(r, p.id, 'swap_pick', '交代 ─ 手札のどのクリーチャーを配置する?', opts);
  }
  if (pend.type === 'swap_pick') {
    if (optionId !== 'sp2:cancel' && p.hand.includes('sp_swap')) {
      const c = optionId.slice(4);
      const o = r.owners[p.swapI];
      if (o && o.player === p.id && p.hand.includes(c) &&
          CREATURES[c].cost + SPELLS.sp_swap.cost <= p.gold) {
        const oldC = o.creature;
        p.discard.push(oldC);                 // 元のクリーチャーは捨て札へ
        p.hand.splice(p.hand.indexOf(c), 1);
        o.creature = c; o.dmg = 0; o.shade = 0;  // 新クリーチャーは全快で配置(死影は解除)
        if (baseId(c) === 'cresteria') { p.gems++; log(r, `【真珠】${p.name}は宝石を1個得た(所持${p.gems}個)`); }
        if (baseId(c) === 'fugorm') { gainToDeck(r, p, ['weapon']); log(r, `【鍛冶】${p.name}は支援「武器」を山札に得た`); }
        p.hand.splice(p.hand.indexOf('sp_swap'), 1);
        p.discard.push('sp_swap');
        p.gold -= SPELLS.sp_swap.cost + CREATURES[c].cost;
        p.spellCast = true;
        r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_swap.name,
          desc: `${CREATURES[oldC].name}に代わり${CREATURES[c].name}が領地に立った`, at: stamp(r) };
        log(r, `📜 ${p.name}が交代の呪文! ${CREATURES[oldC].name}に代わり${CREATURES[c].name}が領地に立った(−${SPELLS.sp_swap.cost + CREATURES[c].cost}G)`);
      }
    }
    p.swapI = null;
    return askRoll(r, p);
  }
  if (pend.type === 'direction') {
    p.dir = optionId === 'dir:-1' ? -1 : 1;
    log(r, `${p.name}は${p.dir === 1 ? '左回り' : '右回り'}に進むことにした(以後変更不可)`);
    const dp = r.dirPend;
    r.dirPend = null;
    if (dp) return performMove(r, p, dp.steps, dp.meta, dp.moveLabel);
    return askRoll(r, p);
  }
  if (pend.type === 'select_wait') {
    if (optionId === 'unpick') { p.charId = null; p.confirmed = false; return askSelect(r, p); }
    return;
  }
  if (pend.type === 'sell') {
    if (optionId.startsWith('sl:')) {
      const i = +optionId.slice(3);
      const o = r.owners[i];
      if (o && o.player === p.id) {
        const got = Math.round(landValue(r, i) * 0.7);
        p.gold += got;
        p.discard.push(o.creature);
        r.owners[i] = null;
        r.curses[i] && delete r.curses[i];
        log(r, `${p.name}は${TILES[i].e}の土地を${got}Gで売却した(所持金${p.gold}G)`);
      }
    }
    return settleAll(r);
  }
  if (pend.type === 'overflow') {
    const c = optionId.slice(3);
    if (p.hand.includes(c)) {
      p.hand.splice(p.hand.indexOf(c), 1);
      p.discard.push(c);
      log(r, `${p.name}は手札上限のため「${(CREATURES[c] || SPELLS[c] || SUPPORTS[c] || { name: c }).name}」を捨てた`);
    }
    return endTurn(r);  // 7枚以下になるまで繰り返し
  }
  if (pend.type === 'quake_target') {
    if (optionId !== 'qt:cancel') {
      const i = +optionId.slice(3);
      p.hand.splice(p.hand.indexOf('sp_quake'), 1);
      p.exile.push('sp_quake');
      if (SPELLS.sp_quake.cost) p.gold -= SPELLS.sp_quake.cost;
      p.spellCast = true;
      const o = r.owners[i];
      o.level = Math.max(1, o.level - 1);
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_quake.name,
        desc: `${pById(r, o.player).name}の領地(${i}番)がLv${o.level}に崩れた!`, at: stamp(r) };
      log(r, `⛰ ${p.name}の地割れで${pById(r, o.player).name}の領地(${i}番)がLv${o.level}に崩れた!`);
    }
    return askRoll(r, p);
  }

  if (pend.type === 'draft') {
    if (optionId === 'skip') {
      r.deck.push(...r.draft.cards);
      log(r, `${p.name}はカードを加えなかった`);
      const resume0 = r.draft.resume;
      r.draft = null;
      if (resume0 === 'tile') return resolveTile(r, p);
      if (resume0 === 'market') return askMarket(r, p);
      if (resume0 === 'battle') return settleAll(r);  // 戦勝ドラフト後は精算→手番終了へ(v0.74)
      return endTurn(r);
    }
    const c = optionId.slice(5);
    const rest = r.draft.cards.filter(x => x !== c);
    // 選ばれなかった2枚は山札の底へ(同じカードが複数枚ある場合も1枚だけ取る)
    const idx = r.draft.cards.indexOf(c);
    r.draft.cards.splice(idx, 1);
    r.deck.push(...r.draft.cards);
    gainToDeck(r, p, [c]);  // v0.61: 獲得カードは山札へ(シャッフル)
    log(r, `${p.name}はカードを1枚獲得し、山札に加えた(中身は非公開)`);
    const resume = r.draft.resume;
    r.draft = null;
    if (resume === 'tile') return resolveTile(r, p);
    if (resume === 'market') return askMarket(r, p);
    if (resume === 'battle') return settleAll(r);  // 戦勝ドラフト後は精算→手番終了へ(v0.74)
    return endTurn(r);
  }

  if (pend.type === 'gate') {
    r.lastEvent = { type: 'gate', player: p.id, choice: optionId, at: stamp(r) };
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
      // 目標レベルの選択(1段ずつでも一気でも)
      const opts = [];
      for (let t = o.level + 1; t <= RULES.maxLevel; t++) {
        const c = upCostRange(r, p, i, t);
        if (c <= p.gold) opts.push({ id: 'ul:' + i + ':' + t, label: `Lv${o.level}→Lv${t} に強化(−${c}G)` });
      }
      opts.push({ id: 'ul:cancel', label: 'やめる' });
      return ask(r, p.id, 'upgrade_lv', `${TILES[i].e}の土地(${CREATURES[o.creature].name}) ─ どのレベルまで上げる?`, opts);
    }
    return endTurn(r);
  }
  if (pend.type === 'upgrade_lv') {
    if (optionId !== 'ul:cancel') {
      const [, iS, tS] = optionId.split(':');
      const i = +iS, target = +tS;
      const o = r.owners[i];
      const cost = upCostRange(r, p, i, target);
      if (o && o.player === p.id && target > o.level && target <= RULES.maxLevel && cost <= p.gold) {
        const wasBelow = o.level < RULES.evoLevel;
        p.gold -= cost;
        o.level = target;
        log(r, `${p.name}は${CREATURES[o.creature].name}の土地をLv${target}に育てた(−${cost}G)` +
          (wasBelow && target >= RULES.evoLevel && CREATURES[o.creature].evo && !/_f$/.test(o.creature)
            ? ` ─ ${CREATURES[o.creature].name}が${CREATURES[o.creature].evo}に進化!` : ''));
        if (checkVictory(r)) return;
      }
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
      if (baseId(c) === 'cresteria') { p.gems++; log(r, `【真珠】${p.name}は宝石を1個得た(所持${p.gems}個)`); }
      if (baseId(c) === 'fugorm') { gainToDeck(r, p, ['weapon']); log(r, `【鍛冶】${p.name}は支援「武器」を山札に得た`); }
      updateTitles(r); if (checkVictory(r)) return; return endTurn(r);
    }
    if (optionId === 'toll') {
      const enemy = pById(r, o.player);
      const toll = tollOf(r, i);
      const paid = payTo(r, p, enemy, toll);
      consumeTide(r, i);
      kingBonus(r, enemy, i);
      r.lastEvent = { type: 'toll', from: p.id, to: enemy.id, amount: paid,
                      fromGold: p.gold, toGold: enemy.gold, at: stamp(r) };
      log(r, `${p.name}は通行料${paid}Gを支払った`);
      return settleAll(r);
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
      consumeTide(r, p.pos);
      kingBonus(r, enemy, p.pos);
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
      log(r, `${p.name}は市場でカードを求めた`);
      return startDraft(r, p, 'market');
    } else if (optionId.startsWith('buys:')) {
      const s = optionId.slice(5);
      p.gold -= hm(SUPPORTS[s].cost);
      gainToDeck(r, p, [s]);  // v0.61: 購入品は山札へ
      log(r, `${p.name}は支援「${SUPPORTS[s].name}」を購入(山札へ)`);
    } else if (optionId === 'gem') {
      p.gold -= hm(RULES.gemPrice); p.gems++; p.gemThisStop = (p.gemThisStop || 0) + 1;
      log(r, `${p.name}は宝石を購入(所持${p.gems}個)`);
    } else if (optionId === 'treasure') {
      const need = r.treasureCost[p.id] || 5;
      p.gems -= need; p.treasures++;
      r.treasureCost[p.id] = need + 2;
      log(r, `💎 ${p.name}は秘宝を手に入れた!(+1点)`);
      if (checkVictory(r)) return;
    } else if (optionId === 'forget') {
      const nameOf = c => (CREATURES[c] || SPELLS[c] || SUPPORTS[c] || { name: c }).name;
      const opts = [];
      p.hand.forEach((c, i) => opts.push({ id: 'fh:' + i, label: `[手札] ${nameOf(c)}`, card: c, zone: 'h' }));
      p.discard.forEach((c, i) => opts.push({ id: 'fd:' + i, label: `[捨て札] ${nameOf(c)}`, card: c, zone: 'd' }));
      opts.push({ id: 'fg:cancel', label: 'やめる' });
      return ask(r, p.id, 'forget', `忘却 ─ どのカードを廃棄する?(−${RULES.forgetCost}G)`, opts);
    } else { p.gemThisStop = 0; p.forgetThisStop = 0; if (r.halfMarket === p.id) r.halfMarket = null; return endTurn(r); }
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
             winner: g.who[winIdx].id, at: stamp(r) };
  log(r, `🎲 ${CHARS[g.cid].name}を巡るダイス勝負! ` +
    g.who.map((p, k) => `${p.name}=${rolls[k]}`).join(' / ') + ` → ${g.who[winIdx].name}が獲得`);
  g.who.forEach((p, k) => {
    if (k !== winIdx) { p.charId = null; p.confirmed = false; askSelect(r, p); }
  });
}
function startGame(r) {
  r.phase = 'playing';
  r.pending = {};
  const order = r.players.slice().sort(() => Math.random() - 0.5);
  r.players = order;
  for (const p of r.players) {
    p.pos = 0; p.gold = RULES.startGold; p.lap = 1;
    p.deck = shuffle(CHAR_DECKS[p.charId].slice());
    p.discard = []; p.exile = []; p.hand = [];
    p.gems = 0; p.treasures = 0; p.battleWins = 0; p.shrineVisits = 0; p.ultUsed = false;
    p.color = CHARS[p.charId].color;
  }
  for (const p of r.players) drawCards(r, p, RULES.startHand);  // 全員に初期手札を配る
  log(r, `全員のキャラが確定! ゲーム開始(手番順: ${r.players.map(p => p.name).join(' → ')})`);
  for (const p of r.players) p.dir = 0;  // 方向は初回のダイス後に選ぶ
  beginTurn(r);
}

// ===== 公開状態とHTTP =====
function publicState(r, viewerId) {
  return {
    ver: VERSION, code: r.code, phase: r.phase, evoLevel: RULES.evoLevel, turn: r.turn, round: r.round, target: ASSET_GOAL, reachAt: ASSET_REACH,
    tiles: TILES.map((t, i) => r.elemOv[i] ? Object.assign({}, t, { e: r.elemOv[i] }) : t),
    tolls: r.owners.map((o, i) => o ? tollOf(r, i) : 0),
    tileFx: r.tileFx,
    owners: r.owners, market: r.market, log: r.log,
    titles: r.titles, duel: r.duel, curses: r.curses, lastEvent: r.lastEvent || null,
    barrier: r.barrier || {}, lastUlt: r.lastUlt || null, lastBattle: r.lastBattle, lastDice: r.lastDice || null,
    lastSeal: r.lastSeal || null, lastRuin: r.lastRuin || null,
    lastBarrierHit: r.lastBarrierHit || null,
    upgradePreview: r.upgradePreview || null,   // 強化候補プレビュー(揮発 ─ v0.75)
    saveRev: r.saveRev || 0,
    winner: r.winner,
    pending: Object.fromEntries(Object.entries(r.pending).map(([k, v]) =>
      v.type === 'draft' && k !== viewerId
        ? [k, { type: v.type, prompt: v.prompt, options: [], aura: r.draft ? r.draft.aura : null,
            resume: r.draft ? r.draft.resume : null }]
        : v.type === 'pick_draw' && k !== viewerId
          ? [k, { type: v.type, prompt: v.prompt, options: [], until: v.until }]  // 候補カードは本人だけに見せる
          : [k, v])),
    lastDraw: r.lastDraw || null, lastGain: r.lastGain || null,
    catalog: { CREATURES, SUPPORTS, ITEMS, CHARS, ULTS, SPELLS },
    players: r.players.map(p => ({
      id: p.id, name: p.name, charId: p.charId || null, confirmed: !!p.confirmed,
      color: p.color || '#888', pos: p.pos || 0, gold: p.gold ?? 0,
      gems: p.gems || 0, treasures: p.treasures || 0,
      battleWins: p.battleWins || 0, shrineVisits: p.shrineVisits || 0, ultUsed: !!p.ultUsed,
      hand: p.id === viewerId ? (p.hand || []) : [],
      deckList: p.id === viewerId ? [...(p.deck || [])].sort() : undefined,
      discardList: p.id === viewerId ? [...(p.discard || [])].sort() : undefined,
      exileList: p.id === viewerId ? [...(p.exile || [])].sort() : undefined,
      handCount: (p.hand || []).length,
      deckCount: (p.deck || []).length,
      discardCount: (p.discard || []).length,
      exileCount: (p.exile || []).length,
      points: r.phase === 'playing' || r.phase === 'ended' ? points(r, p) : 0,
      bankrupt: !!p.bankrupt,
      dir: p.dir || 1,
      seal: !!p.seal,
      lap: p.lap || 1,
    })),
  };
}
function broadcast(r) {
  r.saveRev = (r.saveRev || 0) + 1;  // v0.62: 状態変化ごとに単調増加(盤面の自動セーブ契機)
  for (const c of r.clients) {
    try { c.res.write(`data: ${JSON.stringify(publicState(r, c.viewerId))}\n\n`); }
    catch (e) { r.clients.delete(c); }
  }
}

// ===== v0.62 セーブ/再開(docs/plan_save_v0.62.md §7準拠) =====
const SAVE_VER = 1;
// ルームのフィールド分類表。ルームに新しいキーを追加したら必ずどちらかに分類すること
// (save_testが未分類キーを検出して失敗する)
const ROOM_RUNTIME_KEYS = new Set(['clients', 'lastActivity', 'upgradePreview']);  // 保存しない
const ROOM_PERSIST_KEYS = new Set([                                            // 保存する
  'code', 'phase', 'players', 'owners', 'deck', 'market', 'turn', 'round', 'log',
  'pending', 'titles', 'duel', 'lastBattle', 'winner', 'barrier', 'elemOv', 'tileFx',
  'treasureCost', 'curses', 'boardToken', 'atSeq', 'saveRev', 'battle', 'draft',
  'dirPend', 'halfMarket',
  'lastEvent', 'lastDice', 'lastUlt', 'lastSeal', 'lastRuin', 'lastDraw', 'lastGain',
  'lastBarrierHit',
]);
function serializeRoom(r) {
  const room = {};
  for (const k of Object.keys(r)) {
    if (ROOM_RUNTIME_KEYS.has(k)) continue;
    if (ROOM_PERSIST_KEYS.has(k)) room[k] = r[k];
    // 未分類キーは保存しない(save_testが検出する)
  }
  return { saveVer: SAVE_VER, gameVer: VERSION, savedAt: Date.now(),
           room: JSON.parse(JSON.stringify(room)) };
}
const VALID_CARD = c => !!(CREATURES[c] || SPELLS[c] || SUPPORTS[c]);
// セーブデータの検証。問題なければnull、あればエラーメッセージを返す
function validateSave(save) {
  if (!save || typeof save !== 'object') return 'セーブデータが不正です';
  if (typeof save.saveVer !== 'number' || save.saveVer > SAVE_VER)
    return `このセーブ形式(ver${save.saveVer})は新しすぎて読めません(対応: ver${SAVE_VER}まで)`;
  if (save.saveVer < SAVE_VER)
    return `このセーブ形式(ver${save.saveVer})には対応していません(対応: ver${SAVE_VER})`;
  const d = save.room;
  if (!d || typeof d !== 'object') return 'セーブデータが壊れています';
  if (typeof d.code !== 'string' || !/^[A-Z0-9]{4}$/.test(d.code)) return 'ルームコードが不正です';
  if (typeof d.boardToken !== 'string' || d.boardToken.length < 16) return '権限トークンが不正です';
  if (!['lobby', 'select', 'playing', 'ended'].includes(d.phase)) return 'フェーズが不正です';
  if (!Array.isArray(d.players) || d.players.length < 1 || d.players.length > 4) return 'プレイヤー数が不正です';
  const ids = new Set();
  for (const q of d.players) {
    if (!q || typeof q.id !== 'string' || !q.id || q.id.length > 24 || ids.has(q.id)) return 'プレイヤーIDが不正です';
    ids.add(q.id);
    if (typeof q.name !== 'string' || q.name.length > 16) return 'プレイヤー名が不正です';
    if (q.charId != null && !CHARS[q.charId]) return 'キャラクターIDが不正です';
    for (const zone of ['deck', 'hand', 'discard', 'exile', 'pickCards']) {
      const z = q[zone];
      if (z == null) continue;
      if (!Array.isArray(z) || z.length > 300) return `カード置き場(${zone})が不正です`;
      for (const c of z) if (!VALID_CARD(c)) return `不明なカードID: ${c}`;
    }
    for (const nk of ['gold', 'pos', 'lap', 'gems', 'treasures', 'battleWins', 'shrineVisits'])
      if (q[nk] != null && (typeof q[nk] !== 'number' || !isFinite(q[nk]))) return `数値(${nk})が不正です`;
    if (q.pos != null && (q.pos < 0 || q.pos >= TILES.length)) return 'プレイヤー位置が不正です';
  }
  if (!Array.isArray(d.owners) || d.owners.length !== TILES.length) return '盤面データが不正です';
  for (const o of d.owners) {
    if (o == null) continue;
    if (!ids.has(o.player)) return '領地の所有者が不正です';
    if (!VALID_CARD(o.creature)) return `盤面に不明なカードID: ${o.creature}`;
    if (typeof o.level !== 'number' || o.level < 1 || o.level > RULES.maxLevel) return '領地レベルが不正です';
  }
  if (!Array.isArray(d.deck) || d.deck.length > 500) return '共通山札が不正です';
  for (const c of d.deck) if (!VALID_CARD(c)) return `共通山札に不明なカードID: ${c}`;
  if (d.market != null && (!Array.isArray(d.market) || d.market.some(c => !VALID_CARD(c)))) return '市場データが不正です';
  if (d.pending != null) {
    if (typeof d.pending !== 'object') return 'pendingが不正です';
    for (const [k, v] of Object.entries(d.pending)) {
      if (!ids.has(k)) return 'pendingの対象プレイヤーが不正です';
      if (!v || typeof v.type !== 'string' || !Array.isArray(v.options)) return 'pendingの形式が不正です';
    }
  }
  if (d.battle != null && (!ids.has(d.battle.attacker) || !ids.has(d.battle.defender))) return '戦闘データが不正です';
  if (d.draft != null && !ids.has(d.draft.player)) return 'ドラフトデータが不正です';
  for (const key of ['elemOv', 'tileFx', 'curses'])
    if (d[key] != null) {
      if (typeof d[key] !== 'object') return `${key}が不正です`;
      for (const ti of Object.keys(d[key]))
        if (!(+ti >= 0 && +ti < TILES.length)) return `${key}のマス番号が不正です`;
    }
  if (d.elemOv != null)
    for (const e of Object.values(d.elemOv))
      if (!['fire', 'water', 'earth', 'wind'].includes(e)) return '属性上書きが不正です';
  return null;
}
// 復元(原子的): 検証・構築がすべて成功してからroomsへ登録する。失敗時は既存ルームを変更しない
function restoreRoom(save) {
  const err = validateSave(save);
  if (err) return { error: err, status: 400 };
  let d;
  try { d = JSON.parse(JSON.stringify(save.room)); }  // 別オブジェクトへ複製
  catch (e) { return { error: 'セーブデータを複製できません', status: 400 }; }
  const existing = rooms.get(d.code);
  if (existing && existing.boardToken !== d.boardToken)
    return { error: `ルーム${d.code}は使用中のため復元できません(既存のルームを閉じてから再試行してください)`, status: 409 };
  const room = Object.assign(d, { clients: new Set(), lastActivity: Date.now() });
  // ここから先は失敗しない操作のみ(原子的な差し替え)
  if (existing) {
    for (const c of existing.clients) { try { c.res.end(); } catch (e) {} }
    rooms.delete(d.code);
  }
  rooms.set(room.code, room);
  // 選択ドロー中のセーブは候補2枚ごと復元される(v0.63: 制限時間なし)
  for (const pend of Object.values(room.pending || {}))
    if (pend && pend.type === 'pick_draw') delete pend.until;  // 旧セーブの制限時間表記は破棄
  log(room, 'セーブデータからゲームを再開した');
  const warn = save.gameVer !== VERSION
    ? `セーブ時のゲームバージョン(${save.gameVer})と現在(${VERSION})が異なります` : null;
  return { room, warn };
}
const BODY_LIMIT = 2 * 1024 * 1024;  // v0.62: 2MB(復元JSONの上限を兼ねる)
const readBody = req => new Promise(res => {
  let raw = '';
  req.on('data', c => {
    if (raw === null) return;
    raw += c;
    if (raw.length > BODY_LIMIT) { raw = null; try { req.destroy(); } catch (e) {} res({ __tooLarge: true }); }
  });
  req.on('end', () => { if (raw === null) return; try { res(JSON.parse(raw || '{}')); } catch (e) { res({}); } });
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
// v0.66: 描画パリティ確認用のフィクスチャルーム(roomsに登録せず、publicState生成にだけ使う)
function makeFixtureRoom() {
  const r = makeRoom();
  rooms.delete(r.code);
  r.code = 'FIXT';
  r.phase = 'playing';
  r.round = 12;
  const chars = ['redani', 'linnei', 'grease', 'mio'];
  r.players = chars.map((c, i) => ({
    id: 'fx' + i, name: 'テスト' + '甲乙丙丁'[i], charId: c, confirmed: true,
    color: CHARS[c].color, pos: 20, gold: 800 + i * 300, lap: 3, dir: 1,
    deck: [], hand: [], discard: [], exile: [],
    gems: i, treasures: i % 2, battleWins: i, shrineVisits: i, seal: i % 2 === 0,
  }));
  // Lv1〜4・進化・全属性・呪い・結界・土地効果を網羅した盤面
  const own = (i, pl, lv, cr) => { r.owners[i] = { player: 'fx' + pl, level: lv, creature: cr, dmg: lv * 5 }; };
  own(1, 0, 1, 'gecko'); own(2, 0, 2, 'magado'); own(3, 0, 4, 'detropas');     // 火(Lv4=進化)
  own(9, 3, 1, 'gaston'); own(10, 3, 3, 'garble'); own(12, 3, 2, 'pakawata');  // 風(Lv3=進化)
  own(16, 2, 2, 'nome'); own(17, 2, 4, 'barbaro'); own(19, 2, 1, 'bedebero');  // 土
  own(21, 1, 3, 'orphe'); own(22, 1, 1, 'cresteria'); own(24, 1, 2, 'kbaby_f'); // 水(手札鍛錬済み_f)
  own(26, 1, 1, 'mimic'); own(27, 0, 2, 'beruf');                               // 無属性トークン確認
  r.owners[27].shade = 2;
  r.curses[16] = { by: 'fx0', hp: 20 };
  r.barrier['fx1'] = true;
  r.tileFx[3] = { vortex: true, roots: true };
  r.tileFx[21] = { tide: { by: 'fx1' } };
  r.elemOv[19] = 'fire';
  r.titles.conqueror = 'fx0';
  r.titles.pilgrim = 'fx1';
  log(r, 'フィクスチャ表示(開発用)');
  return r;
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
  // v0.66: 共有タイミング定数・Phaserワールド描画・同梱ライブラリ
  if (p === '/game_timing.js' || p === '/board_world.js' || p.startsWith('/vendor/'))
    return serveFile(res, p.slice(1));
  if (p === '/api/fixture') {
    // v0.66: 描画パリティ確認用の固定state(ルームは登録しない・開発用)
    return json(res, publicState(makeFixtureRoom(), null));
  }

  if (p === '/api/create' && req.method === 'POST') {
    const r = makeRoom();
    const base = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL.replace(/\/$/, '')
      : `http://${lanIP()}:${PORT}`;
    return json(res, { code: r.code, phoneUrl: `${base}/phone`, boardToken: r.boardToken });
  }
  if (p === '/api/join' && req.method === 'POST') {
    const b = await readBody(req);
    const r = rooms.get((b.room || '').toUpperCase());
    if (!r) return json(res, { error: 'ルームが見つかりません' }, 404);
    const nm = String(b.name || '').trim().slice(0, 8);
    if (r.phase !== 'lobby') {
      // v0.62: 名前復帰 ─ 同名の「切断中」プレイヤーを引き継ぐ(接続中は乗っ取り不可)
      const pl = nm && r.players.find(x => x.name === nm);
      if (pl) {
        const connected = [...r.clients].some(c => c.viewerId === pl.id);
        if (connected) return json(res, { error: `「${nm}」は接続中のため復帰できません` }, 400);
        touch(r);
        log(r, `${pl.name}が復帰した`);
        broadcast(r);
        return json(res, { playerId: pl.id, room: r.code, resumed: true });
      }
      return json(res, { error: 'ゲームは開始済みです(参加中の名前を入力すると復帰できます)' }, 400);
    }
    if (r.players.length >= 4) return json(res, { error: '満員です' }, 400);
    if (nm && r.players.some(x => x.name === nm))
      return json(res, { error: '同じ名前のプレイヤーがいます' }, 400);  // v0.62: 名前復帰のため重複禁止
    const id = 'p' + Math.random().toString(36).slice(2, 8);
    r.players.push({ id, name: nm || '名無し' });
    touch(r);
    log(r, `${r.players[r.players.length - 1].name}が参加した`);
    broadcast(r);
    return json(res, { playerId: id, room: r.code });
  }
  if (p === '/api/save') {
    // v0.62: 盤面専用(boardToken必須)。全員の手札・山札を含むため参加者には渡さない
    const r = rooms.get((url.searchParams.get('room') || '').toUpperCase());
    if (!r) return json(res, { error: 'ルームが見つかりません' }, 404);
    if (url.searchParams.get('token') !== r.boardToken) return json(res, { error: '権限がありません' }, 403);
    return json(res, serializeRoom(r));
  }
  if (p === '/api/restore' && req.method === 'POST') {
    const b = await readBody(req);
    if (b.__tooLarge) return json(res, { error: 'セーブデータが大きすぎます' }, 413);
    const out = restoreRoom(b);
    if (out.error) return json(res, { error: out.error }, out.status || 400);
    const base = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL.replace(/\/$/, '')
      : `http://${lanIP()}:${PORT}`;
    console.log(`ルーム${out.room.code}をセーブデータから復元`);
    return json(res, { code: out.room.code, phoneUrl: `${base}/phone`,
                       boardToken: out.room.boardToken, warn: out.warn || null });
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
      if (b.token !== r.boardToken) return json(res, { error: '権限がありません' }, 403);  // v0.62
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
    else if (b.type === 'upgrade_preview') {
      // 発注書v0.75 §6.3: 強化選択中の候補プレビュー(揮発・非保存・ルール影響なし)。
      // 本人が強化選択中で、送られたtileが現在の候補に含まれる場合のみ表示する
      const pv = r.pending[b.playerId];
      if (pv && pv.type === 'upgrade') {
        r.upgradePreview = pv.options.some(o => o.tile === b.tile)
          ? { player: b.playerId, tile: b.tile, at: stamp(r) }
          : null;
      }
    }
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
    req.on('close', () => {
      r.clients.delete(client);
      // 切断時にプレビューを解除(発注書v0.75 §6.3)
      if (r.upgradePreview && r.upgradePreview.player === client.viewerId) {
        r.upgradePreview = null;
        broadcast(r);
      }
    });
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
