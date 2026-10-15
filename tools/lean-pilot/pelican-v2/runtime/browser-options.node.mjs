import test from 'node:test';
import assert from 'node:assert/strict';
import {browserOptions} from '../browser-options.mjs';
test('Linux CI can use the actual Mesa desktop GL browser under Xvfb',()=>{
 const options=browserOptions('chromium','linux',{QA_USE_MESA:'1'});assert.equal(options.headless,false);assert.ok(options.args.includes('--use-angle=gl'));assert.ok(options.args.includes('--enable-gpu'));
});
test('Mesa CI selection does not change native Metal captures or WebKit',()=>{
 assert.ok(browserOptions('chromium','darwin',{QA_USE_MESA:'1'}).args.includes('--use-angle=metal'));
 assert.deepEqual(browserOptions('webkit','linux',{QA_USE_MESA:'1'}),{headless:true});
 assert.equal(browserOptions('chromium','linux',{}).headless,true);
});
