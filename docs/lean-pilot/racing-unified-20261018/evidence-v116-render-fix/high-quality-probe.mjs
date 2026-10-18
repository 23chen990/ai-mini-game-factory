import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const root='/workspace/scratch/29547c23d820';
const repo=path.join(root,'racing-unified');
const recovery=path.join(root,'recovery');
const run=path.join(repo,'runs/h5-qq-mobile-20261013');
const require=createRequire(path.join(repo,'package.json'));
const nativeRequire=createRequire(path.join(run,'workspace/source/qq-speed/package.json'));
const {chromium}=require('@playwright/test');
const {z}=require('zod');
const THREE=nativeRequire('three');
const expectedBuild='3a1bd6000047d8310718ca3ee39c7602b311a07eb5c2d2c08e950fee399cadf5';
const expectedHtml='6e5d09159c71f34517177d6eacbfaa281337b90717309051e3b6f6803041f6d1';
const htmlPath=path.join(run,'racing-two-button-3a1bd6000047.html');
const screenshotPath=path.join(recovery,'cold-render-msaa-high-quality.png');
const outputPath=path.join(recovery,'cold-render-msaa-high-quality-qa.json');
const executablePath=path.join(recovery,'playwright-browsers/chromium-1234/chrome-linux64/chrome');
const flags=['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report={schemaVersion:1,type:'HIGH_QUALITY_RUNTIME_QA',buildHash:expectedBuild,htmlPath,htmlSha256:expectedHtml,
  startedAt:new Date().toISOString(),finishedAt:null,passed:false,
  scope:'One normal UI start, pause and high-quality selection in full desktop Chromium software WebGL. This is not a natural race completion, a 45/18-second cold-start acceptance test, a physical handset test, or proof of underlying GPU sample allocation.',
  browser:{executablePath,flags,viewport:{width:1366,height:768},deviceScaleFactor:1,isMobile:false,hasTouch:false,version:null},
  constants:{threeRevision:THREE.REVISION,HalfFloatType:THREE.HalfFloatType},
  actions:[],snapshots:[],checks:[],pageErrors:[],consoleErrors:[],consoleWarnings:[],requestFailures:[],errors:[],
  sampleInterpretation:'renderTarget.samples records the actual runtime requested sample count. MAX_SAMPLES records device capability. No underlying renderbuffer allocation was inspected.',
  screenshot:null,cleanup:{browserLaunched:false,browserClosed:false,serverClosed:false},zodValidated:false};
const stage=(name,extra={})=>{const item={name,at:new Date().toISOString(),...extra};report.actions.push(item);console.log('HIGH_QUALITY_STAGE='+JSON.stringify(item));};
const check=(name,condition)=>{report.checks.push({name,passed:Boolean(condition)});assert.ok(condition,name);};
let server,browser,context,page,references;
const snapshot=async label=>{
  const value=await page.evaluate(ref=>{
    const g=window.game,r=g.renderer,gl=r.getContext(),c=g.composer;
    const target=t=>t?{samplesRequested:t.samples,textureType:t.texture?.type,width:t.width,height:t.height}:null;
    let sceneObjectCount=0;g.scene.traverse(()=>sceneObjectCount++);
    return {at:performance.now(),state:g.state,pausedFrom:g.pausedFrom??null,phase:document.querySelector('#race-kit')?.dataset.phase,
      quality:g.settings.quality,qualityControl:document.querySelector('#race-quality')?.value,
      graphicsQualityStored:localStorage.getItem('h5-qq-mobile-20261013:graphics-quality:v1'),
      qualityNote:document.querySelector('#race-quality-note')?.textContent,
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},pixelRatio:r.getPixelRatio(),
      drawingBuffer:{width:r.domElement.width,height:r.domElement.height},
      contextAttributes:gl.getContextAttributes(),contextLost:gl.isContextLost(),
      deviceMaxSamples:gl.getParameter(gl.MAX_SAMPLES),rendererMaxSamples:r.capabilities.maxSamples,
      identities:{game:g===ref.game,renderer:r===ref.renderer,context:gl===ref.context,scene:g.scene===ref.scene,camera:g.camera===ref.camera},
      composer:c?{rendererIsNative:c.renderer===r,renderTarget1:target(c.renderTarget1),renderTarget2:target(c.renderTarget2),
        passCount:c.passes.length,passNames:c.passes.map(p=>p.constructor.name),enabled:c.passes.map(p=>p.enabled),
        renderPassSceneIsNative:c.passes[0]?.scene===g.scene,renderPassCameraIsNative:c.passes[0]?.camera===g.camera,
        bloomIsSecondPass:c.passes[1]===g.bloom}:null,
      bloom:g.bloom?{present:true,enabled:g.bloom.enabled,nMips:g.bloom.nMips,horizontalTargets:g.bloom.renderTargetsHorizontal.length,
        verticalTargets:g.bloom.renderTargetsVertical.length,strength:g.bloom.strength}:null,
      nativeScene:{objectCount:sceneObjectCount,children:g.scene.children.length,racerCount:g.racers.length,hasPlayer:!!g.player},
      nativeTiming:{cdT:g.cdT??null,raceTime:g.raceTime,time:g.time},
      renderInfo:{...r.info.render},visibility:document.visibilityState,focused:document.hasFocus()};
  },references);
  const result={label,...value};report.snapshots.push(result);return result;
};
try{
  await fs.access(outputPath).then(()=>{throw new Error('Refuse to overwrite existing QA evidence');},e=>{if(e.code!=='ENOENT')throw e;});
  const buildBytes=await fs.readFile(path.join(run,'artifacts/build-racing.json'));
  const build=JSON.parse(buildBytes);
  const html=await fs.readFile(htmlPath);
  check('exact-attempt13-build',build.attempt===13&&build.buildHash===expectedBuild);
  check('exact-parent-requested-standalone-html',digest(html)===expectedHtml&&build.trialSha256===expectedHtml);
  report.inputEvidence={buildReceiptSha256:digest(buildBytes),htmlBytes:html.length};
  const game=path.join(run,'workspace/game');
  server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent((req.url??'/').split('?')[0]);
      if(pathname==='/'){report.servedHtmlSha256=digest(html);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length});res.end(html);return;}
      if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
      const file=path.resolve(game,'.'+pathname);
      if(!file.startsWith(game+path.sep)){res.writeHead(403);res.end();return;}
      const data=await fs.readFile(file);
      const mime={'.json':'application/json','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'});res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  stage('launch-full-chromium');
  browser=await chromium.launch({headless:true,executablePath,args:flags});
  report.cleanup.browserLaunched=true;report.browser.version=browser.version();
  context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,isMobile:false,hasTouch:false});
  page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());if(message.type()==='warning')report.consoleWarnings.push(message.text());});
  page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),failure:request.failure()}));
  const url='http://127.0.0.1:'+server.address().port+'/';
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  check('served-exact-original-html-bytes',response.status()===200&&report.servedHtmlSha256===expectedHtml);
  await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.loaded==='true'&&!!window.game?.renderer,null,{timeout:45000});
  references=await page.evaluateHandle(()=>({game:window.game,renderer:window.game.renderer,context:window.game.renderer.getContext(),scene:window.game.scene,camera:window.game.camera}));
  const initial=await snapshot('ready');
  check('initial-default-context-antialias-false',initial.contextAttributes.antialias===false);
  stage('click-visible-race-start');
  await page.locator('#race-start').click({timeout:45000});
  await page.locator('#race-pause').waitFor({state:'visible',timeout:45000});
  await snapshot('before-normal-pause');
  stage('click-visible-race-pause');
  await page.locator('#race-pause').click({timeout:45000});
  await page.waitForFunction(()=>window.game?.state==='paused'&&document.querySelector('#race-kit')?.dataset.phase==='paused',null,{timeout:45000});
  const paused=await snapshot('paused-before-high');
  check('normal-native-pause-branch',['countdown','race'].includes(paused.pausedFrom));
  const quality=page.locator('#race-quality');
  check('quality-selector-visible',await quality.isVisible());
  stage('select-visible-high-with-keyboard',{selector:'#race-quality',keys:['End','Enter']});
  await quality.click({timeout:45000});
  await page.keyboard.press('End');await page.keyboard.press('Enter');
  await page.waitForFunction(frame=>window.game?.state==='paused'&&window.game.settings.quality==='high'&&
    document.querySelector('#race-quality')?.value==='high'&&window.game.composer?.passes.length===3&&
    window.game.renderer.info.render.frame>frame,paused.renderInfo.frame,{timeout:45000});
  const high=await snapshot('paused-high-rendered');
  check('same-game-renderer-context-scene-camera',Object.values(high.identities).every(Boolean));
  check('default-context-still-antialias-false',high.contextAttributes.antialias===false&&!high.contextLost);
  check('unchanged-1366x768-dpr1',high.viewport.width===1366&&high.viewport.height===768&&high.viewport.dpr===1);
  check('actual-high-native-composer',high.state==='paused'&&high.quality==='high'&&high.composer.rendererIsNative);
  check('both-targets-request-four-samples',high.composer.renderTarget1.samplesRequested===4&&high.composer.renderTarget2.samplesRequested===4);
  check('both-targets-use-native-half-float',high.composer.renderTarget1.textureType===THREE.HalfFloatType&&high.composer.renderTarget2.textureType===THREE.HalfFloatType);
  check('three-enabled-passes-native-scene-and-camera',high.composer.passCount===3&&high.composer.enabled.every(Boolean)&&high.composer.renderPassSceneIsNative&&high.composer.renderPassCameraIsNative);
  check('bloom-retained-as-second-pass',high.composer.bloomIsSecondPass&&high.bloom?.present&&high.bloom.enabled&&high.bloom.nMips===5);
  check('normal-quality-preference-stored',high.graphicsQualityStored==='high'&&high.qualityControl==='high');
  check('native-full-scene-retained',high.nativeScene.objectCount===paused.nativeScene.objectCount&&high.nativeScene.children===paused.nativeScene.children&&high.nativeScene.racerCount===paused.nativeScene.racerCount);
  stage('capture-paused-high-screenshot');
  await page.screenshot({path:screenshotPath,timeout:45000});
  const screenshot=await fs.readFile(screenshotPath);
  report.screenshot={path:screenshotPath,bytes:screenshot.length,sha256:digest(screenshot),width:1366,height:768};
  await snapshot('after-high-screenshot');
  check('no-page-errors',report.pageErrors.length===0);
  check('no-console-errors',report.consoleErrors.length===0);
  check('no-failed-requests',report.requestFailures.length===0);
  report.passed=true;
}catch(error){report.errors.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{await references?.dispose();await context?.close();await browser?.close();report.cleanup.browserClosed=!browser||!browser.isConnected();}
  catch(error){report.errors.push('cleanup: '+String(error));report.passed=false;process.exitCode=1;}
  if(server){await new Promise(resolve=>server.close(resolve));report.cleanup.serverClosed=true;}
  report.finishedAt=new Date().toISOString();report.zodValidated=true;
  const hash=z.string().regex(/^[a-f0-9]{64}$/);
  const schema=z.object({schemaVersion:z.literal(1),type:z.literal('HIGH_QUALITY_RUNTIME_QA'),buildHash:z.literal(expectedBuild),htmlPath:z.string(),htmlSha256:z.literal(expectedHtml),
    startedAt:z.iso.datetime(),finishedAt:z.iso.datetime(),passed:z.boolean(),scope:z.string(),
    browser:z.object({executablePath:z.string(),flags:z.array(z.string()).length(4),viewport:z.object({width:z.literal(1366),height:z.literal(768)}),deviceScaleFactor:z.literal(1),isMobile:z.literal(false),hasTouch:z.literal(false),version:z.string().nullable()}),
    constants:z.object({threeRevision:z.literal('169'),HalfFloatType:z.literal(1016)}),
    actions:z.array(z.object({name:z.string(),at:z.iso.datetime()}).passthrough()),snapshots:z.array(z.record(z.string(),z.unknown())),
    checks:z.array(z.object({name:z.string(),passed:z.boolean()})),pageErrors:z.array(z.string()),consoleErrors:z.array(z.string()),consoleWarnings:z.array(z.string()),requestFailures:z.array(z.unknown()),errors:z.array(z.string()),sampleInterpretation:z.string(),
    screenshot:z.object({path:z.string(),bytes:z.number().int().positive(),sha256:hash,width:z.literal(1366),height:z.literal(768)}).nullable(),
    cleanup:z.object({browserLaunched:z.boolean(),browserClosed:z.boolean(),serverClosed:z.boolean()}),zodValidated:z.literal(true),
    inputEvidence:z.object({buildReceiptSha256:hash,htmlBytes:z.number().int().positive()}).optional(),servedHtmlSha256:hash.optional()
  }).strict().superRefine((v,ctx)=>{if(v.passed&&(!v.checks.every(c=>c.passed)||v.errors.length||!v.cleanup.browserClosed||!v.cleanup.serverClosed||!v.screenshot))ctx.addIssue({code:'custom',message:'Passing QA requires complete checks, screenshot and cleanup'});});
  const checked=schema.parse(report);await fs.writeFile(outputPath,JSON.stringify(checked,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(checked,null,2));
}
