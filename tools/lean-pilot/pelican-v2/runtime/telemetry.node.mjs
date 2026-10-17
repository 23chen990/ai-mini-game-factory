import test from 'node:test';
import assert from 'node:assert/strict';
import {newPlaytestMetrics,loadPlaytestMetrics,recordPlaytestEvent,exportPlaytestSummary} from './telemetry.mjs';
import {newCollection} from './collection.mjs';

test('only specified anonymous local events are persisted, with bounded evidence',()=>{
 const m=newPlaytestMetrics();
 assert.equal(recordPlaytestEvent(m,'email',{email:'do-not-log'}),false);
 for(let i=0;i<130;i++)assert.equal(recordPlaytestEvent(m,'retry',{level:6,distance:i}),true);
 assert.equal(m.counters.retry,130);
 assert.equal(m.events.length,80);
 assert.deepEqual(Object.keys(m.events[0]).sort(),['at','distance','elapsedSec','event','level']);
 recordPlaytestEvent(m,'fail',{level:6,distance:421,elapsed:49.8,reason:'vehicle'});
 assert.equal(m.events.at(-1).elapsedSec,49);
 assert.equal(m.events.at(-1).reason,'vehicle');
 recordPlaytestEvent(m,'fail',{level:6,reason:'user@example.com'});
 assert.equal('reason' in m.events.at(-1),false,'free-text reason must be rejected');
 recordPlaytestEvent(m,'finish',{level:1,reason:'vehicle'});
 assert.equal('reason' in m.events.at(-1),false,'successful runs do not need collision reasons');
 const saved=loadPlaytestMetrics(JSON.stringify(m));
 assert.equal(saved.counters.retry,130);
 assert.equal(saved.events.length,80);
 assert.equal(saved.events.some(e=>e.event==='fail'&&e.reason==='vehicle'),true);
 const old=loadPlaytestMetrics(JSON.stringify({version:1,counters:{fail:1},events:[{event:'fail',level:1,distance:120,at:1000}]}));
 assert.equal(old.events[0].elapsedSec,0);
 assert.equal('reason' in old.events[0],false,'old anonymous JSON is readable');
 assert.equal(loadPlaytestMetrics(JSON.stringify({...m,counters:{email:999}})),null);
 assert.equal(exportPlaytestSummary(saved,newCollection()).notice.includes('Local anonymous'),true);
});
