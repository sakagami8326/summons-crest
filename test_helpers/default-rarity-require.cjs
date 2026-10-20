// Creature release regressions assert their original, approved balance profile.
// User-editable profiles are exercised separately by card_rarity_settings_test.js.
const {createRequire}=require('module'),path=require('path');
const serverRequire=createRequire(path.join(__dirname,'../server.js'));
module.exports=id=>id==='./card-rarity-settings'?{apply(){}}:serverRequire(id);
