// v1.13 regression: creature rarity, stats, costs, and rewritten abilities.
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/, '');
const G = new Function('require','__dirname','process','console','setInterval',
  src + '\n;return {VERSION,CREATURES,makeRoom,tollOf,spellDamage};')(
  require,__dirname,process,console,()=>{});
let pass=0;
const ok=(v,n)=>{if(!v)throw new Error('FAIL: '+n);pass++;};
const eq=(a,b,n)=>ok(JSON.stringify(a)===JSON.stringify(b),`${n} (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);
eq(G.VERSION,'1.13','version');
const C=G.CREATURES;
eq([C.strauk.rarity,C.samurai_saga.rarity,C.pakawata.rarity,C.ludi.rarity],['L','L','L','R'],'rarities');
eq([C.gecko.st,C.nome.hp,C.nome.evoHp],[30,40,65],'starter stats');
eq([C.beruf.cost,C.morbill.cost,C.fugorm.cost,C.garble.cost,C.goagoa.cost,C.zati.cost],
  [60,60,80,100,100,60],'summon costs');
ok(C.detropas.fx.includes('AT+10'),'Pack grants AT+10 per fire land');
ok(C.qbaby.fx.includes('自分の火領地'),'Queen affects all friendly fire lands');
ok(C.kbaby.fx.includes('1.5倍')&&C.kbaby.fx.includes('2倍'),'King uses toll multipliers');
ok(C.beruf.fx.includes('DF+10')&&C.beruf.fx.includes('上限なし'),'Shade grants uncapped DF');
{
  const r=G.makeRoom(); r.players=[{id:'p',name:'P',discard:[]}];
  r.owners[1]={player:'p',level:1,creature:'kbaby'};
  const normal=G.tollOf(r,1);
  r.owners[1].level=3;
  const evolved=G.tollOf(r,1);
  eq([normal,evolved],[38,400],'King toll is multiplied before payment');
}
{
  const r=G.makeRoom(); r.players=[{id:'p',name:'P',discard:[]}];
  r.owners[1]={player:'p',level:1,creature:'beruf',dmg:0};
  for(let i=0;i<5;i++) G.spellDamage(r,1,1,'test');
  eq(r.owners[1].shade,5,'Shade stacks beyond the old cap');
}
console.log(`V1.13 BALANCE ALL ${pass} CHECKS PASSED`);
