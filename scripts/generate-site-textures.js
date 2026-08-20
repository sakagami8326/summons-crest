const path = require('path');
const sharp = require('sharp');

const size = 256;
const pixels = Buffer.alloc(size * size * 4);
let state = 0x51a7c0de;

for (let i = 0; i < size * size; i++) {
  state = (1664525 * state + 1013904223) >>> 0;
  const grain = 44 + (state & 63);
  const alpha = 10 + ((state >>> 8) & 31);
  pixels[i * 4] = grain;
  pixels[i * 4 + 1] = grain;
  pixels[i * 4 + 2] = grain;
  pixels[i * 4 + 3] = alpha;
}

const output = path.resolve(__dirname, '..', 'public', 'assets', 'site', 'noise-fine-v1.png');
sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(output)
  .then(() => console.log(output))
  .catch(error => { console.error(error); process.exitCode = 1; });

const paperWidth = 1600;
const paperHeight = 1000;
const paper = Buffer.alloc(paperWidth * paperHeight * 4);
let paperState = 0x37d2149b;
for (let y = 0; y < paperHeight; y++) {
  for (let x = 0; x < paperWidth; x++) {
    const i = y * paperWidth + x;
    paperState = (1103515245 * paperState + 12345) >>> 0;
    const broad = Math.sin(x / 173) * 7 + Math.cos(y / 139) * 6 + Math.sin((x + y) / 251) * 5;
    const grain = ((paperState >>> 12) & 31) - 15;
    const value = Math.max(42, Math.min(112, Math.round(72 + broad + grain)));
    paper[i * 4] = value;
    paper[i * 4 + 1] = value;
    paper[i * 4 + 2] = value;
    paper[i * 4 + 3] = 18 + ((paperState >>> 25) & 15);
  }
}

const paperOutput = path.resolve(__dirname, '..', 'public', 'assets', 'site', 'paper-grain-v2.webp');
sharp(paper, { raw: { width: paperWidth, height: paperHeight, channels: 4 } })
  .webp({ quality: 72, alphaQuality: 70, effort: 5 })
  .toFile(paperOutput)
  .then(() => console.log(paperOutput))
  .catch(error => { console.error(error); process.exitCode = 1; });
