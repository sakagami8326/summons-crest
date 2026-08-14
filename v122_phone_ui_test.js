const fs = require('fs');

const phone = fs.readFileSync('public/phone.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const pkg = require('./package.json');
const css = (phone.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];

if (!/const VERSION = '1\.(\d+)';/.test(server) || Number(RegExp.$1) < 22 || Number(pkg.version.split('.')[1]) < 22)
  throw new Error('バージョン検査: v1.22以降ではない');

if (!fs.existsSync('public/assets/ui/phone-btn-ultimate-v2.webp'))
  throw new Error('必殺技ボタン検査: 正方形の新規素材がない');
if (!/grid-template-columns:repeat\(5,13\.2dvh\)/.test(css) ||
    !/#ultBtn\s*\{[^}]*grid-column:1[^}]*phone-btn-ultimate-v2\.webp/.test(css) ||
    !/#mapBtn\s*\{[^}]*grid-column:2/.test(css) ||
    !/#fsBtn\s*\{[^}]*grid-column:5/.test(css))
  throw new Error('操作ボタン検査: 必殺技から全画面までの5列配置が不正');
if (!/#msg\s*\{[^}]*grid-column:1\s*\/\s*6[^}]*color:#111[^}]*-webkit-line-clamp:2/.test(css) ||
    !/<div id="topTools">[\s\S]*?<div id="msg"/.test(phone))
  throw new Error('アナウンス検査: ボタン群の下段・黒文字・2行表示になっていない');
if (!/<button id="joinFsBtn"[^>]*>/.test(phone) ||
    !/\$\('joinFsBtn'\)\.onclick\s*=\s*toggleFullscreen/.test(phone) ||
    !/screen\.orientation\.lock\('landscape'\)/.test(phone))
  throw new Error('全画面検査: 入室前の全画面ボタンまたは共通処理がない');
if (!/#diceBtn\s*\{[^}]*width:22dvh[^}]*height:22dvh/.test(css) ||
    !/\.dice3d\s*\{[^}]*width:15dvh[^}]*height:15dvh/.test(css))
  throw new Error('サイコロ検査: ボタンまたは3Dサイコロが拡大されていない');
if (!/#hand \.card\.dim\s*\{[^}]*brightness\(\.48\)[^}]*saturate\(\.35\)/.test(css))
  throw new Error('カード暗転検査: 手札のドロップシャドウより強い暗転指定がない');
for (const type of ['creatureCard', 'spellCard', 'supportCard']) {
  const re = new RegExp('\\.' + type + ' \\.ccCost\\s*\\{[^}]*z-index:20[^}]*top:62\\.8%');
  if (!re.test(css)) throw new Error(`コスト表示検査: ${type}の位置またはレイヤーが不正`);
}
if (!/const canUlt = !!\([\s\S]*?\$\('ultBtn'\)\.disabled = !canUlt/.test(phone) ||
    !/#ultBtn:disabled\s*\{/.test(css))
  throw new Error('必殺技状態検査: 常時配置または使用不可時の無効化がない');

let source = server.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const internals = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  source + ';return { CREATURES, askRoll, makeRoom };')(
  require, __dirname, process, { log: () => {}, error: console.error }, () => 0);
const { CREATURES } = internals;
const bodyOf = text => String(text || '').replace(/^【[^】]+】/, '');
for (const [id, creature] of Object.entries(CREATURES)) {
  for (const key of ['fx', 'evoFx']) {
    if (!creature[key]) continue;
    const body = bodyOf(creature[key]);
    if ([...body].length > 34)
      throw new Error(`効果本文検査: ${id}.${key}が34文字を超過 (${[...body].length}文字)`);
  }
}
if (CREATURES.samurai_saga.fx !== '【地脈改変】全属性の土地で地形補正を得る。召喚した土地を任意の属性へ変更できる' ||
    CREATURES.marlow.fx !== '【風渡り】自領地停止時、配置中のマーロー1体を空いている風属性土地へ移動できる')
  throw new Error('効果本文検査: サムライ・サガまたはマーローの短縮文が不正');

{
  const room = internals.makeRoom();
  const player = { id:'ui-cost', name:'UI検査', charId:'redani', fixedDice:null, ultUsed:true,
    spellCast:false, hand:['sp_gale'], gold:0 };
  room.players = [player];
  internals.askRoll(room, player);
  if (room.pending[player.id].options.some(o => o.id === 'sp:sp_gale'))
    throw new Error('使用可否検査: 資金不足のスペルが合法選択肢に含まれる');
  player.gold = 100;
  internals.askRoll(room, player);
  if (!room.pending[player.id].options.some(o => o.id === 'sp:sp_gale'))
    throw new Error('使用可否検査: 資金があるスペルが合法選択肢に含まれない');
  player.spellCast = true;
  internals.askRoll(room, player);
  if (room.pending[player.id].options.some(o => o.id === 'sp:sp_gale'))
    throw new Error('使用可否検査: スペル使用後も別スペルが合法選択肢に残る');
}

console.log('v1.22 スマホUI検査: OK');
