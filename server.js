// SUMMONS CODE 統合サーバー v0.1(段階①: ゲームエンジン)
// 仕様書v0.2準拠: 勝利点12先取 / 土地レベル / 連鎖通行料 / ウェポン付き侵略戦闘 /
// 祠(巡礼称号) / 市場(公開商品の購入・カード削除) / 覇者称号 / キャラ選択のダイス競合
// 起動: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VERSION = '1.41';
const GAME_TIMING = require('./public/game_timing');
const PORT = process.env.PORT || 3000;
const TURN_TRANSITION_TIMEOUT_MS = 20000;
const TARGET_PTS = 12;
const RULES = { startGold: 300, castleBonusPerLap: 100, gateBonus: 200, shrineBonus: 100, tollUnit: 30,
                levelCost: { 2: 100, 3: 450, 4: 950 }, maxLevel: 4,  // v0.60: Lv3/Lv4強化を大型投資に
                evoLevel: 3, forgeCost: 150,
                startHand: 5, forgetCost: 80 };  // v0.44: 初期5枚+毎ターン1枚ドロー
// キャラ別初期デッキ12枚(初期デッキ仕様案v0.1 第12節)
// v0.53: 黄金・ひらめきを全員1枚、衰弱=レダーニ/交代=リンネイ・グリース/移動=ミオ
const CHAR_DECKS = {
  redani: ['kamadoma', 'kamadoma', 'swordgear', 'gecko', 'gecko', 'cleo',
           'sp_gold', 'sp_insight', 'sp_bloodstained_blade',
           'weapon', 'weapon', 'gweapon'],
  linnei: ['orphe', 'orphe', 'orphe', 'nome', 'nome', 'cleo',
           'sp_gold', 'sp_insight', 'sp_swap',
           'shield', 'shield', 'jinx'],
  grease: ['nome', 'nome', 'nome', 'orphe', 'orphe', 'cleo',
           'sp_gold', 'sp_insight', 'sp_swap',
           'shield', 'shield', 'jinx'],
  mio:    ['gaston', 'gaston', 'gaston', 'gecko', 'gecko', 'cleo',
           'sp_gold', 'sp_insight', 'sp_step',
           'weapon', 'weapon', 'jinx'],
  lia:    ['grayble', 'grayble', 'grayble', 'trooper', 'trooper', 'gecko',
           'sp_gold', 'sp_insight', 'sp_flame_vortex',
           'weapon', 'weapon', 'jinx'],
  adel:   ['survey', 'survey', 'survey', 'palecoral', 'palecoral', 'orphe',
           'sp_gold', 'sp_insight', 'sp_abyssal_pearl',
           'shield', 'shield', 'jinx'],
  villa:  ['gaust', 'gaust', 'alter', 'alter', 'marlow', 'cleo',
           'sp_gold', 'sp_insight', 'sp_fatal_reward',
           'shield', 'weapon', 'jinx'],
  nerasio:['komao', 'komao', 'nome', 'nome', 'fugorm', 'cleo',
           'sp_gold', 'sp_insight', 'sp_earth_mother_stone',
           'shield', 'shield', 'jinx'],
};
// 廃棄スペル(使用後ゲームから除外)
let EXILE_SPELLS = new Set();
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
function gainToDeck(r, p, cards, reason = 'gain') {
  p.deck.push(...cards);
  shuffle(p.deck);
  r.lastGain = { player: p.id, n: cards.length, cards: cards.slice(), reason, at: stamp(r) };
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
  gecko:  { name: 'バーンゲッコー', evo: 'サラマンダー',   elem: 'fire',  st: 30, hp: 25, cost: 50, evoSt: 60, evoHp: 40, fx: '【猛攻】攻撃時AT+10', rarity: 'N' },
  orphe:  { name: 'オルフェ',       evo: 'ウンディーネ',   elem: 'water', st: 30, hp: 30, cost: 50, evoSt: 45, evoHp: 50, fx: '【清流】この土地の通行料+20%', rarity: 'N' },
  nome:   { name: 'ノーム',         evo: 'アースゴーレム', elem: 'earth', st: 10, hp: 40, cost: 50, evoSt: 30, evoHp: 65, fx: '【岩壁】防衛時、地形補正+10(進化+20)', rarity: 'N' },
  gaston: { name: 'ガストン',       evo: 'ガストレイド',   elem: 'wind',  st: 20, hp: 40, cost: 50, evoSt: 40, evoHp: 60, fx: '【旋風】敗北しても消滅せず手札に戻る', rarity: 'N' },
  cleo:   { name: 'クレオ',         evo: 'クレステッド',   elem: null,    st: 30, hp: 30, cost: 50, evoSt: 50, evoHp: 45, fx: '【適応】どの属性でも地形補正を得る', rarity: 'N' },
  // マーケット
  magado:  { name: 'マガドー', evo: 'マグナガルム', elem: 'fire', st: 55, hp: 35, cost: 120, evoSt: 75, evoHp: 55, rarity: 'R' },
  qbaby:   { name: 'クイーンベビー', evo: 'クイーン', elem: 'fire', st: 35, hp: 30, cost: 120, evoSt: 55, evoHp: 50, fx: '【女王の威光】自分の火領地の防衛DF+10(進化+20)', rarity: 'L' },
  cresteria:{ name: 'クレステリア',    elem: 'water', st: 20, hp: 50, cost: 90, fx: '【真珠】召喚時、ウェポン「シールド」1枚をデッキに加える', rarity: 'N' },
  kbaby:   { name: 'キングベビー', evo: 'キング', elem: 'water', st: 30, hp: 40, cost: 120, evoSt: 50, evoHp: 60, fx: '【王の徴収】配置土地の通行料1.5倍(進化後2倍)', rarity: 'L' },
  ludi:    { name: 'ルディ', evo: 'シンルー', elem: 'wind', st: 25, hp: 40, cost: 120, evoSt: 45, evoHp: 60, fx: '【雲隠れ】防衛時、相手のウェポンを無効化', rarity: 'R' },
  garble:  { name: 'ガーブル', evo: 'ガレス・ゲイル', elem: 'wind', st: 35, hp: 25, cost: 100, evoSt: 55, evoHp: 45, fx: '【風刃】攻撃時、相手の地形補正を無視', rarity: 'R' },
  barbaro: { name: 'バルバロ', evo: 'バーグランダ', elem: 'earth', st: 30, hp: 45, cost: 120, evoSt: 50, evoHp: 65, fx: '【逆鱗】防衛成功時、相手から30G奪う(進化50G)', rarity: 'R' },
  detropas:{ name: 'デトロパス', evo: 'クラーケンイービル', elem: 'fire', st: 30, hp: 25, cost: 60, evoSt: 50, evoHp: 45, fx: '【群れ】攻撃時、自分の火領地1つにつきAT+10', rarity: 'N' },
  goagoa:  { name: 'ゴアゴア', evo: 'ノーク・ゴーア', elem: 'water', st: 40, hp: 40, cost: 100, evoSt: 60, evoHp: 65, fx: '【深海】防衛成功時、自分の負傷を10回復する', rarity: 'R' },
  fugorm:  { name: 'フーゴルム', evo: 'ゴーレムアイン', elem: 'earth', st: 35, hp: 40, cost: 80, evoSt: 55, evoHp: 60, fx: '【鍛冶】召喚時、ウェポン「ソード」を得る', rarity: 'N' },
  bedebero:{ name: 'ベデベロ',         elem: 'earth', st: 30, hp: 60, cost: 120, fx: '【不動】受けるスペルダメージを10軽減する', rarity: 'R' },
  zati:    { name: 'ザーティー', evo: 'ザンティアー', elem: 'wind', st: 40, hp: 30, cost: 60, evoSt: 60, evoHp: 50, fx: '【略奪】侵略成功時、相手から50G奪う', rarity: 'N' },
  pakawata:{ name: 'パカワタ',         elem: 'wind',  st: 50, hp: 25, cost: 130, fx: '【先制】防衛時、侵略側より先に攻撃する', rarity: 'L' },
  avalanche:{ name: 'アヴァランチ', evo: 'アヴァランチジャイアント', elem: 'earth', st: 20, hp: 40, cost: 120, evoSt: 30, evoHp: 60, fx: '【双撃】侵略時、同じATで2回続けて攻撃する', rarity: 'L' },
  bonerex: { name: 'ボーンレックス', evo: 'ディノガルド', elem: 'earth', st: 35, hp: 45, cost: 110, evoSt: 55, evoHp: 65, fx: '【骨鎧】防衛時DF+10(進化+20)', rarity: 'R' },
  morbill: { name: 'モービル', evo: 'モルドラ', elem: 'earth', st: 30, hp: 45, cost: 60, evoSt: 50, evoHp: 65, fx: '【腐蝕】侵略時、相手の防衛DF-10(進化-20)', rarity: 'N' },
  mimic:   { name: 'ミミック',         elem: null,    st: 30, hp: 30, cost: 70, fx: '【擬態】戦闘時、相手の基礎AT/HPをコピー', rarity: 'N' },
  beruf:   { name: 'ベルーフ・シェイド', evo: 'デスベルーフ', elem: null, st: 20, hp: 50, cost: 60, evoSt: 40, evoHp: 70, fx: '【死影】スペルダメージを受けるたびDF+10。上限なし、土地を離れるまで持続', rarity: 'N' },
  grayble: { name: 'グレイブル', evo: 'グランガルム', elem: 'fire', st: 40, hp: 30, cost: 80, evoSt: 65, evoHp: 45,
             fx: '【追撃】侵略時、戦闘前から相手が負傷していればAT+10', evoFx: '【追撃】侵略時、戦闘前から相手が負傷していればAT+20', rarity: 'N' },
  trooper: { name: 'トルーパー', evo: 'グリゴール', elem: 'fire', st: 25, hp: 40, cost: 90, evoSt: 45, evoHp: 60,
             fx: '【火種】配置時、「炎の渦」1枚を山札へ加えてシャッフルする', evoFx: '【魔導節約】配置中、自分のスペルコストを20G下げる', rarity: 'N' },
  survey:  { name: 'サーベイ', evo: 'ザシャック', elem: 'water', st: 35, hp: 35, cost: 80, evoSt: 55, evoHp: 50,
             fx: '【支援】戦闘時、手札のクリーチャーをウェポンとして使える', evoFx: '【支援】戦闘時、手札のクリーチャーをウェポンとして使える', rarity: 'N' },
  palecoral:{ name: 'パレコラル', evo: 'コラルグレイヴ', elem: 'water', st: 20, hp: 50, cost: 90, evoSt: 40, evoHp: 70,
             fx: '【珊瑚再生】水領地が2つ以上ならターン開始時にHPを10回復', evoFx: '【珊瑚再生】水領地が2つ以上ならターン開始時にHPを20回復', rarity: 'N' },
  bunnyhop:{ name: 'バニホップ', evo: 'ロードバンプ', elem: 'fire', st: 10, hp: 10, cost: 60, evoSt: 40, evoHp: 60,
             fx: '【耐魔】スペルによるダメージを受けない', evoFx: '【魔力徴収】自分がスペルを使うたび100Gを得る(重複)', rarity: 'N' },
  strauk:  { name: 'ストラウク', elem: null, st: 10, hp: 70, cost: 120,
             fx: '【地脈適応】どの属性の土地からでも地形補正を得る', rarity: 'L' },
  samurai_saga:{ name: 'サムライ・サガ', elem: null, st: 50, hp: 50, cost: 120,
             fx: '【地脈改変】全属性の土地で地形補正を得る。召喚した土地を任意の属性へ変更できる', rarity: 'L' },
  marlow:  { name: 'マーロー', elem: 'wind', st: 30, hp: 30, cost: 50,
             fx: '【風渡り】自領地停止時、配置中のマーロー1体を空いている風属性土地へ移動できる', rarity: 'R' },
  shuterio:{ name: 'シュテリオ', evo: 'エアロシュティレ', elem: 'wind', st: 30, hp: 30, cost: 70,
             evoSt: 40, evoHp: 50, fx: '【支援】戦闘時、手札のクリーチャーをウェポンとして使える', rarity: 'R' },
  gaust:   { name: 'ガウスト', evo: 'マスターガウスト', elem: 'wind', st: 30, hp: 30, cost: 70,
             evoSt: 40, evoHp: 50, fx: '【魂の選別】配置時、1枚引き、手札1枚を廃棄する', rarity: 'N' },
  alter:   { name: 'オルター', evo: 'オルボロス', elem: 'wind', st: 30, hp: 40, cost: 70,
             evoSt: 40, evoHp: 50, fx: '【魂喰らい】戦闘時、自分の廃棄1枚につきDF+5', rarity: 'R' },
  toxy:    { name: 'トキシー', evo: 'マッドミスト', elem: 'wind', st: 30, hp: 40, cost: 120,
             evoSt: 30, evoHp: 50, fx: '【瘴気連鎖】配置中、自分のカード廃棄時、敵1人の手札を1枚捨てる', rarity: 'R' },
  kamadoma:{ name: 'カマドーマ', evo: 'ダイテッカン', elem: 'fire', st: 20, hp: 40, cost: 60,
             evoSt: 30, evoHp: 60, fx: '【武具錬成】配置時、ソード1枚を手札に加える',
             evoFx: '【武具錬成】配置時にソードを得る。【再鍛造】戦闘勝利時、廃棄のウェポン1枚を回収', rarity: 'N' },
  swordgear:{ name: 'ソードギア', evo: 'イグニスナイト', elem: 'fire', st: 40, hp: 30, cost: 100,
             evoSt: 40, evoHp: 50, fx: '【武装熟練】ソード／ヘビーアックスのAT補正をさらに+10',
             evoFx: '【武装熟練】ソード／ヘビーアックスのAT補正をさらに+20', rarity: 'R' },
  komao:   { name: 'コマオー', evo: 'シシガルム', elem: 'earth', st: 30, hp: 30, cost: 70,
             evoSt: 30, evoHp: 50, fx: '【地脈転成】配置した土地を土属性に変える',
             evoFx: '【地脈転成】配置土地を土属性化。【獅子地脈】自分の土領地1つにつきDF+5', rarity: 'N' },
};
const ITEMS = {}; // v0.34: 呪いアイテムは廃止(スペル「衰弱の呪文」に移行)
const SPELLS = {
  sp_gold:   { name: 'ゴールド', rarity: 'N', cost: 0,
               desc: '現在の周回数×100Gを得る' },
  sp_weaken: { name: '衰弱の呪文', rarity: 'N', cost: 200, hp: 20,
               desc: '敵領地を1つ選び、そのクリーチャーに20ダメージ(回復しない)。HPが0以下になると滅び、土地は空き地になる' },
  sp_gale:   { name: 'ダブルロール', rarity: 'R', cost: 30,
               desc: 'このターン、サイコロを2個振って移動する' },
  sp_quake:  { name: '地割れ', rarity: 'R', cost: 300, exileAfterUse: true,
               desc: '敵の領地1つのレベルを1下げる(Lv1には無効)' },
  sp_step:   { name: 'ムーブ', rarity: 'R', cost: 40,
               desc: '自分の領地のクリーチャー1体を隣のマスへ移動。空き地なら新たな領地(Lv1)に、敵領地ならそのまま侵略(通行料なし)' },
  // ---- v0.56 追加スペル(スペル追加仕様v0.53) ----
  sp_volcanic_core:     { name: 'フレイム・シフト', rarity: 'R', cost: 80, exileAfterUse: true,
    desc: '自分の領地1つを火属性に変更する' },
  sp_abyssal_pearl:     { name: 'アクア・シフト', rarity: 'R', cost: 80, exileAfterUse: true,
    desc: '自分の領地1つを水属性に変更する' },
  sp_earth_mother_stone:{ name: 'アース・シフト', rarity: 'R', cost: 80, exileAfterUse: true,
    desc: '自分の領地1つを土属性に変更する' },
  sp_sky_crystal:       { name: 'ウィンド・シフト', rarity: 'R', cost: 80, exileAfterUse: true,
    desc: '自分の領地1つを風属性に変更する' },
  sp_flame_vortex:      { name: '炎の渦', rarity: 'R', cost: 100,
    desc: '敵領地に10ダメージを与える。次にその領地へ侵略するクリーチャーはAT+10' },
  sp_bloodstained_blade:{ name: '血染めの刃', rarity: 'R', cost: 40,
    desc: '次の侵略でAT+10。侵略成功時、相手から30Gを奪う' },
  sp_bedrock_uplift:    { name: 'リストア', rarity: 'R', cost: 50,
    desc: '自分の負傷した領地1つを20回復し、次の戦闘でDF+10' },
  sp_wind_shift:        { name: '風向転換', rarity: 'R', cost: 30,
    desc: '現在の進行方向を反転し、以降もその方向へ進む' },
  sp_ward:   { name: 'バリア', rarity: 'R', cost: 80, exileAfterUse: true,
               desc: 'あなたの次の手番まで、自分の領地は侵略されない' },
  sp_move:   { name: 'スイッチ', rarity: 'R', cost: 40,
               desc: '自分の領地2つのクリーチャーを入れ替える(負傷も一緒に移動)' },
  sp_insight:{ name: 'ダブルドロー', rarity: 'N', cost: 40,
               desc: 'カードを2枚引く' },
  sp_fatal_reward:{ name: 'フェイタルリワード', rarity: 'N', cost: 80,
               desc: 'カードを1枚引き、その後手札1枚を廃棄する' },
  sp_swap:   { name: 'チェンジ', rarity: 'R', cost: 30,
               desc: '自分の領地のクリーチャーを手札のクリーチャーと交代する(召喚コスト別途。元のクリーチャーは捨て札へ・負傷は回復)' },
  sp_dice_1: { name: 'ダイス1', rarity: 'R', cost: 50, fixedDice: 1,
               desc: 'このターン、ダイスの出目を1に固定する' },
  sp_dice_2: { name: 'ダイス2', rarity: 'R', cost: 50, fixedDice: 2,
               desc: 'このターン、ダイスの出目を2に固定する' },
  sp_dice_3: { name: 'ダイス3', rarity: 'R', cost: 50, fixedDice: 3,
               desc: 'このターン、ダイスの出目を3に固定する' },
  sp_dice_4: { name: 'ダイス4', rarity: 'R', cost: 50, fixedDice: 4,
               desc: 'このターン、ダイスの出目を4に固定する' },
  sp_dice_5: { name: 'ダイス5', rarity: 'R', cost: 50, fixedDice: 5,
               desc: 'このターン、ダイスの出目を5に固定する' },
  sp_dice_6: { name: 'ダイス6', rarity: 'R', cost: 50, fixedDice: 6,
               desc: 'このターン、ダイスの出目を6に固定する' },
};
const SUPPORTS = {
  weapon:  { name: 'ソード',           st: 20, hp: 0,  cost: 60, exileAfterUse: true },
  gweapon: { name: 'ヘビーアックス',   st: 40, hp: 0,  cost: 120, exileAfterUse: true },
  shield:  { name: 'シールド',         st: 0,  hp: 20, cost: 60, exileAfterUse: true },
  gshield: { name: 'ビッグシールド',   st: 0,  hp: 40, cost: 120, exileAfterUse: true },
  jinx:    { name: 'ディスアーム',     st: 0,  hp: 0,  cost: 100, jinx: true,
             fx: '相手のウェポンを無効化', exileAfterUse: true },
};
EXILE_SPELLS = new Set(Object.entries(SPELLS).filter(([, sp]) => sp.exileAfterUse).map(([id]) => id));
const CHARS = {
  redani: { name: 'レダーニ', color: '#D85A30', elem: 'fire',
            style: 'ウェポン・火力侵略', deckNote: 'カマドーマ2+ソードギア ─ ウェポンを鍛えて攻める' },
  linnei: { name: 'リンネイ', color: '#378ADD', elem: 'water',
            style: '経済・通行料', deckNote: 'オルフェ2+黄金2 ─ 資金と収入を伸ばす' },
  grease: { name: 'グリース', color: '#C69A32', elem: 'earth',
            style: '防衛・領地育成', deckNote: 'ノーム2+シールド2+加護 ─ 守って育てる' },
  mio:    { name: 'ミオ',     color: '#4FA69C', elem: 'wind',
            style: '移動・機動侵略', deckNote: 'ガストン2+疾風2 ─ 動き回って仕掛ける' },
  lia:    { name: 'リーア',   color: '#E6868F', elem: 'fire',
            style: '負傷・火力侵略', deckNote: '炎の渦で傷を刻み、追撃で侵略する' },
  adel:   { name: 'アーデル', color: '#9DDFF2', elem: 'water',
            style: '回復・クリーチャーウェポン', deckNote: '水連鎖を築き、ウェポンと回復で守り抜く', selectable: true, upcoming: false },
  villa:  { name: 'ヴィラ',   color: '#42B875', elem: 'wind',
            style: '廃棄・墓守戦術', deckNote: '廃棄を蓄え、魂喰らいと墓守の協奏曲で再利用する', selectable: true, upcoming: false },
  nerasio:{ name: 'ネラシオ', color: '#C49545', elem: 'earth',
            style: '地脈・属性連鎖', deckNote: '土地属性を再構成し、連鎖と地形補正を組み替える', selectable: true, upcoming: false },
};
const ULTS = {
  redani: { name: '烈火の進軍', desc: 'サイコロを3個振って移動する' },
  linnei: { name: '水鏡の大商談', desc: '現在のマスでショップを開き、全品半額で買い物' },
  grease: { name: '大地の大結界', desc: '次の自分の手番まで、すべての自分の領地が侵略されなくなる' },
  mio:    { name: '追い風の導き', desc: '好きなマスへ移動して止まる' },
  lia:    { name: '紅蓮の方程式', desc: '敵領地を最大3か所選び、炎の渦を発生させる' },
  adel:   { name: '氷晶の勅令', desc: '自分の全クリーチャーを20回復し、次の防衛戦闘でDF+10' },
  villa:  { name: '墓守の協奏曲', desc: '廃棄枚数だけ進み、廃棄から最大3枚を手札へ戻す。その後ダイスを振る' },
  nerasio:{ name: '天地転成', desc: '自分の領地を1〜2か所選び、選んだ属性へ永続的に変更する' },
};
for (const [cid, c] of Object.entries({ ...CREATURES }))
  if (c.evo) CREATURES[cid + '_f'] = { name: c.evo, elem: c.elem, st: c.evoSt, hp: c.evoHp,
    cost: c.cost, fx: c.evoFx || c.fx, rarity: c.rarity, forged: true };

const MARKET_POOL = ['magado','detropas','qbaby','cresteria','goagoa','kbaby','bedebero','fugorm','zati','pakawata','mimic','beruf','ludi','garble','barbaro','avalanche','bonerex','morbill','grayble','trooper','survey','palecoral','bunnyhop','strauk','samurai_saga','marlow','shuterio','gaust','alter','toxy','kamadoma','swordgear','komao'];
// アートが存在するクリーチャーID(assetsのc_*.pngを起動時に走査 ─ v0.82)。
// クライアントはcatalog.artIds経由で受け取る。手書きリストの二重管理はしない
// (新クリーチャーはIDとファイル名を一致させて置くだけで盤面・カード・戦闘に反映される)
const ART_IDS = (() => {
  try {
    return fs.readdirSync(path.join(__dirname, 'public', 'assets'))
      .filter(f => /^c_.+\.(?:png|webp)$/.test(f)).map(f => f.replace(/^c_/, '').replace(/\.(?:png|webp)$/, ''));
  } catch (e) { return []; }
})();
const RARITY_COPIES = { L: 1, R: 2, N: 3 };
const MARKET_COPY_OVERRIDES = { marlow: 3 };
const RANDOM_SUPPORT_POOL = ['gweapon', 'gshield'];
const RANDOM_SUPPORT_COPIES = 2;
function makeDeck() {
  const d = [];
  for (const c of MARKET_POOL)
    for (let i = 0; i < (MARKET_COPY_OVERRIDES[c] || RARITY_COPIES[CREATURES[c].rarity]); i++) d.push(c);
  for (const [sid, sp] of Object.entries(SPELLS))
    for (let i = 0; i < RARITY_COPIES[sp.rarity]; i++) d.push(sid);
  for (const sid of RANDOM_SUPPORT_POOL)
    for (let i = 0; i < RANDOM_SUPPORT_COPIES; i++) d.push(sid);
  return d.sort(() => Math.random() - 0.5);
}
const SHOP_PRICE = { N: 60, R: 100, L: 160 };
function shopRandomPool() {
  const weighted = [];
  for (const id of [...MARKET_POOL, ...Object.keys(SPELLS)]) {
    const info = CREATURES[id] || SPELLS[id];
    for (let i = 0; i < RARITY_COPIES[info.rarity]; i++) weighted.push(id);
  }
  for (const sid of RANDOM_SUPPORT_POOL)
    for (let i = 0; i < RANDOM_SUPPORT_COPIES; i++) weighted.push(sid);
  return weighted;
}
function shopRandomItem(card, i, price) {
  const support = SUPPORTS[card];
  const info = CREATURES[card] || SPELLS[card];
  const basePrice = support ? support.cost : SHOP_PRICE[info.rarity];
  return { slotId: `card${i}`, kind: support ? 'support' : 'card', card,
    basePrice, price: price(basePrice), sold: false };
}
function makeShopVisit(r, p) {
  const weighted = shopRandomPool();
  const cards = [];
  while (cards.length < 5 && weighted.length) {
    const id = weighted[Math.floor(Math.random() * weighted.length)];
    if (!cards.includes(id)) cards.push(id);
  }
  const half = r.halfMarket === p.id;
  const price = n => half ? Math.round(n / 2) : n;
  r.shopVisit = {
    id: crypto.randomBytes(6).toString('hex'), player: p.id, half, selected: null,
    items: [
      ...cards.map((card, i) => shopRandomItem(card, i, price)),
      { slotId: 'weapon', kind: 'support', card: 'weapon', basePrice: SUPPORTS.weapon.cost, price: price(SUPPORTS.weapon.cost), sold: false },
      { slotId: 'shield', kind: 'support', card: 'shield', basePrice: SUPPORTS.shield.cost, price: price(SUPPORTS.shield.cost), sold: false },
      { slotId: 'jinx', kind: 'support', card: 'jinx', basePrice: SUPPORTS.jinx.cost, price: price(SUPPORTS.jinx.cost), sold: false },
      { slotId: 'remove', kind: 'remove', basePrice: RULES.forgetCost, price: price(RULES.forgetCost), sold: false },
    ],
  };
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
      clearBotTimer(r);
      clearUltTimer(r);
      clearTurnTransitionTimer(r);
      for (const c of r.clients) { try { c.res.end(); } catch (e) {} }
      rooms.delete(code);
      console.log(`ルーム${code}を掃除(60分無操作)`);
    }
  }
}, 10 * 60 * 1000);

function makeRoom(mode = 'normal') {
  const deck = makeDeck();
  const room = {
    code: code4(), phase: 'lobby', clients: new Set(), players: [],
    botMode: mode === 'bot', botTimer: null, botActionSeq: 0, presentationSpeed: 1,
    boardSeen: false, turnTransition: null, turnTransitionTimer: null,
    turnEpoch: 0, promptSeq: 0, stateRev: 0, processedActions: [],
    owners: TILES.map(() => null),        // { player, level, creature }
    deck, market: deck.splice(0, 5), shopVisit: null,
    turn: 0, round: 1, log: [],
    pending: {},                          // playerId → { type, prompt, options }
    titles: { conqueror: null, pilgrim: null },
    duel: null, lastBattle: null, winner: null, barrier: {}, ultSequence: null, ultTimer: null,
    effectQueue: [], effectResume: null, battleAfter: null,
    elemOv: {},                           // 属性変更スペル: マスi → 'fire'等
    tileFx: {},                           // 土地継続効果: マスi → {vortex,tide:{by},uplift,roots}
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
const presentationMs = (r, playerId, ms) => GAME_TIMING.scaled(ms,
  r.botMode && r.presentationSpeed === 2 && pById(r, playerId)?.isBot ? 2 : 1);

// ===== 得点・称号 =====
// イベント刻印: 同一ミリ秒でも必ず増加する(クライアントのat比較による重複排除を確実にする)
function stamp(r) { r.atSeq = Math.max(Date.now(), (r.atSeq || 0) + 1); return r.atSeq; }
// 盤面スペル演出イベント(発注書v0.75 §7 ─ TVがPW.playへ接続する。結果はstateが正)
function spellFx(r, sid, tiles, caster, extra) {
  r.lastSpellFx = Object.assign({ spell: sid, tiles, caster: caster || null, at: stamp(r) }, extra || {});
}
function tileElem(r, i) { return (r.elemOv && r.elemOv[i]) || TILES[i].e; }
const ELEM_OF_SPELL = { sp_volcanic_core: 'fire', sp_abyssal_pearl: 'water',
                        sp_earth_mother_stone: 'earth', sp_sky_crystal: 'wind' };
const ELEM_JA = { fire: '火', water: '水', earth: '土', wind: '風' };
function chainCount(r, playerId, elem) {
  return r.owners.reduce((n, o, i) => n + (o && o.player === playerId && tileElem(r, i) === elem ? 1 : 0), 0);
}
function creatureMaxHp(o) {
  const c = CREATURES[baseId(o && o.creature)];
  return c ? (isEvolved(o) && c.evo ? c.evoHp : c.hp) : 0;
}
function grigorCount(r, playerId) {
  return r.owners.reduce((n, o) => n + (o && o.player === playerId &&
    baseId(o.creature) === 'trooper' && isEvolved(o) ? 1 : 0), 0);
}
function effectiveSpellCost(r, p, sid) {
  const sp = SPELLS[sid];
  return sp ? Math.max(0, sp.cost - grigorCount(r, p.id) * 20) : Infinity;
}
function roadbumpCount(r, playerId) {
  return r.owners.reduce((n, o) => n + (o && o.player === playerId &&
    baseId(o.creature) === 'bunnyhop' && isEvolved(o) ? 1 : 0), 0);
}
function onSpellCast(r, p) {
  const count = roadbumpCount(r, p.id);
  if (!count) return;
  const gain = count * 100;
  p.gold += gain;
  log(r, `【魔力徴収】ロードバンプ${count}体が反応し、${p.name}は${gain}Gを得た`);
}
function universalTerrain(creatureId) {
  return ['cleo', 'strauk', 'samurai_saga'].includes(baseId(creatureId));
}

// v1.39: 戦闘UI用の状態は効果文を解析せず、実装IDから明示的に判定する。
// 新しいクリーチャーはここへ分類し、未登録時は誤って無効表示せずconditionalへ退避する。
const CREATURE_EFFECT_CONTEXT = Object.freeze({
  gecko:'battle', orphe:'toll', nome:'battle', gaston:'battle', cleo:'battle', magado:'none',
  qbaby:'battle', cresteria:'placement', kbaby:'toll', ludi:'battle', garble:'battle',
  barbaro:'battle', detropas:'battle', goagoa:'battle', fugorm:'placement', bedebero:'spell',
  zati:'battle', pakawata:'battle', avalanche:'battle', bonerex:'battle', morbill:'battle',
  mimic:'battle', beruf:'battle', grayble:'battle', trooper:'other', survey:'battle',
  palecoral:'turn', bunnyhop:'spell', strauk:'battle', samurai_saga:'battle', marlow:'land',
  shuterio:'battle', gaust:'placement', alter:'battle', toxy:'exile', kamadoma:'other',
  swordgear:'battle', komao:'other',
});
function terrainBreakdown(r, tile, attackerCreature = null) {
  const o = r.owners[tile];
  if (!o) return null;
  const c = CREATURES[baseId(o.creature)] || {};
  const landElem = tileElem(r, tile);
  const universal = universalTerrain(o.creature);
  const affinity = universal ? 'universal' : c.elem === landElem ? 'match' : 'mismatch';
  const baseBonus = affinity === 'mismatch' ? 0 : (o.level || 1) * 10;
  const abilityBonus = baseId(o.creature) === 'nome' && baseBonus
    ? (isEvolved(o) ? 20 : 10) : 0;
  const potentialBonus = baseBonus + abilityBonus;
  const nullifiedBy = baseId(attackerCreature) === 'garble' && potentialBonus ? 'garble' : null;
  return {
    level: o.level || 1,
    tileElem: landElem,
    creatureElem: c.elem || 'neutral',
    affinity,
    baseBonus,
    abilityBonus,
    potentialBonus,
    appliedBonus: nullifiedBy ? 0 : potentialBonus,
    nullifiedBy,
  };
}
function effectUi(state, reason, text) {
  return { state, reason: reason || '', text: text || '' };
}
function creatureEffectUi(r, creatureId, tile, role, context = 'battle', result = null) {
  const bid = baseId(creatureId);
  const c = CREATURES[bid];
  if (!c || (!c.fx && !c.evoFx)) return null;
  const o = tile != null ? r.owners[tile] : null;
  const evolved = !!(o && o.creature === creatureId && isEvolved(o)) || /_f$/.test(creatureId);
  const text = evolved ? (c.evoFx || c.fx || '') : (c.fx || '');
  const kind = CREATURE_EFFECT_CONTEXT[bid];
  const inactive = reason => effectUi('inactive', reason, text);
  const active = reason => effectUi('active', reason, text);
  const conditional = reason => effectUi('conditional', reason, text);
  if (!kind) return conditional('表示条件未登録');
  if (kind === 'none') return null;
  if (kind !== 'battle') {
    if (context === 'land_stop' && kind === 'toll') return active('通行料に適用');
    const reasons = { toll:'通行料効果', placement:'召喚・配置時のみ', spell:'スペル対象時のみ',
      turn:'ターン開始時のみ', land:'自領地停止時のみ', exile:'カード廃棄時のみ', other:'この戦闘では発動しない' };
    // 進化後だけ戦闘効果を持つカードを個別に扱う。
    if (bid === 'trooper' || (bid === 'bunnyhop' && evolved)) return inactive('スペル使用時のみ');
    if (bid === 'kamadoma' && evolved && role === 'attacker') {
      if (!result) return conditional('戦闘勝利時');
      return result.win ? active('戦闘勝利で発動') : inactive('侵略失敗');
    }
    if (bid === 'komao' && evolved) {
      const owner = o ? pById(r, o.player) : null;
      const n = owner ? chainCount(r, owner.id, 'earth') : 0;
      return n ? active(`土領地${n}つ`) : inactive('土領地なし');
    }
    return inactive(reasons[kind] || 'この戦闘では発動しない');
  }
  const terrain = tile != null ? terrainBreakdown(r, tile, role === 'attacker' ? creatureId : null) : null;
  const owner = role === 'attacker' && r.battle
    ? pById(r, r.battle.attacker)
    : (o ? pById(r, o.player) : null);
  switch (bid) {
    case 'gecko': return role === 'attacker' ? active('攻撃時に発動') : inactive('攻撃時のみ');
    case 'nome': return role === 'defender'
      ? (terrain && terrain.baseBonus ? active('地形補正に加算') : inactive('領地属性不一致'))
      : inactive('防衛時のみ');
    case 'gaston':
      if (!result) return conditional('敗北時');
      return (role === 'defender' ? result.win : !result.atkSurvived)
        ? active('敗北したため発動') : inactive('敗北していない');
    case 'cleo': case 'strauk': case 'samurai_saga':
      return role === 'defender' ? active('全属性に適応') : inactive('防衛領地でのみ');
    case 'qbaby':
      return role === 'defender' && terrain && terrain.tileElem === 'fire'
        ? active('火領地の防衛に適用') : inactive(role === 'defender' ? '火領地ではない' : '防衛時のみ');
    case 'ludi':
      if (role !== 'defender') return inactive('防衛時のみ');
      if (!result) return conditional('相手のウェポン選択時');
      return result.atkSupport && result.atkSupport.kind !== 'none'
        ? active('相手ウェポンを無効化') : inactive('相手ウェポンなし');
    case 'garble': return role === 'attacker'
      ? (terrain && terrain.potentialBonus ? active('地形補正を無効化') : inactive('相手に地形補正なし'))
      : inactive('攻撃時のみ');
    case 'barbaro':
      if (role !== 'defender') return inactive('防衛成功時のみ');
      if (!result) return conditional('防衛成功時');
      return result.win ? inactive('領地を奪われた') : active('防衛成功で発動');
    case 'detropas': {
      if (role !== 'attacker') return inactive('攻撃時のみ');
      const n = owner ? chainCount(r, owner.id, 'fire') : 0;
      return n ? active(`火領地${n}つ`) : conditional('火領地数に応じて発動');
    }
    case 'goagoa':
      if (role !== 'defender') return inactive('防衛成功時のみ');
      if (!result) return conditional('防衛成功時');
      return result.win ? inactive('領地を奪われた') : active('防衛成功で発動');
    case 'zati':
      if (role !== 'attacker') return inactive('侵略成功時のみ');
      if (!result) return conditional('侵略成功時');
      return result.win ? active('侵略成功で発動') : inactive('侵略失敗');
    case 'pakawata': return role === 'defender' ? active('先制攻撃') : inactive('防衛時のみ');
    case 'avalanche': return role === 'attacker' ? active('侵略時に発動') : inactive('侵略時のみ');
    case 'bonerex': return role === 'defender' ? active('防衛DFに加算') : inactive('防衛時のみ');
    case 'morbill': return role === 'attacker' ? active('侵略時に発動') : inactive('侵略時のみ');
    case 'mimic': return active('戦闘開始時に発動');
    case 'beruf': return o && (o.shade || 0) > 0 ? active(`影${o.shade}`) : inactive('蓄積した影なし');
    case 'grayble': return role === 'attacker'
      ? (o && (o.dmg || 0) > 0 ? active('相手が負傷済み') : inactive('相手が負傷していない'))
      : inactive('侵略時のみ');
    case 'survey': case 'shuterio': return conditional('クリーチャー支援選択時');
    case 'alter': {
      const n = owner ? (owner.exile || []).length : 0;
      return n ? active(`廃棄${n}枚`) : inactive('廃棄札なし');
    }
    case 'swordgear':
      if (!result) return conditional('ソード系ウェポン選択時');
      return result.selfSupport && ['weapon','gweapon'].includes(result.selfSupport.cardId)
        ? active('ソード系ウェポンに適用') : inactive('対象ウェポンなし');
    default: return conditional('条件成立時');
  }
}
function battleEffectStates(r, battle, result = null) {
  if (!battle) return { attacker: null, defender: null };
  const owner = r.owners[battle.tile];
  const resultBase = result ? Object.assign({ attacker: battle.attacker }, result) : null;
  return {
    attacker: battle.atkCreature ? creatureEffectUi(r, battle.atkCreature, battle.tile, 'attacker', 'battle',
      resultBase && Object.assign({}, resultBase, { selfSupport: resultBase.atkSupport })) : null,
    defender: owner ? creatureEffectUi(r, owner.creature, battle.tile, 'defender', 'battle',
      resultBase && Object.assign({}, resultBase, { selfSupport: resultBase.defSupport })) : null,
  };
}
function landCombatUi(r, tile) {
  const o = r.owners[tile];
  if (!o) return null;
  const terrain = terrainBreakdown(r, tile);
  return Object.assign({}, terrain, {
    tile,
    effect: creatureEffectUi(r, o.creature, tile, 'defender', 'land_stop'),
  });
}
function cardName(cardId) {
  return (CREATURES[cardId] || SPELLS[cardId] || SUPPORTS[cardId] || { name: cardId }).name;
}
function placedToxyCount(r, playerId) {
  return r.owners.reduce((n, o) => n + (o && o.player === playerId && baseId(o.creature) === 'toxy' ? 1 : 0), 0);
}
function exileCard(r, p, cardId, source = 'effect', battle = false) {
  if (!Array.isArray(p.exile)) p.exile = [];
  p.exile.push(cardId);
  if (!Array.isArray(r.effectQueue)) r.effectQueue = [];
  const triggers = placedToxyCount(r, p.id);
  for (let n = 0; n < triggers; n++)
    r.effectQueue.push({ type: 'toxy', owner: p.id, card: cardId, source, battle: !!battle, order: n + 1 });
  return triggers;
}
function finishEffectResume(r, resume) {
  r.effectResume = null;
  if (!resume) return;
  const p = resume.player ? pById(r, resume.player) : null;
  if (resume.type === 'roll') return p && !p.bankrupt ? askRoll(r, p) : settleAll(r);
  if (resume.type === 'market') return p && !p.bankrupt ? askMarket(r, p) : settleAll(r);
  if (resume.type === 'placement') return p ? resumeAfterPlacement(r, p, resume.pend || {}) : settleAll(r);
  if (resume.type === 'post_battle') return continuePostBattle(r);
}
function processEffectQueue(r) {
  if (!Array.isArray(r.effectQueue)) r.effectQueue = [];
  while (r.effectQueue.length) {
    const effect = r.effectQueue.shift();
    if (!effect || effect.type !== 'toxy') continue;
    const owner = pById(r, effect.owner);
    if (!owner || owner.bankrupt) continue;
    const targets = r.players.filter(q => !q.bankrupt && q.id !== owner.id && (q.hand || []).length > 0);
    if (!targets.length) {
      log(r, `【瘴気連鎖】${owner.name}が廃棄したが、手札のある敵がいないため不発`);
      continue;
    }
    ask(r, owner.id, 'toxy_target', `【瘴気連鎖】手札を捨てさせる敵を選ぶ(${effect.order}体目)`,
      targets.map(q => ({ id: 'tx:' + q.id, player: q.id, label: `${q.name}(手札${q.hand.length}枚)` })));
    Object.assign(r.pending[owner.id], { effect });
    return true;
  }
  const resume = r.effectResume;
  return finishEffectResume(r, resume);
}
function resumeAfterExileEffects(r, resume) {
  if (resume) r.effectResume = resume;
  return processEffectQueue(r);
}
function askMandatoryHandExile(r, p, type, prompt, extra = {}) {
  if (!p.hand.length) return false;
  ask(r, p.id, type, prompt, p.hand.map((c, i) => ({
    id: (type === 'gaust_exile' ? 'gx:' : 'fe:') + i, card: c,
    label: `${cardName(c)}を廃棄`,
  })));
  Object.assign(r.pending[p.id], extra);
  return true;
}
function resumeAfterPlacement(r, p, pend) {
  if (pend.after === 'swap') return askRoll(r, p);
  if (pend.after === 'battle') return continuePostBattle(r);
  return endTurn(r);
}
function onCreatureSummoned(r, p, creatureId, reason, tile) {
  if (!['summon', 'swap', 'battle'].includes(reason)) return false;
  if (baseId(creatureId) === 'komao' && Number.isInteger(tile)) {
    const before = tileElem(r, tile);
    if (TILES[tile]?.e === 'earth') delete r.elemOv[tile];
    else r.elemOv[tile] = 'earth';
    log(r, `【地脈転成】${CREATURES.komao.name}が土地${tile}を${before === 'earth' ? '土属性に固定した' : '土属性へ変えた'}`);
  }
  if (baseId(creatureId) === 'cresteria' && reason !== 'battle') {
    gainToDeck(r, p, ['shield'], 'cresteria');
    log(r, `【真珠】${CREATURES.cresteria.name}の召喚でウェポン「シールド」1枚を山札へ加えた`);
  }
  if (baseId(creatureId) === 'trooper' && !isEvolved({ creature: creatureId })) {
    gainToDeck(r, p, ['sp_flame_vortex'], 'trooper');
    log(r, `【火種】${CREATURES.trooper.name}の配置で「炎の渦」1枚を山札へ加えた`);
  }
  if (baseId(creatureId) === 'kamadoma') {
    p.hand.push('weapon');
    r.lastGain = { player: p.id, n: 1, cards: ['weapon'], reason: 'kamadoma', at: stamp(r) };
    log(r, `【武具錬成】${CREATURES.kamadoma.name}の配置で${p.name}はソード1枚を手札に加えた`);
  }
  if (baseId(creatureId) === 'gaust') {
    const got = drawCards(r, p, 1);
    if (got) r.lastDraw = { player: p.id, n: got, reason: 'gaust', at: stamp(r) };
    log(r, `【魂の選別】${CREATURES.gaust.name}の配置で${got ? 'カードを1枚引いた' : '引けるカードがなかった'}`);
    if (askMandatoryHandExile(r, p, 'gaust_exile', '【魂の選別】廃棄する手札を1枚選ぶ', { after: reason, tile }))
      return true;
  }
  if (baseId(creatureId) !== 'samurai_saga' || !Number.isInteger(tile)) return false;
  ask(r, p.id, 'samurai_elem', '【地脈改変】この土地の属性を変更しますか?', [
    { id: 'se:fire', label: '火属性に変更' },
    { id: 'se:water', label: '水属性に変更' },
    { id: 'se:earth', label: '土属性に変更' },
    { id: 'se:wind', label: '風属性に変更' },
    { id: 'se:none', label: '変更しない' },
  ]);
  Object.assign(r.pending[p.id], { tile, after: reason });
  return true;
}
function tollOf(r, i) {
  const o = r.owners[i];
  let rate = 1;
  if (baseId(o.creature) === 'orphe') rate += 0.2;                       // 清流
  if (baseId(o.creature) === 'kbaby') rate *= isEvolved(o) ? 2 : 1.5;   // 王の徴収
  return Math.round(landValue(r, i) * 0.25 * rate);
}
// スペルの直接ダメージ処理: 不動(ベデベロ-10)・死影(ベルーフDF+10/上限なし)・撃破は捨て札
// 戻り値: true=撃破して空き地化
function spellDamage(r, i, raw, srcName, isSpellCard = true) {
  const o = r.owners[i];
  if (!o) return false;
  const cE = CREATURES[o.creature];
  if (isSpellCard && baseId(o.creature) === 'bunnyhop' && !isEvolved(o)) {
    log(r, `【耐魔】バニホップは${srcName}のダメージを受けない`);
    return false;
  }
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
  if (dmg > 0 && baseId(o.creature) === 'beruf') {
    o.shade = (o.shade || 0) + 1;
    log(r, `【死影】${cE.name}は受けた痛みを影に変えた(DF+${o.shade * 10})`);
  }
  return false;
}
// ===== v0.51 資産経済 =====
const LV_MUL = { 1: 1, 2: 2.5, 3: 8, 4: 20 };  // v1.07: 高Lv領地1つで勝負が決まりすぎないよう緩和
const CHAIN_MUL = [0, 1.0, 1.4, 1.8, 2.2, 2.6];  // 同属性所有数→倍率(5以上は2.6)
const ASSET_GOAL = 8000, ASSET_REACH = 7000;
function landValue(r, i) {
  const o = r.owners[i];
  if (!o) return 0;
  const chain = Math.min(5, chainCount(r, o.player, tileElem(r, i)));
  return Math.round(100 * LV_MUL[o.level] * CHAIN_MUL[chain]);
}
const CASTLE_LAND_RATE = 0.2;
const castleLandBonus = lands => Math.round(lands * CASTLE_LAND_RATE);
const castleLapBonus = completedLaps => Math.max(0, Number(completedLaps) || 0) * RULES.castleBonusPerLap;
// 総資産 = 所持金+地価合計+称号500G
function points(r, p) {
  const lands = r.owners.reduce((n, o, i) => n + (o && o.player === p.id ? landValue(r, i) : 0), 0);
  const titles = (r.titles.conqueror === p.id ? 500 : 0) + (r.titles.pilgrim === p.id ? 500 : 0);
  return p.gold + lands + titles;
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
  clearBotTimer(r);
  clearUltTimer(r);
  clearTurnTransitionTimer(r);
  r.turnTransition = null;
  r.phase = 'ended'; r.winner = p.id; r.pending = {};
  log(r, `🏆 ${p.name}が${why} 勝利!`);
}

// ===== 手番進行 =====
function ask(r, playerId, type, prompt, options) {
  r.promptSeq = (r.promptSeq || 0) + 1;
  r.pending[playerId] = { type, prompt, options, turnEpoch: r.turnEpoch || 0,
    promptId: `${r.turnEpoch || 0}-${r.promptSeq}` };
  if (r.phase === 'playing' && playerId === cur(r)?.id && r.turnReadyAt > Date.now())
    r.pending[playerId].availableAt = r.turnReadyAt;
}
const ULT_CUTIN_MS = 5000;
function clearUltTimer(r) {
  if (r.ultTimer) clearTimeout(r.ultTimer);
  r.ultTimer = null;
}
function armUltSequence(r) {
  clearUltTimer(r);
  const seq = r.ultSequence;
  if (!seq || seq.resolved) return;
  r.ultTimer = setTimeout(() => {
    r.ultTimer = null;
    if (!r.ultSequence || r.ultSequence.id !== seq.id || r.ultSequence.resolved) return;
    resolveUltSequence(r);
    touch(r); broadcast(r);
  }, Math.max(0, seq.resolveAt - Date.now()));
}
function beginUltSequence(r, p, data = {}) {
  p.ultUsed = true;
  const startedAt = Date.now();
  const id = crypto.randomBytes(6).toString('hex');
  r.ultSequence = { id, player: p.id, charId: p.charId, name: ULTS[p.charId].name,
    desc: ULTS[p.charId].desc, startedAt, resolveAt: startedAt + ULT_CUTIN_MS,
    resolved: false, data };
  r.lastUlt = { player: p.id, charId: p.charId, name: ULTS[p.charId].name,
    sequenceId: id, at: stamp(r) };
  ask(r, p.id, 'ult_resolve', `【${ULTS[p.charId].name}】発動中…`, []);
  log(r, `⚡ ${p.name}が固有スキル【${ULTS[p.charId].name}】を発動!`);
  armUltSequence(r);
}
function resolveUltSequence(r) {
  const seq = r.ultSequence;
  if (!seq || seq.resolved) return;
  seq.resolved = true;
  const p = pById(r, seq.player);
  if (!p || p.bankrupt || r.phase !== 'playing') { r.ultSequence = null; return; }
  delete r.pending[p.id];
  const d = seq.data || {};
  if (seq.charId === 'redani') {
    const dice = d.dice || [1, 1, 1], sum = dice.reduce((n, x) => n + x, 0);
    r.ultSequence = null;
    return performMove(r, p, sum, { value: dice[0], multi: dice }, `3つのダイスで${sum}を出した!(${dice.join('+')})`);
  }
  if (seq.charId === 'linnei') {
    r.halfMarket = p.id;
    log(r, `${p.name}は現在地で水鏡のショップを開いた(全品半額!)`);
    r.ultSequence = null;
    return askMarket(r, p);
  }
  if (seq.charId === 'grease') {
    r.barrier[p.id] = true;
    for (const [ti] of Object.entries(r.curses))
      if (r.owners[ti] && r.owners[ti].player === p.id) delete r.curses[ti];
    log(r, `🛡 ${p.name}の全領地に大結界が張られた(次の手番まで侵略不可)`);
  } else if (seq.charId === 'adel') {
    const targets = [];
    for (const i of d.targets || []) {
      const o = r.owners[i];
      if (!o || o.player !== p.id) continue;
      const amount = Math.min(o.dmg || 0, 20);
      if (amount > 0) o.dmg -= amount;
      o.iceWard = true;
      targets.push({ tile: i, amount, creature: o.creature, df: 10 });
    }
    r.lastHeal = { player: p.id, source: 'ult_adel', targets, at: stamp(r) };
    log(r, `❄ ${p.name}の配置クリーチャー全員を回復し氷晶の守りを与えた`);
    spellFx(r, 'ult_adel', targets.map(t => t.tile), p.id, { targets });
  } else if (seq.charId === 'mio') {
    p.pos = d.target;
    r.ultSequence = null;
    return resolveTile(r, p);
  } else if (seq.charId === 'lia') {
    const results = [];
    for (const i of d.targets || []) {
      const before = r.owners[i];
      if (!before || before.player === p.id) continue;
      r.tileFx[i] = r.tileFx[i] || {}; r.tileFx[i].vortex = true;
      const creature = before.creature;
      results.push({ tile: i, creature, damage: 10,
        defeated: spellDamage(r, i, 10, '紅蓮の方程式', false) });
    }
    log(r, `🔥 ${p.name}は${results.length}か所に炎の渦を発生させた`);
    spellFx(r, 'sp_flame_vortex', results.map(x => x.tile), p.id,
      { source: 'ult_lia', sequence: true, results });
  } else if (seq.charId === 'villa') {
    const steps = Math.max(0, Number(d.steps) || 0);
    if (!steps) {
      r.ultSequence = null;
      return askRoll(r, p);
    }
    p.bonusRollPending = true;
    r.ultSequence = null;
    return performMove(r, p, steps,
      { value: steps, ultimate: true, villaUlt: true, presentation: 'villa_move', moveSteps: steps },
      `【墓守の協奏曲】廃棄${steps}枚の力で${steps}マス進んだ`);
  } else if (seq.charId === 'nerasio') {
    const elem = d.elem;
    const targets = [...new Set((d.targets || []).map(Number))].filter(i => {
      const o = r.owners[i];
      return i >= 0 && i < TILES.length && TILES[i].t === 'land' && o && o.player === p.id;
    }).slice(0, 2);
    if (!['fire', 'water', 'earth', 'wind'].includes(elem) || !targets.length) {
      r.ultSequence = null;
      return askRoll(r, p);
    }
    for (const i of targets) {
      if (TILES[i].e === elem) delete r.elemOv[i];
      else r.elemOv[i] = elem;
    }
    updateTitles(r);
    r.lastEvent = { type: 'ult_nerasio', player: p.id, targets: targets.slice(), elem, at: stamp(r) };
    log(r, `🌐 ${p.name}は【天地転成】で領地${targets.join('・')}を${ELEM_JA[elem]}属性へ再構成した`);
  }
  r.ultSequence = null;
  return askRoll(r, p);
}
function askRoll(r, p) {
  const opts = [{ id: 'roll', label: '🎲 サイコロを振る' }];
  const ultAvailable = p.charId === 'lia'
    ? r.owners.some(o => o && o.player !== p.id)
    : p.charId === 'adel'
      ? r.owners.some(o => o && o.player === p.id)
      : p.charId === 'villa'
        ? (p.exile || []).length > 0
      : p.charId === 'nerasio'
        ? r.owners.some((o, i) => o && o.player === p.id && TILES[i].t === 'land')
      : true;
  if (!p.fixedDice && !p.ultUsed && ULTS[p.charId] && ultAvailable)
    opts.push({ id: 'ult', label: `固有スキル【${ULTS[p.charId].name}】` });
  // v0.60: 呪文は1ターンに1回まで(黄金+ひらめきの無限ループ対策)
  for (const sid of p.spellCast ? [] : [...new Set(p.hand.filter(c => SPELLS[c]))]) {
    const spellCost = effectiveSpellCost(r, p, sid);
    if (spellCost > p.gold) continue;
    if (sid === 'sp_weaken' &&
        !r.owners.some(o => o && o.player !== p.id)) continue;
    if (sid === 'sp_quake' &&
        !r.owners.some(o => o && o.player !== p.id && o.level >= 2)) continue;
    if (sid === 'sp_move' &&
        r.owners.filter(o => o && o.player === p.id).length < 2) continue;
    if (sid === 'sp_step' && !stepSources(r, p).length) continue;
    if (sid === 'sp_wind_shift' && !p.dir) continue;
    if ((sid === 'sp_volcanic_core' || sid === 'sp_abyssal_pearl' ||
         sid === 'sp_earth_mother_stone' || sid === 'sp_sky_crystal') &&
        !r.owners.some((o, i) => o && o.player === p.id && tileElem(r, i) !== ELEM_OF_SPELL[sid])) continue;
    if (sid === 'sp_flame_vortex' && !r.owners.some(o => o && o.player !== p.id)) continue;
    if (sid === 'sp_bedrock_uplift' &&
        !r.owners.some(o => o && o.player === p.id && (o.dmg || 0) > 0)) continue;
    if (sid === 'sp_swap' &&
        (!r.owners.some(o => o && o.player === p.id) ||
         !p.hand.some(c => CREATURES[c] && CREATURES[c].cost + effectiveSpellCost(r, p, 'sp_swap') <= p.gold))) continue;
    opts.push({ id: 'sp:' + sid, card: sid, cost: spellCost,
      label: `呪文「${SPELLS[sid].name}」を唱える${spellCost ? `(−${spellCost}G)` : ''}` });
  }
  ask(r, p.id, 'roll', 'あなたの手番です', opts);
}
function askLiaUlt(r, p, selected = []) {
  const valid = new Set(r.owners.map((o, i) => o && o.player !== p.id ? i : null).filter(i => i !== null));
  const chosen = [...new Set(selected.map(Number))].filter(i => valid.has(i)).slice(0, 3);
  const opts = [];
  for (const i of valid) {
    if (chosen.length >= 3 && !chosen.includes(i)) continue;
    const o = r.owners[i];
    opts.push({ id: 'lu:' + i, label: `${chosen.includes(i) ? '✓ ' : ''}#${i} ${pById(r, o.player).name}の${CREATURES[o.creature].name}(Lv${o.level})` });
  }
  if (chosen.length) opts.push({ id: 'lu:confirm', label: `決定(${chosen.length}か所)` });
  opts.push({ id: 'lu:cancel', label: 'やめる' });
  ask(r, p.id, 'ult_lia', '🔥【紅蓮の方程式】炎の渦を発生させる敵領地を1〜3か所選択', opts);
  r.pending[p.id].selected = chosen;
}
function ultimateStatus(r, p) {
  const pending = r.pending[p.id];
  const canActivate = !!(r.phase === 'playing' && cur(r) === p && pending && pending.type === 'roll' &&
    pending.options.some(o => o.id === 'ult'));
  if (canActivate) return { canActivate: true, used: false, reasonCode: '', reason: '' };
  if (p.ultUsed) return { canActivate: false, used: true, reasonCode: 'used', reason: 'このゲームでは使用済みです' };
  if (r.phase !== 'playing') return { canActivate: false, used: false, reasonCode: 'wrong_phase', reason: 'ゲーム中のみ使用できます' };
  if (cur(r) !== p) return { canActivate: false, used: false, reasonCode: 'not_turn', reason: '他プレイヤーの手番です' };
  if (!pending || pending.type !== 'roll') return { canActivate: false, used: false, reasonCode: 'wrong_step', reason: 'ダイス選択時に使用できます' };
  return { canActivate: false, used: false, reasonCode: 'prerequisite', reason: '発動条件を満たしていません' };
}
function askNerasioUlt(r, p, selected = []) {
  const valid = new Set(r.owners.map((o, i) =>
    o && o.player === p.id && TILES[i].t === 'land' ? i : null).filter(i => i !== null));
  const chosen = [...new Set(selected.map(Number))].filter(i => valid.has(i)).slice(0, 2);
  const opts = [];
  for (const i of valid) {
    if (chosen.length >= 2 && !chosen.includes(i)) continue;
    const o = r.owners[i];
    opts.push({ id: 'nu:' + i, tile: i,
      label: `${chosen.includes(i) ? '✓ ' : ''}#${i} ${CREATURES[o.creature].name}(Lv${o.level}・${ELEM_JA[tileElem(r, i)]})` });
  }
  if (chosen.length) opts.push({ id: 'nu:confirm', label: `決定(${chosen.length}か所)` });
  opts.push({ id: 'nu:cancel', label: 'やめる' });
  ask(r, p.id, 'ult_nerasio_land', '🌐【天地転成】属性を再構成する自領地を1〜2か所選択', opts);
  r.pending[p.id].selected = chosen;
}
function askNerasioElem(r, p, targets) {
  const selected = [...new Set((targets || []).map(Number))].filter(i => {
    const o = r.owners[i];
    return TILES[i]?.t === 'land' && o && o.player === p.id;
  }).slice(0, 2);
  if (!selected.length) return askRoll(r, p);
  ask(r, p.id, 'ult_nerasio_elem', '🌐【天地転成】変更後の属性を選択',
    ['fire','water','earth','wind'].map(elem => ({ id: 'ne:' + elem, elem,
      label: `${ELEM_JA[elem]}属性へ変更` })).concat({ id: 'ne:cancel', label: '領地選択へ戻る' }));
  r.pending[p.id].selected = selected;
}
function startVillaRecovery(r, p, availableAt = 0, selected = []) {
  const valid = new Set((p.exile || []).map((_, i) => i));
  const chosen = [...new Set(selected.map(Number))].filter(i => valid.has(i)).slice(0, 3);
  const opts = [];
  (p.exile || []).forEach((c, i) => {
    if (chosen.length >= 3 && !chosen.includes(i)) return;
    opts.push({ id: 'vr:' + i, card: c,
      label: `${chosen.includes(i) ? '✓ ' : ''}${cardName(c)}` });
  });
  opts.push({ id: 'vr:confirm', label: `決定(${chosen.length}枚回収)` });
  ask(r, p.id, 'ult_villa_recover',
    `【墓守の協奏曲】廃棄から0〜3枚を手札へ戻す ─ 選択中 ${chosen.length}/3`, opts);
  Object.assign(r.pending[p.id], { selected: chosen });
  if (availableAt && Date.now() < availableAt) r.pending[p.id].availableAt = availableAt;
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
  r.turnEpoch = (r.turnEpoch || 0) + 1;
  const p = cur(r);
  // テレビの手番交代演出が終わる前にスマホが次ターンを開始しないためのサーバーロック。
  r.turnReadyAt = Date.now() + presentationMs(r, p.id, 4300);
  p.spellCast = false;  // 呪文は1ターンに1回まで
  p.gale = false;
  p.fixedDice = null;
  p.blade = false;  // 血染めの刃: 次の手番開始まで侵略しなければ解除
  // この人が掛けた呪いは効果終了(「あなたの次の手番まで」)
  for (const [ti, c] of Object.entries(r.curses))
    if (c.by === p.id) { delete r.curses[ti]; log(r, `衰弱の呪い(${ti}番の土地)の効果が切れた`); }
  // この人の結界は効果終了
  if (r.barrier[p.id]) { delete r.barrier[p.id]; log(r, `${p.name}の結界が解けた`); }
  if (chainCount(r, p.id, 'water') >= 2) {
    const healed = [];
    r.owners.forEach((o, i) => {
      if (!o || o.player !== p.id || baseId(o.creature) !== 'palecoral' || !(o.dmg > 0)) return;
      const amount = Math.min(o.dmg, isEvolved(o) ? 20 : 10);
      if (amount <= 0) return;
      o.dmg -= amount;
      healed.push({ tile: i, amount, creature: o.creature });
      log(r, `【珊瑚再生】${CREATURES[o.creature].name}のHPが${amount}回復した`);
    });
    if (healed.length) r.lastHeal = { player: p.id, source: 'palecoral', targets: healed, at: stamp(r) };
  }
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
  p.blade = false;
  r.lastEvent = { type: 'bankrupt', player: p.id, at: stamp(r) };
  log(r, `💥 ${p.name}は破産した! ゲームから脱落…`);
  delete r.pending[p.id];
  const alive = r.players.filter(q => !q.bankrupt);
  if (alive.length === 1) return declareWin(r, alive[0], '最後の生き残りとなった!');
  return endTurn(r);
}
const HAND_LIMIT = 7;
function clearTurnTransitionTimer(r) {
  if (r.turnTransitionTimer) clearTimeout(r.turnTransitionTimer);
  r.turnTransitionTimer = null;
}
function advanceTurnNow(r) {
  if (r.phase !== 'playing' || r.winner) return;
  do {
    r.turn = (r.turn + 1) % r.players.length;
    if (r.turn === 0) r.round++;
  } while (r.players[r.turn].bankrupt);
  beginTurn(r);
}
function completeTurnTransition(r, transitionId, reason = 'board') {
  const tr = r.turnTransition;
  if (!tr || tr.id !== transitionId) return false;
  clearTurnTransitionTimer(r);
  r.turnTransition = null;
  if (reason === 'timeout') console.warn(`room ${r.code}: presentation completion timeout (${transitionId})`);
  advanceTurnNow(r);
  return true;
}
function armTurnTransition(r) {
  clearTurnTransitionTimer(r);
  const tr = r.turnTransition;
  if (!tr) return;
  r.turnTransitionTimer = setTimeout(() => {
    r.turnTransitionTimer = null;
    if (!completeTurnTransition(r, tr.id, 'timeout')) return;
    touch(r);
    broadcast(r);
  }, Math.max(0, tr.deadline - Date.now()));
}
function beginTurnTransition(r, p) {
  if (r.turnTransition) return;
  // Static engine tests and rooms that have never had a TV connected retain the
  // synchronous path. Once a board has connected, a disconnect uses the watchdog.
  if (!r.boardSeen) return advanceTurnNow(r);
  const startedAt = Date.now();
  r.turnTransition = {
    id: crypto.randomBytes(8).toString('hex'),
    fromPlayer: p ? p.id : null,
    startedAt,
    deadline: startedAt + TURN_TRANSITION_TIMEOUT_MS,
  };
  armTurnTransition(r);
}
function endTurn(r) {
  // 手札上限: 8枚以上なら7枚になるまで捨てさせてから手番を渡す
  const p = cur(r);
  // 墓守の協奏曲の停止マス処理後は、手番を渡さず通常のダイスへ戻る。
  if (p && p.bonusRollPending && !p.bankrupt && r.phase === 'playing') {
    p.bonusRollPending = false;
    return askRoll(r, p);
  }
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
  beginTurnTransition(r, p);
}

const GATE_TILE = TILES.findIndex(t => t.t === 'gate');
function performMove(r, p, steps, meta, moveLabel) {
  // 初回の移動時: ダイスの後に進行方向を選ぶ(矢印UI)
  if (!p.dir) {
    const at = stamp(r);
    r.lastDice = Object.assign({ player: p.id, at, noMove: true }, meta,
      meta && meta.villaUlt ? { suppressPresentation: true } : null);  // ヴィラ演出は方向決定後に見せる
    r.dirPend = { steps, meta: Object.assign({}, meta, { at }), moveLabel };
    return ask(r, p.id, 'direction', `${steps}が出た! どちらの方向へ進む?`, [
      { id: 'dir:1', label: '⬅ 左回りに進む' },
      { id: 'dir:-1', label: '右回りに進む ➡' },
    ]);
  }
  r.lastDice = Object.assign({ player: p.id, at: stamp(r) }, meta);
  const dir = p.dir || 1;
  let bonus = 0, gotSeal = false, noSeal = false, castleStep = 0, usedSeal = false;
  let completedLaps = Math.max(0, (p.lap || 1) - 1);
  for (let s2 = 0; s2 < steps; s2++) {
    p.pos = (p.pos + dir + TILES.length) % TILES.length;
    if (p.pos === GATE_TILE && !p.seal) { p.seal = true; gotSeal = true; }
    if (p.pos === 0) {
      castleStep = s2 + 1;
      p.lap = (p.lap || 1) + 1;  // 刻印の有無に関わらず周回は進む
      completedLaps = Math.max(1, p.lap - 1);
      if (p.seal) { bonus += castleLapBonus(completedLaps); p.seal = false; usedSeal = true; }
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
    // 領地ボーナス: 所有地価合計の20%(v1.07)
    const lands = r.owners.reduce((n, o, i) => n + (o && o.player === p.id ? landValue(r, i) : 0), 0);
    const landRate = CASTLE_LAND_RATE;
    const lb = castleLandBonus(lands);
    p.gold += bonus + lb;
    // 帰還の癒し: 自領地のクリーチャーの負傷を10回復(最大値は超えない)
    const healed = [];
    r.owners.forEach((o, i) => {
      if (o && o.player === p.id && o.dmg > 0) {
        const before = o.dmg;
        o.dmg = Math.max(0, o.dmg - 10);
        const c = CREATURES[o.creature] || CREATURES[baseId(o.creature)] || {};
        healed.push({ tile: i, creature: c.name || o.creature, before, after: o.dmg, amount: before - o.dmg });
      }
    });
    if (healed.length) log(r, `⛨ 帰還の癒し ─ ${p.name}の領地のクリーチャーが回復した(負傷-10 × ${healed.length}体)`);
    const initial = presentationMs(r, p.id, meta.multi ? GAME_TIMING.moveStartDelayMulti : GAME_TIMING.moveStartDelay);
    const availableAt = r.lastDice.at + initial + castleStep * presentationMs(r, p.id, GAME_TIMING.stepMs) +
      presentationMs(r, p.id, GAME_TIMING.castleZoom + GAME_TIMING.castleBreakdown);
    r.lastDice.castle = { usedSeal, completedLaps, bonusPerLap: RULES.castleBonusPerLap,
      baseBonus: bonus, gold: bonus, landValue: lands, landRate,
      landBonus: lb, total: bonus + lb, drew: 1, healed, castleStep, availableAt };
    log(r, `${p.name}は${moveLabel}(城通過 +${bonus}G${lb ? `+領地ボーナス${lb}G` : ''}、カードを選択!)`);
    // 勝利判定: ボーナス込みで総資産8000G以上
    if (points(r, p) >= ASSET_GOAL) {
      return declareWin(r, p, `総資産${points(r, p)}Gで城に凱旋!`);
    }
    return startDraft(r, p, meta && meta.villaUlt ? 'villa_recover' : 'tile', availableAt);
  }
  if (noSeal) {
    const initial = presentationMs(r, p.id, meta.multi ? GAME_TIMING.moveStartDelayMulti : GAME_TIMING.moveStartDelay);
    const availableAt = r.lastDice.at + initial + castleStep * presentationMs(r, p.id, GAME_TIMING.stepMs) +
      presentationMs(r, p.id, GAME_TIMING.castleZoom + GAME_TIMING.castleBreakdown);
    r.lastDice.castle = { usedSeal: false, completedLaps, bonusPerLap: RULES.castleBonusPerLap,
      baseBonus: 0, gold: 0, landValue: 0, landRate: CASTLE_LAND_RATE,
      landBonus: 0, total: 0, drew: 0, healed: [], castleStep, availableAt };
    log(r, `${p.name}は${moveLabel} ─ 刻印がないため一周ボーナスなし…`);
    if (points(r, p) >= ASSET_GOAL) return declareWin(r, p, `総資産${points(r, p)}Gで城に凱旋!`);
  } else {
    r.lastDice.castle = null;
    log(r, `${p.name}は${moveLabel}`);
  }
  if (meta && meta.villaUlt) return startVillaRecovery(r, p,
    r.lastDice && r.lastDice.castle ? r.lastDice.castle.availableAt : 0);
  resolveTile(r, p);
}
function doRoll(r, p) {
  if (p.fixedDice) {
    const dice = p.fixedDice;
    p.fixedDice = null;
    return performMove(r, p, dice, { value: dice, fixed: true }, `呪文で${dice}に固定した`);
  }
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
      .map(c => ({ id: 'summon:' + c, card: c, cost: CREATURES[c].cost,
        label: `${CREATURES[c].name}を召喚(−${CREATURES[c].cost}G)` }));
    opts.push({ id: 'pass', label: '配置しない' });
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
// ムーブ: マスiの隣で移動可能な行き先(空き属性地 or 結界のない敵属性地)
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
function marlowSources(r, p) {
  const sources = [];
  r.owners.forEach((o, i) => {
    if (o && o.player === p.id && baseId(o.creature) === 'marlow') sources.push(i);
  });
  return sources;
}
function marlowDests(r) {
  const dests = [];
  r.owners.forEach((o, i) => {
    if (!o && TILES[i].t === 'land' && tileElem(r, i) === 'wind') dests.push(i);
  });
  return dests;
}
function moveMarlow(r, p, src, dest) {
  const o = r.owners[src];
  if (!o || o.player !== p.id || baseId(o.creature) !== 'marlow' ||
      !Number.isInteger(dest) || !TILES[dest] || r.owners[dest] ||
      TILES[dest].t !== 'land' || tileElem(r, dest) !== 'wind') return false;
  r.owners[dest] = o;
  r.owners[src] = null;
  log(r, `【風渡り】${p.name}のマーローが土地${src}から空いている風属性の土地${dest}へ移動した(Lv${o.level})`);
  updateTitles(r);
  return true;
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
  if (where === '自領地' && marlowSources(r, p).length && marlowDests(r).length)
    opts.push({ id: 'marlow:move', label: '【風渡り】マーローを空いている風属性土地へ移動' });
  if (!opts.length) { log(r, `${p.name}は${where}で休息した(強化・移動できる領地なし)`); return endTurn(r); }
  opts.push({ id: 'pass', label: where === '自領地' ? '何もしない' : '強化しない' });
  ask(r, p.id, 'upgrade', `${where}に到着 ─ ${where === '自領地' ? '領地を強化／マーローを移動' : '強化する領地を選ぶ'}`, opts);
  r.pending[p.id].where = where;
}
function startDraft(r, p, resume, availableAt) {
  refillDeck(r);
  if (r.deck.length < 3) {
    r.deck.push(...makeDeck());
    log(r, '📦 市場の山札が補充された');
  }
  const cards = r.deck.splice(0, 3);
  const ranks = { N: 0, R: 1, L: 2 };
  const info = c => CREATURES[c] || SPELLS[c] || SUPPORTS[c];
  const rarity = c => SUPPORTS[c] ? 'R' : info(c).rarity;
  const top = cards.reduce((a, c) => ranks[rarity(c)] > ranks[a] ? rarity(c) : a, 'N');
  r.draft = { player: p.id, cards, resume, aura: top };
  ask(r, p.id, 'draft', 'カードを1枚選んで獲得(残りは山札の底へ)', cards.map(c => ({
    id: 'take:' + c,
    label: SUPPORTS[c]
      ? `${SUPPORTS[c].name}(${SUPPORTS[c].jinx ? '相手のウェポンを無効化' : SUPPORTS[c].st ? `AT+${SUPPORTS[c].st}` : `DF+${SUPPORTS[c].hp}`})`
      : SPELLS[c]
      ? `呪文「${SPELLS[c].name}」 ${SPELLS[c].desc}`
      : `${CREATURES[c].name}(AT${CREATURES[c].st}/HP${CREATURES[c].hp})${CREATURES[c].fx ? ' ' + CREATURES[c].fx : ''}`,
  })).concat([{ id: 'skip', label: 'カードを加えない(3枚とも山札の底へ)' }]));
  if (availableAt) r.pending[p.id].availableAt = availableAt;
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
  if (!r.shopVisit || r.shopVisit.player !== p.id) makeShopVisit(r, p);
  const opts = r.shopVisit.items.filter(x => !x.sold).map(x => ({
    id: 'buy:' + x.slotId, slotId: x.slotId, card: x.card || null, kind: x.kind,
    price: x.price, label: x.kind === 'remove' ? 'カード削除' : (CREATURES[x.card] || SPELLS[x.card] || SUPPORTS[x.card]).name,
  }));
  opts.push({ id: 'done', label: '市場を出る' });
  ask(r, p.id, 'market', r.shopVisit.half ? '💧 水鏡の市場 ─ 全品半額セール!' : '市場に到着 ─ 商品をタップしてください', opts);
  Object.assign(r.pending[p.id], { shopId: r.shopVisit.id });
}

// ===== 侵略戦闘 =====
function startBattle(r, attacker, tileIdx) {
  const opts = attacker.hand.filter(c => CREATURES[c])
    .map(c => ({ id: 'atk:' + c, card: c, cost: 0,
      label: `${CREATURES[c].name}(AT${CREATURES[c].st})で攻める` }));
  r.battle = { tile: tileIdx, attacker: attacker.id, defender: r.owners[tileIdx].player,
               atkCreature: null, supports: {}, startedAt: stamp(r) };
  ask(r, attacker.id, 'pick_creature', '侵略! 手札からクリーチャーを選べ', opts);
}
function creatureSupportEnabled(creatureId) {
  return ['survey', 'shuterio'].includes(baseId(creatureId));
}
function askSupports(r) {
  const b = r.battle;
  for (const pid of [b.attacker, b.defender]) {
    const p = pById(r, pid);
    const opts = p.hand.filter(c => SUPPORTS[c])
      .map(c => ({ id: 'sup:s:' + c, card: c, cost: 0, label: `${SUPPORTS[c].name}を出す` }));
    const battleCreature = pid === b.attacker ? b.atkCreature : r.owners[b.tile].creature;
    if (creatureSupportEnabled(battleCreature)) {
      let skippedReserved = false;
      p.hand.forEach(c => {
        if (!CREATURES[c]) return;
        if (pid === b.attacker && c === b.atkCreature && !skippedReserved) {
          skippedReserved = true;
          return;
        }
        const cc = CREATURES[c];
        if (cc.cost <= p.gold)
          opts.push({ id: 'sup:c:' + c, card: c, cost: cc.cost,
            label: `【クリーチャーウェポン】${cc.name}(−${cc.cost}G / AT+${cc.st}・DF+${cc.hp})` });
      });
    }
    opts.push({ id: 'sup:none', label: 'ウェポンなしで挑む' });
    ask(r, pid, 'support', '⚔ ウェポンを秘密裏に選べ', opts);
  }
}
function supportChoice(raw) {
  if (!raw || raw === 'none' || raw.kind === 'none') return { kind: 'none' };
  if (typeof raw === 'string') return { kind: 'support', cardId: raw };
  return raw;
}
function supportStats(choice) {
  const c = supportChoice(choice);
  if (c.kind === 'creature') {
    const card = CREATURES[c.cardId];
    return card ? { kind: 'creature', cardId: c.cardId, name: card.name,
      cost: card.cost, st: card.st, hp: card.hp, artId: c.cardId, jinx: false } : null;
  }
  if (c.kind === 'support') {
    const card = SUPPORTS[c.cardId];
    return card ? { kind: 'support', cardId: c.cardId, name: card.name,
      cost: card.cost || 0, st: card.st || 0, hp: card.hp || 0,
      artId: c.cardId, jinx: !!card.jinx } : null;
  }
  return null;
}
function weaponMasteryBonus(creatureId, evolved, support) {
  return baseId(creatureId) === 'swordgear' && support && support.kind === 'support' &&
    (support.cardId === 'weapon' || support.cardId === 'gweapon') ? (evolved ? 20 : 10) : 0;
}
function consumeBattleSupport(r, pid, choice) {
  const c = supportChoice(choice);
  if (c.kind === 'none') return;
  const p = pById(r, pid);
  const idx = p.hand.indexOf(c.cardId);
  if (idx < 0) return;
  p.hand.splice(idx, 1);
  if (c.kind === 'creature') {
    const cost = CREATURES[c.cardId].cost;
    p.gold = Math.max(0, p.gold - cost);
    p.discard.push(c.cardId);
  } else {
    if (SUPPORTS[c.cardId].exileAfterUse) exileCard(r, p, c.cardId, 'battle_support', true);
    else p.discard.push(c.cardId);
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

  // --- ウェポン(ディスアーム・雲隠れによる無効化) ---
  const aSup = supportStats(b.supports[atk.id]);
  const dSup = supportStats(b.supports[def.id]);
  let aJinxed = dSup && dSup.jinx, dJinxed = aSup && aSup.jinx;
  if (baseId(o.creature) === 'ludi' && aSup && !aJinxed) {
    aJinxed = true;
    notes.push('【雲隠れ】' + dc.name + 'が相手のウェポンを無効化!');
  }
  const aEff = aJinxed ? null : aSup, dEff = dJinxed ? null : dSup;

  // --- 進化ステータスの適用(Lv3以上の防衛側/ムーブで進出した攻撃側) ---
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
  const carried = o.dmg || 0;
  const atkEvolved = aEvo || /_f$/.test(b.atkCreature);
  const atkWeaponMastery = weaponMasteryBonus(b.atkCreature, atkEvolved, aEff);
  const defWeaponMastery = weaponMasteryBonus(o.creature, defEvolved, dEff);
  let st = aBase.st + (aEff ? aEff.st : 0) + atkWeaponMastery;
  const atkSoul = baseId(b.atkCreature) === 'alter' ? (atk.exile || []).length * 5 : 0;
  const defSoul = baseId(o.creature) === 'alter' ? (def.exile || []).length * 5 : 0;
  const atkEarthChain = baseId(b.atkCreature) === 'komao' && atkEvolved
    ? chainCount(r, atk.id, 'earth') * 5 : 0;
  const defEarthChain = baseId(o.creature) === 'komao' && defEvolved
    ? chainCount(r, def.id, 'earth') * 5 : 0;
  if (atkSoul) notes.push(`【魂喰らい】廃棄${atk.exile.length}枚で侵略側DF+${atkSoul}!`);
  if (defSoul) notes.push(`【魂喰らい】廃棄${def.exile.length}枚で防衛側DF+${defSoul}!`);
  if (atkEarthChain) notes.push(`【獅子地脈】土領地${atkEarthChain / 5}つで侵略側DF+${atkEarthChain}!`);
  if (defEarthChain) notes.push(`【獅子地脈】土領地${defEarthChain / 5}つで防衛側DF+${defEarthChain}!`);
  if (atkWeaponMastery) notes.push(`【武装熟練】侵略側の攻撃ウェポンAT補正をさらに+${atkWeaponMastery}!`);
  if (defWeaponMastery) notes.push(`【武装熟練】防衛側の攻撃ウェポンAT補正をさらに+${defWeaponMastery}!`);
  if (baseId(b.atkCreature) === 'grayble' && carried > 0) {
    const chase = atkEvolved ? 20 : 10;
    st += chase;
    notes.push(`【追撃】負傷した相手へAT+${chase}!`);
  }
  if (baseId(b.atkCreature) === 'gecko') { st += 10; notes.push('【猛攻】AT+10!'); }
  if (baseId(b.atkCreature) === 'detropas') {
    const fires = r.owners.reduce((n, oo, i) => n + (oo && oo.player === atk.id && tileElem(r, i) === 'fire' ? 1 : 0), 0);
    if (fires) { st += fires * 10; notes.push(`【群れ】火の領地${fires}つでAT+${fires * 10}!`); }
  }
  // スペル継続効果(プレイヤー→土地の順、最後に最低0へ補正)
  const bFx = r.tileFx[b.tile] || {};
  if (atk.blade) { st += 10; notes.push('血染めの刃が侵略者のATを10高めた!'); }
  if (bFx.vortex) { st += 10; notes.push('炎の渦が侵略者を後押し!(AT+10)'); }
  st = Math.max(0, st);

  // --- 防衛側HP(地形・女王・呪い) ---
  const tElem = tileElem(r, b.tile);
  const terrainUi = terrainBreakdown(r, b.tile, b.atkCreature);
  let terrain = terrainUi.appliedBonus;
  if (terrainUi.affinity === 'universal' && dc.elem !== tElem)
    notes.push('【地脈適応】属性を問わず地形補正を獲得!');
  if (terrainUi.abilityBonus) notes.push(`【岩壁】地形補正+${terrainUi.abilityBonus}!`);
  if (terrainUi.nullifiedBy === 'garble') notes.push('【風刃】地形補正を無視!');
  let queenBonus = 0;
  if (tElem === 'fire') for (const no of r.owners)
    if (no && no.player === def.id && baseId(no.creature) === 'qbaby')
      queenBonus = Math.max(queenBonus, isEvolved(no) ? 20 : 10);  // 威光は重複しない(最大のみ)
  if (queenBonus) notes.push(`【女王の威光】防衛DF+${queenBonus}!`);
  const curse = (r.curses[b.tile] && baseId(o.creature) !== 'beruf') ? r.curses[b.tile].hp : 0;
  const hp = dBase.hp + terrain + queenBonus + (dEff ? dEff.hp : 0) - curse;

  // ウェポンは勝敗問わず消費
  for (const [pid, sc] of Object.entries(b.supports)) consumeBattleSupport(r, pid, sc);

  // ===== v0.47 戦闘: AT / HP / DF モデル =====
  // DF(防御) = 地形補正+女王+支援HP。ダメージ = AT − DF(最低0)。負傷は軽減後の実ダメージだけ蓄積
  if (carried) notes.push(`負傷を引き継いでいる(−${carried})`);
  const upliftDF = bFx.uplift ? 10 : 0;
  if (upliftDF) notes.push('リストアが大地を固める!(防衛DF+10)');
  const boneArmor = baseId(o.creature) === 'bonerex' ? (defEvolved ? 20 : 10) : 0;
  if (boneArmor) notes.push(`【骨鎧】防衛DF+${boneArmor}!`);
  const corrosion = baseId(b.atkCreature) === 'morbill' ? (atkEvolved ? 20 : 10) : 0;
  const iceWard = o.iceWard ? 10 : 0;
  if (iceWard) notes.push('【氷晶の勅令】防衛DF+10!');
  const shadeDF = baseId(o.creature) === 'beruf' ? (o.shade || 0) * 10 : 0;
  if (shadeDF) notes.push(`【死影】蓄えた影が防衛DFを${shadeDF}高める!`);
  let defDF = terrain + queenBonus + (dEff ? dEff.hp : 0) + upliftDF + boneArmor + iceWard + shadeDF + defSoul + defEarthChain;
  if (corrosion) {
    const reduced = Math.min(defDF, corrosion);
    defDF = Math.max(0, defDF - corrosion);
    notes.push(`【腐蝕】相手の防衛DFを${reduced}溶かした!`);
  }
  const effHp = Math.max(1, dBase.hp - curse - carried);   // 現在HP(呪いは一時的な減少)
  const atkDmg = st;                                        // AT = 基礎AT+固有+効果+支援
  const atkShadeDF = baseId(b.atkCreature) === 'beruf'
    ? ((mvSrc && mvSrc.shade) || b.atkShade || 0) * 10 : 0;
  if (atkShadeDF) notes.push(`【死影】蓄えた影が侵略側DFを${atkShadeDF}高める!`);
  const atkDF = (aEff ? aEff.hp : 0) + atkShadeDF + atkSoul + atkEarthChain;
  const atkCarried = mvSrc ? (mvSrc.dmg || 0) : (corridor ? (b.atkCarry || 0) : 0);
  const atkEffHp = Math.max(1, aBase.hp - atkCarried);
  const defSt = dBase.st + (dEff ? dEff.st : 0) + defWeaponMastery;

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

  const battleResultUi = { win, atkSurvived, atkSupport: aSup, defSupport: dSup, attacker: atk.id };
  r.lastBattle = { tile: b.tile, attacker: atk.id, defender: def.id,
    terrainElem: tileElem(r, b.tile),
    atkCreature: b.atkCreature, defCreature: o.creature,
    defLevel: o.level,
    atkSupport: aSup, defSupport: dSup,
    st: atkDmg, hp: effHp, df: defDF, dealt,
    atkBaseAt: aBase.st, atkBaseHp: atkEffHp,
    defBaseAt: dBase.st, defBaseHp: effHp, defSt,
    atkHp: atkEffHp, atkDf: atkDF, counterSt, counterDealt, atkSurvived,
    atkPreAt: atkDmg - (aEff ? aEff.st : 0) - atkWeaponMastery, atkPostAt: atkDmg,
    atkPreHp: atkEffHp, atkPostHp: atkEffHp,
    atkPreDf: atkSoul + atkShadeDF + atkEarthChain, atkPostDf: atkDF,
    defPreAt: defSt - (dEff ? dEff.st : 0) - defWeaponMastery, defPostAt: defSt,
    defPreHp: effHp, defPostHp: effHp,
    defPreDf: Math.max(0, defDF - (dEff ? dEff.hp : 0)), defPostDf: defDF,
    atkExileCount: (atk.exile || []).length, defExileCount: (def.exile || []).length,
    // v1.28: 旧フィールド名は保存・旧UI互換のため残し、値はDF補正として扱う。
    atkSoulBonus: atkSoul, defSoulBonus: defSoul,
    atkSoulDfBonus: atkSoul, defSoulDfBonus: defSoul,
    atkEarthChainBonus: atkEarthChain, defEarthChainBonus: defEarthChain,
    atkWeaponMastery, defWeaponMastery,
    hits: hitsDone, preempt,
    moveFrom: b.moveFrom,
    remainHp: win ? 0 : effHp - dealt,
    terrain, terrainBreakdown: terrainUi,
    effectStates: battleEffectStates(r, b, battleResultUi),
    curse, notes, win, at: stamp(r) };
  log(r, `⚔ ${atk.name}の${ac.name}(AT${atkDmg}${hitsDone === 2 ? '×2回' : ''}) vs ${def.name}の${dc.name}(HP${effHp}/DF${defDF}) → 実ダメージ${dealt}`);
  for (const n of notes) log(r, n);
  if (iceWard) delete o.iceWard;

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
      log(r, `${def.name}が防衛成功! 通行料${toll}Gも支払わせた`);
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
  if (endFx) { delete endFx.vortex; delete endFx.uplift; }  // 戦闘終了で解除
  r.battle = null;
  // v0.74: 戦勝報酬は共通山札から3枚ドラフト(勝者=攻守どちらでも)。
  // ドラフト完了後にsettleAll→endTurnへ続く(進行を直列化し、r.draftの競合を防ぐ)
  const bWinner = win ? atk : def;
  r.battleAfter = { winner: bWinner.id, attacker: atk.id, defender: def.id, tile: b.tile,
    invasionWon: !!win, recoveryDone: false };
  if (win && onCreatureSummoned(r, atk, b.atkCreature, 'battle', b.tile)) {
    Object.assign(r.pending[atk.id], { battleWinner: bWinner.id });
    return;
  }
  return continuePostBattle(r);
}

function continuePostBattle(r) {
  const state = r.battleAfter;
  if (!state) return settleAll(r);
  const winner = pById(r, state.winner);
  if (!winner || winner.bankrupt || r.winner) {
    r.battleAfter = null;
    r.effectResume = null;
    return settleAll(r);
  }
  if ((r.effectQueue || []).length) return resumeAfterExileEffects(r, { type: 'post_battle' });
  if (!state.recoveryDone) {
    state.recoveryDone = true;
    const placed = r.owners[state.tile];
    if (placed && placed.player === winner.id && baseId(placed.creature) === 'kamadoma' && isEvolved(placed)) {
      const opts = (winner.exile || []).map((card, i) => SUPPORTS[card]
        ? { id: 'dr:' + i, card, label: `${cardName(card)}を手札に戻す` } : null).filter(Boolean);
      if (opts.length) {
        ask(r, winner.id, 'daitekkan_recover', '【再鍛造】廃棄されたウェポン1枚を選ぶ', opts);
        return;
      }
    }
  }
  r.battleAfter = null;
  r.effectResume = null;
  log(r, `戦${state.invasionWon ? '勝' : '果'}の報酬 ─ ${winner.name}は3枚のカードから1枚を選ぶ`);
  return startDraft(r, winner, 'battle');
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

  if (pend.type === 'toxy_target') {
    const target = pById(r, optionId.slice(3));
    if (target && target.id !== p.id && !target.bankrupt && target.hand.length) {
      const i = Math.floor(Math.random() * target.hand.length);
      const card = target.hand.splice(i, 1)[0];
      target.discard.push(card);
      log(r, `【瘴気連鎖】${p.name}の瘴気が${target.name}の手札「${cardName(card)}」を捨てさせた`);
    }
    return processEffectQueue(r);
  }

  if (pend.type === 'daitekkan_recover') {
    const i = +optionId.slice(3);
    const card = (p.exile || [])[i];
    if (i >= 0 && SUPPORTS[card]) {
      p.exile.splice(i, 1);
      p.hand.push(card);
      r.lastGain = { player: p.id, n: 1, cards: [card], reason: 'daitekkan', at: stamp(r) };
      log(r, `【再鍛造】${p.name}のダイテッカンが廃棄から「${cardName(card)}」を手札に戻した`);
    }
    return continuePostBattle(r);
  }

  if (pend.type === 'gaust_exile') {
    const i = +optionId.slice(3);
    if (i >= 0 && i < p.hand.length) {
      const card = p.hand.splice(i, 1)[0];
      exileCard(r, p, card, 'gaust');
      log(r, `【魂の選別】${p.name}は「${cardName(card)}」を廃棄した`);
    }
    return resumeAfterExileEffects(r, { type: 'placement', player: p.id, pend });
  }

  if (pend.type === 'fatal_exile') {
    const i = +optionId.slice(3);
    if (i >= 0 && i < p.hand.length) {
      const card = p.hand.splice(i, 1)[0];
      exileCard(r, p, card, 'fatal_reward');
      log(r, `フェイタルリワード ─ ${p.name}は「${cardName(card)}」を廃棄した`);
    }
    const resolving = Array.isArray(p.resolving) ? p.resolving : [];
    const ri = resolving.indexOf('sp_fatal_reward');
    if (ri >= 0) p.discard.push(resolving.splice(ri, 1)[0]);
    spellFx(r, 'sp_fatal_reward', [], p.id, { exiled: true });
    return resumeAfterExileEffects(r, { type: 'roll', player: p.id });
  }

  if (pend.type === 'ult_villa_recover') {
    const selected = Array.isArray(pend.selected) ? pend.selected.slice() : [];
    if (optionId === 'vr:confirm') {
      const valid = [...new Set(selected)].filter(i => i >= 0 && i < p.exile.length).slice(0, 3);
      const cards = valid.map(i => p.exile[i]);
      [...valid].sort((a, b) => b - a).forEach(i => p.exile.splice(i, 1));
      p.hand.push(...cards);
      r.lastGain = { player: p.id, n: cards.length, cards: cards.slice(), reason: 'ult_villa', at: stamp(r) };
      log(r, `【墓守の協奏曲】${p.name}は廃棄から${cards.length}枚を手札へ戻した`);
      return resolveTile(r, p);
    }
    const i = +optionId.slice(3);
    if (!(i >= 0 && i < p.exile.length)) return startVillaRecovery(r, p, 0, selected);
    const at = selected.indexOf(i);
    if (at >= 0) selected.splice(at, 1);
    else if (selected.length < 3) selected.push(i);
    return startVillaRecovery(r, p, 0, selected);
  }

  // --- キャラ選択 ---
  if (pend.type === 'select_char') {
    if (optionId === 'unpick') {
      p.charId = null; p.confirmed = false;
      if (r.botMode && !p.isBot) r.players.filter(q => q.isBot).forEach((q, i) => {
        q.charId = null; q.confirmed = false; q.name = `BOT ${String.fromCharCode(65 + i)}`;
        delete r.pending[q.id];
      });
      return askSelect(r, p);
    }
    p.charId = optionId; p.confirmed = true;
    // テレビで開始するまでは、全員がいつでも選び直せる状態を保つ。
    ask(r, p.id, 'select_wait', '他のプレイヤーを待っています…', [{ id: 'unpick', label: 'キャラを選び直す' }]);
    log(r, `${p.name}は${CHARS[optionId].name}を選択`);
    if (r.botMode && !p.isBot) assignBotCharacters(r, p.charId);
    return trySelectResolve(r);
  }

  // --- サムライ・サガ召喚時の土地属性変更 ---
  if (pend.type === 'samurai_elem') {
    const i = pend.tile;
    const o = r.owners[i];
    const resume = () => resumeAfterPlacement(r, p, pend);
    if (!o || o.player !== p.id || baseId(o.creature) !== 'samurai_saga') return resume();
    if (optionId !== 'se:none') {
      const elem = optionId.slice(3);
      if (!['fire', 'water', 'earth', 'wind'].includes(elem)) return resume();
      if (TILES[i].e === elem) delete r.elemOv[i]; else r.elemOv[i] = elem;
      log(r, `【地脈改変】${p.name}のサムライ・サガが土地${i}を${ELEM_JA[elem]}属性へ変更した`);
    } else {
      log(r, `【地脈改変】${p.name}は土地${i}の属性を変更しなかった`);
    }
    updateTitles(r);
    return resume();
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
    if (p.charId === 'lia') return askLiaUlt(r, p);
    if (p.charId === 'nerasio') return askNerasioUlt(r, p);
    if (p.charId === 'adel') {
      const targets = r.owners.map((o, i) => o && o.player === p.id ? i : null).filter(i => i != null);
      if (!targets.length) return askRoll(r, p);
      return beginUltSequence(r, p, { targets });
    }
    if (p.charId === 'redani') {
      const d = [0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6));
      return beginUltSequence(r, p, { dice: d });
    }
    if (p.charId === 'linnei') {
      return beginUltSequence(r, p);
    }
    if (p.charId === 'grease') return beginUltSequence(r, p);
    if (p.charId === 'villa' && (p.exile || []).length)
      return beginUltSequence(r, p, { steps: p.exile.length });
    return askRoll(r, p);
  }
  if (pend.type === 'ult_mio') {
    if (optionId === 'mt:cancel') return askRoll(r, p);
    const i = +optionId.slice(3);
    return beginUltSequence(r, p, { target: i });
  }
  if (pend.type === 'ult_lia') {
    if (optionId === 'lu:cancel') return askRoll(r, p);
    const selected = Array.isArray(pend.selected) ? pend.selected.slice() : [];
    if (optionId === 'lu:confirm') {
      const targets = [...new Set(selected)].filter(i => {
        const o = r.owners[i];
        return o && o.player !== p.id;
      }).slice(0, 3);
      if (!targets.length) return askRoll(r, p);
      return beginUltSequence(r, p, { targets });
    }
    const i = +optionId.slice(3);
    const o = r.owners[i];
    if (!o || o.player === p.id) return askLiaUlt(r, p, selected);
    const at = selected.indexOf(i);
    if (at >= 0) selected.splice(at, 1);
    else if (selected.length < 3) selected.push(i);
    return askLiaUlt(r, p, selected);
  }
  if (pend.type === 'ult_nerasio_land') {
    if (optionId === 'nu:cancel') return askRoll(r, p);
    const selected = Array.isArray(pend.selected) ? pend.selected.slice() : [];
    if (optionId === 'nu:confirm') {
      const targets = [...new Set(selected)].filter(i => {
        const o = r.owners[i];
        return TILES[i]?.t === 'land' && o && o.player === p.id;
      }).slice(0, 2);
      return askNerasioElem(r, p, targets);
    }
    const i = +optionId.slice(3);
    const o = r.owners[i];
    if (!o || o.player !== p.id || TILES[i]?.t !== 'land') return askNerasioUlt(r, p, selected);
    const at = selected.indexOf(i);
    if (at >= 0) selected.splice(at, 1);
    else if (selected.length < 2) selected.push(i);
    return askNerasioUlt(r, p, selected);
  }
  if (pend.type === 'ult_nerasio_elem') {
    const selected = Array.isArray(pend.selected) ? pend.selected.slice() : [];
    if (optionId === 'ne:cancel') return askNerasioUlt(r, p, selected);
    const elem = optionId.slice(3);
    if (!['fire', 'water', 'earth', 'wind'].includes(elem)) return askNerasioElem(r, p, selected);
    const targets = [...new Set(selected)].filter(i => {
      const o = r.owners[i];
      return TILES[i]?.t === 'land' && o && o.player === p.id;
    }).slice(0, 2);
    if (!targets.length) return askRoll(r, p);
    return beginUltSequence(r, p, { targets, elem });
  }
  if (pend.type === 'roll' && optionId.startsWith('sp:')) {
    const sid = optionId.slice(3);
    const spellCost = effectiveSpellCost(r, p, sid);
    if (!p.hand.includes(sid) || spellCost > p.gold) return askRoll(r, p);
    const castLog = () => {
      p.hand.splice(p.hand.indexOf(sid), 1);
      if (EXILE_SPELLS.has(sid)) { exileCard(r, p, sid, 'spell'); }
      else p.discard.push(sid);
      if (spellCost) p.gold -= spellCost;
      p.spellCast = true;
      onSpellCast(r, p);
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS[sid].name, desc: SPELLS[sid].desc, at: stamp(r) };
      log(r, `📜 ${p.name}が呪文「${SPELLS[sid].name}」を唱えた!${spellCost ? `(−${spellCost}G)` : ''}${EXILE_SPELLS.has(sid) ? '(廃棄)' : ''}`);
    };
    if (sid === 'sp_fatal_reward') {
      p.hand.splice(p.hand.indexOf(sid), 1);
      p.gold -= spellCost;
      p.spellCast = true;
      if (!Array.isArray(p.resolving)) p.resolving = [];
      p.resolving.push(sid);  // 効果解決後まで解決中領域へ置き、即時の引き直しを防ぐ
      onSpellCast(r, p);
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS[sid].name,
        desc: SPELLS[sid].desc, at: stamp(r) };
      const got = drawCards(r, p, 1);
      if (got) r.lastDraw = { player: p.id, n: got, reason: 'fatal_reward', at: stamp(r) };
      log(r, `📜 ${p.name}が「${SPELLS[sid].name}」を唱え、カードを${got}枚引いた(−${spellCost}G)`);
      if (askMandatoryHandExile(r, p, 'fatal_exile', 'フェイタルリワード ─ 廃棄する手札を1枚選ぶ')) return;
      const ri = p.resolving.indexOf(sid);
      if (ri >= 0) p.discard.push(p.resolving.splice(ri, 1)[0]);
      spellFx(r, sid, [], p.id, { exiled: false });
      return askRoll(r, p);
    }
    if (sid === 'sp_gold') {
      castLog();
      const gain = (p.lap || 1) * 100;
      p.gold += gain;
      r.lastEvent.desc = `第${p.lap || 1}周 ─ ${gain}Gを獲得(所持${p.gold}G)`;
      log(r, `第${p.lap || 1}周 ─ ${p.name}は${gain}Gを得た(所持${p.gold}G)`);
      spellFx(r, 'sp_gold', [], p.id);
      return askRoll(r, p);
    }
    if (sid === 'sp_insight') {
      castLog();
      const got = drawCards(r, p, 2);
      if (got) r.lastDraw = { player: p.id, n: got, reason: 'insight', at: stamp(r) };
      log(r, `${p.name}はカードを${got}枚引いた`);
      spellFx(r, 'sp_insight', [], p.id, { n: got });
      return askRoll(r, p);
    }
    if (sid === 'sp_gale') {
      castLog();
      p.gale = true;
      log(r, `${p.name}に追い風が吹く…(このターンはダイス2個)`);
      spellFx(r, 'sp_gale', [], p.id);
      return askRoll(r, p);
    }
    if (SPELLS[sid].fixedDice) {
      castLog();
      p.fixedDice = SPELLS[sid].fixedDice;
      r.lastEvent.desc = `このターンのダイスを${p.fixedDice}に固定`;
      log(r, `${p.name}の次のダイスは${p.fixedDice}に固定された`);
      spellFx(r, sid, [], p.id, { fixedDice: p.fixedDice });
      return askRoll(r, p);
    }
    if (sid === 'sp_ward') {
      castLog();
      r.barrier[p.id] = true;
      log(r, `${p.name}の全領地に結界が張られた(次の手番まで侵略不可)`);
      spellFx(r, 'sp_ward', r.owners.map((o, i) => o && o.player === p.id ? i : null).filter(x => x !== null), p.id);
      return resumeAfterExileEffects(r, { type: 'roll', player: p.id });
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
    if (sid === 'sp_bloodstained_blade') {
      castLog();
      p.blade = true;
      log(r, `${p.name}の刃が血に染まる…(次の侵略でAT+10・成功時30G強奪)`);
      spellFx(r, 'sp_bloodstained_blade', [], p.id);
      return askRoll(r, p);
    }
    if (sid === 'sp_wind_shift') {
      castLog();
      p.dir = -(p.dir || 1);
      log(r, `${p.name}は風向転換で進行方向を${p.dir === 1 ? '左回り' : '右回り'}へ反転した!`);
      spellFx(r, 'sp_wind_shift', [], p.id);
      return askRoll(r, p);
    }
    if (ELEM_OF_SPELL[sid] || sid === 'sp_flame_vortex' || sid === 'sp_bedrock_uplift') {
      p.pendSpell = sid;
      let cond;
      if (ELEM_OF_SPELL[sid]) cond = (o, i) => o.player === p.id && tileElem(r, i) !== ELEM_OF_SPELL[sid];
      else if (sid === 'sp_flame_vortex') cond = o => o.player !== p.id;
      else if (sid === 'sp_bedrock_uplift') cond = o => o.player === p.id && (o.dmg || 0) > 0;
      else cond = o => o.player === p.id;
      const opts = r.owners.map((o, i) => o && cond(o, i)
        ? { id: 'tg:' + i, label: `${o.player !== p.id ? pById(r, o.player).name + 'の' : ''}${CREATURES[o.creature].name}(${tileElem(r, i)} Lv${o.level}${o.dmg ? ' 負傷' + o.dmg : ''})` }
        : null).filter(Boolean);
      opts.push({ id: 'tg:cancel', label: 'やめる' });
      return ask(r, p.id, 'spell_target', `「${SPELLS[sid].name}」─ 対象のマスを選ぶ`, opts);
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
      const spellCost = effectiveSpellCost(r, p, 'sp_weaken');
      if (o && o.player !== p.id && p.hand.includes('sp_weaken') && p.gold >= spellCost) {
        p.hand.splice(p.hand.indexOf('sp_weaken'), 1);
        p.discard.push('sp_weaken');
        p.gold -= spellCost;
        p.spellCast = true;
        onSpellCast(r, p);
        r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_weaken.name,
          desc: `${pById(r, o.player).name}の${CREATURES[o.creature].name}に20ダメージ!`, at: stamp(r) };
        log(r, `☠ ${p.name}が${pById(r, o.player).name}の${CREATURES[o.creature].name}に衰弱の呪文!(20ダメージ)`);
        spellFx(r, 'sp_weaken', [i], p.id);
        spellDamage(r, i, SPELLS.sp_weaken.hp, '衰弱');
      }
    }
    return askRoll(r, p);
  }
  if (pend.type === 'forget') {
    if (optionId !== 'fg:cancel') {
      const zone = optionId[1] === 'h' ? p.hand : p.discard;
      const i = +optionId.slice(3);
      const item = r.shopVisit && r.shopVisit.player === p.id && r.shopVisit.items.find(x => x.slotId === 'remove');
      if (item && !item.sold && i < zone.length && p.gold >= item.price) {
        const c = zone.splice(i, 1)[0];
        exileCard(r, p, c, 'shop_remove');
        p.gold -= item.price;
        item.sold = true;
        const nameOf = x => (CREATURES[x] || SPELLS[x] || SUPPORTS[x] || { name: x }).name;
        log(r, `${p.name}は「${nameOf(c)}」を忘却した(ゲームから廃棄)`);
      }
    }
    return resumeAfterExileEffects(r, { type: 'market', player: p.id });
  }
  if (pend.type === 'spell_target') {
    const sid = p.pendSpell;
    const spellCost = sid ? effectiveSpellCost(r, p, sid) : Infinity;
    if (optionId === 'tg:cancel' || !sid || !p.hand.includes(sid) || spellCost > p.gold) {
      p.pendSpell = null;
      return askRoll(r, p);
    }
    const i = +optionId.slice(3);
    const o = r.owners[i];
    p.pendSpell = null;
    if (!o) return askRoll(r, p);
    const pay = () => {
      p.hand.splice(p.hand.indexOf(sid), 1);
      if (EXILE_SPELLS.has(sid)) exileCard(r, p, sid, 'spell'); else p.discard.push(sid);
      p.gold -= spellCost;
      p.spellCast = true;
      onSpellCast(r, p);
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
      spellFx(r, sid, [i], p.id, { elem: el });
    } else if (sid === 'sp_flame_vortex') {
      if (o.player === p.id) return askRoll(r, p);
      pay();
      fx().vortex = true;
      r.lastEvent.desc = `${pById(r, o.player).name}の${CREATURES[o.creature].name}に10ダメージ! 次の侵略者はAT+10`;
      log(r, `🔥 炎の渦がマス${i}を包む。${CREATURES[o.creature].name}に10ダメージ! 次の侵略者はAT+10`);
      spellFx(r, 'sp_flame_vortex', [i], p.id, { cid: o.creature });
      spellDamage(r, i, 10, '炎の渦');
    } else if (sid === 'sp_bedrock_uplift') {
      if (o.player !== p.id || !(o.dmg > 0)) return askRoll(r, p);
      pay();
      const before = o.dmg || 0;
      o.dmg = Math.max(0, before - 20);
      fx().uplift = true;
      r.lastEvent.desc = `${CREATURES[o.creature].name}の負傷${before}→${o.dmg}。次の戦闘でDF+10`;
      log(r, `⛰ リストア! ${CREATURES[o.creature].name}の負傷${before}→${o.dmg}。次の戦闘でDF+10`);
      spellFx(r, 'sp_bedrock_uplift', [i], p.id);
    }
    return resumeAfterExileEffects(r, { type: 'roll', player: p.id });
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
    const spellCost = effectiveSpellCost(r, p, 'sp_step');
    if (src && src.player === p.id && p.hand.includes('sp_step') &&
        stepDests(r, p, i).includes(j) && spellCost <= p.gold) {
      p.hand.splice(p.hand.indexOf('sp_step'), 1);
      p.discard.push('sp_step');
      p.gold -= spellCost;
      p.spellCast = true;
      onSpellCast(r, p);
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_step.name,
        desc: r.owners[j] ? `${CREATURES[src.creature].name}が隣の敵領地へ侵略!(通行料なし)`
                          : `${CREATURES[src.creature].name}が隣の空き地へ進出し、Lv1の領地に`, at: stamp(r) };
      p.stepI = null;
      const dest = r.owners[j];
      if (!dest) {
        // 空き地へ移動: Lv1で取得・負傷維持・元は空き地に
        r.owners[j] = { player: p.id, level: 1, creature: src.creature, dmg: src.dmg || 0 };
        r.owners[i] = null;
        log(r, `📜 ${p.name}の${SPELLS.sp_step.name}! ${CREATURES[r.owners[j].creature].name}が隣の空き地(${TILES[j].e})へ進出し、Lv1の領地とした`);
        spellFx(r, 'sp_step', [i, j], p.id);
        return askRoll(r, p);
      }
      // 敵領地へ: そのまま侵略(通行料なし)。攻撃クリーチャーは土地から出撃
      log(r, `📜 ${p.name}の${SPELLS.sp_step.name}! ${CREATURES[src.creature].name}が隣の${pById(r, dest.player).name}の領地へ攻め込む!(通行料なし)`);
      spellFx(r, 'sp_step', [i, j], p.id, { battle: true });
      r.battle = { tile: j, attacker: p.id, defender: dest.player,
                   atkCreature: src.creature, moveFrom: i, supports: {}, startedAt: stamp(r) };
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
    const spellCost = effectiveSpellCost(r, p, 'sp_move');
    if (optionId !== 'mb:cancel' && p.hand.includes('sp_move') && p.gold >= spellCost) {
      const a = p.moveA, bI = +optionId.slice(3);
      const oa = r.owners[a], ob = r.owners[bI];
      if (oa && ob && oa.player === p.id && ob.player === p.id) {
        [oa.creature, ob.creature] = [ob.creature, oa.creature];
        [oa.dmg, ob.dmg] = [ob.dmg || 0, oa.dmg || 0];
        p.hand.splice(p.hand.indexOf('sp_move'), 1);
        p.discard.push('sp_move');
        p.gold -= spellCost;
        p.spellCast = true;
        onSpellCast(r, p);
        r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_move.name,
          desc: `${CREATURES[ob.creature].name}と${CREATURES[oa.creature].name}が入れ替わった`, at: stamp(r) };
        log(r, `📜 ${p.name}が${SPELLS.sp_move.name}! ${CREATURES[ob.creature].name}と${CREATURES[oa.creature].name}が入れ替わった(−${spellCost}G)`);
        spellFx(r, 'sp_move', [a, bI], p.id);
      }
    }
    p.moveA = null;
    return askRoll(r, p);
  }
  if (pend.type === 'swap_land') {
    if (optionId === 'sw:cancel') return askRoll(r, p);
    p.swapI = +optionId.slice(3);
    const budget = p.gold - effectiveSpellCost(r, p, 'sp_swap');
    const opts = [...new Set(p.hand.filter(c => CREATURES[c] && CREATURES[c].cost <= budget))].map(c =>
      ({ id: 'sp2:' + c, label: `${CREATURES[c].name}(AT${CREATURES[c].st}/HP${CREATURES[c].hp} −${CREATURES[c].cost}G)` }));
    opts.push({ id: 'sp2:cancel', label: 'やめる' });
    return ask(r, p.id, 'swap_pick', '交代 ─ 手札のどのクリーチャーを配置する?', opts);
  }
  if (pend.type === 'swap_pick') {
    let summonPaused = false;
    if (optionId !== 'sp2:cancel' && p.hand.includes('sp_swap')) {
      const c = optionId.slice(4);
      const o = r.owners[p.swapI];
      const swapTile = p.swapI;
      const spellCost = effectiveSpellCost(r, p, 'sp_swap');
      if (o && o.player === p.id && p.hand.includes(c) &&
          CREATURES[c].cost + spellCost <= p.gold) {
        const oldC = o.creature;
        p.discard.push(oldC);                 // 元のクリーチャーは捨て札へ
        p.hand.splice(p.hand.indexOf(c), 1);
        o.creature = c; o.dmg = 0; o.shade = 0; delete o.iceWard;  // 新クリーチャーは全快で配置
        if (baseId(c) === 'fugorm') { gainToDeck(r, p, ['weapon'], 'fugorm'); log(r, `【鍛冶】${p.name}はウェポン「ソード」を山札に得た`); }
        p.hand.splice(p.hand.indexOf('sp_swap'), 1);
        p.discard.push('sp_swap');
        p.gold -= spellCost + CREATURES[c].cost;
        p.spellCast = true;
        onSpellCast(r, p);
        r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_swap.name,
          desc: `${CREATURES[oldC].name}に代わり${CREATURES[c].name}が領地に立った`, at: stamp(r) };
        log(r, `📜 ${p.name}が${SPELLS.sp_swap.name}! ${CREATURES[oldC].name}に代わり${CREATURES[c].name}が領地に立った(−${spellCost + CREATURES[c].cost}G)`);
        spellFx(r, 'sp_swap', [p.swapI], p.id, { cid: oldC });
        summonPaused = onCreatureSummoned(r, p, c, 'swap', swapTile);
      }
    }
    p.swapI = null;
    if (summonPaused) return;
    return askRoll(r, p);
  }
  if (pend.type === 'direction') {
    p.dir = optionId === 'dir:-1' ? -1 : 1;
    if (p.windShiftLegacyPending) {
      p.dir *= -1;
      delete p.windShiftLegacyPending;
    }
    log(r, `${p.name}は${p.dir === 1 ? '左回り' : '右回り'}に進むことにした(以後変更不可)`);
    const dp = r.dirPend;
    r.dirPend = null;
    if (dp) {
      if (dp.meta && dp.meta.villaUlt) delete dp.meta.at;
      return performMove(r, p, dp.steps, dp.meta, dp.moveLabel);
    }
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
      const o = r.owners[i];
      const spellCost = effectiveSpellCost(r, p, 'sp_quake');
      if (!o || o.player === p.id || o.level < 2 || !p.hand.includes('sp_quake') || p.gold < spellCost)
        return askRoll(r, p);
      p.hand.splice(p.hand.indexOf('sp_quake'), 1);
      exileCard(r, p, 'sp_quake', 'spell');
      p.gold -= spellCost;
      p.spellCast = true;
      onSpellCast(r, p);
      o.level = Math.max(1, o.level - 1);
      r.lastEvent = { type: 'spell', player: p.id, name: SPELLS.sp_quake.name,
        desc: `${pById(r, o.player).name}の領地(${i}番)がLv${o.level}に崩れた!`, at: stamp(r) };
      log(r, `⛰ ${p.name}の地割れで${pById(r, o.player).name}の領地(${i}番)がLv${o.level}に崩れた!`);
      spellFx(r, 'sp_quake', [i], p.id);
    }
    return resumeAfterExileEffects(r, { type: 'roll', player: p.id });
  }

  if (pend.type === 'draft') {
    if (optionId === 'skip') {
      r.deck.push(...r.draft.cards);
      log(r, `${p.name}はカードを加えなかった`);
      const resume0 = r.draft.resume;
      r.draft = null;
      if (resume0 === 'tile') return resolveTile(r, p);
      if (resume0 === 'villa_recover') return startVillaRecovery(r, p);
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
    gainToDeck(r, p, [c], 'draft');  // v0.61: 獲得カードは山札へ(シャッフル)
    log(r, `${p.name}はカードを1枚獲得し、山札に加えた(中身は非公開)`);
    const resume = r.draft.resume;
    r.draft = null;
    if (resume === 'tile') return resolveTile(r, p);
    if (resume === 'villa_recover') return startVillaRecovery(r, p);
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

  if (pend.type === 'marlow_src') {
    if (optionId === 'ms:cancel') return askUpgrade(r, p, pend.where || '自領地');
    const src = +optionId.slice(3);
    const o = r.owners[src];
    if (!o || o.player !== p.id || baseId(o.creature) !== 'marlow' || !marlowDests(r).length)
      return askUpgrade(r, p, pend.where || '自領地');
    const opts = marlowDests(r).map(i => ({
      id: 'md:' + i, tile: i, label: `土地${i}(${ELEM_JA[tileElem(r, i)]})へ移動`,
    }));
    opts.push({ id: 'md:cancel', label: 'やめる' });
    ask(r, p.id, 'marlow_dest', '【風渡り】移動先の空いている風属性土地を選ぶ', opts);
    Object.assign(r.pending[p.id], { source: src, where: pend.where || '自領地' });
    return;
  }

  if (pend.type === 'marlow_dest') {
    if (optionId === 'md:cancel') return askUpgrade(r, p, pend.where || '自領地');
    const src = pend.source, dest = +optionId.slice(3);
    if (!moveMarlow(r, p, src, dest))
      return askUpgrade(r, p, pend.where || '自領地');
    if (checkVictory(r)) return;
    return endTurn(r);
  }

  if (pend.type === 'upgrade') {
    if (optionId === 'marlow:move') {
      const opts = marlowSources(r, p).filter(i => marlowDests(r).length).map(i => ({
        id: 'ms:' + i, tile: i,
        label: `土地${i}のマーロー(Lv${r.owners[i].level}${r.owners[i].dmg ? `・負傷${r.owners[i].dmg}` : ''})`,
      }));
      if (!opts.length) return askUpgrade(r, p, pend.where || '自領地');
      opts.push({ id: 'ms:cancel', label: 'やめる' });
      ask(r, p.id, 'marlow_src', '【風渡り】移動するマーローを選ぶ', opts);
      r.pending[p.id].where = pend.where || '自領地';
      return;
    }
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
      if (!CREATURES[c] || !p.hand.includes(c) || CREATURES[c].cost > p.gold || r.owners[i])
        return endTurn(r);
      p.gold -= CREATURES[c].cost;
      p.hand.splice(p.hand.indexOf(c), 1);
      r.owners[i] = { player: p.id, level: 1, creature: c };
      log(r, `${p.name}は${CREATURES[c].name}を召喚し、土地を領地化!`);
      if (baseId(c) === 'fugorm') { gainToDeck(r, p, ['weapon'], 'fugorm'); log(r, `【鍛冶】${p.name}はウェポン「ソード」を山札に得た`); }
      const summonPaused = onCreatureSummoned(r, p, c, 'summon', i);
      updateTitles(r); if (checkVictory(r)) return; if (summonPaused) return; return endTurn(r);
    }
    if (optionId === 'toll') {
      const enemy = pById(r, o.player);
      const toll = tollOf(r, i);
      const paid = payTo(r, p, enemy, toll);
      r.lastEvent = { type: 'toll', from: p.id, to: enemy.id, amount: paid,
                      fromGold: p.gold, toGold: enemy.gold, at: stamp(r) };
      log(r, `${p.name}は通行料${paid}Gを支払った`);
      return settleAll(r);
    }
    if (optionId === 'invade') return startBattle(r, p, i);
    return endTurn(r); // pass
  }

  if (pend.type === 'pick_creature') {
    const c = optionId.slice(4);
    if (!r.battle || !CREATURES[c] || !p.hand.includes(c) ||
        !(pend.options || []).some(o => o.id === optionId)) return;
    r.battle.atkCreature = c;
    return askSupports(r);
  }

  if (pend.type === 'support') {
    if (!r.battle || !(pend.options || []).some(o => o.id === optionId)) return;
    let choice;
    if (optionId === 'sup:none') {
      choice = { kind: 'none' };
    } else if (optionId.startsWith('sup:s:')) {
      const cardId = optionId.slice(6);
      if (!SUPPORTS[cardId] || !p.hand.includes(cardId)) return;
      choice = { kind: 'support', cardId };
    } else if (optionId.startsWith('sup:c:')) {
      const cardId = optionId.slice(6);
      const b = r.battle;
      const battleCreature = playerId === b.attacker
        ? b.atkCreature
        : r.owners[b.tile] && r.owners[b.tile].creature;
      if (!creatureSupportEnabled(battleCreature) || !CREATURES[cardId] ||
          !p.hand.includes(cardId) || CREATURES[cardId].cost > p.gold) return;
      if (playerId === b.attacker && cardId === b.atkCreature &&
          p.hand.filter(c => c === cardId).length < 2) return;
      choice = { kind: 'creature', cardId };
    } else {
      return;
    }
    r.battle.supports[playerId] = choice;
    if (Object.keys(r.battle.supports).length === 2) return resolveBattle(r);
    return;
  }

  if (pend.type === 'market') {
    const visit = r.shopVisit;
    if (!visit || visit.player !== p.id || pend.shopId !== visit.id) return endTurn(r);
    if (optionId === 'done') {
      r.shopVisit = null;
      if (r.halfMarket === p.id) r.halfMarket = null;
      return endTurn(r);
    }
    const slotId = optionId.startsWith('buy:') ? optionId.slice(4) : '';
    const item = visit.items.find(x => x.slotId === slotId);
    if (!item || item.sold || p.gold < item.price) return askMarket(r, p);
    if (item.kind === 'remove') {
      const nameOf = c => (CREATURES[c] || SPELLS[c] || SUPPORTS[c] || { name: c }).name;
      const opts = [];
      p.hand.forEach((c, i) => opts.push({ id: 'fh:' + i, label: `[手札] ${nameOf(c)}`, card: c, zone: 'h' }));
      p.discard.forEach((c, i) => opts.push({ id: 'fd:' + i, label: `[捨て札] ${nameOf(c)}`, card: c, zone: 'd' }));
      opts.push({ id: 'fg:cancel', label: 'やめる' });
      ask(r, p.id, 'forget', `忘却 ─ どのカードを廃棄する?(−${item.price}G)`, opts);
      Object.assign(r.pending[p.id], { shopId: visit.id });
      return;
    }
    p.gold -= item.price;
    item.sold = true;
    gainToDeck(r, p, [item.card], 'market');
    const card = CREATURES[item.card] || SPELLS[item.card] || SUPPORTS[item.card];
    log(r, `${p.name}は「${card.name}」を${item.price}Gで購入(山札へ)`);
    return askMarket(r, p);
  }
}

// ===== キャラ選択フェーズ =====
function addBotPlayers(r) {
  if (!r.botMode || r.players.some(p => p.isBot)) return;
  for (let i = 0; i < 3; i++) r.players.push({
    id: `bot${crypto.randomBytes(4).toString('hex')}`, name: `BOT ${String.fromCharCode(65 + i)}`,
    isBot: true, confirmed: false,
  });
  log(r, 'BOT3体が参加した');
}
function assignBotCharacters(r, humanChar) {
  const bots = r.players.filter(p => p.isBot);
  if (!r.botMode || bots.length !== 3 || bots.every(p => p.confirmed)) return;
  const available = shuffle(Object.keys(CHARS).filter(cid => CHARS[cid].selectable !== false && cid !== humanChar));
  bots.forEach((bot, i) => {
    bot.charId = available[i];
    bot.name = CHARS[bot.charId].name;
    bot.confirmed = true;
    ask(r, bot.id, 'select_wait', 'ゲーム開始を待っています…', []);
    log(r, `BOTは${bot.name}を選択`);
  });
}
function startSelect(r) {
  if (r.botMode) addBotPlayers(r);
  r.phase = 'select';
  log(r, 'キャラクター選択を開始');
  for (const p of r.players) if (!p.isBot) askSelect(r, p);
}
function askSelect(r, p) {
  const taken = r.players.filter(x => x.confirmed && x.id !== p.id).map(x => x.charId);
  const opts = Object.entries(CHARS).filter(([id, c]) => c.selectable !== false && !taken.includes(id))
    .map(([id, c]) => ({ id, label: `${c.name}を使う` }));
  ask(r, p.id, 'select_char', '使用するキャラクターを選んでください', opts);
}
function isSelectionReady(r) {
  if (r.phase !== 'select' || r.players.length < 2) return false;
  if (!r.players.every(p => p.confirmed && p.charId &&
      CHARS[p.charId]?.selectable !== false && CHAR_DECKS[p.charId])) return false;
  return new Set(r.players.map(p => p.charId)).size === r.players.length;
}
function trySelectResolve(r) {
  if (!r.players.every(p => p.confirmed)) return;
  const groups = Object.entries(CHARS).filter(([, c]) => c.selectable !== false).map(([cid]) => cid)
    .map(cid => ({ cid, who: r.players.filter(p => p.charId === cid) }))
    .filter(g => g.who.length >= 2);
  if (groups.length === 0) {
    if (isSelectionReady(r)) log(r, '全員の召喚士が確定しました。テレビ画面からゲームを開始してください');
    return;
  }
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
  const invalid = r.players.find(p => !p.charId || CHARS[p.charId]?.selectable === false || !CHAR_DECKS[p.charId]);
  if (invalid) {
    invalid.charId = null;
    invalid.confirmed = false;
    askSelect(r, invalid);
    log(r, `${invalid.name}の召喚士選択が無効なため、選択画面へ戻した`);
    return;
  }
  r.phase = 'playing';
  r.pending = {};
  const order = r.players.slice().sort(() => Math.random() - 0.5);
  r.players = order;
  for (const p of r.players) {
    p.pos = 0; p.gold = RULES.startGold; p.lap = 1;
    p.deck = shuffle(CHAR_DECKS[p.charId].slice());
    p.discard = []; p.exile = []; p.resolving = []; p.hand = [];
    p.bonusRollPending = false;
    p.battleWins = 0; p.shrineVisits = 0; p.ultUsed = false;
    p.color = CHARS[p.charId].color;
  }
  for (const p of r.players) drawCards(r, p, RULES.startHand);  // 全員に初期手札を配る
  log(r, `全員のキャラが確定! ゲーム開始(手番順: ${r.players.map(p => p.name).join(' → ')})`);
  for (const p of r.players) p.dir = 0;  // 方向は初回のダイス後に選ぶ
  beginTurn(r);
}

// ===== v1.05 BOT判断・実行 =====
const BOT_CANCEL_IDS = new Set(['pass', 'done', 'skip', 'back', 'sup:none', 'mt:cancel', 'lu:cancel',
  'qt:cancel', 'st:cancel', 'sd:cancel', 'mv:cancel', 'sw:cancel', 'fg:cancel', 'ms:cancel', 'md:cancel',
  'ul:cancel']);
const botCardInfo = id => CREATURES[baseId(id)] || SPELLS[id] || SUPPORTS[id] || {};
function botCardScore(r, p, id) {
  const c = botCardInfo(id);
  let score = (c.st || 0) * 1.2 + (c.hp || 0) + ({ L: 42, R: 22, N: 8 }[c.rarity] || 0) - (c.cost || 0) * .08;
  if (c.elem && c.elem === CHARS[p.charId]?.elem) score += 28;
  if (SPELLS[id]) score += id === 'sp_gold' ? 38 : id === 'sp_insight' ? 32 : 18;
  if (id === 'sp_fatal_reward') score += p.charId === 'villa' ? 34 : 10;
  if (baseId(id) === 'alter') score += Math.min(60, (p.exile || []).length * 6);
  if (baseId(id) === 'gaust' && p.charId === 'villa') score += 24;
  if (SUPPORTS[id]) score += (c.st || 0) + (c.hp || 0) + (c.jinx ? 35 : 0);
  const owned = [...(p.hand || []), ...(p.deck || []), ...(p.discard || [])].filter(x => x === id).length;
  return score - Math.max(0, owned - 2) * 12;
}
function botLandScore(r, p, i, attacking = false) {
  const t = TILES[i], o = r.owners[i];
  if (t.t !== 'land') return ({ shrine: 65, gate: 70, market: p.gold >= 100 ? 55 : 18, castle: p.seal ? 90 : 24 }[t.t] || 0);
  if (!o) return 75 + (tileElem(r, i) === CHARS[p.charId]?.elem ? 45 : 0) + chainCount(r, p.id, tileElem(r, i)) * 14;
  if (o.player === p.id) return 44 + o.level * 18 + (o.dmg || 0) * -.5;
  const toll = tollOf(r, i);
  return attacking ? 35 + landValue(r, i) * .08 - o.level * 12 : -Math.min(180, toll * .25);
}
function botBest(r, options, scoreFn, low = false) {
  if (!options.length) return null;
  const scored = options.map(o => ({ o, s: scoreFn(o) + Math.random() * .01 }));
  scored.sort((a, b) => low ? a.s - b.s : b.s - a.s);
  return scored[0].o;
}
function botTileFromOption(o) {
  if (Number.isInteger(o.tile)) return o.tile;
  const m = String(o.id).match(/(?:^|:)(\d+)(?::\d+)?$/);
  return m ? +m[1] : null;
}
function botChooseOption(r, p, pend) {
  const opts = (pend && pend.options || []).slice();
  if (!opts.length) return null;
  const byId = id => opts.find(o => o.id === id);
  const nonCancel = opts.filter(o => !BOT_CANCEL_IDS.has(o.id));
  if (pend.type === 'roll') {
    const ult = byId('ult');
    if (ult && !p.ultUsed && (points(r, p) >= ASSET_REACH || Math.random() < .16)) return ult.id;
    const spells = opts.filter(o => o.id.startsWith('sp:'));
    if (spells.length && p.gold >= 100 && Math.random() < .38)
      return botBest(r, spells, o => botCardScore(r, p, o.id.slice(3))).id;
    return (byId('roll') || opts[0]).id;
  }
  if (pend.type === 'direction') {
    const steps = r.dirPend?.steps || 1;
    return botBest(r, opts, o => {
      const dir = o.id === 'dir:-1' ? -1 : 1;
      return botLandScore(r, p, (p.pos + dir * steps % TILES.length + TILES.length) % TILES.length);
    }).id;
  }
  if (pend.type === 'pick_draw' || pend.type === 'draft') {
    const cards = nonCancel.filter(o => o.card || o.id.startsWith('take:'));
    const best = botBest(r, cards, o => botCardScore(r, p, o.card || o.id.slice(5)));
    return (best || byId('skip') || opts[0]).id;
  }
  if (pend.type === 'gaust_exile' || pend.type === 'fatal_exile')
    return (botBest(r, opts.filter(o => o.card), o => botCardScore(r, p, o.card), true) || opts[0]).id;
  if (pend.type === 'toxy_target')
    return (botBest(r, opts, o => {
      const target = pById(r, o.player || String(o.id).slice(3));
      return target ? target.hand.length * 20 + points(r, target) * 4 : 0;
    }) || opts[0]).id;
  if (pend.type === 'daitekkan_recover')
    return (botBest(r, opts, o => botCardScore(r, p, o.card)) || opts[0]).id;
  if (pend.type === 'ult_villa_recover') {
    const confirm = byId('vr:confirm');
    if ((pend.selected || []).length >= Math.min(3, (p.exile || []).length)) return confirm.id;
    const choices = opts.filter(o => /^vr:\d+$/.test(o.id) && !(pend.selected || []).includes(+o.id.slice(3)));
    return (botBest(r, choices, o => botCardScore(r, p, o.card)) || confirm).id;
  }
  if (pend.type === 'tile') {
    const summons = opts.filter(o => o.id.startsWith('summon:'));
    if (summons.length) return botBest(r, summons, o => botCardScore(r, p, o.id.slice(7))).id;
    if (byId('invade')) {
      const enemy = r.owners[p.pos];
      const bestAtk = Math.max(0, ...(p.hand || []).filter(c => CREATURES[c]).map(c => CREATURES[c].st));
      const defHp = enemy ? Math.max(1, creatureMaxHp(enemy) - (enemy.dmg || 0) + enemy.level * 10) : 999;
      if (bestAtk + 15 >= defHp || tollOf(r, p.pos) > Math.max(80, p.gold * .2)) return 'invade';
    }
    return (byId('toll') || byId('pass') || opts[0]).id;
  }
  if (pend.type === 'pick_creature')
    return botBest(r, opts, o => CREATURES[o.id.slice(4)]?.st || 0).id;
  if (pend.type === 'support') {
    const sideAttack = r.battle?.attacker === p.id;
    const useful = opts.filter(o => o.id !== 'sup:none');
    if (!useful.length) return 'sup:none';
    const best = botBest(r, useful, o => {
      const id = o.id.slice(6), c = botCardInfo(id);
      return (sideAttack ? (c.st || 0) * 2 + (c.hp || 0) : (c.hp || 0) * 2 + (c.st || 0)) + (c.jinx ? 45 : 0) - (o.id.startsWith('sup:c:') ? c.cost * .15 : 0);
    });
    return (Math.random() < .72 ? best : byId('sup:none')).id;
  }
  if (pend.type === 'upgrade') {
    const lands = opts.filter(o => o.id.startsWith('up:'));
    if (lands.length && p.gold >= 180)
      return botBest(r, lands, o => botLandScore(r, p, botTileFromOption(o))).id;
    if (byId('marlow:move') && Math.random() < .2) return 'marlow:move';
    return (byId('pass') || opts[0]).id;
  }
  if (pend.type === 'upgrade_lv') {
    const levels = opts.filter(o => o.id.startsWith('ul:') && o.id !== 'ul:cancel');
    if (!levels.length || p.gold < 180) return (byId('ul:cancel') || opts[0]).id;
    const affordableReserve = levels.filter(o => {
      const [, i, lv] = o.id.split(':');
      return p.gold - upCostRange(r, p, +i, +lv) >= 100;
    });
    return (affordableReserve[affordableReserve.length - 1] || levels[0]).id;
  }
  if (pend.type === 'market') {
    const visit = r.shopVisit;
    const choices = opts.filter(o => o.id.startsWith('buy:')).filter(o => {
      const item = visit && visit.items.find(x => x.slotId === o.id.slice(4));
      return item && !item.sold && item.price <= p.gold;
    });
    const best = botBest(r, choices, o => {
      const item = visit.items.find(x => x.slotId === o.id.slice(4));
      if (item.kind === 'remove') return p.gold >= 260 && (p.hand.length + p.discard.length) ? 20 : -100;
      const score = item.kind === 'support'
        ? ({ shield:65, weapon:70, jinx:72, gweapon:84, gshield:80 }[item.card] || 60)
        : botCardScore(r, p, item.card);
      return score - item.price * .45;
    });
    if (best && botCardScore(r, p, (visit.items.find(x => x.slotId === best.id.slice(4)) || {}).card) > 25)
      return best.id;
    return (byId('done') || opts[0]).id;
  }
  if (pend.type === 'gate') {
    if (byId('g_up') && p.gold >= 250) return 'g_up';
    if (byId('g_forge') && p.gold >= 300) return 'g_forge';
    return (byId('g_draft') || byId('pass') || opts[0]).id;
  }
  if (pend.type === 'forge') {
    const choices = opts.filter(o => o.id.startsWith('fg:'));
    return (botBest(r, choices, o => botCardScore(r, p, p.hand[+o.id.slice(3)])) || byId('back') || opts[0]).id;
  }
  if (pend.type === 'sell')
    return botBest(r, opts, o => botLandScore(r, p, botTileFromOption(o)), true).id;
  if (pend.type === 'overflow' || pend.type === 'forget') {
    const cards = nonCancel.filter(o => o.card);
    return (botBest(r, cards, o => botCardScore(r, p, o.card), true) || opts[0]).id;
  }
  if (pend.type === 'ult_lia') {
    if ((pend.selected || []).length >= Math.min(3, r.owners.filter(o => o && o.player !== p.id).length))
      return (byId('lu:confirm') || opts[0]).id;
    const targets = opts.filter(o => /^lu:\d+$/.test(o.id) && !(pend.selected || []).includes(+o.id.slice(3)));
    return (botBest(r, targets, o => landValue(r, +o.id.slice(3))) || byId('lu:confirm') || byId('lu:cancel')).id;
  }
  if (pend.type === 'ult_nerasio_land') {
    const confirm = byId('nu:confirm');
    if ((pend.selected || []).length >= Math.min(2, r.owners.filter((o, i) =>
      o && o.player === p.id && TILES[i].t === 'land').length)) return (confirm || opts[0]).id;
    const targets = opts.filter(o => /^nu:\d+$/.test(o.id) && !(pend.selected || []).includes(+o.id.slice(3)));
    return (botBest(r, targets, o => {
      const i = +o.id.slice(3);
      return landValue(r, i) + (tileElem(r, i) === CHARS[p.charId]?.elem ? -100 : 100);
    }) || confirm || byId('nu:cancel')).id;
  }
  if (pend.type === 'ult_nerasio_elem') {
    const selected = new Set(pend.selected || []);
    return (botBest(r, opts.filter(o => o.id.startsWith('ne:') && o.id !== 'ne:cancel'), o => {
      const elem = o.id.slice(3);
      let count = 0, levels = 0;
      r.owners.forEach((owner, i) => {
        if (!owner || owner.player !== p.id || TILES[i].t !== 'land') return;
        if (selected.has(i) || tileElem(r, i) === elem) { count++; levels += owner.level || 1; }
      });
      return count * 40 + levels * 5 + (elem === CHARS[p.charId]?.elem ? 15 : 0);
    }) || opts[0]).id;
  }
  if (pend.type === 'samurai_elem') {
    const wanted = CHARS[p.charId]?.elem;
    return (byId('se:' + wanted) || nonCancel[0] || opts[0]).id;
  }
  if (['curse_target', 'quake_target', 'spell_target', 'step_b', 'ult_mio'].includes(pend.type)) {
    const choices = nonCancel.filter(o => botTileFromOption(o) !== null);
    return (botBest(r, choices, o => botLandScore(r, p, botTileFromOption(o), true)) || opts[0]).id;
  }
  if (['marlow_dest'].includes(pend.type)) {
    const choices = nonCancel.filter(o => botTileFromOption(o) !== null);
    return (botBest(r, choices, o => botLandScore(r, p, botTileFromOption(o))) || opts[0]).id;
  }
  if (['move_a', 'move_b', 'swap_land', 'swap_pick', 'step_a', 'marlow_src'].includes(pend.type)) {
    const choice = botBest(r, nonCancel, o => {
      const tile = botTileFromOption(o);
      if (tile !== null) return botLandScore(r, p, tile);
      const card = o.card || p.hand[+String(o.id).split(':')[1]];
      return card ? botCardScore(r, p, card) : 0;
    });
    return (choice || opts.find(o => BOT_CANCEL_IDS.has(o.id)) || opts[0]).id;
  }
  return (opts.find(o => BOT_CANCEL_IDS.has(o.id)) || opts[Math.floor(Math.random() * opts.length)]).id;
}
function botDelayFor(r, pend, optionId) {
  if (pend.type === 'roll') return optionId === 'roll' ? 1200 : 1500;
  if (['pick_creature', 'support'].includes(pend.type)) return 1350;
  if (['tile', 'spell_target', 'quake_target', 'curse_target'].includes(pend.type)) return 1450;
  return 800 + Math.floor(Math.random() * 701);
}
function clearBotTimer(r) {
  if (r.botTimer) clearTimeout(r.botTimer);
  r.botTimer = null;
}
function scheduleBotAction(r) {
  clearBotTimer(r);
  if (!r.botMode || r.phase !== 'playing' || r.winner || r.turnTransition) return;
  const entry = Object.entries(r.pending || {}).find(([pid, pend]) => pById(r, pid)?.isBot && pend?.options?.length);
  if (!entry) return;
  const [pid, pend] = entry;
  const optionId = botChooseOption(r, pById(r, pid), pend);
  if (!optionId) return;
  const seq = ++r.botActionSeq;
  const type = pend.type;
  const availableDelay = Math.max(0, (pend.availableAt || 0) - Date.now());
  r.botTimer = setTimeout(() => {
    r.botTimer = null;
    if (r.botActionSeq !== seq || r.phase !== 'playing') return;
    const now = r.pending[pid];
    if (!now || now.type !== type || !now.options.some(o => o.id === optionId)) return scheduleBotAction(r);
    handleChoose(r, pid, optionId);
    touch(r);
    broadcast(r);
  }, Math.max(botDelayFor(r, pend, optionId), availableDelay + 50));
}

// ===== 公開状態とHTTP =====
// 進行中の戦闘はテレビ画面へ段階だけを公開する。
// ウェポンIDと「ウェポンなし」の区別は、両者が回答してlastBattleになるまで秘匿する。
function publicBattle(r) {
  const b = r.battle;
  if (!b) return null;
  const owner = r.owners[b.tile];
  const hasSupport = pid => Object.prototype.hasOwnProperty.call(b.supports || {}, pid);
  return {
    key: b.startedAt || `${b.tile}:${b.attacker}:${b.defender}`,
    phase: b.atkCreature ? 'support' : 'pick_attacker',
    tile: b.tile,
    terrainElem: tileElem(r, b.tile),
    attacker: b.attacker,
    defender: b.defender,
    atkCreature: b.atkCreature || null,
    defCreature: owner ? owner.creature : null,
    defLevel: owner ? owner.level : 1,
    defDamage: owner ? (owner.dmg || 0) : 0,
    terrainBreakdown: owner ? terrainBreakdown(r, b.tile, b.atkCreature) : null,
    effectStates: owner ? battleEffectStates(r, b) : { attacker: null, defender: null },
    supportReady: {
      attacker: hasSupport(b.attacker),
      defender: hasSupport(b.defender),
    },
  };
}
function publicState(r, viewerId) {
  return {
    ver: VERSION, code: r.code, phase: r.phase, evoLevel: RULES.evoLevel, turn: r.turn, round: r.round, target: ASSET_GOAL, reachAt: ASSET_REACH,
    stateRev: r.stateRev || 0, turnEpoch: r.turnEpoch || 0, serverNow: Date.now(),
    presentationSpeed: r.presentationSpeed === 2 ? 2 : 1,
    botMode: !!r.botMode,
    selectionReady: isSelectionReady(r),
    tiles: TILES.map((t, i) => r.elemOv[i] ? Object.assign({}, t, { e: r.elemOv[i] }) : t),
    tolls: r.owners.map((o, i) => o ? tollOf(r, i) : 0),
    landCombat: r.owners.map((o, i) => o ? landCombatUi(r, i) : null),
    tileFx: r.tileFx,
    owners: r.owners, market: r.market, shopVisit: r.shopVisit || null, log: r.log,
    titles: r.titles, duel: r.duel, curses: r.curses, lastEvent: r.lastEvent || null,
    barrier: r.barrier || {}, lastUlt: r.lastUlt || null,
    turnTransition: r.turnTransition ? {
      id: r.turnTransition.id, fromPlayer: r.turnTransition.fromPlayer,
      startedAt: r.turnTransition.startedAt, deadline: r.turnTransition.deadline,
    } : null,
    ultSequence: r.ultSequence ? { id: r.ultSequence.id, player: r.ultSequence.player,
      charId: r.ultSequence.charId, name: r.ultSequence.name, desc: r.ultSequence.desc,
      startedAt: r.ultSequence.startedAt, resolveAt: r.ultSequence.resolveAt,
      resolved: !!r.ultSequence.resolved } : null,
    battlePreview: publicBattle(r),
    lastBattle: r.lastBattle, lastDice: r.lastDice || null,
    lastSeal: r.lastSeal || null, lastRuin: r.lastRuin || null,
    lastBarrierHit: r.lastBarrierHit || null,
    upgradePreview: r.upgradePreview || null,   // 強化候補プレビュー(揮発 ─ v0.75)
    lastSpellFx: r.lastSpellFx || null,         // スペル盤面演出(発注書§7 ─ v0.77)
    saveRev: r.saveRev || 0,
    winner: r.winner,
    pending: Object.fromEntries(Object.entries(r.pending).map(([k, v]) =>
      v.type === 'draft' && k !== viewerId
        ? [k, { type: v.type, prompt: v.prompt, options: [], aura: r.draft ? r.draft.aura : null,
            resume: r.draft ? r.draft.resume : null }]
        : v.type === 'pick_draw' && k !== viewerId
          ? [k, { type: v.type, prompt: v.prompt, options: [], until: v.until }]  // 候補カードは本人だけに見せる
          : ['gaust_exile', 'fatal_exile', 'ult_villa_recover', 'daitekkan_recover'].includes(v.type) && k !== viewerId
            ? [k, { type: v.type, prompt: v.prompt, options: [], selectedCount: (v.selected || []).length }]
          : v.type === 'support' && k !== viewerId
            ? [k, { type: v.type, prompt: 'ウェポンを選択中', options: [] }]
            : [k, v])),
    lastDraw: r.lastDraw || null,
    lastGain: r.lastGain ? Object.assign({}, r.lastGain,
      r.lastGain.player === viewerId && Array.isArray(r.lastGain.cards)
        ? { cards: r.lastGain.cards.slice() } : { cards: undefined }) : null,
    catalog: { CREATURES, SUPPORTS, ITEMS, CHARS, ULTS, SPELLS, STARTER_DECKS: CHAR_DECKS, artIds: ART_IDS },
    players: r.players.map(p => ({
      id: p.id, name: p.name, charId: p.charId || null, confirmed: !!p.confirmed,
      isBot: !!p.isBot,
      color: p.color || '#888', pos: p.pos || 0, gold: p.gold ?? 0,
      battleWins: p.battleWins || 0, shrineVisits: p.shrineVisits || 0, ultUsed: !!p.ultUsed,
      hand: p.id === viewerId ? (p.hand || []) : [],
      deckList: p.id === viewerId ? [...(p.deck || [])].sort() : undefined,
      discardList: p.id === viewerId ? [...(p.discard || [])].sort() : undefined,
      exileList: p.id === viewerId ? [...(p.exile || [])].sort() : undefined,
      handCount: (p.hand || []).length,
      deckCount: (p.deck || []).length,
      discardCount: (p.discard || []).length,
      exileCount: (p.exile || []).length,
      effectiveSpellCosts: p.id === viewerId
        ? Object.fromEntries(Object.keys(SPELLS).map(sid => [sid, effectiveSpellCost(r, p, sid)]))
        : undefined,
      ultimateStatus: p.id === viewerId ? ultimateStatus(r, p) : undefined,
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
  r.stateRev = (r.stateRev || 0) + 1;
  for (const c of r.clients) {
    try { c.res.write(`data: ${JSON.stringify(publicState(r, c.viewerId))}\n\n`); }
    catch (e) { r.clients.delete(c); }
  }
  scheduleBotAction(r);
}

// ===== v0.62 セーブ/再開(docs/plan_save_v0.62.md §7準拠) =====
const SAVE_VER = 1;
// ルームのフィールド分類表。ルームに新しいキーを追加したら必ずどちらかに分類すること
// (save_testが未分類キーを検出して失敗する)
const ROOM_RUNTIME_KEYS = new Set(['clients', 'lastActivity', 'upgradePreview', 'botTimer', 'botActionSeq', 'ultTimer', 'processedActions', 'turnReadyAt', 'turnTransitionTimer', 'boardSeen']);  // 保存しない
const ROOM_PERSIST_KEYS = new Set([                                            // 保存する
  'code', 'phase', 'players', 'owners', 'deck', 'market', 'turn', 'round', 'log',
  'pending', 'titles', 'duel', 'lastBattle', 'winner', 'barrier', 'elemOv', 'tileFx',
  'curses', 'boardToken', 'atSeq', 'saveRev', 'battle', 'draft',
  'dirPend', 'halfMarket', 'shopVisit', 'effectQueue', 'effectResume', 'battleAfter',
  'lastEvent', 'lastDice', 'lastUlt', 'ultSequence', 'lastHeal', 'lastSeal', 'lastRuin', 'lastDraw', 'lastGain',
  'lastBarrierHit', 'lastSpellFx', 'botMode', 'presentationSpeed', 'turnEpoch', 'promptSeq', 'stateRev', 'turnTransition',
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
const RETIRED_CARD_IDS = new Set(['sp_cornucopia']);
const VALID_CARD = c => !!(CREATURES[c] || SPELLS[c] || SUPPORTS[c]);
const VALID_SAVE_CARD = c => VALID_CARD(c) || RETIRED_CARD_IDS.has(c);
function migrateLegacyWindShiftPlayer(p) {
  if (!p || !p.windShift) return false;
  if (p.dir) p.dir *= -1;
  else p.windShiftLegacyPending = true;
  delete p.windShift;
  return true;
}
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
    if (q.charId != null && (!CHARS[q.charId] || CHARS[q.charId].selectable === false))
      return 'キャラクターIDが不正です';
    for (const zone of ['deck', 'hand', 'discard', 'exile', 'resolving', 'pickCards']) {
      const z = q[zone];
      if (z == null) continue;
      if (!Array.isArray(z) || z.length > 300) return `カード置き場(${zone})が不正です`;
      for (const c of z) if (!VALID_SAVE_CARD(c)) return `不明なカードID: ${c}`;
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
  for (const c of d.deck) if (!VALID_SAVE_CARD(c)) return `共通山札に不明なカードID: ${c}`;
  if (d.market != null && (!Array.isArray(d.market) || d.market.some(c => !VALID_SAVE_CARD(c)))) return '市場データが不正です';
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
  const room = Object.assign(d, { clients: new Set(), lastActivity: Date.now(), botTimer: null, botActionSeq: 0,
    ultTimer: null, processedActions: [], turnTransitionTimer: null, boardSeen: true });
  if (room.botMode == null) room.botMode = false;
  if (room.presentationSpeed !== 2) room.presentationSpeed = 1;
  if (!Number.isInteger(room.turnEpoch)) room.turnEpoch = 0;
  if (!Number.isInteger(room.promptSeq)) room.promptSeq = 0;
  if (!Number.isInteger(room.stateRev)) room.stateRev = room.saveRev || 0;
  if (room.turnTransition) {
    if (room.turnTransition.deadline <= Date.now()) completeTurnTransition(room, room.turnTransition.id, 'timeout');
    else armTurnTransition(room);
  }
  if (!Array.isArray(room.effectQueue)) room.effectQueue = [];
  if (room.effectResume == null) room.effectResume = null;
  if (room.battleAfter == null) room.battleAfter = null;
  delete room.treasureCost;
  for (const p of room.players) {
    delete p.gems; delete p.treasures; delete p.gemThisStop; delete p.forgetThisStop;
    if (!Array.isArray(p.resolving)) p.resolving = [];
    migrateLegacyWindShiftPlayer(p);
    for (const zone of ['deck', 'hand', 'discard', 'exile', 'resolving', 'pickCards'])
      if (Array.isArray(p[zone])) p[zone] = p[zone].filter(c => !RETIRED_CARD_IDS.has(c));
  }
  room.deck = (room.deck || []).filter(c => !RETIRED_CARD_IDS.has(c));
  if (Array.isArray(room.market)) room.market = room.market.filter(c => !RETIRED_CARD_IDS.has(c));
  if (room.shopVisit && Array.isArray(room.shopVisit.items))
    room.shopVisit.items = room.shopVisit.items.filter(item => !RETIRED_CARD_IDS.has(item.card));
  for (const pend of Object.values(room.pending || {}))
    if (pend && Array.isArray(pend.options)) {
      pend.options = pend.options.filter(o => ![...RETIRED_CARD_IDS].some(c => o.card === c || String(o.id || '').includes(c)));
      if (!Number.isInteger(pend.turnEpoch)) pend.turnEpoch = room.turnEpoch;
      if (!pend.promptId) pend.promptId = `${room.turnEpoch}-${++room.promptSeq}`;
    }
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
  if (room.ultSequence && !room.ultSequence.resolved) {
    if (room.ultSequence.resolveAt <= Date.now()) resolveUltSequence(room);
    else armUltSequence(room);
  }
  scheduleBotAction(room);
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
const MIME = {
  html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', webm: 'video/webm',
  svg: 'image/svg+xml', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', otf: 'font/otf'
};
function serveFile(res, rel) {
  const fp = path.join(__dirname, 'public', rel);
  if (!fp.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const type = MIME[fp.split('.').pop()] || 'application/octet-stream';
    const charset = /^(?:text\/|application\/(?:javascript|json))/.test(type) ? '; charset=utf-8' : '';
    res.writeHead(200, { 'Content-Type': type + charset });
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
    battleWins: i, shrineVisits: i, seal: i % 2 === 0,
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
const publicBaseUrl = () => process.env.PUBLIC_URL
  ? process.env.PUBLIC_URL.replace(/\/$/, '')
  : `http://${lanIP()}:${PORT}`;
const phoneUrlForRoom = code => `${publicBaseUrl()}/phone?room=${encodeURIComponent(String(code || '').toUpperCase())}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  if (p === '/') return serveFile(res, 'site/index.html');
  if (p === '/play') return serveFile(res, 'board.html');
  if (p === '/board') { res.writeHead(302, { Location: '/play' }); return res.end(); }
  if (p === '/site') { res.writeHead(302, { Location: '/' }); return res.end(); }
  if (p === '/phone') return serveFile(res, 'phone.html');
  if (p.startsWith('/assets/')) return serveFile(res, p.slice(1));
  if (p.startsWith('/site/')) return serveFile(res, p.slice(1));
  // v0.66: 共有タイミング定数・Phaserワールド描画・同梱ライブラリ
  if (p === '/game_timing.js' || p === '/board_world.js' || p === '/battle_world.js' || p === '/ult_fx_world.js' ||
      p === '/fx_manifest.js' || p.startsWith('/vendor/'))
    return serveFile(res, p.slice(1));
  if (p === '/api/fixture') {
    // v0.66: 描画パリティ確認用の固定state(ルームは登録しない・開発用)
    return json(res, publicState(makeFixtureRoom(), null));
  }

  if (p === '/api/create' && req.method === 'POST') {
    const b = await readBody(req);
    const r = makeRoom(b.mode === 'bot' ? 'bot' : 'normal');
    return json(res, { code: r.code, phoneUrl: phoneUrlForRoom(r.code), boardToken: r.boardToken });
  }
  if (p === '/api/join' && req.method === 'POST') {
    const b = await readBody(req);
    const r = rooms.get((b.room || '').toUpperCase());
    if (!r) return json(res, { error: 'ルームが見つかりません' }, 404);
    const nm = String(b.name || '').trim().slice(0, 8);
    if (r.phase !== 'lobby') {
      // v0.62: 名前復帰 ─ 同名の「切断中」プレイヤーを引き継ぐ(接続中は乗っ取り不可)
      const pl = nm && r.players.find(x => x.name === nm && !x.isBot);
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
    if (r.botMode && r.players.some(x => !x.isBot))
      return json(res, { error: 'BOT戦にはプレイヤー1人だけ参加できます' }, 400);
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
    console.log(`ルーム${out.room.code}をセーブデータから復元`);
    return json(res, { code: out.room.code, phoneUrl: phoneUrlForRoom(out.room.code),
                       boardToken: out.room.boardToken, warn: out.warn || null });
  }
  if (p === '/api/resume' && req.method === 'POST') {
    const b = await readBody(req);
    const r = rooms.get((b.room || '').toUpperCase());
    const pl = r && r.players.find(x => x.id === b.playerId && !x.isBot);
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
      clearBotTimer(r);
      clearUltTimer(r);
      clearTurnTransitionTimer(r);
      for (const c of r.clients) { try { c.res.end(); } catch (e) {} }
      rooms.delete(r.code);
      console.log(`ルーム${r.code}を手動クローズ`);
    }
    return json(res, { ok: true });
  }
  if (p === '/api/room') {
    const r = rooms.get((url.searchParams.get('code') || '').toUpperCase());
    if (!r) return json(res, { exists: false });
    return json(res, { exists: true, phase: r.phase, players: r.players.length,
                       phoneUrl: phoneUrlForRoom(r.code) });
  }
  if (p === '/api/action' && req.method === 'POST') {
    const b = await readBody(req);
    const r = rooms.get((b.room || '').toUpperCase());
    if (!r) return json(res, { error: 'no room' }, 404);
    touch(r);
    if (b.type === 'start_select' && r.phase === 'lobby' &&
        (r.botMode ? r.players.filter(q => !q.isBot).length === 1 : r.players.length >= 2)) startSelect(r);
    else if (b.type === 'start_game') {
      if (b.token !== r.boardToken) return json(res, { error: '権限がありません' }, 403);
      if (!isSelectionReady(r))
        return json(res, { error: '召喚士の選択状態が変わりました。全員でもう一度確認してください' }, 409);
      startGame(r);
    }
    else if (b.type === 'choose') {
      const actor = pById(r, b.playerId);
      if (actor && actor.isBot) return json(res, { error: 'BOTは外部から操作できません' }, 403);
      const pend = r.pending[b.playerId];
      if (!actor || !pend) return json(res, { error: 'この操作は終了しています', state: publicState(r, b.playerId) }, 409);
      if (r.phase === 'playing' && (b.turnEpoch !== pend.turnEpoch || b.promptId !== pend.promptId))
        return json(res, { error: '手番が更新されました', state: publicState(r, b.playerId) }, 409);
      if (r.phase === 'playing' && (!b.actionId || (r.processedActions || []).includes(b.actionId)))
        return json(res, { error: b.actionId ? 'この操作は処理済みです' : '操作IDがありません', state: publicState(r, b.playerId) }, 409);
      if (!pend.options.some(o => o.id === b.optionId))
        return json(res, { error: '選択肢が更新されました', state: publicState(r, b.playerId) }, 409);
      if (pend?.availableAt && Date.now() < pend.availableAt)
        return json(res, { error: '城の帰還演出中です' }, 425);
      if (b.actionId) r.processedActions = [...(r.processedActions || []).slice(-99), b.actionId];
      handleChoose(r, b.playerId, b.optionId);
    }
    else if (b.type === 'set_presentation_speed') {
      if (b.token !== r.boardToken) return json(res, { error: '権限がありません' }, 403);
      if (!r.botMode) return json(res, { error: 'BOT戦でのみ変更できます' }, 409);
      r.presentationSpeed = b.speed === 2 ? 2 : 1;
      log(r, `BOT演出速度を${r.presentationSpeed === 2 ? '2倍' : '通常'}に変更`);
    }
    else if (b.type === 'presentation_complete') {
      if (b.token !== r.boardToken) return json(res, { error: '権限がありません' }, 403);
      if (!r.turnTransition) return json(res, { ok: true, alreadyComplete: true });
      if (b.transitionId !== r.turnTransition.id)
        return json(res, { error: '演出待機が更新されました' }, 409);
      completeTurnTransition(r, b.transitionId, 'board');
    }
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
    else if (b.type === 'shop_preview') {
      const actor = pById(r, b.playerId);
      const pv = r.pending[b.playerId];
      const visit = r.shopVisit;
      if (actor && !actor.isBot && pv?.type === 'market' && visit?.player === b.playerId && pv.shopId === visit.id) {
        if (b.slotId == null) visit.selected = null;
        else if (visit.items.some(x => x.slotId === b.slotId && !x.sold)) visit.selected = b.slotId;
      }
    }
    broadcast(r);
    return json(res, { ok: true });
  }
  if (p === '/api/events') {
    const r = rooms.get((url.searchParams.get('room') || '').toUpperCase());
    if (!r) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const requestedViewer = url.searchParams.get('me') || null;
    const viewer = pById(r, requestedViewer);
    const client = { res, viewerId: viewer && !viewer.isBot ? viewer.id : null };
    if (!client.viewerId) r.boardSeen = true;
    r.clients.add(client);
    res.write(`data: ${JSON.stringify(publicState(r, client.viewerId))}\n\n`);
    req.on('close', () => {
      r.clients.delete(client);
      // 切断時にプレビューを解除(発注書v0.75 §6.3)
      if (r.upgradePreview && r.upgradePreview.player === client.viewerId) {
        r.upgradePreview = null;
        broadcast(r);
      }
      if (r.shopVisit && r.shopVisit.player === client.viewerId && r.shopVisit.selected) {
        r.shopVisit.selected = null;
        broadcast(r);
      }
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log('SUMMONS CODE 統合サーバー起動');
  console.log(`  共有ボード: http://localhost:${PORT}`);
  console.log(process.env.PUBLIC_URL
    ? `  公開URL: ${process.env.PUBLIC_URL}`
    : `  スマホ参加: http://${lanIP()}:${PORT}/phone`);
});
