/* global process,console,window,document */
import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {URL} from 'node:url';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {tapVisible} from './touch.mjs';
const engine=process.env.QA_ENGINE??'chromium';
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const dir=path.join(RUN,'attempts',`attempt-${build.attempt}`,`v6-real-browser-${engine}`);
await mkdir(dir,{recursive:true});
const report={targetGame:'鹈鹕海岸冒险',engine,workspace:WORKSPACE,
 buildHash:build.buildHash,driverHash:sha(await readFile(new URL(import.meta.url))),
 mode:'real rendered H5 with normal touchscreen actions, no injection',
 normalInputOnly:true,stateInjection:false,liveAds:'NOT_INTEGRATED',humanTest:'NOT_RUN',
 checks:[],screenshots:[],errors:[],passed:false};
const server=await serve();
let browser,context,page;
function check(name,ok,detail=null){report.checks.push({name,passed:ok===true,detail});console.log('V6 '+name+' '+ok);assert.equal(ok,true,name);}
async function shot(name){const file=path.join(dir,name+'.png');await page.screenshot({path:file});report.screenshots.push({name,path:path.relative(RUN,file),sha256:sha(await readFile(file))});}
const snap=()=>page.evaluate(()=>window.__coast.snapshot());
const tap=async selector=>{await tapVisible(page,selector);};
try{
 browser=await(engine==='webkit'?webkit:chromium).launch(browserOptions(engine));
 context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
  deviceScaleFactor:qaDpr(),recordVideo:{dir,size:{width:390,height:844}}});
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/game/index.html');
 await page.waitForSelector('#coast[data-loaded="true"]');
 check('endless-select-visible',await page.locator('[data-level="6"]').isVisible());
 check('earned-cosmetic-items-visible',await page.locator('#co-collection [data-style]').count()===6);
 check('initial-wallet-is-zero',(await page.locator('.co-collection-total').innerText()).includes('0 贝壳'));
 await shot('v6-menu');
 await tap('[data-style="sunset"]');
 check('cannot-purchase-with-empty-wallet',(await page.locator('#co-notice').innerText()).includes('还需'));
 await tap('[data-level="6"]');
 check('endless-selected',await page.locator('[data-level="6"]').getAttribute('class')==='selected');
 await tap('#co-start');
 let r=await snap();
 check('endless-running-native-h5',r.level===6&&r.phase==='running');
 await page.waitForFunction(()=>document.querySelector('#co-mastery')?.textContent?.includes('海风热身'),null,{timeout:5000});
 check('visible-endless-tier-and-actual-speed',
  (await page.locator('#co-mastery').innerText()).includes('8.3m/s'));
 check('no-ads-and-no-fake-wallet-credit',r.collection.coins===0);
 await page.waitForFunction(()=>window.__coast.snapshot().count>=3||window.__coast.snapshot().phase==='finished',
  null,{timeout:35000});
 r=await snap();check('three-fish-genuine-physics',r.phase==='running'&&r.count>=3&&r.events.filter(e=>e.type==='fish-caught').length>=3);
 await shot('v6-endless-real-fish');
 await tap('#co-pause');
 check('endless-pause-offers-voluntary-checkout',await page.locator('#co-exit').isVisible());
 await tap('#co-exit');
 r=await snap();
 check('voluntary-real-settlement',r.phase==='finished'&&r.reason==='retired'&&r.settled===true);
 check('earned-coin-award-is-real',r.collection.coins>=1&&r.collection.endlessRuns===1&&r.collection.bestDistance>=45);
 check('endless-did-not-cheat-career',r.save.unlocked===1&&r.save.stars.every(v=>v===0));
 check('local-event-funnel-counts-genuine-actions',r.metrics.start===1&&r.metrics.retire===1);
 await shot('v6-earned-settlement');
 await tap('#co-select');
 check('shop-showing-genuine-balance',(await page.locator('.co-collection-total').innerText()).includes(String(r.collection.coins)));
 await tap('[data-style="classic"]');
 check('equip-owned-style-without-price',(await page.locator('[data-style="classic"] small').innerText())==='已穿戴');
 await page.reload();await page.waitForSelector('#coast[data-loaded="true"]');
 const shop=await page.locator('.co-collection-total').innerText();
 check('real-page-reload-persists-wallet-and-record',shop.includes(String(r.collection.coins))&&shop.includes(String(r.collection.bestDistance)));
 check('local-only-playtest-disclosure-visible',await page.locator('#co-storage').innerText().then(t=>t.includes('仅存本机')));
 await shot('v6-persisted-after-reload');
 // Pause-screen replay must bank this genuine run before beginning another one.
 await tap('[data-level="6"]');await tap('#co-start');
 await page.waitForFunction(()=>document.querySelector('#co-mastery')?.textContent?.includes('差 '),null,{timeout:5000});
 check('live-record-chase-is-grounded-in-persisted-personal-best',
  (await page.locator('#co-mastery').innerText()).includes('差 '+r.collection.bestDistance+'m'));
 await page.waitForFunction(()=>window.__coast.snapshot().count>=3||window.__coast.snapshot().phase==='finished',null,{timeout:35000});
 const beforeRestart=await snap();
 check('second-real-run-has-earned-fish',beforeRestart.phase==='running'&&beforeRestart.count>=3);
 await tap('#co-pause');
 check('endless-replay-explains-settlement',(await page.locator('#co-replay').innerText()).includes('结算本局'));
 await tap('#co-replay');
 const afterRestart=await snap();
 check('paused-endless-replay-banks-once',
  afterRestart.phase==='running'&&afterRestart.level===6&&afterRestart.collection.endlessRuns===2&&
  afterRestart.collection.coins>r.collection.coins&&afterRestart.metrics.retire===2);
}catch(error){report.errors.push(error.stack??String(error));}
finally{
 if(page)await shot('v6-final').catch(()=>{});
 if(context)await context.close();if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
 report.passed=report.errors.length===0&&report.checks.every(c=>c.passed);
 await json(path.join(dir,'report.json'),report);
 console.log('V6_H5_BROWSER_RESULT '+JSON.stringify({engine,passed:report.passed,
  checks:report.checks.map(c=>({name:c.name,passed:c.passed})),errors:report.errors}));
 if(!report.passed)process.exitCode=1;
}
