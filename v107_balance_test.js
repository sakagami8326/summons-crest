// v1.07 regression: slower territory economy and 20% castle land bonus.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
src = src.replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require', '__dirname', 'process', 'console', 'setInterval',
  src + '\n;return { VERSION, LV_MUL, CHAIN_MUL, CASTLE_LAND_RATE, castleLandBonus };')(
  require, __dirname, process, console, () => {});

let pass = 0;
const ok = (value, name) => { if (!value) throw new Error('FAIL: ' + name); pass++; };
const eq = (actual, expected, name) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${name} (actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);

ok(Number(G.VERSION) >= 1.07, 'version is v1.07 or newer');
eq(G.LV_MUL, { 1: 1, 2: 2.5, 3: 8, 4: 20 }, 'level multipliers');
eq(G.CHAIN_MUL, [0, 1, 1.4, 1.8, 2.2, 2.6], 'chain multipliers remain unchanged');
eq(G.CASTLE_LAND_RATE, 0.2, 'castle territory bonus rate');
eq(G.castleLandBonus(600), 120, '600G territory value returns 20%');
eq(G.castleLandBonus(103), 21, 'fractional 20% result is rounded');
eq(Math.round(100 * G.LV_MUL[4] * G.CHAIN_MUL[4]), 4400,
  'one level-4 land in a four-chain stays below victory target');

console.log(`V1.07 BALANCE ALL ${pass} CHECKS PASSED`);
