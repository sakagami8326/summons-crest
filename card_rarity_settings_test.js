'use strict';
const fs=require('fs'),assert=require('assert/strict'),settings=require('./card-rarity-settings');
const src=fs.readFileSync(__dirname+'/server.js','utf8').replace(/server\.listen\([\s\S]*?\}\);\s*$/,'');
const G=new Function('require','__dirname','setInterval','setTimeout',src+';return {CREATURES,SPELLS,SUPPORTS,makeDeck,publicCardCatalog,publicState,makeFixtureRoom};')(require,__dirname,()=>0,()=>0);
const saved=JSON.parse(fs.readFileSync(settings.file,'utf8')),catalog=G.publicCardCatalog(),deck=G.makeDeck();
for(const c of catalog.cards){const expected=saved[c.id]||(c.kind==='weapon'?'R':'N');assert.equal(c.rarity,expected,c.id);if(c.evolution)assert.equal(G.publicState(G.makeFixtureRoom(),null).catalog.CREATURES[c.id+'_f'].rarity,expected,c.id+' evolution')}
for(const[id,c]of Object.entries(G.SPELLS))assert.equal(deck.filter(x=>x===id).length,{N:3,R:2,L:1}[c.rarity],id+' draw copies');
assert.equal(new Set(catalog.cards.map(c=>c.id)).size,87);assert.throws(()=>settings.validate({unknown:'N'},G));assert.throws(()=>settings.validate({hibami:'BAD'},G));assert.throws(()=>settings.validate({hibami_f:'N'},G));
console.log('PASS saved rarity profile: 87 card values, evolved forms, spell draw weighting, validation');
