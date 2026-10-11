/* global URL, process, console, window, document */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { standaloneHtml } from './standalone.mjs';

/** Fallback when navigation is unavailable. It never replaces browser.json. */
export async function offlineDomQa(runId) {
  if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(runId))throw new Error('Invalid run id');
  const root=fileURLToPath(new URL(`../../runs/${runId}/`,import.meta.url));const game=path.join(root,'workspace/game');
  const pw=await import(process.env.LEAN_PLAYWRIGHT_MODULE?pathToFileURL(process.env.LEAN_PLAYWRIGHT_MODULE).href:'@playwright/test');
  const browser=await pw.chromium.launch({headless:true,...(process.env.LEAN_CHROMIUM_PATH?{executablePath:process.env.LEAN_CHROMIUM_PATH}:{})});
  const checks=[];const errors=[];const screenshots=[];let buildHash='';
  await mkdir(path.join(root,'screenshots'),{recursive:true});
  try {
    for(const [theme,width,height] of [['observatory',390,844],['observatory',320,568],['observatory',844,390],['orchard',390,844]]) {
      const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      const bundle=await standaloneHtml(game,theme);buildHash=bundle.buildHash;
      await writeFile(path.join(root,`${theme}-standalone.html`),bundle.html);
      await page.setContent(bundle.html);await page.waitForFunction(()=>window.__GRID_MERGE__);
      assert.equal((await page.evaluate(()=>window.__GRID_MERGE__.getSnapshot())).theme,theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
      const boardBox=await page.locator('#board').boundingBox();
      const controlsBox=await page.locator('.controls').boundingBox();
      assert.ok(boardBox && boardBox.y>=0 && boardBox.y+boardBox.height<=height, 'board must fit the initial viewport');
      assert.ok(controlsBox && controlsBox.y+controlsBox.height<=height, 'primary controls must fit the initial viewport');
      const shot=`screenshots/offline-${theme}-${width}x${height}.png`;await page.screenshot({path:path.join(root,shot),fullPage:true});screenshots.push(shot);
      checks.push({name:`layout-${theme}-${width}x${height}`,kind:'OFFLINE_DOM',passed:true});
      if(width===390&&theme==='observatory') {
        const session=await context.newCDPSession(page);const bounds=await page.locator('#board').boundingBox();
        for(const [dx,dy] of [[-80,0],[0,80],[80,0],[0,-80],[-80,0],[0,80],[80,0],[0,-80]]) {
          const x=bounds.x+bounds.width/2;const y=bounds.y+bounds.height/2;
          await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
          for(let i=1;i<=4;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/4,y:y+dy*i/4,id:1}]});
          await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForFunction(()=>!window.__GRID_MERGE__.getSnapshot().busy);
        }
        const snap=await page.evaluate(()=>window.__GRID_MERGE__.getSnapshot());
        assert.ok(snap.state.moves>=4);assert.ok(snap.inputTrace.some(e=>e.source==='touch'));
        assert.ok(snap.eventTrace.some(e=>e.events.some(x=>x.type==='merge')));
        checks.push({name:'touch-input-move-and-merge',kind:'OFFLINE_DOM_NORMAL_INPUT',passed:true});
        let terminal;
        for(let i=0;i<900;i++) {
          const s=await page.evaluate(()=>window.__GRID_MERGE__.getSnapshot());
          if(s.state.status==='lost'){terminal=s;break;}
          if(s.state.status==='won')await page.locator('#dialog-primary').click();
          await page.keyboard.press(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'][i%4]);
          await page.waitForFunction(()=>!window.__GRID_MERGE__.getSnapshot().busy);
        }
        assert.ok(terminal);await page.screenshot({path:path.join(root,'screenshots/offline-terminal.png'),fullPage:true});screenshots.push('screenshots/offline-terminal.png');
        await page.locator('#dialog-primary').click();assert.equal((await page.evaluate(()=>window.__GRID_MERGE__.getSnapshot())).state.moves,0);
        checks.push({name:'unforced-terminal-and-replay',kind:'OFFLINE_DOM_NORMAL_INPUT',passed:true,terminalMoves:terminal.state.moves});
      }
      await context.close();
    }
  }catch(error){errors.push(error.message);}
  finally{await browser.close();}
  const report={schemaVersion:1,runId,buildHash,passed:errors.length===0,checks,errors,screenshots,
    transport:'PLAYWRIGHT_SET_CONTENT_LOCAL_HTML',storage:'OPAQUE_ORIGIN_UNAVAILABLE_NOT_MOCKED',
    fullBrowserGate:'NOT_SATISFIED',humanPlaytest:'NOT_RUN',
    limitation:'Offline DOM verifies owned bundled markup and normal keyboard/touch events. It does not verify HTTP loading, localStorage restoration, Safari or real devices.'};
  await writeFile(path.join(root,'offline-dom.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)offlineDomQa(process.argv[2]).then(r=>{console.log(JSON.stringify(r,null,2));if(!r.passed)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
