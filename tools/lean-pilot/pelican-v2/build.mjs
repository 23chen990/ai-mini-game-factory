/* global process, console */
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath, URL} from 'node:url';
import {REPO,RUN,WORKSPACE,SOURCE,BASE,sha,json} from './prepare.mjs';
import {brandPelicanBoot} from './boot.mjs';
const HERE=fileURLToPath(new URL('.',import.meta.url));
function once(text,from,to){if(text.split(from).length!==2)throw Error('Pinned source anchor changed: '+from.slice(0,70));return text.replace(from,to);}
export function patchMain(original){
 let s=original;
 s="import { createCoastAdventure } from './coast-ui.mjs';\nimport { frameDelta } from './feel.mjs';\n"+s;
 s=once(s,'let dt = Math.min(timer.getDelta(), 1 / 20);','let dt = frameDelta(timer.getDelta());');
 s=once(s,"low: { name: '流畅', pr: Math.min(DPR, 1) * 0.8, shadow: 1024, bloom: false, msaa: 0, density: 0.5 }","low: { name: '省电', pr: Math.min(DPR, 1.25), shadow: 1024, bloom: false, msaa: 2, density: 0.5 }");
 s=once(s,"medium: { name: '均衡', pr: Math.min(DPR, 1.25), shadow: 2048, bloom: true, msaa: 2, density: 0.8 }","medium: { name: '均衡', pr: Math.min(DPR, 1.5), shadow: 1024, bloom: false, msaa: 2, density: 0.65 }");
 s=once(s,"let qualityKey = qp('q', isTouch ? 'medium' : 'high');","let qualityKey = 'medium';");
 s=once(s,'uGrain: { value: 0.035 }','uGrain: { value: 0 }');s=once(s,'uVignette: { value: 0.28 }','uVignette: { value: 0.10 }');
 s=once(s,"let camMode = qp('cam', 'cine');","let camMode = 'chase';");
 const cameraStart=s.indexOf('function cameraUpdate(dt) {'),cameraEnd=s.indexOf('\nfunction groundAt',cameraStart);
 if(cameraStart<0||cameraEnd<0)throw Error('camera anchors');s=s.slice(0,cameraStart)+'function cameraUpdate(dt) { coast.afterRide(dt); }\n'+s.slice(cameraEnd);
 s=once(s,"setCamMode(Q.has('cam') ? camMode : 'orbit');","setCamMode('chase', true);");
 const rideStart=s.indexOf('  const up = keys.up;',s.indexOf('function updateRide')),rideEnd=s.indexOf('  // 自动变速',rideStart);
 s=s.slice(0,rideStart)+`  coast.beforeRide(dt);\n  const down = false;\n  const acc = (settings.cruise - S.speed) * .7;\n  S.accel = damp(S.accel, acc, 6, dt);\n  S.pedaling = !S.airborne && S.speed > .25;\n  S.wheel += (S.speed / WHEEL_R) * dt;\n\n`+s.slice(rideEnd);
 const laneStart=s.indexOf('  // 变道 / 自动驾驶',s.indexOf('function updateRide')),laneEnd=s.indexOf('  // 特技：',laneStart);
 s=s.slice(0,laneStart)+'  // Adventure owns continuous lateral input, bounded jump integration and swept hazards.\n'+s.slice(laneEnd);
 s=once(s,'rider.rotation.set(S.lean, -Math.atan2(S.laneV, Math.max(S.speed, 1.5)), 0);','rider.rotation.set(S.lean, S.yaw, 0);');
 const fishStart=s.indexOf('function updateFishes(dt) {'),fishEnd=s.indexOf('\n// 跃出海面的鱼',fishStart);
 s=s.slice(0,fishStart)+'function updateFishes() { coast.updateFishVisuals(); }\n'+s.slice(fishEnd);
 const adaptStart=s.indexOf('function adaptQuality(fps) {'),adaptEnd=s.indexOf('\nfunction setPixelRatio',adaptStart);
 s=s.slice(0,adaptStart)+'function adaptQuality() { /* Managed by measured effect-first coast quality policy. */ }\n'+s.slice(adaptEnd);
 s=once(s,"gradePass.uniforms.uAberration.value = clamp((S.speed - 9) / 6, 0, 1) * 0.012 + (S.airborne ? 0.004 : 0);","gradePass.uniforms.uAberration.value = 0;");
 s=once(s,'  composer.render();','  renderer.info.autoReset = false;\n  renderer.info.reset();\n  composer.render();\n  coast.performanceSample();');
 // No native demo gameplay/debug writes remain on the default adventure journey.
 s=s.slice(0,s.indexOf('// 调试接口（自动化测试截图使用）'));
 s=once(s,'// 首帧前预热一次，避免开场卡顿',`const coast = createCoastAdventure({\n  THREE, scene, renderer, camera, S, settings, rider, bike, pelican, fishes, fishGeo, fishMat, goldMat, audio, ensureAudio,\n  composerSize: () => [composer.readBuffer.width, composer.readBuffer.height],\n  configureRender: q => {\n    setPixelRatio(q.pr); bloom.enabled = q.tier >= 2 && settings.bloom;\n    renderer.shadowMap.enabled = q.tier >= 1;\n    gradePass.enabled = q.tier >= 1;\n  },\n  onFish: golden => { pelican.mouth.getWorldPosition(mouthW); pelican.gulp(); audio.gulp(golden); popScore(golden ? '+1 金鱼!' : '+1', golden); }\n});\n// 首帧前预热一次，避免开场卡顿`);
 return s;
}
export async function build({hypothesis='P0: synchronize composer and renderer, replace default orbit; integrate authored adventure with native art/animation.'}={}){
 const receipt=JSON.parse(await readFile(path.join(RUN,'baseline-receipt.json'),'utf8'));
 const before=await readFile(path.join(SOURCE,'src/main.js'),'utf8');
 // Always derive from immutable baseline, never repatch an already modified file.
 let original;
 try{original=await readFile(path.join(RUN,'original-main.js'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;original=before;await writeFile(path.join(RUN,'original-main.js'),original);}
 const originalHash=receipt.files.find(f=>f.path==='pelican-bike/src/main.js').sha256;if(sha(original)!==originalHash)throw Error('Native preimage mismatch');
 const runtimeFiles=['levels.mjs','adventure.mjs','coast-ui.mjs','coast.css','feel.mjs','safety.mjs','engagement.mjs'];const inputHashes=[];
 for(const f of runtimeFiles){const bytes=await readFile(path.join(HERE,'runtime',f));await writeFile(path.join(SOURCE,'src',f),bytes);inputHashes.push({path:f,sha256:sha(bytes)});}
 const patched=patchMain(original);await writeFile(path.join(SOURCE,'src/main.js'),patched);
 inputHashes.push({path:'boot.mjs',sha256:sha(await readFile(path.join(HERE,'boot.mjs')))});
 const pelicanPath=path.join(SOURCE,'src/pelican.js');let pelicanOriginal;
 try{pelicanOriginal=await readFile(path.join(RUN,'original-pelican.js'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;pelicanOriginal=await readFile(pelicanPath,'utf8');await writeFile(path.join(RUN,'original-pelican.js'),pelicanOriginal);}
 if(sha(pelicanOriginal)!==receipt.files.find(f=>f.path==='pelican-bike/src/pelican.js').sha256)throw Error('Pelican preimage mismatch');
 await writeFile(pelicanPath,pelicanOriginal);inputHashes.push({path:'pelican.js',sha256:sha(pelicanOriginal)});
 const texturePath=path.join(SOURCE,'src/textures.js');let textureOriginal;
 try{textureOriginal=await readFile(path.join(RUN,'original-textures.js'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;textureOriginal=await readFile(texturePath,'utf8');await writeFile(path.join(RUN,'original-textures.js'),textureOriginal);}
 if(sha(textureOriginal)!==receipt.files.find(f=>f.path==='pelican-bike/src/textures.js').sha256)throw Error('Texture preimage mismatch');
 const texturePatch=once(textureOriginal,"for (let x = 0; x < 24; x += 6) paintLine(x, 2.64, 3, 0.12, '#f2c94c');","for (let x = 0; x < 24; x += 6) for (const laneEdge of [1.83, 3.45]) paintLine(x, laneEdge, 3, 0.075, '#d7e2da');");
 await writeFile(texturePath,texturePatch);inputHashes.push({path:'textures.js',sha256:sha(texturePatch)});
 for(const [from,to]of [['engine.mjs','reward-engine.mjs'],['themes.mjs','reward-adapter.mjs']])await cp(path.join(REPO,'templates/web-lite/h5-source-mobile-v1',from),path.join(SOURCE,'src',to));
 const upstreamBuild=await readFile(path.join(SOURCE,'build.mjs'),'utf8');
 if(!upstreamBuild.includes("loader: { '.css': 'text' }"))await writeFile(path.join(SOURCE,'build.mjs'),once(upstreamBuild,"bundle: true,","bundle: true,\n  loader: { '.css': 'text' },"));
 const codeHash=sha(JSON.stringify(inputHashes)+patched);let state={attempt:0,threadId:process.env.CODEX_THREAD_ID??'current-parent-builder-continuity',history:[]};
 try{state=JSON.parse(await readFile(path.join(RUN,'repair-state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(state.history.at(-1)?.codeHash===codeHash)throw Error('Unchanged code: reuse previous build; do not consume another repair attempt');
 state.attempt++;const attemptDir=path.join(RUN,'attempts','attempt-'+state.attempt);await mkdir(attemptDir,{recursive:true});
 const attempt={attempt:state.attempt,role:'FixerAgent',route:'formal-fixer',codeHash,hypothesis,baselineCommit:BASE,workspace:WORKSPACE,threadId:state.threadId,contextIntentionallyOmitted:['unrelated games','full conversation','legacy REA logs'],inputHashes,buildExit:null,buildHash:null,qa:'PENDING',at:new Date().toISOString()};
 try{const log=execFileSync(process.execPath,['build.mjs'],{cwd:SOURCE,encoding:'utf8'});await writeFile(path.join(attemptDir,'build.log'),log);attempt.buildExit=0;
  let html=await readFile(path.join(SOURCE,'dist/index.html'),'utf8');const license=await readFile(path.join(SOURCE,'node_modules/three/LICENSE'),'utf8');html=brandPelicanBoot(html.replace('<!--OG_IMAGE-->','')).replace('</head>','<meta name="coast-build" content="'+codeHash+'"></head>');
  // Three.js notice remains bundled in standalone downloads as well as the adjacent license file.
  html=html.replace('</body>','<!-- Three.js MIT notice\n'+license.replaceAll('--','—')+'\n--></body>');
  const game=path.join(WORKSPACE,'game');await mkdir(game,{recursive:true});await writeFile(path.join(game,'index.html'),html);await writeFile(path.join(game,'LICENSE.three.txt'),license);await json(path.join(game,'platform.json'),{wechatMiniGame:{status:'NOT_PACKAGED'},douyinMiniGame:{status:'NOT_PACKAGED'},tapTapH5:{status:'NOT_INTEGRATED',liveAds:false},production:false});
  attempt.buildHash=sha(html);await cp(path.join(game,'index.html'),path.join(attemptDir,'index.html'));
 }catch(e){attempt.buildExit=e.status??1;attempt.error=String(e);throw e;}finally{state.history.push(attempt);await json(path.join(attemptDir,'fix-evidence.json'),attempt);await json(path.join(RUN,'repair-state.json'),state);}
 await json(path.join(RUN,'build-receipt.json'),attempt);return attempt;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await build({hypothesis:process.env.REPAIR_HYPOTHESIS}),null,2));
