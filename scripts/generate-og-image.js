const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const logo = fs.readFileSync(path.join(root, 'public', 'assets', 'summons-code-gold.svg'));
const output = path.join(root, 'public', 'assets', 'site', 'og-summons-code-v1.png');

const background = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="50%" cy="43%" r="72%">
      <stop offset="0" stop-color="#29233d"/>
      <stop offset="0.55" stop-color="#141227"/>
      <stop offset="1" stop-color="#080a12"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M24 0V48M0 24H48" stroke="#efd98f" stroke-opacity=".035" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect x="28" y="28" width="1144" height="574" rx="2" fill="none" stroke="#efd98f" stroke-opacity=".32" stroke-width="2"/>
  <rect x="39" y="39" width="1122" height="552" rx="2" fill="none" stroke="#efd98f" stroke-opacity=".12"/>
</svg>`);

async function main() {
  const fittedLogo = await sharp(logo)
    .resize({ width: 760, height: 400, fit: 'contain' })
    .png()
    .toBuffer();

  await sharp(background)
    .composite([{ input: fittedLogo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(output);

  console.log(output);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
