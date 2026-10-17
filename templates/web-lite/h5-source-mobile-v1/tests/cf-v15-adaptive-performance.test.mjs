import test from 'node:test';
import assert from 'node:assert/strict';
import {cfAdaptivePixelRatio} from '../fps-mobile-ux.mjs';

test('CF V15 lowers only its native 3D resolution when sustained frame rate is poor',()=>{
  assert.equal(cfAdaptivePixelRatio(1,9),.85);
  assert.equal(cfAdaptivePixelRatio(.85,9),.7);
  assert.equal(cfAdaptivePixelRatio(.7,9),.6);
  assert.equal(cfAdaptivePixelRatio(.6,9),.6);
  assert.equal(cfAdaptivePixelRatio(1,23),.9);
  assert.equal(cfAdaptivePixelRatio(.8,23),.7);
  assert.equal(cfAdaptivePixelRatio(1,37),1);
});

test('CF V15 avoids resolution oscillation or invalid pixel ratios',()=>{
  assert.equal(cfAdaptivePixelRatio(.6,52,1),.6,'one fast interval cannot cause oscillation');
  assert.equal(cfAdaptivePixelRatio(.6,52,3),.7,'multiple fast intervals allow gradual recovery');
  assert.equal(cfAdaptivePixelRatio(.9,60,3),1);
  assert.equal(cfAdaptivePixelRatio(1,60,3),1);
  assert.equal(cfAdaptivePixelRatio(.8,NaN,3),.8);
  assert.equal(cfAdaptivePixelRatio(.8,0,3),.8);
  assert.equal(cfAdaptivePixelRatio(Infinity,12),.85,'malformed prior scale resets safely');
  assert.equal(cfAdaptivePixelRatio(.8,31,3),.8);
});
