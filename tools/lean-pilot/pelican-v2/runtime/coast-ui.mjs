/* global window, document, localStorage, performance */
import css from './coast.css';
import { LEVELS, LANES } from './levels.mjs';
import { newRun, input, advance, newSave, loadSave, settle, qualityStep } from './adventure.mjs';
import {upcomingHazards} from './safety.mjs';
import {cameraTarget,smooth,FEEL,syncRidePose} from './feel.mjs';
import {allStars,nextStarTip,starRequirements,masteryStatus} from './engagement.mjs';
import {newProgress,loadProgress,saveProgress,startRound,finishRound,rewardRound,adAllowed} from './reward-engine.mjs';
import {requestRewardedVideo} from './reward-adapter.mjs';

// Source-facing UI + primitive hazards. Original coastline, rider, bike, IK and audio stay native.
export function createCoastAdventure(api) {
 const {THREE,scene,renderer,camera,S,settings,rider,pelican,fishes,fishMat,goldMat,fishGeo,audio}=api;
 const style=document.createElement('style');style.textContent=css;document.head.append(style);
 document.title='鹈鹕海岸冒险';document.documentElement.dataset.referenceGame='pelican-coast-v3';
 const root=document.createElement('section');root.id='coast';root.dataset.phase='ready';
 root.innerHTML=`<header class="co-top"><div><small>PELICAN COAST</small><b id="co-title">鹈鹕海岸冒险</b></div><button id="co-pause" aria-label="暂停">Ⅱ 暂停</button></header>
 <div class="co-goals"><div class="co-goal" id="co-distance-box"><span>🏁 海岸路程</span><b id="co-distance">0 / 300 m</b><progress id="co-distance-bar" value="0" max="300"></progress></div><div class="co-goal" id="co-fish-box"><span id="co-fish-label">🐟 捕鱼目标</span><b id="co-fish">0 / 6 条</b><progress id="co-fish-bar" value="0" max="6"></progress></div><div class="co-goal" id="co-time-box"><span>◷ 剩余</span><b id="co-time">55 秒</b></div></div>
 <div id="co-radar-label" hidden>前方路况 · 从左到右对应三条车道</div><div id="co-radar" aria-label="前方三车道路况"><div class="co-lane" data-lane="0"></div><div class="co-lane" data-lane="1"></div><div class="co-lane" data-lane="2"></div></div>
 <div id="co-feedback" role="status"><strong></strong><small></small></div><div id="co-crash"></div>
 <div id="co-modal"><div class="co-card"><span class="co-eyebrow">A LITTLE COASTAL ESCAPE</span><h1 id="co-heading">鹈鹕<br>海岸冒险</h1><p id="co-copy">骑着单车追鱼，沿着海岸去下一站。</p><div id="co-rules" class="co-rules"><span><b>◀ ▶</b>轻点或左右滑动</span><span><b>🐟</b>靠近自动抓鱼</span><span><b>↟</b>点跳跃或上滑</span></div><p id="co-progress" class="co-progress"></p><div id="co-route" class="co-route"></div><div class="co-actions"><button id="co-start" class="primary">▶ 出发 · 海岸出发</button><button id="co-resume" class="primary" hidden>▶ 继续骑行</button><button id="co-next" class="primary" hidden>下一关 →</button><button id="co-replay" class="secondary" hidden>↻ 重开当前关卡</button><button id="co-select" class="secondary" hidden>海岸路线 · 选择关卡</button><button id="co-ad" class="secondary" hidden>自愿观看广告 · 额外补给（未接入）</button></div><div class="co-settings"><button id="co-quality">画质 · 均衡</button><button id="co-sound">声音 · 关</button></div><div id="co-notice" role="status"></div><p id="co-storage" class="co-meta">本机保存关卡进度 · 广告未接入 · H5 开发试玩</p></div></div>
 <div class="co-lane-indicator"><i></i><i class="on"></i><i></i></div><nav id="co-controls" aria-label="骑行操作"><button data-action="left" aria-label="向左变道">◀<small>向左变道</small></button><button data-action="right" aria-label="向右变道">▶<small>向右变道</small></button><button data-action="jump" aria-label="跳跃">↟<small>跳跃</small></button></nav>`;
 const mastery=document.createElement('div');mastery.id='co-mastery';mastery.setAttribute('aria-label','三星挑战进度');root.append(mastery);
 document.body.append(root);const $=id=>root.querySelector('#co-'+id);
 const SAVE='pelican-coast:campaign:v2',REWARD='h5-mobile:pelican-coast-v2-20261014:pelican-bike:v1';
 let save=newSave(),progress=newProgress(),storage=true;
 try{save=loadSave(localStorage.getItem(SAVE))??save;progress=loadProgress(localStorage.getItem(REWARD),'pelican-bike')??progress;}catch{storage=false;}
 let run=null,round=null,selected=save.unlocked,lastPhase='ready',eventCursor=0,feedbackUntil=0,settledAt=0,now=performance.now(),sound=false,hudLast='',lastRadar='',pausedBySystem=false;
 let quality={tier:2,pr:Math.min(window.devicePixelRatio||1,1.5)},manualQuality='balanced',lowSeconds=0;
 const persist=()=>{try{localStorage.setItem(SAVE,JSON.stringify(save));localStorage.setItem(REWARD,saveProgress(progress,'pelican-bike'));}catch{storage=false;}$('storage').textContent=storage?'本机保存关卡进度 · 广告未接入 · H5 开发试玩':'存储不可用，本次可玩，关卡进度无法保存';};
 const hazards=new Map(),fishSlots=new Map(),rainGroup=new THREE.Group();scene.add(rainGroup);
 const obstacleRoot=new THREE.Group();scene.add(obstacleRoot);
 const materials=new Map();
 const mat=(color,emissive=false)=>{const k=color+emissive;if(!materials.has(k))materials.set(k,new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.12,...(emissive?{emissive:color,emissiveIntensity:.8}:{})}));return materials.get(k);};
 const box=(parent,w,h,d,color,x=0,y=0,z=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const sphere=(parent,r,color,x,y,z)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),mat(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
 const wheelGeo=new THREE.CylinderGeometry(.29,.29,.14,12),limbGeo=new THREE.CylinderGeometry(.06,.055,.5,8);
 function hazardModel(o){const g=new THREE.Group();g.userData.kind=o.kind;
  if(o.kind==='car'||o.kind==='van'){
   const van=o.kind==='van',len=van?3.6:3;box(g,len-.1,.55,van?1.32:1.26,van?'#edc66c':'#e77656',0,.64,0);box(g,van?2:1.48,van?1.05:.66,1.12,van?'#e9e2c5':'#f0b294',van?.2:.12,van?1.39:1.21,0);box(g,.025,.43,1.02,'#305967',van?-.82:-.64,van?1.51:1.27,0);
   for(const x of [-len*.32,len*.32])for(const z of [-.65,.65]){const w=new THREE.Mesh(wheelGeo,mat('#253b41'));w.rotation.x=Math.PI/2;w.position.set(x,.30,z);g.add(w);sphere(g,.12,'#d9ddcb',x,.30,z*1.06);}
   for(const z of [-.43,.43]){const light=box(g,.06,.15,.23,'#fff4bd',-len/2,.72,z);light.material=mat('#ffedb0',true);}box(g,.08,.13,.92,'#e9ddbf',-len/2,.48,0);
  }else if(o.kind==='pedestrian'){
   const body=new THREE.Group();g.add(body);g.userData.body=body;
   box(body,.35,.5,.29,o.lane===0?'#dd895b':'#d5b05d',0,1.03,0);sphere(body,.19,'#e9bf91',0,1.48,0);sphere(body,.2,'#34646a',0,1.61,0);
   const limbs=[];for(const side of [-1,1]){for(const arm of [false,true]){const p=new THREE.Group();p.position.set(arm?0:side*.105,arm?1.16:.78,arm?side*.23:0);const mesh=new THREE.Mesh(limbGeo,mat(arm?'#e9bf91':'#325b68'));mesh.position.y=-.24;p.add(mesh);if(!arm)box(p,.21,.12,.17,'#f6e7bf',.05,-.49,0);body.add(p);limbs.push(p);}}g.userData.limbs=limbs;
  }else{box(g,.4,.24,1.17,'#e3873c',0,.19,0);for(const z of [-.38,0,.38])box(g,.415,.16,.15,'#fff1cf',0,.2,z);for(const z of [-.46,.46])box(g,.48,.07,.14,'#314e58',0,.04,z);}
  return g;
 }
 // Fixed rain geometry is recycled rather than allocated per frame.
 const rainData=new Float32Array(180*6);for(let i=0;i<180;i++){const x=(i%20)/20*55-7,y=(i*7%19)/19*10,z=(i*13%23)/23*14-7;rainData.set([x,y,z,x-.1,y+.32,z],i*6);}
 const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainData,3));const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#c5e7e8',transparent:true,opacity:.52,depthWrite:false}));rainGroup.add(rain);rainGroup.visible=false;
 const finishRoot=new THREE.Group();box(finishRoot,.15,3.6,.12,'#ede7c5',0,1.8,-2.6);box(finishRoot,.15,3.6,.12,'#ede7c5',0,1.8,2.6);box(finishRoot,.12,.45,5.4,'#247d76',0,3.5,0);for(let i=0;i<12;i++)box(finishRoot,.16,.22,.4,i%2?'#fff2d1':'#274b55',0,.02,-2.2+i*.4);scene.add(finishRoot);finishRoot.visible=false;
 // Restrict dynamic shadow casters to the close player and hazards; static coast remains lit.
 scene.traverse(o=>{if(o.isMesh){o.castShadow=false;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.map)m.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}});rider.traverse(o=>{if(o.isMesh)o.castShadow=true;});
 const followLook=new THREE.Vector3();let cameraReady=false;
 function notice(title,copy,kind=''){const el=$('feedback');el.className='visible '+kind;el.querySelector('strong').textContent=title;el.querySelector('small').textContent=copy;feedbackUntil=now+1400;}
 function routes(){
  const route=$('route'),earned=allStars(save);
  $('progress').textContent=`🌟 全海岸 ${earned}/15 星 · ${earned===15?'渔王挑战已达成':'重玩关卡可冲三星'}`;
  route.innerHTML=LEVELS.map(l=>{
   const req=starRequirements(l),best=save.best?.[l.id-1],record=save.completed[l.id-1]&&best?.fish>0?` · 纪录 ${best.fish} 鱼`:'';
   return `<button data-level="${l.id}" ${l.id>save.unlocked?'disabled':''} class="${l.id===selected?'selected':''} ${l.id>save.unlocked?'locked':''}"><strong>${l.id>save.unlocked?'🔒':l.id}</strong><span><b>${l.name}</b><small>${l.distance} m · ${l.goal.count} 条鱼${l.goal.gold?' · 金鱼 '+l.goal.gold:''}${record}</small><small class="co-master">★★★ 🐟${req.gold} · 🌟${req.goldFish} · ↟${req.jumps} · 🛡 · ◷≤${req.time.toFixed(1)}s</small></span><em>${save.completed[l.id-1]?'★'.repeat(save.stars[l.id-1]):l.id===save.unlocked?'出发 →':''}</em></button>`;
  }).join('');
  $('start').textContent='▶ 出发 · '+LEVELS[selected-1].name;
  if(!run)$('copy').textContent=LEVELS[selected-1].subtitle;
  for(const b of route.querySelectorAll('[data-level]'))b.addEventListener('click',()=>{selected=Number(b.dataset.level);routes();});
  route.querySelector('.selected')?.scrollIntoView({block:'nearest'});
 }
 function phase(p){root.dataset.phase=p;$('modal').hidden=p==='running';$('resume').hidden=p!=='paused';$('start').hidden=p!=='ready';$('route').hidden=p!=='ready';$('progress').hidden=p!=='ready';$('rules').hidden=p!=='ready';$('replay').hidden=!['finished','paused'].includes(p);$('select').hidden=!['finished','paused'].includes(p);$('next').hidden=p!=='finished'||run?.reason!=='complete'||run.level.id>=5;$('ad').hidden=p!=='finished';$('pause').disabled=!run||!['running','paused'].includes(p);$('pause').textContent=p==='paused'?'▶ 继续':'Ⅱ 暂停';if(p!=='running'){$('radar').classList.remove('active');$('radar-label').hidden=true;}$('notice').textContent='';}
 function begin(id=selected){
  selected=id;run=newRun(id);round=startRound(progress,run.level.seconds*1000);eventCursor=0;lastPhase='running';hudLast='';lastRadar='';settledAt=0;cameraReady=false;pausedBySystem=false;
  for(const g of hazards.values())g.visible=false;for(const f of fishes){f.mesh.visible=false;f.active=false;}fishSlots.clear();
  Object.assign(S,{started:true,paused:false,distance:0,lane:0,laneTarget:0,laneV:0,prevLaneV:0,latAcc:0,lean:0,steer:0,yaw:0,crank:0,wheel:0,y:0,vy:0,airborne:false,trick:0,trickT:0,wheelie:0,speed:run.level.speed,fish:0,golden:0,time:0,t:0});
  Object.assign(settings,{autopilot:false,cruise:run.level.speed,hour:run.level.hour,timeFlow:false,cloud:run.level.weather==='rain'?.78:.35,fog:run.level.weather==='rain'?1.08:.8,music:sound});
  document.body.classList.add('started');root.classList.remove('crashing');rider.rotation.set(0,0,0);pelican.root.rotation.z=0;audio.mute(!sound);rainGroup.visible=run.level.weather==='rain'&&quality.tier>0;finishRoot.visible=true;$('crash').classList.remove('active');$('title').textContent=id+' · '+run.level.name;
  phase('running');persist();
   const intro=run.level.weather==='rain'?'🌧 雨天转向稍慢，提前看路况':run.level.weather==='dusk'?'🌙 暮色金鱼更亮，提前留意危险车道':'轻点左右追鱼，跳过路障可拿奖励金鱼';
   notice(id===1?'🐟 第一条鱼在前方':'🐟 本关挑战开始',intro,'tutorial');
 }
 function pause(system=false){if(run?.phase!=='running')return;input(run,'pause');S.paused=true;pausedBySystem=system;audio.mute(true);$('heading').textContent=system?'回来啦，继续出发':'沿途歇一歇';$('copy').textContent='已暂停，路程与倒计时都停住了。';phase('paused');persist();}
 function resume(){if(run?.phase!=='paused')return;input(run,'resume');S.paused=false;pausedBySystem=false;audio.mute(!sound);phase('running');}
 function choose(){if(run?.phase==='running')pause();run=null;round=null;S.paused=true;S.started=false;phase('ready');$('heading').innerHTML='鹈鹕<br>海岸冒险';$('title').textContent='鹈鹕海岸冒险';$('copy').textContent='挑战每关三星 · 追逐奖励金鱼，刷新个人纪录。';$('start').textContent='▶ 出发 · '+LEVELS[selected-1].name;routes();}
 function terminal(){
  if(!settle(save,run))return;round.score=run.rewardScore;finishRound(round,progress);persist();S.paused=true;settledAt=now;audio.mute(true);phase('finished');
  const reasons={vehicle:'撞到汽车了',barrier:'碰到了低矮路障','fish-short':'抵达终点，鱼还没抓够','gold-short':'抵达终点，还缺少金鱼',timeout:'时间到了',complete:'海岸这一站，完成！'};
  $('heading').textContent=reasons[run.reason];
   const earned=allStars(save),best=save.best?.[run.level.id-1];
   $('copy').textContent=run.reason==='complete'?`${'★'.repeat(run.stars)} · ${run.count} 条鱼 / 金鱼 ${run.gold} · 跳障 ${run.jumpedBarriers} 次 · 最多 ${best?.fish??run.count} 鱼。${nextStarTip(run.level,run)}。全海岸 ${earned}/15 星。${run.level.id<5?'下一站已解锁。':'全部路线已解锁，可回头冲满星。'}`:run.reason==='vehicle'?'🚗 汽车不能跳过。看见红色车道预警后，提前换道。':run.reason==='barrier'?'↟ 跳过去有奖励金鱼，绕开也可以安全前进。':run.reason==='timeout'?'行人碰撞会停车 3 秒，但倒计时继续。留意斑马线。':`🐟 已抓 ${run.count}/${run.level.goal.count} 条 · 金鱼 ${run.gold}/${run.level.goal.gold}。下次沿着发光的鱼走，留意红色危险车道。`;
  $('next').textContent=run.level.id<5?'下一关 · '+LEVELS[run.level.id].name+' →':'海岸已完成';
  if(run.reason==='vehicle'||run.reason==='barrier'){root.classList.add('crashing');$('crash').classList.add('active');rider.rotation.x=0;notice('💥 '+(run.reason==='vehicle'?'撞车了':'没越过路障'),'轻点重开，马上再试','collision');}
  $('ad').disabled=false;$('ad').textContent='自愿观看广告 · 额外补给（未接入）';
 }
 $('start').addEventListener('click',()=>begin());$('replay').addEventListener('click',()=>begin(run.level.id));$('next').addEventListener('click',()=>begin(run.level.id+1));$('select').addEventListener('click',choose);$('pause').addEventListener('click',()=>run?.phase==='paused'?resume():pause());$('resume').addEventListener('click',resume);
 for(const b of root.querySelectorAll('[data-action]')){b.addEventListener('pointerdown',e=>{e.preventDefault();if(!run)return;b.setPointerCapture(e.pointerId);input(run,b.dataset.action);b.classList.add('pressed');});const release=()=>b.classList.remove('pressed');for(const e of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(e,release);}
  // Optional one-finger gestures on the 3D scene; UI buttons remain fully usable.
  let swipe=null;renderer.domElement.style.touchAction='none';
  renderer.domElement.addEventListener('touchstart',e=>{const t=e.touches[0];if(e.touches.length===1&&run?.phase==='running')swipe={id:t.identifier,x:t.clientX,y:t.clientY};else swipe=null;},{passive:true});
  renderer.domElement.addEventListener('touchend',e=>{const t=[...e.changedTouches].find(t=>t.identifier===swipe?.id);if(!swipe||!t)return;const dx=t.clientX-swipe.x,dy=t.clientY-swipe.y;swipe=null;if(run?.phase!=='running')return;
   if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)*1.15)input(run,dx<0?'left':'right');
   else if(dy< -48)input(run,'jump');
  });renderer.domElement.addEventListener('touchcancel',()=>{swipe=null;});
 // Own the three gameplay actions before the legacy demo's shortcuts/held controls.
 window.addEventListener('keydown',e=>{const action={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'jump',ArrowUp:'jump',Escape:'pause',KeyP:'pause'}[e.code];if(!action)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(action==='pause'){if(run?.phase==='paused')resume();else pause();}else if(run)input(run,action);},true);
 window.addEventListener('blur',()=>pause(true));window.addEventListener('pagehide',()=>pause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();pause(true);$('copy').textContent='图形资源暂时丢失。请稍候恢复后继续，或刷新；已解锁关卡仍会保留。';});renderer.domElement.addEventListener('webglcontextrestored',()=>{$('copy').textContent='画面已恢复，点击继续骑行。';});
 $('sound').addEventListener('click',()=>{sound=!sound;if(sound&&!audio.ctx)api.ensureAudio();audio.mute(!sound||run?.phase!=='running');$('sound').textContent='声音 · '+(sound?'开':'关');});
 function applyRender(){api.configureRender(quality);rainGroup.visible=run?.level.weather==='rain'&&quality.tier>0;}
 $('quality').addEventListener('click',()=>{manualQuality=manualQuality==='balanced'?'sharp':manualQuality==='sharp'?'efficient':'balanced';quality={tier:manualQuality==='sharp'?2:manualQuality==='balanced'?1:0,pr:Math.min(window.devicePixelRatio||1,manualQuality==='efficient'?1.25:1.5)};applyRender();$('quality').textContent='画质 · '+({balanced:'均衡',sharp:'清晰',efficient:'省电'}[manualQuality]);});
 const platform={status:'PENDING',source:'NOT_RUN',screenOrientation:1};
 $('ad').addEventListener('click',async()=>{if(!round)return;if(platform.status!==1){$('notice').textContent='TapTap H5 广告尚未接入；当前不播放模拟广告，也不会发放广告奖励。';return;}if(!adAllowed(round,progress,performance.now()-loadedAt)){ $('notice').textContent='暂未满足奖励条件，可以直接重开。';return;}const current=round;$('ad').disabled=true;const result=await requestRewardedVideo({tap:window.tap,config:platform});if(round!==current)return;const rewarded=rewardRound(current,progress,result.status==='completed');persist();$('notice').textContent=rewarded?'额外补给已到账':'广告未完成或加载失败，可直接继续游戏';$('ad').disabled=false;});
 const loadedAt=performance.now();S.paused=true;S.started=false;settings.autopilot=false;settings.timeFlow=false;settings.hour=14;settings.lookMouse=false;settings.showFps=false;settings.bloom=false;
 // An inspection-only surface: no set score, teleport, unlock, or finish helpers.
 window.__coast=Object.freeze({snapshot:()=>run?JSON.parse(JSON.stringify({phase:run.phase,level:run.level.id,distance:run.distance,elapsed:run.elapsed,lane:run.lane,laneIndex:run.laneIndex,y:run.y,stun:run.stun,count:run.count,gold:run.gold,jumpedBarriers:run.jumpedBarriers,reason:run.reason,events:run.events,save,pausedBySystem})):({phase:'ready',save}),renderInfo:()=>({pixelRatio:renderer.getPixelRatio(),canvas:[renderer.domElement.width,renderer.domElement.height],composer:api.composerSize(),camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov},quality:{...quality},calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory}})});
 phase('ready');routes();persist();applyRender();root.dataset.loaded='true';
 function beforeRide(dt){now=performance.now();if(run)advance(run,dt);syncRidePose(S,run);
  if(run){
   while(eventCursor<run.events.length){const e=run.events[eventCursor++];if(e.type==='fish-caught'){api.onFish(e.golden);notice(e.bonus?'🏆 奖励金鱼 +7分':e.golden?'🌟 金鱼到手！':e.first?'🐟 第一条鱼！':'🐟 +1 条鱼',`${e.count} / ${run.level.goal.count} 条`, 'catch');}if(e.type==='jump')audio.whoosh();if(e.type==='pedestrian-hit'){audio.thump();notice('⏸ 停车 3 秒','行人摔倒了，倒计时仍在继续','collision');}if(e.type==='recovered')notice('▶ 继续骑行','看清前方再出发','tutorial');if(e.type==='barrier-cleared'&&e.jumped)notice('↟ 跳过路障！',`本关成功跳障 ${e.combo} 次 · 后方有奖励金鱼`,'tutorial');}
   if(run.phase==='finished'&&lastPhase!=='finished')terminal();lastPhase=run.phase;
  }
 }
 function updateFishVisuals(){if(!run)return;
  const visible=run.fishes.filter(f=>!f.caught&&f.x-run.distance>-3&&f.x-run.distance<105);
  const keep=new Set(visible.map(f=>f.id));for(const [id,slot]of fishSlots)if(!keep.has(id)){slot.active=false;slot.mesh.visible=false;fishSlots.delete(id);}
  for(const f of visible){let slot=fishSlots.get(f.id);if(!slot){slot=fishes.find(s=>!s.active);if(!slot)continue;slot.active=true;fishSlots.set(f.id,slot);}Object.assign(slot,{x:f.x,y:1.34,z:LANES[f.lane],golden:f.golden,caught:-1});slot.mesh.visible=true;slot.mesh.material=f.golden?goldMat:fishMat;slot.mesh.geometry=fishGeo;slot.mesh.scale.setScalar(f.bonus?2.1:1.8);slot.mesh.position.set(f.x-run.distance,1.34+Math.sin(S.t*3+f.x)*.06,LANES[f.lane]);slot.mesh.rotation.set(0,Math.PI+Math.sin(S.t+f.x)*.25,0);slot.halo.material.color.set(f.golden?'#ffd257':'#7fe3ff');slot.halo.scale.setScalar(f.bonus?1.45:run.level.weather==='dusk'?1.2:1.05);}
 }
 function afterRide(dt){
  if(run){for(const o of run.obstacles){const rel=o.x-run.distance;if(rel>100||rel<-9){const g=hazards.get(o.id);if(g)g.visible=false;continue;}let g=hazards.get(o.id);if(!g){g=hazardModel(o);hazards.set(o.id,g);obstacleRoot.add(g);}g.visible=true;g.position.set(rel,0,o.z??LANES[o.lane]);
    if(o.kind==='pedestrian'){const fall=o.fallAt===null||o.fallAt===undefined?0:run.elapsed-o.fallAt;const lying=o.hit&&fall<2;const amount=lying?Math.min(1,fall/.22):o.hit?Math.max(0,1-(fall-2)/.65):0;g.userData.body.rotation.x=amount*1.25*(o.z>0?-1:1);g.userData.body.position.y=0;for(let i=0;i<g.userData.limbs.length;i++)g.userData.limbs[i].rotation.z=Math.sin(run.elapsed*8+i*2)*.28*(o.crossAt!==undefined&&!o.hit?1:0);if(o.hit&&fall>2.8)g.position.z+=(o.lane===0?-1:1)*Math.min(3,(fall-2.8)*1.5);}}
   finishRoot.position.x=run.level.distance-run.distance;
   if(rainGroup.visible){rain.position.y=-(S.t*10%3);rain.position.x=-(S.t*2%2);}
   root.classList.toggle('stunned',run.stun>0);if(run.stun>0){$('feedback').className='visible collision';$('feedback').querySelector('strong').textContent='⏸ '+Math.ceil(run.stun)+' 秒';$('feedback').querySelector('small').textContent='行人摔倒 · 倒计时继续';}
   // Brief, directional crash tilt, while keeping the road framing fixed.
   if(run.phase==='finished'&&run.reason!=='complete'&&(run.reason==='vehicle'||run.reason==='barrier')){const age=now-settledAt;rider.rotation.x=-.65*Math.min(1,age/260);root.classList.toggle('crashing',age<650);}
   updateHud();
  }
  // Soft positional lag + slight lateral anticipation; camera never snaps per tap.
  const pose=cameraTarget(S.lane,run?.laneV??0,run?.y??0,camera.aspect,run?.speed??8);
  if(!cameraReady){camera.position.set(...pose.position);followLook.set(...pose.look);camera.fov=pose.fov;cameraReady=true;}
  else {for(let i=0;i<3;i++){camera.position.setComponent(i,smooth(camera.position.getComponent(i),pose.position[i],i===1?FEEL.cameraHeightRate:FEEL.cameraPositionRate,dt));followLook.setComponent(i,smooth(followLook.getComponent(i),pose.look[i],FEEL.cameraLookRate,dt));}camera.fov=smooth(camera.fov,pose.fov,5,dt);}
  camera.lookAt(followLook);camera.updateProjectionMatrix();
  if(now>feedbackUntil&&!(run?.stun>0))$('feedback').classList.remove('visible');
 }
 function updateHud(){const remaining=Math.max(0,Math.ceil(run.level.seconds-run.elapsed));const signature=[Math.floor(run.distance),remaining,run.count,run.gold,run.laneIndex,run.phase].join(':');
  if(signature!==hudLast){hudLast=signature;$('distance').textContent=`${Math.floor(run.distance)} / ${run.level.distance} m`;$('distance-bar').max=run.level.distance;$('distance-bar').value=run.distance;$('fish').textContent=`${run.count} / ${run.level.goal.count} 条`;$('fish-label').textContent=run.level.goal.gold?`🐟 捕鱼 · 🌟 ${run.gold}/${run.level.goal.gold}`:'🐟 捕鱼目标';$('fish-bar').max=run.level.goal.count;$('fish-bar').value=run.count;$('time').textContent=remaining+' 秒';$('fish-box').classList.toggle('done',run.count>=run.level.goal.count&&run.gold>=run.level.goal.gold);$('distance-box').classList.toggle('done',run.distance>=run.level.distance);$('time-box').classList.toggle('urgent',remaining<=12);root.querySelectorAll('.co-lane-indicator i').forEach((n,i)=>n.classList.toggle('on',i===run.laneIndex));}
  if(run.phase!=='running')return;
  const upcoming=upcomingHazards(run), next=upcoming[0];
  const fish=run.fishes.find(f=>!f.caught&&f.x-run.distance>1&&f.x-run.distance<35);
  const lanes=[0,1,2].map(lane=>{
   const hazard=upcoming.find(h=>h.lanes.includes(lane)&&(!next||Math.abs(h.seconds-next.seconds)<1.8));
   if(hazard){const kind=hazard.obstacle.kind,bonus=kind==='barrier'&&run.fishes.some(f=>f.bonus&&f.sourceObstacleId===hazard.obstacle.id&&!f.caught);return {kind:bonus?'danger jump-reward':'danger',icon:bonus?'↟🌟':kind==='barrier'?'↟':kind==='pedestrian'?'🚶':'🚗',seconds:kind==='barrier'&&hazard.seconds<1.5?Math.max(.1,hazard.seconds).toFixed(1):Math.max(1,Math.ceil(hazard.seconds)),label:kind};}
   return fish?.lane===lane?{kind:'fish',icon:fish.golden?'🌟':'🐟',seconds:'',label:'fish'}:{kind:'',icon:'·',seconds:'',label:'clear'};
  });const rkey=JSON.stringify(lanes);if(rkey!==lastRadar){lastRadar=rkey;for(let i=0;i<3;i++){const n=root.querySelector(`[data-lane="${i}"]`),r=lanes[i];n.className='co-lane '+r.kind;n.innerHTML=r.icon+(r.seconds?`<small>${r.seconds}s</small>`:'');n.dataset.kind=r.label;}}
  $('radar').classList.toggle('active',!!next||!!fish);$('radar-label').hidden=!next&&!fish;
  const prizeAhead=next?.obstacle.kind==='barrier'&&run.fishes.some(f=>f.bonus&&!f.caught&&f.sourceObstacleId===next.obstacle.id&&f.x-run.distance<50);
   $('radar-label').textContent=next?.obstacle.kind==='pedestrian'?'前方有人横穿 · 提前避开红色车道':prizeAhead?'前方路障 · 跳过去追奖励金鱼（也可绕开）':'前方路况 · 红色危险车道';

  const barrier=upcoming.find(h=>h.obstacle.kind==='barrier'&&h.obstacle.lane===run.laneIndex&&h.seconds>.15&&h.seconds<.6);
  root.querySelector('[data-action="jump"]').classList.toggle('ready',!!barrier&&run.y===0);
  const m=masteryStatus(run),mark=v=>v?'done':'missed';
  const mastery=`<b>★★★</b><span data-goal="catch" class="${m.catch.done?'done':''}">🐟 ${m.catch.value}/${m.catch.target}</span><span data-goal="gold" class="${m.gold.done?'done':''}">🌟 ${m.gold.value}/${m.gold.target}</span><span data-goal="jump" class="${m.jump.done?'done':''}">↟ ${m.jump.value}/${m.jump.target}</span><span data-goal="no-hit" title="无碰撞" class="${mark(m.noHit.done)}">🛡${m.noHit.done?'✓':'×'}</span><span data-goal="time" title="三星用时上限" class="${mark(m.time.done)}">◷≤${m.time.target.toFixed(1)}s</span>`;
  if($('mastery').innerHTML!==mastery)$('mastery').innerHTML=mastery;
 }
 let sampleAt=performance.now(),sampleFrames=0;
 function performanceSample(){sampleFrames++;const current=performance.now();if(current-sampleAt<3000)return;const fps=sampleFrames*1000/(current-sampleAt);sampleAt=current;sampleFrames=0;if(run?.phase!=='running'||manualQuality==='sharp')return;if(fps<38)lowSeconds+=3;else lowSeconds=0;if(lowSeconds>=6){quality=qualityStep(quality,fps,window.devicePixelRatio||1);applyRender();lowSeconds=0;}}
 return {beforeRide,updateFishVisuals,afterRide,performanceSample,get running(){return run?.phase==='running';}};
}
