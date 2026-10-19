// One ordered protocol stream of real touches. Waiting for each browser ACK
// can consume the player's prelaunch window on a software-rendered CI host.
// The actual game-event order and trusted pointerdowns must still be checked.
export async function queueTapSequence(session,engine,points){
 if(!['webkit','chromium'].includes(engine)||!Array.isArray(points)||(points.length!==2&&points.length!==3)||points.some(p=>!p||![p.x,p.y].every(Number.isFinite)||p.x<0||p.y<0))throw Error('Invalid trusted touch sequence');
 const acknowledgements=[];
 for(const {x,y} of points){
  const touchPoints=[{x,y,id:1}];
  acknowledgements.push(session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints}));
  acknowledgements.push(session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:engine==='chromium'?[]:touchPoints}));
 }
 await Promise.all(acknowledgements);
}
