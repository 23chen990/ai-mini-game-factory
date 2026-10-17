import test from 'node:test';
import assert from 'node:assert/strict';
import { v10AiCornerBudget,v10AiRacingLine,v10AiNitroAllowed } from '../racing/v10-rival-racecraft.mjs';
const track={
 length:2700,halfW:9,v9WidthAt:d=>d<500?7.9:9,
 __V10_STAGE_IDENTITY__:'corner-duel',
 __RACE_SHORTCUT__:{start:900,end:1080},
 curvAhead:()=>.012
};
test('fair AI skill means real native cornering budget, with narrower roads requiring braking',()=>{
  const narrow=v10AiCornerBudget(1,track,200),
    wide=v10AiCornerBudget(1,track,1500);
  assert.ok(narrow<wide,'physical narrow sector constrains lateral speed');
  assert.ok(v10AiCornerBudget(.9,track,1500)<v10AiCornerBudget(1.2,track,1500));
  assert.ok(v10AiCornerBudget(1.8,track,1500)<=85,'no impossible corner-rate grant');
});
test('rival physically changes available side near a player, not standings or longitudinal progress',()=>{
  const ai={dist:500,lat:1.1,s:41,__V10_RIVAL_PLAYER__:{progress:509,lat:3.1}},
    oldDist=ai.dist;
  const targetRight=v10AiRacingLine(ai,track,0,7);
  ai.__V10_RIVAL_PLAYER__.lat=-3.1;
  const targetLeft=v10AiRacingLine(ai,track,0,7);
  assert.ok(targetRight<0&&targetLeft>0);
  assert.equal(ai.dist,oldDist,'AI must not get gifted forward progress');
  ai.__V10_RIVAL_PLAYER__.progress=680;
  assert.equal(v10AiRacingLine(ai,track,0,7),0,'distant player cannot alter AI line');
  ai.__V8_FORK_STATE__={arc:12};ai.__V10_RIVAL_PLAYER__.progress=510;
  assert.equal(v10AiRacingLine(ai,track,0,7),0,'fork is an already committed physical road');
});
test('AI conserves own earned nitro during risky branch, but has no global handicap',()=>{
  assert.equal(v10AiNitroAllowed({},track,500),true);
  assert.equal(v10AiNitroAllowed({},track,855),false,'brake before shortcut entrance');
  assert.equal(v10AiNitroAllowed({},track,940),false,'do not fake full-throttle on fork');
  assert.equal(v10AiNitroAllowed({},track,1200),true);
  assert.equal(v10AiNitroAllowed({__V8_FORK_STATE__:{arc:22}},track,1200),false);
  assert.equal(v10AiNitroAllowed({}, {...track,__V10_STAGE_IDENTITY__:null},940),true);
});
