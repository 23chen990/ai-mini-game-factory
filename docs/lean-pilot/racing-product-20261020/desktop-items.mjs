/* global window, document */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { earnedUpgradeOrigin } from '../../../tools/lean-pilot/racing-visible-policy.mjs';
import { minimapPolicy } from '../../../tools/lean-pilot/racing-minimap-observer.mjs';
import { VisibleActionPolicy } from '../../../tools/lean-pilot/racing-visible-actions.mjs';

const run=path.resolve('runs/h5-qq-mobile-20261013'),root=run+'/workspace/game';
const previous=run+'/evidence/rc19-natural-retry04-look16';
const saved=JSON.parse(await readFile(previous+'/natural-earned-storage.json'));
const oldReport=JSON.parse(await readFile(previous+'/report.json'));
const oldBuild=JSON.parse(await readFile('docs/lean-pilot/racing-internal-20261020/evidence/build.json'));
const build=JSON.parse(await readFile(run+'/artifacts/build-racing.json'));
const origin=earnedUpgradeOrigin(oldReport,saved,oldBuild,build.buildHash);
const out=run+'/artifacts/product-20261020/desktop-items-'+build.attempt;await mkdir(out);
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,origin).pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));assert.ok(file.startsWith(root+'/'));
    res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':pathname.endsWith('.json')?'application/json':'text/html');
    res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
server.listen(Number(new URL(origin).port),'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1366,height:768},storageState:saved,recordVideo:{dir:out,size:{width:1366,height:768}}});
const page=await context.newPage();
const report={buildHash:build.buildHash,profile:'unmodified-previously-earned-profile-upgrade',previousReport:previous+'/report.json',naturalKeyboardInput:true,physicalPhone:false,currentBuildWinClaim:false,rows:[],errors:[],passed:false};
const observe=()=>page.evaluate(()=>({
  inventory:[...window.game.player.items],nitro:window.game.player.nitroCount,boost:window.game.player.nitroTime,
  time:window.game.raceTime,mobile:window.game.mobileMode,
}));
let keys=new Set();
async function hold(next){
  for(const key of keys)if(!next.has(key))await page.keyboard.up(key);
  for(const key of next)if(!keys.has(key))await page.keyboard.down(key);
  keys=next;
}
try{
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(origin);await page.locator('#race-start:not([disabled])').waitFor({timeout:60000});
  assert.equal(await page.locator('#race-stage option[value="4"]').isDisabled(),false,'stage05 must already be genuinely earned');
  await page.locator('#race-stage').selectOption('4');await page.locator('#race-start:not([disabled])').click();
  await page.waitForFunction(()=>window.game.state==='race',null,{timeout:45000});
  const policy=new VisibleActionPolicy(),deadline=Date.now()+90000;
  while(Date.now()<deadline){
    const road=await page.evaluate(minimapPolicy,16);
    const hud=await page.evaluate(()=>({
      speedKmh:Number(document.querySelector('#race-speed-value').textContent),
      drifting:document.querySelector('#race-kit').classList.contains('drifting'),
      smallReady:document.querySelector('[data-key-action="small"]').classList.contains('ready'),
      nitroReady:document.querySelector('[data-key-action="nitro"]').classList.contains('ready'),
      itemReady:document.querySelector('[data-key-action="item"]').classList.contains('ready'),
    }));
    if(hud.itemReady&&hud.nitroReady){
      await hold(new Set(['ArrowUp']));await page.waitForTimeout(80);
      const before=await observe();await page.screenshot({path:out+'/both-earned.png'});
      await page.keyboard.press('Space');await page.waitForTimeout(100);
      const afterSpace=await observe();
      assert.deepEqual(afterSpace.inventory,before.inventory,'Space must not consume the item');
      assert.equal(afterSpace.nitro,before.nitro-1);assert.ok(afterSpace.boost>0);assert.equal(afterSpace.mobile,false);
      await page.screenshot({path:out+'/space-nitro.png'});
      await page.keyboard.press('ControlLeft');await page.waitForTimeout(100);
      const afterCtrl=await observe();
      assert.equal(afterCtrl.inventory.length,afterSpace.inventory.length-1);assert.equal(afterCtrl.nitro,afterSpace.nitro);
      await page.screenshot({path:out+'/ctrl-item.png'});
      report.rows.push({before,afterSpace,afterCtrl});report.passed=true;break;
    }
    const next=new Set(['ArrowUp']);
    if(road.direction)next.add(road.direction==='left'?'ArrowLeft':'ArrowRight');
    const actions=policy.frame(road,{...hud,nitroReady:false,itemReady:false},Date.now());
    if(actions.includes('drift'))next.add('ShiftLeft');
    await hold(next);
    if(actions.includes('small'))await page.keyboard.press('KeyW');
    await page.waitForTimeout(55);
  }
  assert.equal(report.passed,true,'No naturally earned joint resource case was observed');
  assert.deepEqual(report.errors,[]);
}catch(error){report.errors.push(error.stack);}
finally{
  await hold(new Set());await page.screenshot({path:out+'/last-frame.png'});
  await context.close();await browser.close();server.close();
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report));if(!report.passed||report.errors.length)process.exitCode=1;
