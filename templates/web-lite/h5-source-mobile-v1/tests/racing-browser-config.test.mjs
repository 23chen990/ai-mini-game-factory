import test from 'node:test';
import assert from 'node:assert/strict';
import {realRacingChromiumOptions} from '../../../../tools/lean-pilot/racing-browser-config.mjs';
test('full Chromium changes only QA executable channel, never GPU flags or timeout',()=>{
 const options={headless:true,timeout:45000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 const frozen=JSON.stringify(options),next=realRacingChromiumOptions(options);
 assert.equal(JSON.stringify(options),frozen);
 assert.deepEqual(next,{...options,channel:'chromium'});
 assert.equal(next.args,options.args);
});
test('explicit executables, channels and headed choices remain authoritative',()=>{
 for(const options of [{channel:'chrome'},{executablePath:'/approved/chrome'},{headless:false}])
  assert.equal(realRacingChromiumOptions(options),options);
});
test('new-headless QA configuration is idempotent without clock/frame-rate switches',()=>{
 const next=realRacingChromiumOptions({headless:true});
 assert.deepEqual(next,{headless:true,channel:'chromium'});
 assert.equal(realRacingChromiumOptions(next),next);
});
