/* global window, document, innerWidth, innerHeight */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [label,gameRoot]=process.argv.slice(2);
assert.ok(label&&gameRoot,'usage: capture.mjs label game-directory');
const root=path.resolve(gameRoot),out=path.resolve('runs/h5-qq-mobile-20261013/artifacts/product-20261020',label);
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const name=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    assert.ok(file.startsWith(root+path.sep));
    res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.mjs')?'application/javascript':'text/html');
    res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--use-angle=metal']});
const report={label,htmlSha256:createHash('sha256').update(await readFile(root+'/index.html')).digest('hex'),physicalPhone:false,rows:[],errors:[]};
try{
  for(const [width,height,touch] of [[1366,768,false],[844,390,true],[667,375,true]]){
    const name=touch?'phone-'+width:'desktop';
    const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
    const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#race-start:not([disabled])').waitFor({timeout:60000});
    const shot=async tag=>{const file=name+'-'+tag+'.png';await page.screenshot({path:out+'/'+file});return file;};
    await page.waitForTimeout(800);await shot('home');
    await page.locator('[data-car-id="custom-03"]').click();
    await page.waitForFunction(()=>window.__RACE_EVIDENCE__.displayedCar==='custom-03'&&!window.__RACE_EVIDENCE__.garage.busy);
    await page.waitForTimeout(600);await shot('preview');
    await page.locator('[data-car-id="starter"]').click();
    await page.locator('#race-start:not([disabled])').click();
    await page.waitForFunction(()=>window.game.state==='race',null,{timeout:45000});
    if(!touch)await page.keyboard.down('ArrowUp');
    await page.waitForFunction(()=>window.game.raceTime>=4);
    const state=await page.evaluate(()=>{
      const g=window.game,p=g.player,THREE=window.__RACE_THREE__;
      const box=new THREE.Box3().setFromObject(p.model.userData.root);
      const corners=[];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const v=new THREE.Vector3(x,y,z).project(g.camera);
        corners.push([(v.x+1)*innerWidth/2,(1-v.y)*innerHeight/2]);
      }
      return {cameraFov:g.camera.fov,mobile:g.mobileMode,carWidth:Math.max(...corners.map(c=>c[0]))-Math.min(...corners.map(c=>c[0])),carHeight:Math.max(...corners.map(c=>c[1]))-Math.min(...corners.map(c=>c[1])),time:g.raceTime,speed:p.s,pixelRatio:g.renderer.getPixelRatio(),viewport:[innerWidth,innerHeight]};
    });
    report.rows.push({name,...state,screenshot:await shot('race')});
    if(!touch){
      await page.keyboard.down('ShiftLeft');await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(900);await shot('drift-smoke');
      await page.keyboard.up('ShiftLeft');await page.keyboard.up('ArrowLeft');
    }
    if(!touch)await page.keyboard.up('ArrowUp');
    await page.locator('#race-pause').click();
    await shot('pause');
    await context.close();
  }
  assert.deepEqual(report.errors,[]);
}finally{
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();server.close();
}
console.log(JSON.stringify(report));
