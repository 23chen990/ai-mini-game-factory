import test from 'node:test';
import assert from 'node:assert/strict';
import {installCountdownQualitySafety} from '../racing/session.mjs';
function fixture() {
 let clock=0,ratio=1,resizes=0;
 const applied=[];
 const game={state:'countdown',settings:{quality:'low'},cdT:1,player:{progress:0},
  render(){return 'native';},setupQuality(){},resize(){resizes++;},
  renderer:{getPixelRatio:()=>ratio,setPixelRatio:value=>{ratio=value;applied.push(value);}}};
 installCountdownQualitySafety(game,{now:()=>clock});
 const frame=ms=>{clock+=ms;return game.render(.05);};
 return {game,frame,applied,ratio:()=>ratio,resizes:()=>resizes};
}
test('sustained low-tier rendering stalls reduce only the 3D drawing buffer',()=>{
 const x=fixture();x.frame(0);
 for(let i=0;i<8;i++)x.frame(300);
 assert.deepEqual(x.applied,[.75,.5]);assert.equal(x.resizes(),2);
 assert.equal(x.game.cdT,1);assert.equal(x.game.player.progress,0);
 assert.equal(x.game.settings.quality,'low');
});
test('drawing-buffer floor is stable and normal frames are not downgraded',()=>{
 const x=fixture();x.frame(0);
 for(let i=0;i<90;i++)x.frame(16.7);
 x.frame(600);
 for(let i=0;i<90;i++)x.frame(16.7);
 assert.equal(x.ratio(),1);
 for(let i=0;i<24;i++)x.frame(300);
 assert.equal(x.ratio(),.5);assert.equal(x.applied.length,2);
});
test('pause/hidden boundaries discard low-resolution evidence',()=>{
 const x=fixture();x.frame(0);
 for(let i=0;i<3;i++)x.frame(300);
 x.game.state='paused';x.frame(20000);
 x.game.state='countdown';x.frame(16);
 for(let i=0;i<3;i++)x.frame(300);
 assert.equal(x.ratio(),1);
});
test('ordinary 30 FPS does not count as severe drawing-buffer pressure',()=>{
 const x=fixture();x.frame(0);
 for(let i=0;i<120;i++)assert.equal(x.frame(33.3),'native');
 assert.equal(x.ratio(),1);
});
