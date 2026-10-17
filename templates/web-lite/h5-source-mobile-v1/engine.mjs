// Owned small lifecycle module around existing games, not a replacement game engine.
export function racePhase(state) { return state === 'finish' ? 'finished' : state === 'paused' ? 'paused' : ['race', 'countdown'].includes(state) ? 'running' : 'ready'; }
export function newProgress() { return { version: 1, best: 0, bank: 0, rounds: 0, nextRoundId: 1, lastRewardedRound: 0, assistTokens: 0 }; }
export function purchaseAssist(progress) {
  if (progress.bank < 10 || progress.assistTokens >= 1) return false;
  progress.bank -= 10; progress.assistTokens = 1; return true;
}
export function startRound(progress, limitMs = null) {
  return { id: progress.nextRoundId++, phase: 'running', elapsedMs: 0, limitMs, score: 0, settled: false, rewardClaimed: false };
}
export function tickRound(round, ms, score) {
  if (round.phase !== 'running') return;
  if (Number.isFinite(score) && score >= 0) round.score = Math.floor(score);
  if (Number.isFinite(ms) && ms > 0) round.elapsedMs += ms;
  if (round.limitMs !== null && round.elapsedMs >= round.limitMs) { round.elapsedMs = round.limitMs; round.phase = 'finished'; }
}
export function pauseRound(round) { if (round.phase === 'running') round.phase = 'paused'; }
export function resumeRound(round) { if (round.phase === 'paused') round.phase = 'running'; }
export function finishRound(round, progress) {
  round.phase = 'finished';
  if (round.settled) return false;
  round.settled = true; progress.rounds++; progress.best = Math.max(progress.best, round.score); progress.bank += round.score;
  return true;
}
export function rewardRound(round, progress, complete) {
  if (complete !== true || round.phase !== 'finished' || !round.settled || round.score <= 0 || round.rewardClaimed || progress.lastRewardedRound === round.id) return false;
  round.rewardClaimed = true; progress.lastRewardedRound = round.id; progress.bank += round.score; return true;
}
export function adAllowed(round, progress, sinceStartupMs) {
  return round.phase === 'finished' && round.settled && round.score > 0 && progress.rounds >= 2 && sinceStartupMs >= 60000 && !round.rewardClaimed;
}
export function saveProgress(progress, gameId) { return JSON.stringify({ version: 1, gameId, progress }); }
export function loadProgress(raw, gameId) {
  try {
    if (typeof raw !== 'string' || raw.length > 2000) return null;
    const data = JSON.parse(raw), p = data.progress;
    if (data.version !== 1 || data.gameId !== gameId || p?.version !== 1 ||
      !['best', 'bank', 'rounds', 'lastRewardedRound'].every(k => Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= 1000000) ||
      !Number.isInteger(p.assistTokens) || p.assistTokens < 0 || p.assistTokens > 1 ||
      !Number.isInteger(p.nextRoundId) || p.nextRoundId < 1 || p.nextRoundId > 1000001 || p.lastRewardedRound >= p.nextRoundId) return null;
    return p;
  } catch { return null; }
}

// Challenge goals observe the existing engines. They do not replace their rules or ads.
const CHALLENGES = {
  'pelican-bike': [
    {id:'coast',title:'海岸抓鱼',instructions:'90秒内抓到8分。金鱼加分，左右追鱼。',limitMs:90000,kind:'fish',target:8},
    {id:'sprint',title:'限时冲刺',instructions:'45秒内抓到5分，尽快对准前方的鱼。',limitMs:45000,kind:'fish',target:5},
    {id:'jump',title:'腾跃追鱼',instructions:'90秒内抓到8分，并完成3次跳跃。',limitMs:90000,kind:'fish',target:8,jumps:3},
  ],
  'qq-speed': [
    {id:'finish',title:'城市完赛',instructions:'城市赛道跑完一圈。左右转向，必要时漂移。',limitMs:150000,kind:'race',target:1,map:'city'},
    {id:'podium',title:'海岛领奖台',instructions:'爱琴海一圈完赛，并进入前三名。',limitMs:150000,kind:'race',target:1,map:'aegean',place:3},
    {id:'drift',title:'漂移练习赛',instructions:'城市一圈完赛，并触发2次有效漂移。',limitMs:150000,kind:'race',target:1,map:'city',drifts:2},
  ],
  'cf-transport-ship': [
    {id:'tags',title:'步枪突围',instructions:'60秒内先命中1次，再换位8米，手动追击命中3次；最多阵亡2次。',limitMs:60000,kind:'hits',target:3,weapon:'m4a1',drill:'reposition',openingHits:1,minTravel:8,maxDeaths:2},
    {id:'precision',title:'狙击尝试',instructions:'90秒内用 AWM 击杀1名敌人。轻点开镜、瞄准后开火。',limitMs:90000,kind:'kills',target:1,weapon:'awm'},
    {id:'survive',title:'小队生存',instructions:'MP5起手，坚持45秒，累计移动20米，死亡不超过2次。',limitMs:45000,kind:'survive',target:2,minTravel:20,weapon:'mp5'},
    {id:'defense',title:'双点反击',instructions:'100秒内亲自坚守A、B两处真实据点，各5秒；敌军独占据点8秒即失守。最多阵亡2次。',limitMs:100000,kind:'defend',target:2,holdSeconds:5,breachSeconds:8,radius:5,maxDeaths:2,weapon:'m4a1'},
    // Campaign 02: each mission requires a genuinely different native action.
    // No unlock fees, phantom kills, injected hitpoints, or ad-only levels.
    {id:'assault',title:'火线截击',instructions:'100秒：真实推进12米并进入战术进攻位，再亲手击杀2名敌人；最多阵亡2次。',limitMs:100000,kind:'assault',target:2,minTravel:12,maxDeaths:2,waypointRadius:5,weapon:'m4a1'},
    {id:'marksman',title:'移动狙杀',instructions:'110秒：用AWM亲手击杀2人，同时移动10米；最多阵亡2次。',limitMs:110000,kind:'kills',target:2,minTravel:10,maxDeaths:2,weapon:'awm'},
    {id:'evac',title:'火线撤离',instructions:'70秒：移动35米、亲手击杀1人，再去真实撤离区守满6秒，坚持到倒计时结束；最多阵亡1次。',limitMs:70000,kind:'survive',target:1,minTravel:35,minKills:1,extractSeconds:6,extractRadius:5,weapon:'mp5'},
    {id:'counter',title:'逆线夺点',instructions:'100秒：先攻远端B，再返回近端A，各坚守5秒；敌军独占7秒则失败。最多阵亡1次。',limitMs:100000,kind:'defend',target:2,holdSeconds:5,breachSeconds:7,radius:5,maxDeaths:1,weapon:'m4a1',reverse:true},
  ],
};
/** Optional, earned CF replay contract. Native damage/kill rules stay untouched. */
export function cfEliteChallenge(base) {
  if(base?.id==='tags'&&base.kind==='hits')
    return {...base,elite:true,limitMs:45000,maxDeaths:0,minTravel:18,target:4};
  if(base?.id==='precision'&&base.kind==='kills')
    return {...base,elite:true,limitMs:75000,maxDeaths:1};
  if(base?.id==='survive'&&base.kind==='survive')
    return {...base,elite:true,target:1,minTravel:30};
  if(base?.id==='defense'&&base.kind==='defend')
    return {...base,elite:true,limitMs:85000,maxDeaths:0,holdSeconds:7,breachSeconds:7,radius:4.2};
  if(base?.id==='assault'&&base.kind==='assault')
    return {...base,elite:true,limitMs:85000,maxDeaths:1,minTravel:18,target:3,waypointRadius:4.2};
  if(base?.id==='marksman'&&base.kind==='kills')
    return {...base,elite:true,limitMs:95000,maxDeaths:1,minTravel:15,target:3};
  if(base?.id==='evac'&&base.kind==='survive')
    return {...base,elite:true,limitMs:80000,target:0,minTravel:50,minKills:2,extractSeconds:8,extractRadius:4.2};
  if(base?.id==='counter'&&base.kind==='defend')
    return {...base,elite:true,limitMs:90000,maxDeaths:0,holdSeconds:7,breachSeconds:6,radius:4.2};
  throw Error('Unsupported CF elite challenge');
}
export function challengesFor(gameId) {
  if (!Object.hasOwn(CHALLENGES,gameId)) throw Error('Unknown challenge game');
  return CHALLENGES[gameId].map(c=>({...c}));
}
export function challengeResult(c,m={},terminal=false,elapsedMs=null) {
  let complete=false,failed=false,value=0,label='';
  if(c.kind==='fish') {value=m.points||0;complete=value>=c.target&&(!c.jumps||(m.jumps||0)>=c.jumps);label=`🐟 ${value}/${c.target}`+(c.jumps?` · ⤒ ${m.jumps||0}/${c.jumps}`:'');}
  if(c.kind==='race') {value=m.finished?1:0;complete=!!m.finished&&(!c.place||m.place>0&&m.place<=c.place)&&(!c.drifts||(m.drifts||0)>=c.drifts);label=`🏁 ${m.place>0?'第'+m.place+'名':'等待发车'}`+(c.drifts?` · 漂移 ${m.drifts||0}/${c.drifts}`:'');}
  if(c.kind==='hits'||c.kind==='kills') {
    const budgetExceeded=Number.isInteger(c.maxDeaths)&&c.maxDeaths>=0 &&
      Math.max(0,Number(m.deaths)||0)>c.maxDeaths+(c.bonusDeaths===1?1:0);
    failed=budgetExceeded;
    if(c.lite===true&&c.id==='tags') {
      // V18 keeps the native introductory opponent and real weapon physics,
      // but a mobile campaign victory depends on visible personal eliminations,
      // not a hidden first-hit -> metre count -> follow-up state machine.
      value=Math.max(0,Math.floor(Number(m.kills)||0));
      complete=!failed&&value>=c.target;
      label='✦ 亲手击倒 '+Math.min(value,c.target)+'/'+c.target;
    } else if(c.kind==='hits'&&c.drill==='reposition') {
      // Not just total shots: the final three hits must occur AFTER a genuine
      // first hit AND 12m of actual movement; zero-AFK and no hidden stat credit.
      const follow=Math.max(0,Math.floor(Number(m.drillFollowUpHits)||0));
      const travel=Math.max(0,Number(m.drillTravel)||0);
      value=follow;
      complete=!failed&&m.drillFirstHit===true&&m.drillStage===2&&
        travel>=c.minTravel&&follow>=c.target;
      label=m.drillStage===0?'◎ 先瞄准 · 自动命中1次':
        m.drillStage===1?'↔ 换位 '+Math.floor(travel)+'/'+c.minTravel+'m':
          '🎯 手动追击 '+follow+'/'+c.target;
    } else {
      value=c.kind==='kills'&&c.weapon==='awm'?(m.awmKills||0):(m[c.kind]||0);
      const walked=Math.max(0,Number(m.travel)||0);
      complete=!failed&&value>=c.target&&(!c.minTravel||walked>=c.minTravel);
      label=`🎯 ${value}/${c.target}${c.kind==='hits'?'命中':c.weapon==='awm'?'AWM击杀':'击杀'}`+
        (c.minTravel?' · ↗ '+Math.floor(walked)+'/'+c.minTravel+'米':'');
    }
  }
  if(c.kind==='assault') {
    const deaths=Math.max(0,Number(m.deaths)||0);
    const kills=Math.max(0,Math.floor(Number(m.assaultKills)||0));
    const travel=Math.max(0,Number(m.assaultTravel)||0);
    const budgetExceeded=Number.isInteger(c.maxDeaths)&&deaths>c.maxDeaths+(c.bonusDeaths===1?1:0);
    value=Math.min(c.target,kills);
    const legalSite=m.assaultSiteValid===true;
    failed=budgetExceeded||!legalSite;
    complete=!failed&&m.assaultStage===1&&travel>=c.minTravel&&kills>=c.target;
    label=!legalSite?'✕ 进攻位寻路不可用':
      m.assaultStage===1?'🎯 进攻位已到达 · 本人击杀 '+kills+'/'+c.target
      :c.lite===true?'↗ 前往进攻位 · 进入标记区域':'↗ 前往进攻位 · 行进 '+Math.floor(travel)+'/'+c.minTravel+'米';
  }
  if(c.kind==='defend') {
    const deaths=Math.max(0,Number(m.deaths)||0);
    const stages=Math.max(0,Math.floor(Number(m.defenseCaptured)||0));
    const breach=m.defenseBreached===true;
    const valid=m.defenseSitesValid===true;
    value=Math.min(c.target,stages);
    failed=breach||!valid||(Number.isInteger(c.maxDeaths)&&deaths>c.maxDeaths+(c.bonusDeaths===1?1:0));
    complete=!failed&&value===c.target&&m.defenseStage===c.target;
    label=breach?'✕ 据点失守':
      !valid?'✕ 据点路线不可用':
      '◆ 已守住 '+value+'/'+c.target+' 处';
  }
  if(c.kind==='survive') {
    value=Math.min(c.target+2,Math.max(0,Number(m.deaths)||0));
    failed=value>c.target+(c.bonusDeaths===1?1:0);
    const travel=Math.max(0,Math.floor(Number(m.travel)||0)),minTravel=c.minTravel||0;
    // Only a full-length survival counts. A native team deathmatch may finish
    // early; that must never masquerade as surviving the declared 45 seconds.
    // The null fallback retains compatibility with existing offline callers.
    const survivedFullClock=c.finishOnExtract===true&&m.evacExtracted===true ? true :
      elapsedMs===null ? terminal :
      Number.isFinite(elapsedMs) && elapsedMs>=c.limitMs;
    const extractionLegal=!c.extractSeconds||m.evacSiteValid===true;
    const extractionComplete=!c.extractSeconds||m.evacExtracted===true;
    failed=failed||!extractionLegal;
    complete=(terminal||(c.finishOnExtract===true&&m.evacExtracted===true))&&
      survivedFullClock&&!failed&&travel>=minTravel&&
      (!c.minKills||Math.max(0,Number(m.kills)||0)>=c.minKills)&&extractionComplete;
    label=`❤ 死亡 ${value}/${c.target+(c.bonusDeaths===1?1:0)} · 移动 ${travel}/${minTravel}米`+
      (c.minKills?' · 击杀 '+(Number(m.kills)||0)+'/'+c.minKills:'')+
      (c.extractSeconds?(!extractionLegal?' · 撤离点不可达':
       m.evacExtracted===true?' · 撤离已准备就绪':
       ' · 撤离 '+Math.floor(Math.max(0,Number(m.evacHeldSec)||0))+'/'+c.extractSeconds+'秒'):'');
  }
  return {outcome:failed?'lost':complete?'won':terminal?'lost':'running',value,label,rewardScore:c.kind==='survive'?(complete?3:0):c.kind==='defend'?(complete?5:value):value};
}
export function newChallengeProgress(gameId) {
  const result={version:1,gameId,selected:challengesFor(gameId)[0].id,records:{}};
  if(gameId==='cf-transport-ship')result.elite=false;
  return result;
}
export function recordChallenge(p,c,score,outcome,{assisted=false}={}) {
  const previous=p.records[c.id]??{best:0,attempts:0,wins:0};
  const record={best:assisted?previous.best:Math.max(previous.best,Math.max(0,Math.floor(score))),
    attempts:previous.attempts+1,wins:previous.wins+(outcome==='won'&&!assisted?1:0)};
  if(assisted||previous.assistedWins!==undefined)
    record.assistedWins=(previous.assistedWins||0)+(outcome==='won'&&assisted?1:0);
  if(p.gameId==='cf-transport-ship'&&(c.elite===true||previous.eliteWins!==undefined)) {
    record.eliteWins=(previous.eliteWins||0)+(c.elite===true&&outcome==='won'?1:0);
  }
  p.records[c.id]=record;
}
export function saveChallengeProgress(p) {return JSON.stringify(p);}
export function loadChallengeProgress(raw,gameId) {
  try {
    if(typeof raw!=='string'||raw.length>2000)return null;
    const p=JSON.parse(raw),ids=challengesFor(gameId).map(c=>c.id);
    if(p.version!==1||p.gameId!==gameId||!ids.includes(p.selected)||!p.records||typeof p.records!=='object'||Array.isArray(p.records))return null;
    if(gameId==='cf-transport-ship'&&p.elite!==undefined&&typeof p.elite!=='boolean')return null;
    for(const [id,r]of Object.entries(p.records)){
      if(!ids.includes(id)||!r||!['best','attempts','wins'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<=1000000)||r.wins>r.attempts)return null;
      if(r.eliteWins!==undefined&&(!Number.isInteger(r.eliteWins)||r.eliteWins<0||r.eliteWins>r.wins))return null;
      if(r.assistedWins!==undefined&&(!Number.isInteger(r.assistedWins)||r.assistedWins<0||
        r.assistedWins>r.attempts-r.wins))return null;
    }
    return p;
  }catch{return null;}
}


/**
 * Control-point state is observed exclusively from REAL game.time, player
 * coordinates, enemy actor coordinates and native deaths. No bot score or
 * scripted contact grants a captured site. Unlike the rifle drill this
 * creates an actually different space-control decision.
 */
export function cfStartDefense(sites) {
  const valid=Array.isArray(sites)&&sites.length===2&&
    sites.every(s=>['A','B'].includes(s?.id)&&Number.isFinite(s.x)&&Number.isFinite(s.z))&&
    sites[0].id!==sites[1].id&&
    Math.hypot(sites[0].x-sites[1].x,sites[0].z-sites[1].z)>=8;
  return {valid:!!valid,sites:valid?sites.map(s=>({id:s.id,x:s.x,z:s.z})):[],
    stage:0,captured:0,held:0,enemyHeld:0,breached:false,
    playerInside:false,enemyInside:false,contested:false,lastTime:null};
}
export function cfStepDefense(state,{gameTime,player,actors=[],team,holdSeconds=5,
  breachSeconds=8,radius=4.2}={}) {
  if(!state||!state.valid||state.breached||state.stage>=2)return state;
  const now=Number(gameTime);
  if(!Number.isFinite(now)||now<0)return state;
  const site=state.sites[state.stage];
  const dt=state.lastTime===null?0:Math.min(.25,Math.max(0,now-state.lastTime));
  if(state.lastTime!==null&&now<state.lastTime)return state;
  const inside=pos=>Number.isFinite(pos?.x)&&Number.isFinite(pos?.z)&&
    Math.hypot(pos.x-site.x,pos.z-site.z)<=radius;
  const playerInside=player?.alive===true&&inside(player.pos);
  const enemyInside=Array.isArray(actors)&&actors.some(a=>a?.alive===true&&
    a.team!==team&&a.team!==undefined&&inside(a.pos));
  let held=state.held,enemyHeld=state.enemyHeld;
  if(playerInside&&!enemyInside) {
    held+=dt;
    enemyHeld=Math.max(0,enemyHeld-dt*.75);
  } else if(enemyInside&&!playerInside) {
    enemyHeld+=dt;
    held=Math.max(0,held-dt*.28);
  } else if(!playerInside&&!enemyInside) {
    enemyHeld=Math.max(0,enemyHeld-dt*.5);
    held=Math.max(0,held-dt*.20);
  }
  const heldEnough=Math.max(1,Number(holdSeconds)||5);
  const enemyEnough=Math.max(1,Number(breachSeconds)||8);
  const breached=enemyHeld+1e-8>=enemyEnough;
  const won=!breached&&held+1e-8>=heldEnough;
  return {...state,lastTime:now,playerInside,enemyInside,
    contested:playerInside&&enemyInside,breached,
    stage:won?state.stage+1:state.stage,
    captured:won?state.captured+1:state.captured,
    held:won?0:held,
    enemyHeld:won?0:enemyHeld};
}


/** Player-made movement and original kill stats only. A long-distance
 * teleport does not count as a reposition: it has to be accompanied by
 * genuine walkedMeters and a net displacement from the spawn anchor. */
export function cfAdvanceAssault(challenge,previous=null,native={}) {
  if(challenge?.kind!=='assault')return null;
  const kills=Number.isFinite(native.kills)?Math.max(0,Math.floor(native.kills)):0;
  const travel=Number.isFinite(native.travel)?Math.max(0,native.travel):0;
  const x=Number.isFinite(native.x)?native.x:null;
  const z=Number.isFinite(native.z)?native.z:null;
  const validSite=native.checkpoint&&Number.isFinite(native.checkpoint.x)&&
    Number.isFinite(native.checkpoint.z);
  const point=previous?.checkpoint||(validSite?{
    ...(native.checkpoint.id==='A'?{id:'A'}:{}),
    x:native.checkpoint.x,z:native.checkpoint.z}:null);
  const state=previous??{stage:0,anchorX:x,anchorZ:z,startTravel:travel,
    killBaseline:kills,lastKills:kills,postKills:0,
    checkpoint:point,checkpointValid:!!point};
  const moved=Math.max(0,travel-state.startTravel);
  const net=state.anchorX!==null&&state.anchorZ!==null&&x!==null&&z!==null
    ?Math.hypot(x-state.anchorX,z-state.anchorZ):0;
  const distance=point&&x!==null&&z!==null
    ?Math.hypot(x-point.x,z-point.z):Infinity;
  const inZone=native.alive===true&&distance<=Math.max(1,Number(challenge.waypointRadius)||5);
  const ready=state.stage===1||!!(state.checkpointValid&&inZone&&
    moved>=challenge.minTravel&&net>=challenge.minTravel*.75);
  return {...state,stage:ready?1:0,lastKills:kills,
    killBaseline:state.stage===0&&ready?kills:state.killBaseline,
    travel:moved,net,
    checkpointDistance:Number.isFinite(distance)?distance:null,
    inZone,postKills:ready?Math.max(0,kills-(state.stage===0?kills:state.killBaseline)):0};
}

/** Actual extraction uses a walkable, route-verified original-world
 * marker. Original player movement/kills and simulation game.time alone can
 * advance it; no actor positions, kills or health are injected. */
export function cfStartExtraction(site) {
  const valid=!!site&&Number.isFinite(site.x)&&Number.isFinite(site.z);
  return {valid,site:valid?{
    ...(['A','B'].includes(site.id)?{id:site.id}:{}),
    x:site.x,z:site.z}:null,
    held:0,extracted:false,inside:false,contested:false,lastTime:null};
}
export function cfStepExtraction(state,{gameTime,player,actors=[],team,
  travel=0,kills=0,minTravel=0,minKills=0,seconds=6,radius=5}={}) {
  if(!state||!state.valid||state.extracted)return state;
  const now=Number(gameTime);
  if(!Number.isFinite(now)||now<0||
    (state.lastTime!==null&&now<state.lastTime))return state;
  const dt=state.lastTime===null?0:Math.min(.25,Math.max(0,now-state.lastTime));
  const point=state.site;
  const inCircle=pos=>Number.isFinite(pos?.x)&&Number.isFinite(pos?.z)&&
    Math.hypot(pos.x-point.x,pos.z-point.z)<=Math.max(1,Number(radius)||5);
  const inside=player?.alive===true&&inCircle(player.pos);
  const contested=Array.isArray(actors)&&actors.some(a=>
    a?.alive===true&&a.team!==undefined&&a.team!==team&&inCircle(a.pos));
  const ready=inside&&!contested&&Number(travel)>=minTravel&&Number(kills)>=minKills;
  const held=ready?state.held+dt:Math.max(0,state.held-dt*.4);
  return {...state,lastTime:now,inside,contested,held,
    extracted:held+1e-8>=Math.max(1,Number(seconds)||6)};
}

/** Placement policy is intentionally stricter than an SDK availability flag:
 * first session minute + first completed round are ad-free, reward is opt-in,
 * never on native gunfire or the countdown itself. */
export function cfCanOfferRevive({challenge,metrics,round,progress,
  sinceStartupMs,config,sdkReady=false,used=false,declined=false,nearWin=true}={}) {
  if(!sdkReady||used||declined||nearWin!==true||
    round?.phase!=='running'||progress?.rounds<1||
    !Number.isFinite(sinceStartupMs)||sinceStartupMs<60000||
    config?.status!==1||config.source!=='check_ads_status'||
    !config.appId||config.screenOrientation!==1||typeof config.spaceId!=='string'||
    !config.spaceId)return false;
  if(challenge?.elite===true||challenge?.bonusDeaths||!metrics||
    metrics.defenseBreached===true||
    (challenge?.kind==='assault'&&metrics.assaultSiteValid!==true)||
    (challenge?.extractSeconds&&metrics.evacSiteValid!==true))return false;
  const budget=challenge.kind==='survive'?challenge.target:challenge.maxDeaths;
  if(!Number.isInteger(budget)||budget<0)return false;
  const deaths=Number(metrics.deaths);
  return Number.isInteger(deaths)&&deaths===budget+1;
}
