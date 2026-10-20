'use strict';
const fs=require('fs'),path=require('path');
const file=path.join(__dirname,'card-rarities.json');
function validate(values,groups){if(!values||Array.isArray(values)||typeof values!=='object')throw Error('設定形式が不正です');const cards=Object.assign({},...Object.values(groups));for(const[id,r]of Object.entries(values)){if(!Object.hasOwn(cards,id)||id.endsWith('_f'))throw Error('不明なカード: '+id);if(!['N','R','UR'].includes(r))throw Error('レアリティはN・R・URから選択してください');}return values;}
function apply(groups){const values=validate(JSON.parse(fs.readFileSync(file,'utf8')),groups);for(const group of Object.values(groups))for(const[id,c]of Object.entries(group)){if(Object.hasOwn(values,id))c.rarity=values[id]==='UR'?'L':values[id];}}
module.exports={file,validate,apply};
