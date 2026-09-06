'use strict';

// Deliberately receives rule calculators, never mutation/HTTP/timer functions.
module.exports = function createStandardBot(A) {
  const { CREATURES:C, SPELLS:S, SUPPORTS:W, CHARS, RULES, ELEM_OF_SPELL,
    baseId, mapOf, tilesOf, tileElem, isCavern, cavernNeighbors, cavernRouteProjection,
    botCashReserve, botPurchaseScore, botCardScore, botCardNeedScore, botLandingScore, botRouteDistance,
    botWalkEndpoints, calculateBattle, creatureMaxHp, terrainBreakdown, chainCount,
    landValue, tollOf, points, upCostRange, effectiveSpellCost, stepSources, stepDests,
    marlowSources, marlowDests, abyssMarkBonusFor, creatureSupportEnabled } = A;
  const clone = x => structuredClone(x);
  const inventory = p => [...p.hand, ...p.deck, ...p.discard];
  const ownLands = (r,p) => r.owners.flatMap((o,i) => o?.player === p.id ? [i] : []);
  const enemyLands = (r,p) => r.owners.flatMap((o,i) => o && o.player !== p.id ? [i] : []);
  const player = (r,id) => r.players.find(p => p.id === id);
  const cancelled = id => /:cancel$/.test(id) || ['pass','back','skip','done','sup:none'].includes(id);
  const numberTile = o => Number.isInteger(o.tile) ? o.tile : /^\w+:\d+$/.test(o.id) ? +o.id.split(':')[1] : null;
  const average = a => a.reduce((n,x) => n+x,0) / Math.max(1,a.length);
  const cautious = a => .7*average(a) + .3*Math.min(...a);
  const handledPending = new Set(('abyss_mark curse_target daitekkan_recover direction draft forge forget gate market '
    +'marlow_dest marlow_src mermaid_heal move_a move_b overflow pick_creature pick_draw quake_target roll route_choice '
    +'samurai_elem select_char select_wait sell spell_target step_a step_b support swap_land swap_pick tile toxy_target '
    +'ult_lia ult_mio ult_nerasio_elem ult_nerasio_land ult_resolve ult_villa_recover upgrade upgrade_lv gaust_exile fatal_exile').split(' '));

  function view(raw, me, pending) {
    const r = {};
    for (const key of ['mapId','phase','turn','round','owners','elemOv','tileFx','curses','barrier','titles','duel','dirPend'])
      if (raw[key] !== undefined) r[key] = clone(raw[key]);
    r.players = raw.players.map(src => {
      const p = {};
      for (const key of ['id','name','charId','pos','gold','lap','seal','dir','previousTile','reverseNext',
        'gatesVisited','bankrupt','blade','ultUsed','battleWins','shrineVisits'])
        if (src[key] !== undefined) p[key] = clone(src[key]);
      const self = src.id === me.id;
      // Counts are public, contents are not. No copying/iteration of enemy cards.
      for (const zone of ['hand','deck','discard','exile']) {
        p[zone+'Count'] = src[zone+'Count'] ?? (src[zone] || []).length;
        p[zone] = self ? (src[zone] || []).slice() : Array(p[zone+'Count']).fill(null);
        if (self && zone === 'deck') p[zone].sort();
      }
      if (self) for (const key of ['spellCast','fixedDice','pendSpell','stepI','swapI','moveA'])
        if (src[key] !== undefined) p[key] = clone(src[key]);
      return p;
    });
    if (raw.battle) {
      r.battle = {};
      for (const key of ['tile','attacker','defender','atkCreature','moveFrom','corridor','atkCarry','atkShade'])
        if (raw.battle[key] !== undefined) r.battle[key] = clone(raw.battle[key]);
      r.battle.supports = {}; // Even a submitted enemy choice is still secret.
    }
    if (pending.type === 'market' || pending.type === 'forget') r.shopVisit = clone(raw.shopVisit);
    return { r, p:player(r,me.id), pending:clone(pending) };
  }
  const trafficCache = new WeakMap();
  function traffic(r,p,tile) {
    let cache = trafficCache.get(r);
    if (!cache) { cache = new Map(); trafficCache.set(r,cache); }
    const key = p.id+':'+tile;
    if (cache.has(key)) return cache.get(key);
    let count = 0;
    for (const other of r.players.filter(x => x.id !== p.id && !x.bankrupt)) {
      const ns = isCavern(r) ? cavernNeighbors(r,other) : other.dir
        ? [(other.pos+other.dir+tilesOf(r).length)%tilesOf(r).length] : mapOf(r).neighbors[other.pos];
      for (let die=1;die<=6;die++) {
        const ends = [...new Set(ns.flatMap(n => botWalkEndpoints(r,other,n,die)))];
        if (ends.includes(tile)) count += 1/(6*ends.length);
      }
    }
    cache.set(key,count); return count;
  }
  function positionValue(r,p) {
    return ownLands(r,p).reduce((sum,i) => {
      const o = r.owners[i], info=C[o.creature];
      const hp = Math.max(0,creatureMaxHp(o)-(o.dmg||0));
      const df = terrainBreakdown(r,i).appliedBonus;
      const earth = ['emeri','valk'].includes(baseId(o.creature)) ? Math.min(5,chainCount(r,p.id,'earth'))*5 : 0;
      const ability = ['wakatama','mist_jelly','night_jelly','qbaby','trooper'].includes(baseId(o.creature)) ? 30 : 0;
      return sum + landValue(r,i) + (hp+df+earth)*.8 + tollOf(r,i)*traffic(r,p,i)*2 + ability
        + (tileElem(r,i)===CHARS[p.charId]?.elem && o.level<RULES.maxLevel ? RULES.levelCost[o.level+1]*.02 : 0)
        + (info?.elem === tileElem(r,i) ? 15 : 0);
    },0);
  }
  const liquid = (r,p) => p.gold + ownLands(r,p).reduce((n,i) => n+Math.round(landValue(r,i)*.7),0);
  const afford = (r,p,cost,exception=false) => cost===0 || cost <= p.gold && (exception || p.gold-cost >= botCashReserve(r,p));
  const lossValue = (r,p,id) => Math.max(20,botCardScore(r,p,id)) + (C[id]?.cost||0)*.25;
  function cardValue(r,p,id) {
    return botCardNeedScore(r,p,id);
  }
  function supports(r,p,cid,reserved=false) {
    const out=[{kind:'none'}]; let skip=reserved;
    for (const id of p.hand) {
      if (skip && id===cid) { skip=false; continue; }
      if (W[id]) out.push({kind:'support',cardId:id});
      else if (C[id] && creatureSupportEnabled(cid) && C[id].cost<=p.gold)
        out.push({kind:'creature',cardId:id});
    }
    return out.filter((x,i,a)=>a.findIndex(y=>y.kind===x.kind&&y.cardId===x.cardId)===i);
  }
  function enemySupports(r,p,cid,attacker=false,fromLand=false) {
    if (p.handCount <= (attacker&&!fromLand?1:0)) return [{kind:'none'}];
    const out=[{kind:'none'}];
    for (const field of ['st','hp','jinx']) {
      const ids=Object.keys(W).filter(id=>W[id][field]);
      ids.sort((a,b)=>Number(W[b][field])-Number(W[a][field]));
      if(ids[0]) out.push({kind:'support',cardId:ids[0]});
    }
    if(creatureSupportEnabled(cid)) for(const field of ['st','hp']) {
      const ids=Object.keys(C).filter(id=>C[id].cost<=p.gold);
      ids.sort((a,b)=>C[b][field]-C[a][field]);
      if(ids[0]) out.push({kind:'creature',cardId:ids[0]});
    }
    return out.filter((x,i,a)=>a.findIndex(y=>y.kind===x.kind&&y.cardId===x.cardId)===i);
  }
  const supportCost = s => s.kind==='creature'?C[s.cardId].cost:0;
  function combat(r,p,b,ownSupport) {
    const attack = b.attacker===p.id, rival=player(r,attack?b.defender:b.attacker);
    const rivalCid=attack?r.owners[b.tile].creature:b.atkCreature;
    const guesses=enemySupports(r,rival,rivalCid,!attack,b.moveFrom!==undefined||b.corridor);
    const fee=supportCost(ownSupport), material=ownSupport.cardId?lossValue(r,p,ownSupport.cardId)*(ownSupport.kind==='creature'?.2:.45):0;
    const toll=b.moveFrom!==undefined||b.corridor?0:tollOf(r,b.tile);
    const results=guesses.map(s=>calculateBattle(r,{...b,supports:{[p.id]:ownSupport,[rival.id]:s}}));
    const values=results.map(q=>{
      const asset=landValue(r,b.tile), src=b.moveFrom;
      if (attack) return (q.win ? asset*1.4+toll*.4+40-(src!==undefined?landValue(r,src):0)
        : -toll*1.25+(baseId(r.owners[b.tile].creature)==='goagoa'?Math.max(0,q.dealt-10):q.dealt)*.5)
        - (!q.atkSurvived && baseId(b.atkCreature)!=='gaston'?lossValue(r,p,b.atkCreature):0)
        - (!q.win&&!q.atkSurvived&&src!==undefined?landValue(r,src):0)-fee-material
        - (!q.win && liquid(r,p)-fee-toll<0 ? 10000 : 0);
      return (q.win ? -asset*1.4-lossValue(r,p,r.owners[b.tile].creature) : asset*.25+toll*.4-q.dealt*.8)
        + (!q.atkSurvived?lossValue(r,rival,b.atkCreature)*.5:0)-fee-material;
    });
    const wins=results.filter(q=>attack?q.win:!q.win).length;
    const rescue=liquid(r,p)-toll<0 && results.every(q=>attack?q.win:!q.win);
    return {score:afford(r,p,fee,rescue)?cautious(values):-Infinity, fee, wins, results,
      reason:`戦闘想定${wins}/${results.length}で${attack?'侵略':'防衛'}成功、消費${fee}G`};
  }
  function invasion(r,p,tile,cids=p.hand.filter(id=>C[id]),extra={}) {
    const o=r.owners[tile]; if(!o || o.player===p.id) return null;
    const trials=[];
    for(const cid of [...new Set(cids)]) for(const sup of supports(r,p,cid,extra.moveFrom===undefined&&!extra.corridor)) {
      const b={tile,attacker:p.id,defender:o.player,atkCreature:cid,...extra};
      trials.push({...combat(r,p,b,sup),cid,sup});
    }
    return trials.sort((a,b)=>b.score-a.score||a.fee-b.fee)[0]||null;
  }
  function upgradePlans(r,p) {
    const out=[], before=positionValue(r,p);
    for(const i of ownLands(r,p)) for(let lv=r.owners[i].level+1;lv<=RULES.maxLevel;lv++) {
      const cost=upCostRange(r,p,i,lv); if(!afford(r,p,cost)) continue;
      const next=clone(r); next.owners[i].level=lv;
      out.push({tile:i,lv,cost,score:positionValue(next,p)-before-cost,reason:'資産・防衛・通行料と強化費を比較'});
    }
    return out.sort((a,b)=>b.score-a.score||a.cost-b.cost||a.tile-b.tile||a.lv-b.lv);
  }
  function placement(r,p,tile,cid) {
    const cost=C[cid].cost; if(!afford(r,p,cost)) return -Infinity;
    const next=clone(r); next.owners[tile]={player:p.id,creature:cid,level:1};
    const base=baseId(cid);
    if(base==='komao')next.elemOv[tile]='earth';
    if(base==='night_jelly')next.owners[tile].abyssMarkTarget=ownLands(next,p)
      .sort((a,b)=>tollOf(next,b)*(1+traffic(next,p,b))-tollOf(next,a)*(1+traffic(next,p,a)))[0];
    const grant={cresteria:'shield',fugorm:'weapon',kamadoma:'weapon',trooper:'sp_flame_vortex'}[base];
    const gift=grant?Math.max(0,cardValue(r,p,grant))*.3:base==='gaust'?20+(p.charId==='villa'?20:0):0;
    return positionValue(next,p)-positionValue(r,p)-cost-lossValue(r,p,cid)*.2+gift;
  }
  function moveScore(r,p,src,dst,marlow=false) {
    const o=r.owners[src]; if(!o) return -Infinity;
    if(r.owners[dst]) return invasion(r,p,dst,[o.creature],{moveFrom:src})?.score??-Infinity;
    const next=clone(r);next.owners[dst]={...o,level:marlow?o.level:1};next.owners[src]=null;
    return positionValue(next,p)-positionValue(r,p);
  }
  const landingCache=new WeakMap();
  function landing(r,p,tile) {
    let cache=landingCache.get(r);if(!cache){cache=new Map();landingCache.set(r,cache);}
    const key=p.id+':'+p.gold+':'+tile;
    if(cache.has(key))return cache.get(key);
    const o=r.owners[tile];let value=botLandingScore(r,p,tile);
    if(o&&o.player!==p.id&&!r.barrier[o.player])value=Math.max(value,invasion(r,p,tile)?.score??-Infinity);
    cache.set(key,value);return value;
  }
  function walkOutcomes(r,p,steps,first=null) {
    const map=mapOf(r),cave=isCavern(r),out=[],seen=new Map(),full=(1<<map.gates.length)-1;
    const lands=ownLands(r,p).reduce((n,i)=>n+landValue(r,i),0),provider=ownLands(r,p).some(i=>baseId(r.owners[i].creature)==='wakatama');
    const initialMask=cave?map.gates.reduce((n,i,k)=>n|((p.gatesVisited||[]).includes(i)?1<<k:0),0):p.seal?1:0;
    const visit=(prev,tile,left,state)=>{
      let {mask,lap,goldGain,returns,gateAwarded,landAdded}=state;
      const gate=map.gates.indexOf(tile);
      if(gate>=0&&!(mask&(1<<gate))){mask|=1<<gate;if(cave||!gateAwarded)goldGain+=map.gateBonus;gateAwarded=true;}
      let won=false;
      if(tile===map.castle){
        if(!cave||mask===full)lap++;
        if(mask===full){
          const recovered=cave||!landAdded?ownLands(r,p).reduce((n,i)=>n+Math.min(10,Math.max(0,(r.owners[i].dmg||0)-returns*10)),0):0;
          goldGain+=(lap-1)*RULES.castleBonusPerLap + (cave||!landAdded?Math.round(lands*.2):0) + (provider?recovered:0);
          // Legacy long moves award healing and a draft only once, even across several laps.
          returns=cave?returns+1:1;landAdded=true;mask=0;won=cave&&points(r,p)+goldGain>=A.ASSET_GOAL;
        }
      }
      const key=[prev,tile,left,mask,lap,returns,gateAwarded,landAdded].join(':');
      if((seen.get(key)??-Infinity)>=goldGain)return;seen.set(key,goldGain);
      const o=r.owners[tile],stop=o&&o.player!==p.id&&baseId(o.creature)==='mist_jelly';
      if(left===0||stop||won){out.push({tile,previousTile:prev,lap,mask,goldGain,returns,win:won||!cave&&returns>0&&points(r,p)+goldGain>=A.ASSET_GOAL});return;}
      const next=cave?map.neighbors[tile].filter(i=>i!==prev):[(tile+(p.dir||((tile-prev+map.tiles.length)%map.tiles.length===1?1:-1))+map.tiles.length)%map.tiles.length];
      for(const dest of next)visit(tile,dest,left-1,{mask,lap,goldGain,returns,gateAwarded,landAdded});
    };
    if(steps<1)return [{tile:p.pos,previousTile:p.previousTile,lap:p.lap,mask:initialMask,goldGain:0,returns:0,win:false}];
    const next=first!==null?[first]:cave?cavernNeighbors(r,p):p.dir?[(p.pos+p.dir+map.tiles.length)%map.tiles.length]:map.neighbors[p.pos];
    for(const tile of next)visit(p.pos,tile,steps-1,{mask:initialMask,lap:p.lap||1,goldGain:0,returns:0,gateAwarded:false,landAdded:false});
    return out;
  }
  function outcomeValue(r,p,x) {
    if(x.win)return 100000;
    const q={...p,gold:p.gold+x.goldGain};
    const healing=ownLands(r,p).reduce((n,i)=>n+Math.min(r.owners[i].dmg||0,x.returns*10),0);
    return landing(r,q,x.tile)+x.goldGain+healing*1.5+x.returns*30;
  }
  function movement(r,p,steps) { return Math.max(...walkOutcomes(r,p,steps).map(x=>outcomeValue(r,p,x))); }
  const diceCache=new Map();
  function diceDistribution(n) {
    if(diceCache.has(n))return diceCache.get(n);
    let d=new Map([[0,1]]);
    for(let j=0;j<n;j++){const next=new Map();for(const [s,w] of d)for(let i=1;i<=6;i++)next.set(s+i,(next.get(s+i)||0)+w/6);d=next;}
    diceCache.set(n,d);return d;
  }
  const expectedMove=(r,p,n=1)=>[...diceDistribution(n)].reduce((sum,[s,w])=>sum+movement(r,p,s)*w,0);

  function exposure(r,p) { return ownLands(r,p).reduce((n,i)=>n+traffic(r,p,i)*(tollOf(r,i)+landValue(r,i)*.25),0); }
  function healValue(r,p,tile,amount,ward=false) {
    const o=r.owners[tile], healed=Math.min(o.dmg||0,amount);
    const provider=ownLands(r,p).some(i=>baseId(r.owners[i].creature)==='wakatama');
    return healed*(1.5+(provider?1:0)) + (ward?10:0)*(1+traffic(r,p,tile)*2);
  }
  function damageValue(r,p,tile,damage,isSpell=true,vortex=false) {
    const o=r.owners[tile], base=baseId(o.creature), evo=C[o.creature].forged||o.level>=RULES.evoLevel;
    if(isSpell&&base==='bunnyhop'&&!evo) damage=0;
    if(base==='bedebero') damage=Math.max(0,damage-10);
    const dead=creatureMaxHp(o)-(o.dmg||0)-damage<=0;
    const canReach=mapOf(r).neighbors[p.pos].includes(tile);
    return dead?landValue(r,tile)*.7+tollOf(r,tile)*.5+40
      : damage*(canReach?2:1) + (vortex&&canReach?20:0) - (base==='beruf'&&damage?15:0);
  }
  function teleportValue(r,p,tile) {
    const map=mapOf(r);
    if(isCavern(r)&&tile===map.castle&&map.gates.every(i=>(p.gatesVisited||[]).includes(i))) {
      const lands=ownLands(r,p).reduce((n,i)=>n+landValue(r,i),0);
      const bonus=(p.lap||1)*RULES.castleBonusPerLap+Math.round(lands*.2);
      if(points(r,p)+bonus>=A.ASSET_GOAL)return 100000;
      return bonus+80;
    }
    if(isCavern(r)&&map.gates.includes(tile)&&!(p.gatesVisited||[]).includes(tile))return 180;
    if(r.owners[tile]&&r.owners[tile].player!==p.id) {
      return Math.max(-tollOf(r,tile)*1.25,invasion(r,p,tile)?.score??-Infinity);
    }
    return botLandingScore(r,p,tile);
  }
  function spellPlans(r,p,sid) {
    const cost=effectiveSpellCost(r,p,sid), out=[], own=ownLands(r,p), enemies=enemyLands(r,p);
    const paid=clone(r),caster=player(paid,p.id);caster.gold-=cost;
    const add=(benefit,extra={},fee=cost)=>{
      const rescue=extra.priority===2;
      if(afford(r,p,fee,rescue) || sid==='sp_gold'&&fee<=p.gold)
        out.push({sid,cost:fee,score:benefit-fee-12,reason:S[sid].name+'の効果と費用を比較',...extra});
    };
    if(sid==='sp_gold') add(Math.max(1,p.lap)*100);
    else if(sid==='sp_insight') add(Math.min(2,Math.max(0,7-p.hand.length+1))*50);
    else if(sid==='sp_fatal_reward') {
      const cheapest=Math.min(...p.hand.filter(id=>id!==sid).map(id=>cardValue(r,p,id)));
      add(35+(p.charId==='villa'?45:0)-Math.max(0,cheapest)*.5);
    } else if(S[sid].fixedDice) {
      const value=movement(paid,caster,S[sid].fixedDice);
      add(value-expectedMove(r,p),{priority:value>=99900?2:0});
    } else if(sid==='sp_gale') add(expectedMove(paid,caster,2)-expectedMove(r,p));
    else if(sid==='sp_wind_shift') {
      if(isCavern(r)&&p.previousTile==null || !isCavern(r)&&!p.dir)return out;
      const q={...caster,dir:-(p.dir||1),reverseNext:!p.reverseNext};
      add(expectedMove(paid,q)-expectedMove(r,p));
    } else if(sid==='sp_ward') add(r.barrier[p.id]?0:exposure(r,p));
    else if(sid==='sp_bloodstained_blade') {
      if(!p.blade){caster.blade=true;add(expectedMove(paid,caster)-expectedMove(r,p));}
    } else if(sid==='sp_bedrock_uplift') {
      for(const tile of own)if(r.owners[tile].dmg>0)add(healValue(r,p,tile,20,!(r.tileFx[tile]?.uplift)),{a:tile});
    } else if(sid==='sp_weaken'||sid==='sp_flame_vortex') {
      for(const tile of enemies)add(damageValue(r,p,tile,sid==='sp_weaken'?20:10,true,sid==='sp_flame_vortex'),{a:tile});
    } else if(sid==='sp_quake') {
      for(const tile of enemies)if(r.owners[tile].level>1){const n=clone(r);n.owners[tile].level--;
        add((landValue(r,tile)-landValue(n,tile))*.8+(tollOf(r,tile)-tollOf(n,tile))*.5,{a:tile});}
    } else if(ELEM_OF_SPELL[sid]) {
      const before=positionValue(r,p);
      for(const tile of own)if(tileElem(r,tile)!==ELEM_OF_SPELL[sid]){const n=clone(r);n.elemOv[tile]=ELEM_OF_SPELL[sid];
        add(positionValue(n,p)-before,{a:tile});}
    } else if(sid==='sp_step') {
      for(const src of stepSources(r,p))for(const dst of stepDests(r,p,src))add(moveScore(r,p,src,dst),{a:src,b:dst});
    } else if(sid==='sp_move') {
      const before=positionValue(r,p);
      for(const a of own)for(const b of own.filter(i=>i>a)){
        const n=clone(r),oa=n.owners[a],ob=n.owners[b];
        for(const key of ['creature','dmg','abyssMarkTarget']) [oa[key],ob[key]]=[ob[key],oa[key]];
        add(positionValue(n,p)-before,{a,b});
      }
    } else if(sid==='sp_swap') {
      const before=positionValue(r,p);
      for(const a of own)for(const cid of [...new Set(p.hand.filter(id=>C[id]))]) {
        const n=clone(r);n.owners[a]={player:p.id,level:r.owners[a].level,creature:cid,dmg:0,shade:0};
        add(positionValue(n,p)-before-lossValue(r,p,cid)*.2,{a,cid},cost+C[cid].cost);
      }
    }
    return out.sort((a,b)=>b.score-a.score||a.cost-b.cost);
  }
  function ultimatePlan(r,p) {
    const own=ownLands(r,p), out={score:-Infinity,reason:'有効な必殺技対象なし'};
    const baseline=()=>expectedMove(r,p);
    if(p.charId==='redani')return {score:expectedMove(r,p,3)-baseline()-50,reason:'3個ダイスの期待到着評価'};
    if(p.charId==='mio') {
      const choices=tilesOf(r).map((_,tile)=>({tile,value:teleportValue(r,p,tile)})).sort((a,b)=>b.value-a.value||a.tile-b.tile);
      return {...choices[0],score:choices[0].value-baseline()-50,priority:choices[0].value>=99900?2:0,reason:'瞬間移動の到着利益'};
    }
    if(p.charId==='linnei')return {score:p.gold>=botCashReserve(r,p)+100 && (inventory(p).filter(id=>C[id]).length<5||inventory(p).filter(id=>W[id]).length<2)?40:-1,reason:'半額市場の予算と補充需要'};
    if(p.charId==='grease')return {score:r.barrier[p.id]?-1:exposure(r,p)-60,reason:'次の手番までの領地保護'};
    if(p.charId==='adel')return {score:own.reduce((n,i)=>n+healValue(r,p,i,20,!r.owners[i].iceWard),0)-60,reason:'実回復と防衛DFの改善'};
    if(p.charId==='lia') {
      const targets=enemyLands(r,p).map(tile=>({tile,value:damageValue(r,p,tile,10,false,true)}))
        .filter(x=>x.value>0).sort((a,b)=>b.value-a.value||a.tile-b.tile).slice(0,3);
      return {targets:targets.map(x=>x.tile),score:targets.reduce((n,x)=>n+x.value,0)-60,reason:'最大3領地への実効ダメージ'};
    }
    if(p.charId==='villa') {
      if(!p.exile.length)return out;
      const recovery=p.exile.map(id=>cardValue(r,p,id)).sort((a,b)=>b-a).slice(0,Math.min(3,Math.max(0,7-p.hand.length))).reduce((n,x)=>n+Math.max(0,x)*.5,0);
      const endpoints=walkOutcomes(r,p,p.exile.length), map=mapOf(r);
      const continuation=Math.max(...endpoints.map(x=>{
        if(x.win)return 100000;
        const q={...p,pos:x.tile,previousTile:x.previousTile,lap:x.lap,gold:p.gold+x.goldGain,
          gatesVisited:map.gates.filter((_,i)=>x.mask&(1<<i)),seal:!!x.mask,reverseNext:false};
        return outcomeValue(r,p,x)+expectedMove(r,q);
      }));
      return {score:continuation-baseline()+recovery-50,priority:continuation>=99900?2:0,reason:'廃棄回収・追加移動・後続ダイスの利益'};
    }
    if(p.charId==='nerasio') {
      const before=positionValue(r,p), plans=[];
      for(const elem of ['fire','water','earth','wind'])for(let j=0;j<own.length;j++)for(let k=j;k<own.length;k++) {
        const targets=[...new Set([own[j],own[k]])],n=clone(r);targets.forEach(i=>n.elemOv[i]=elem);
        plans.push({elem,targets,score:positionValue(n,p)-before-60,reason:'土地属性の組み合わせ改善'});
      }
      return plans.sort((a,b)=>b.score-a.score||a.targets.length-b.targets.length)[0]||out;
    }
    return out;
  }
  function relocationPlans(r,p) {
    const out=[];
    for(const a of marlowSources(r,p))for(const b of marlowDests(r))out.push({a,b,score:moveScore(r,p,a,b,true)});
    return out.sort((a,b)=>b.score-a.score||a.a-b.a||a.b-b.b);
  }
  function liquidation(r,p) {
    const initial=positionValue(r,p), debt=Math.max(0,-p.gold);
    let frontier=[{state:r,path:[],cash:0,loss:0}],best=null;
    for(let depth=0;depth<ownLands(r,p).length&&frontier.length;depth++) {
      const next=[],seen=new Set();
      for(const node of frontier)for(const tile of ownLands(node.state,p)) {
        const state=clone(node.state),cash=node.cash+Math.round(landValue(state,tile)*.7);state.owners[tile]=null;
        const path=[...node.path,tile],key=path.slice().sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);
        const loss=initial-positionValue(state,p),candidate={state,path,cash,loss};
        if(cash>=debt){if(!best||loss<best.loss||loss===best.loss&&path.length<best.path.length)best=candidate;}
        else if(!best||loss<best.loss)next.push(candidate);
      }
      // Bounded search keeps forced liquidation responsive even with many territories.
      frontier=next.sort((a,b)=>a.loss/Math.max(1,a.cash)-b.loss/Math.max(1,b.cash)||a.loss-b.loss).slice(0,32);
    }
    return best;
  }
  function evaluateActions(r,p,pd) {
    const opts=pd.options, by=id=>opts.find(o=>o.id===id), result=[];
    const add=(id,score,reason,extra={})=>result.push({id,score,reason,...extra});
    const baseline=()=>{for(const o of opts.filter(o=>cancelled(o.id)))add(o.id,0,'行動を見送り資源を温存');};
    const bestCard=(o)=>o.card||o.id.replace(/^(take:|atk:|sup:[sc]:|summon:|ov:)/,'');
    baseline();
    if(pd.type==='roll') {
      add('roll',0,'スペル・必殺技を温存して通常移動',{priority:expectedMove(r,p)>=99999?2:0});
      for(const o of opts.filter(o=>o.id.startsWith('sp:'))){const plan=spellPlans(r,p,o.id.slice(3))[0];if(plan)add(o.id,plan.score,plan.reason,{cost:plan.cost,cards:1,priority:plan.priority||0});}
      if(by('ult')){const plan=ultimatePlan(r,p);add('ult',plan.score,plan.reason,{priority:plan.priority||0});}
    } else if(pd.type==='route_choice') {
      for(const o of opts){const victory=o.destinations.some(d=>d.victory);add(o.id,Math.max(...o.destinations.map(d=>botLandingScore(r,p,d.tile)))-botRouteDistance(r,p,o.tile)*2,'通行料と着地利益・門への距離',{priority:victory?2:0});}
    } else if(pd.type==='direction') {
      for(const o of opts)add(o.id,movement(r,{...p,dir:o.id==='dir:-1'?-1:1},r.dirPend?.steps||1),'方向別の実到着地点');
    } else if(pd.type==='tile') {
      for(const o of opts.filter(o=>o.id.startsWith('summon:')))add(o.id,placement(r,p,p.pos,o.id.slice(7)),'配置後の領地価値・召喚費・手札戦力',{cost:C[o.id.slice(7)].cost,cards:1});
      if(by('toll'))add('toll',-tollOf(r,p.pos)*1.25,'支払いでカードを温存');
      if(by('invade')){const trial=invasion(r,p,p.pos);if(trial)add('invade',trial.score,trial.reason);}
    } else if(pd.type==='pick_creature') {
      for(const o of opts){const cid=bestCard(o),trial=invasion(r,p,r.battle.tile,[cid],r.battle.moveFrom!==undefined?{moveFrom:r.battle.moveFrom}:{});if(trial)add(o.id,trial.score,trial.reason,{cost:trial.fee});}
    } else if(pd.type==='support') {
      // Replace the neutral cancellation score: support:none has its own combat result.
      result.length=0;
      for(const o of opts){const s=o.id==='sup:none'?{kind:'none'}:{kind:o.id.startsWith('sup:c:')?'creature':'support',cardId:o.id.slice(6)};
        const trial=combat(r,p,r.battle,s);add(o.id,trial.score,trial.reason,{cost:trial.fee,cards:s.kind==='none'?0:1});}
    } else if(pd.type==='upgrade'||pd.type==='upgrade_lv'||pd.type==='gate'||pd.type==='forge') {
      const upgrades=upgradePlans(r,p);
      if(pd.type==='upgrade') {
        for(const o of opts.filter(o=>o.id.startsWith('up:'))){const v=upgrades.find(x=>x.tile===numberTile(o));if(v)add(o.id,v.score,v.reason,{cost:v.cost});}
        if(by('marlow:move')){const v=relocationPlans(r,p)[0];if(v)add('marlow:move',v.score,'移動後の土地価値');}
      } else if(pd.type==='upgrade_lv') {
        for(const o of opts.filter(o=>/^ul:\d+:\d+$/.test(o.id))){const [,i,lv]=o.id.split(':').map(Number),v=upgrades.find(x=>x.tile===i&&x.lv===lv);if(v)add(o.id,v.score,v.reason,{cost:v.cost});}
      } else {
        const forge=p.hand.flatMap((id,i)=>C[id]?.evo&&afford(r,p,RULES.forgeCost)?[{i,score:(C[id].evoSt-C[id].st+C[id].evoHp-C[id].hp)*3-RULES.forgeCost+30}]:[]).sort((a,b)=>b.score-a.score);
        if(pd.type==='forge')for(const v of forge)add('fg:'+v.i,v.score,'進化による戦力増加',{cost:RULES.forgeCost});
        else {
          if(upgrades[0]&&by('g_up'))add('g_up',upgrades[0].score,upgrades[0].reason,{cost:upgrades[0].cost});
          if(forge[0]&&by('g_forge'))add('g_forge',forge[0].score,'鍛錬で得られる戦力',{cost:RULES.forgeCost});
          if(by('g_draft'))add('g_draft',inventory(p).filter(id=>C[id]).length<5?65:25,'未公開候補を見ず補充需要を評価');
        }
      }
    } else if(pd.type==='market') {
      const visit=r.shopVisit;
      if(visit?.player===p.id&&visit.items.filter(x=>x.sold&&x.card).length<2)for(const o of opts.filter(o=>o.id.startsWith('buy:'))){
        const item=visit.items.find(x=>x.slotId===o.id.slice(4));
        add(o.id,botPurchaseScore(r,p,item,botCashReserve(r,p))-20,'補充価値と購入後の予算',{cost:item?.price||0,cards:1});
      }
    } else if(['draft','pick_draw','daitekkan_recover','ult_villa_recover','overflow','forget','gaust_exile','fatal_exile'].includes(pd.type)) {
      const discard=['overflow','forget','gaust_exile','fatal_exile'].includes(pd.type);
      for(const o of opts.filter(o=>!cancelled(o.id)&&o.id!=='vr:confirm')) {
        if(pd.type==='ult_villa_recover'&&(pd.selected||[]).includes(+o.id.slice(3)))continue;
        const cid=o.card||bestCard(o);if(!C[cid]&&!W[cid]&&!S[cid])continue;
        let score=cardValue(r,p,cid)*(discard?-1:1);
        if(discard&&p.charId==='villa'&&pd.type!=='overflow')score+=25;
        if(pd.type==='forget')score-=r.shopVisit?.items.find(x=>x.kind==='remove')?.price||80;
        add(o.id,score,'役割不足・相性・重複からカード価値を比較');
      }
      if(by('vr:confirm')){if((pd.selected||[]).length>=3)result.length=0;add('vr:confirm',0,'必要な回収を完了');}
    } else if(pd.type==='sell') {
      const plan=liquidation(r,p);
      for(const o of opts){const tile=numberTile(o);if(tile!==null)add(o.id,plan?.path[0]===tile?1:-landValue(r,tile),'連鎖の再計算を含む売却組み合わせ');}
    } else if(['curse_target','quake_target','spell_target','step_a','step_b','move_a','move_b','swap_land','swap_pick'].includes(pd.type)) {
      const sid=pd.type==='curse_target'?'sp_weaken':pd.type==='quake_target'?'sp_quake':pd.type==='spell_target'?p.pendSpell:
        pd.type.startsWith('step_')?'sp_step':pd.type.startsWith('move_')?'sp_move':'sp_swap';
      const plans=sid?spellPlans(r,p,sid):[];
      for(const o of opts.filter(o=>!cancelled(o.id))){const tile=numberTile(o);
        const v=plans.find(x=>pd.type==='step_b'?x.a===p.stepI&&x.b===tile:pd.type==='move_b'?(x.a===p.moveA&&x.b===tile||x.b===p.moveA&&x.a===tile):
          pd.type==='swap_pick'?x.a===p.swapI&&x.cid===o.id.slice(4):x.a===tile||pd.type==='move_a'&&x.b===tile);
        if(v)add(o.id,v.score,v.reason,{cost:v.cost});
      }
    } else if(pd.type==='marlow_src'||pd.type==='marlow_dest') {
      const plans=relocationPlans(r,p);
      for(const o of opts.filter(o=>!cancelled(o.id))){const tile=numberTile(o),v=plans.find(x=>pd.type==='marlow_src'?x.a===tile:x.a===pd.source&&x.b===tile);if(v)add(o.id,v.score,'移動元と移動先を一組で評価');}
    } else if(pd.type==='ult_mio') {
      for(const o of opts.filter(o=>!cancelled(o.id))){const v=teleportValue(r,p,numberTile(o));add(o.id,v,'瞬間移動の実到着利益',{priority:v>=99900?2:0});}
    } else if(['ult_lia','ult_nerasio_land','ult_nerasio_elem'].includes(pd.type)) {
      const plan=ultimatePlan(r,p);
      if(pd.type==='ult_nerasio_elem')for(const o of opts.filter(o=>!cancelled(o.id))){const elem=o.id.slice(3),n=clone(r);(pd.selected||[]).forEach(i=>n.elemOv[i]=elem);add(o.id,positionValue(n,p)-positionValue(r,p),'選んだ領地の属性組み合わせ');}
      else {
        const selected=pd.selected||[], targets=plan.targets||[];
        for(const o of opts.filter(o=>!cancelled(o.id)&&!o.id.endsWith(':confirm'))){const tile=numberTile(o);if(!selected.includes(tile)&&targets.includes(tile))add(o.id,100,'組み合わせ評価で選んだ対象');}
        const confirm=opts.find(o=>o.id.endsWith(':confirm'));if(confirm)add(confirm.id,selected.length?1:-1,'有効対象の選択完了');
      }
    } else if(pd.type==='abyss_mark') {
      for(const o of opts){const i=numberTile(o);if(i!==null)add(o.id,abyssMarkBonusFor(r.owners[pd.sourceTile],r.owners[i])*(1+traffic(r,p,i)*2),'標の増額と到達される可能性');}
    } else if(pd.type==='mermaid_heal') {
      for(const o of opts){const i=numberTile(o);if(i!==null)add(o.id,healValue(r,p,i,10),'実回復量と回復収入');}
    } else if(pd.type==='toxy_target') {
      for(const o of opts){const target=player(r,o.player||o.id.slice(3));if(target)add(o.id,target.handCount*20+points(r,target)*.02,'公開された手札枚数と資産から妨害対象を選ぶ');}
    } else if(pd.type==='samurai_elem') {
      for(const o of opts.filter(o=>o.id.startsWith('se:'))){const elem=o.id.slice(3),next=clone(r);if(elem!=='none')next.elemOv[pd.tile]=elem;
        add(o.id,positionValue(next,p)-positionValue(r,p),'属性変更後の連鎖・地形・土領地補正');}
    } else if(['select_char','select_wait','ult_resolve'].includes(pd.type)) {
      if(opts[0])add(opts[0].id,0,'進行用の合法選択');
    } else {
      const o=opts.find(o=>cancelled(o.id))||opts[0];if(o)add(o.id,0,'未登録pendingの安全フォールバック: '+pd.type);
    }
    return result;
  }

  // All candidate results are test-visible but never attached to room state.
  function choose(raw,me,pending) {
    if(!pending?.options?.length)return {id:null,candidates:[]};
    const {r,p,pending:pd}=view(raw,me,pending);
    const options=pd.options||[];
    if(!options.length)return {id:null,candidates:[]};
    const ranked=evaluateActions(r,p,pd).filter(x=>options.some(o=>o.id===x.id));
    ranked.sort((a,b)=>(b.priority||0)-(a.priority||0)||b.score-a.score||(a.cost||0)-(b.cost||0)||(a.cards||0)-(b.cards||0)
      ||options.findIndex(o=>o.id===a.id)-options.findIndex(o=>o.id===b.id));
    return {id:ranked[0]?.id||options.find(o=>cancelled(o.id))?.id||options[0].id,candidates:ranked};
  }

  return {choose,view,calculateBattle,combat,invasion,cardValue,positionValue,traffic,diceDistribution,walkOutcomes,spellPlans,ultimatePlan,handledPending};
};
