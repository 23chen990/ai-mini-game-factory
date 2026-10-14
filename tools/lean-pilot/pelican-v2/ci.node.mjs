import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {parse} from 'yaml';
import {preparedJumpSeen} from './queued-cue-observation.mjs';
import {compactPresentationPassed,routePresentationPassed} from './qa-presentation.mjs';
test('route text stays inside its card and adjacent rows never overlap',()=>{
 const r={ready:true,rows:[{box:{x:12,y:200,right:308,bottom:280},contents:[{x:68,y:210,right:244,bottom:270}],titleFont:15},{box:{x:12,y:285,right:308,bottom:365},contents:[{x:68,y:295,right:244,bottom:355}],titleFont:15}]};
 assert.equal(routePresentationPassed(r),true);
 assert.equal(routePresentationPassed({...r,rows:[{...r.rows[0],contents:[{x:68,y:195,right:244,bottom:290}]},r.rows[1]]}),false,'Inherited fixed48px height lets title and mastery overflow');
});
test('compact mastery stays in the instrument area with all five readable goals',()=>{
 const good={running:true,buttons:[{x:14,y:484,width:90,height:66,right:104,bottom:550},{x:114,y:484,width:90,height:66,right:204,bottom:550},{x:214,y:484,width:90,height:66,right:304,bottom:550}],font:12,bar:{x:12,y:122,right:308,bottom:164},goalBottom:118,radarLabel:{y:174},goalFonts:[12,12,12,12,12],bodyWidth:320};
 assert.equal(compactPresentationPassed(good),true);
 assert.equal(compactPresentationPassed({...good,bar:{...good.bar,y:412,bottom:470}}),false,'Old compact panel hides the rider');
 assert.equal(compactPresentationPassed({...good,bar:{...good.bar,y:110}}),false,'Do not fix rider clipping by hiding primary goals');
 assert.equal(compactPresentationPassed({...good,goalFonts:[12,12,12,12]}),false,'No omitted time or no-hit criterion');
});
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
