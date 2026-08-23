'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const board = fs.readFileSync(path.join(root, 'public', 'board.html'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'public', 'phone.html'), 'utf8');
const asset = fs.readFileSync(path.join(root, 'public', 'assets', 'element-water-v2.svg'), 'utf8');

function readConstant(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const jsonStart = start + prefix.length;
  const jsonEnd = source.indexOf(';', jsonStart);
  assert.notStrictEqual(jsonEnd, -1, `${name} must terminate`);
  return JSON.parse(source.slice(jsonStart, jsonEnd));
}

const boardLight = readConstant(board, 'ELEM');
const boardDark = readConstant(board, 'ELEM_DARK');
const phoneMini = readConstant(phone, 'ELEM_MINI');
const newMark = 'M437.94,1057.86';
const oldMark = 'M19.05,562.68';

for (const [label, markup] of [
  ['board light', boardLight.water],
  ['board dark', boardDark.water],
  ['phone mini', phoneMini.water],
]) {
  assert(markup.includes(newMark), `${label} must use the new water logo`);
  assert(!markup.includes(oldMark), `${label} must not retain the old water logo`);
  assert(markup.includes('<circle cx="74.42"'), `${label} must include the new bubble detail`);
}

assert(boardLight.water.includes('fill="#56A8E8"'), 'board light color must remain water blue');
assert(phoneMini.water.includes('fill="#56A8E8"'), 'phone color must remain water blue');
assert(boardDark.water.includes('fill="#141219"'), 'board shadow variant must remain dark');
assert(asset.includes('viewBox="0 0 1010.05 1113.95"'), 'source asset must preserve the supplied viewBox');

console.log('ELEMENT LOGO: ALL 13 CHECKS PASSED');
