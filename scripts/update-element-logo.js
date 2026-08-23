'use strict';

const fs = require('fs');
const path = require('path');

const [elementId, sourceArg, colorArg] = process.argv.slice(2);
if (!elementId || !sourceArg || !colorArg) {
  throw new Error('Usage: node scripts/update-element-logo.js <element> <source.svg> <color>');
}

const root = path.resolve(__dirname, '..');
const sourcePath = path.resolve(root, sourceArg);
const svg = fs.readFileSync(sourcePath, 'utf8');
const viewBox = svg.match(/viewBox="([^"]+)"/i);
const body = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
if (!viewBox || !body) throw new Error(`Invalid SVG: ${sourcePath}`);

const [minX, minY, width, height] = viewBox[1].trim().split(/\s+/).map(Number);
if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
  throw new Error(`Invalid viewBox: ${viewBox[1]}`);
}

const scale = Math.min(68 / width, 72 / height) * 0.94;
const centerX = minX + width / 2;
const centerY = minY + height / 2;
const shapes = body[1]
  .replace(/<!--([\s\S]*?)-->/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function mark(color) {
  return `<g transform="scale(${scale.toFixed(6)}) translate(${-centerX},${-centerY})" fill="${color}">${shapes}</g>`;
}

function updateJsonConstant(filePath, constantName, value) {
  let source = fs.readFileSync(filePath, 'utf8');
  const prefix = `const ${constantName} = `;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`${constantName} not found in ${filePath}`);
  const jsonStart = start + prefix.length;
  const jsonEnd = source.indexOf(';', jsonStart);
  if (jsonEnd < 0) throw new Error(`${constantName} terminator not found in ${filePath}`);
  const values = JSON.parse(source.slice(jsonStart, jsonEnd));
  if (!(elementId in values)) throw new Error(`${elementId} not found in ${constantName}`);
  values[elementId] = value;
  source = source.slice(0, jsonStart) + JSON.stringify(values) + source.slice(jsonEnd);
  fs.writeFileSync(filePath, source);
}

const boardPath = path.join(root, 'public', 'board.html');
const phonePath = path.join(root, 'public', 'phone.html');
updateJsonConstant(boardPath, 'ELEM', mark(colorArg));
updateJsonConstant(boardPath, 'ELEM_DARK', mark('#141219'));
updateJsonConstant(phonePath, 'ELEM_MINI', mark(colorArg));

console.log(`Updated ${elementId} element logo in board and phone UI.`);
