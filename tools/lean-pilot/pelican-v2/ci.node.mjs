import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {parse} from 'yaml';
import {preparedJumpSeen} from './queued-cue-observation.mjs';
test('prepared jump evidence requires the exact buffered obstacle and visible cue',()=>{
 const visible={queued:true,buttonVisible:true,feedbackVisible:true,feedback:'↟ 已准备起跳',bufferedJump:'l1-o1'};
 assert.equal(preparedJumpSeen([visible],'l1-o1'),true);
 assert.equal(preparedJumpSeen([visible],'l1-o3'),false);
});
test('a hidden or occluded prepared button cannot satisfy the visible cue gate',()=>{
 const base={queued:true,buttonVisible:false,feedbackVisible:true,feedback:'↟ 已准备起跳',bufferedJump:'l1-o1'};
 assert.equal(preparedJumpSeen([base],'l1-o1'),false);
 assert.equal(preparedJumpSeen([{...base,buttonVisible:true,feedbackVisible:false}],'l1-o1'),false);
});
test('an event alone or an empty recorder cannot fake prepared jump visibility',()=>{
 assert.equal(preparedJumpSeen([],'l1-o1'),false);
 assert.equal(preparedJumpSeen([{type:'jump-buffered',objectId:'l1-o1'}],'l1-o1'),false);
 assert.equal(preparedJumpSeen([{queued:true,buttonVisible:true,feedbackVisible:true,feedback:'鱼到手',bufferedJump:'l1-o1'}],'l1-o1'),false);
});
test('dedicated CI builds the pinned pelican and earns five unlocks in both browser engines',async()=>{
 const bytes=await readFile(new URL('../../../.github/workflows/pelican-v3.yml',import.meta.url),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 const workflow=parse(bytes);assert.ok(workflow,'Dedicated pelican CI is missing');
 const job=workflow.jobs['pelican-browser'];assert.deepEqual(job.strategy.matrix.engine,['webkit','chromium']);
 const commands=job.steps.map(s=>s.run??'').join('\n');
 for(const required of ['54adc1fb64155f9dd7c1c90ecae7b8185ac540b8','pelican:test','pelican-v2/prepare.mjs','pelican-v2/build.mjs','pelican-v2/qa.mjs campaign','pelican-v2/experience-qa.mjs'])assert.ok(commands.includes(required),required);
 assert.ok(!commands.includes('continue-on-error'));assert.ok(!job['continue-on-error']);
 for(const step of job.steps)assert.ok(!step['continue-on-error'],'Every required Pelican step must propagate failures');
 for(const receipt of ['baseline-receipt.json','repair-state.json'])assert.ok(commands.includes('test ! -e runs/pelican-coast-v2-20261014/'+receipt),'A stale run must fail closed');
});
