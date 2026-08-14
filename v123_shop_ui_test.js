const fs = require('fs');

const phone = fs.readFileSync('public/phone.html', 'utf8');
const board = fs.readFileSync('public/board.html', 'utf8');
const boardWorld = fs.readFileSync('public/board_world.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const pkg = require('./package.json');
const css = (phone.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];

if (!/const VERSION = '1\.23';/.test(server) || pkg.version !== '1.23.0' || !/board 1\.23/.test(board))
  throw new Error('バージョン検査: v1.23へ統一されていない');

const pawn = fs.readFileSync('public/assets/p_adel.png');
if (pawn.toString('ascii', 1, 4) !== 'PNG' || pawn.readUInt32BE(16) !== 190 || pawn.readUInt32BE(20) !== 227)
  throw new Error('アーデル検査: p_adel.pngが幅190pxのPNGではない');
if (!/`<img src="\/assets\/p_\$\{it\.charId\}\.png"/.test(board) ||
    !/pngTexture\('pw_' \+ it\.charId, '\/assets\/p_' \+ it\.charId \+ '\.png'\)/.test(boardWorld))
  throw new Error('アーデル検査: DOM描画とPhaser描画が共通の盤面コマを参照していない');

if (/id="pKeeper"|id="pBubble"|#shopScene \.keeper|#shopScene \.bubble/.test(phone))
  throw new Error('スマホ店主検査: 店主または吹き出しが残っている');
if (!/id="shopKeeper"/.test(board) || !/id="shopBubble"/.test(board))
  throw new Error('テレビ店主検査: テレビ側の店主演出が消えている');

if (!/#shopShelf\s*\{[^}]*grid-template-columns:repeat\(10,minmax\(0,1fr\)\)[^}]*grid-template-rows:repeat\(2/.test(css) ||
    !/\.shopProduct:nth-child\(9\)\s*\{\s*grid-area:2\/8\/3\/10/.test(css))
  throw new Error('商品配置検査: 5+4商品の10分割グリッドになっていない');
if (!/\.shopProduct \.shopCard\s*\{[^}]*height:min\(33dvh[^}]*aspect-ratio:4\/5/.test(css) ||
    !/gap:\.35dvh \.22vw/.test(css))
  throw new Error('商品サイズ検査: コンパクトカードの寸法または余白が不正');

if (!/function shopCompactHTML\(item, visit\)/.test(phone) ||
    !/shopCompactName/.test(phone) || !/shopCompactPrice/.test(phone) ||
    !/stat-at-icon\.svg/.test(phone) || !/stat-hp-icon\.svg/.test(phone))
  throw new Error('一覧表示検査: 商品名・価格・AT・HPの軽量表示がない');
const compactSource = phone.match(/function shopCompactHTML\(item, visit\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
if (/ccEffect|spText|suText|desc|fx/.test(compactSource))
  throw new Error('一覧表示検査: 効果全文がコンパクト一覧へ混入している');

if (!/function creatureDetailInfoHTML\(cid, cr, evo, includeModes\)/.test(phone) ||
    !/function renderShopDetail\(item, visit\)/.test(phone) ||
    !/<button class="abtn ghost" id="shopCancel">戻る<\/button><button class="abtn" id="shopBuy">購入する<\/button>/.test(phone))
  throw new Error('詳細表示検査: 共通詳細または右下の戻る・購入操作がない');
if (!/renderShopDetail\(item, visit\)/.test(phone) || !/item\.price > me\(\)\.gold \? 'ゴールド不足'/.test(phone) ||
    !/type:'shop_preview'/.test(phone) || !/choose\('buy:' \+ slotId\)/.test(phone))
  throw new Error('購入検査: 詳細確認・資金不足・同期・購入処理のいずれかが欠けている');
if (!/手札または捨て札からカードを1枚選んで削除する。対象を確定するまで料金は消費しない。/.test(phone))
  throw new Error('カード削除検査: 詳細説明が不足している');

let source = server.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const internals = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  source + ';return { makeRoom, makeShopVisit };')(
  require, __dirname, process, { log: () => {}, error: console.error }, () => 0);
const room = internals.makeRoom();
const player = { id:'shop-ui', name:'UI検査', charId:'redani', gold:500 };
room.players = [player];
internals.makeShopVisit(room, player);
if (room.shopVisit.items.length !== 9 ||
    room.shopVisit.items.map(x => x.slotId).join(',') !== 'card0,card1,card2,card3,card4,weapon,shield,jinx,remove')
  throw new Error('商品構成検査: 既存の9商品構成が維持されていない');

console.log('v1.23 スマホショップUI検査: OK');
