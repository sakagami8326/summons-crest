const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public', 'assets', 'site', 'how-step-summoner-select-current-v3.png');
const characters = [
  ['summoner-still-redani.webp', 'レダーニ', 'FIRE'],
  ['summoner-still-linnei.webp', 'リンネイ', 'WATER'],
  ['summoner-still-grease.webp', 'グリース', 'EARTH'],
  ['summoner-still-mio.webp', 'ミオ', 'WIND']
];

async function main() {
  const background = await sharp(path.join(root, 'public', 'assets', 'summoner-select-bg-v1.png'))
    .resize(1200, 750, { fit: 'cover' })
    .modulate({ brightness: 1.04, saturation: .72 })
    .toBuffer();

  const panels = [];
  for (let i = 0; i < characters.length; i++) {
    const [file] = characters[i];
    panels.push({
      input: await sharp(path.join(root, 'public', 'assets', file))
        .resize(245, 525, { fit: 'cover', position: 'top' })
        .modulate({ saturation: .88 })
        .toBuffer(),
      left: 72 + i * 270,
      top: 128
    });
  }

  const labels = characters.map(([, name, elem], i) => {
    const x = 72 + i * 270;
    return `<rect x="${x}" y="128" width="245" height="525" fill="none" stroke="#b99542" stroke-width="2"/>
      <rect x="${x}" y="565" width="245" height="88" fill="#0c1222" fill-opacity=".9"/>
      <text x="${x + 122.5}" y="607" text-anchor="middle" fill="#fff8e7" font-family="Yu Mincho, serif" font-size="25" font-weight="600">${name}</text>
      <text x="${x + 122.5}" y="632" text-anchor="middle" fill="#d8ba67" font-family="serif" font-size="11" letter-spacing="3">${elem}</text>`;
  }).join('');

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750">
    <text x="600" y="59" text-anchor="middle" fill="#171827" font-family="Yu Mincho, serif" font-size="38" font-weight="600" letter-spacing="10">召喚士選択</text>
    <text x="600" y="86" text-anchor="middle" fill="#8a6a1e" font-family="serif" font-size="12" letter-spacing="7">SUMMONER SELECT</text>
    ${labels}
  </svg>`);

  await sharp(background).composite([...panels, { input: overlay }]).png({ compressionLevel: 9 }).toFile(output);
  console.log(output);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
