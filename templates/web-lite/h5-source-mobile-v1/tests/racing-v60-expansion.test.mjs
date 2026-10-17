import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPANSION_COURSES, EXTRA_STAGES } from '../racing/career-expansion.mjs';
import { STAGES, CAREER_KEY, newCareer, loadCareer, stageUnlocked, gradeStage,
  recordStage } from '../racing/career.mjs';
import { CAREER_COURSE_MAPS, COURSE_BLUEPRINTS, COURSE_ROAD_WIDTHS,
  createCareerLayouts, injectTechnicalSectors,
  careerCourseDetails } from '../racing/track-design.mjs';

const stageId=n=>String(n).padStart(2,'0');
const pointsOf=id=>{
  const p=COURSE_BLUEPRINTS[id];
  return injectTechnicalSectors(p[4].split(' ').map(x=>x.split(',').map(Number)),id,p[3]);
};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const pointSegment=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};
const intersects=(a,b,c,d)=>{
  const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  return cross(a,b,c)*cross(a,b,d)<-1e-7&&cross(c,d,a)*cross(c,d,b)<-1e-7;
};
function spacing(points,scale) {
  const n=points.length;let minimum=Infinity,crossings=0;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    if(j-i<=1||(i===0&&j===n-1))continue;
    const a=points[i],b=points[(i+1)%n],c=points[j],d=points[(j+1)%n];
    if(intersects(a,b,c,d))crossings++;
    minimum=Math.min(minimum,pointSegment(a,c,d),pointSegment(b,c,d),
      pointSegment(c,a,b),pointSegment(d,a,b));
  }
  return {crossings,minimum:minimum*scale};
}
function normalize(points) {
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x0=Math.min(...xs),y0=Math.min(...ys),
    w=Math.max(...xs)-x0,h=Math.max(...ys)-y0;
  const arcs=[0];
  for(let i=0;i<points.length;i++)
    arcs.push(arcs.at(-1)+distance(points[i],points[(i+1)%points.length]));
  return Array.from({length:90},(_,q)=>{
    const distanceAlong=q/90*arcs.at(-1);
    let i=0;
    while(i<points.length-1&&arcs[i+1]<distanceAlong)i++;
    const a=points[i],b=points[(i+1)%points.length],
      t=(distanceAlong-arcs[i])/(arcs[i+1]-arcs[i]);
    return [(a[0]+(b[0]-a[0])*t-x0)/w,(a[1]+(b[1]-a[1])*t-y0)/h];
  });
}
const rms=(left,right)=>Math.sqrt(left.reduce((total,point,i)=>
  total+(point[0]-right[i][0])**2+(point[1]-right[i][1])**2,0)/left.length);

test('30 separate physical spline identities and 14 distinct advanced course blueprints',()=>{
  assert.equal(STAGES.length,30);
  assert.equal(Object.keys(COURSE_BLUEPRINTS).length,30);
  assert.equal(CAREER_COURSE_MAPS.length,30);
  assert.equal(EXTRA_STAGES.length,14);
  assert.deepEqual(STAGES.map(s=>s.id),Array.from({length:30},(_,i)=>stageId(i+1)));
  assert.equal(new Set(STAGES.map(s=>s.name)).size,30);
  assert.equal(new Set(STAGES.map(s=>s.course)).size,30);
  const bases=Object.fromEntries(['city','egypt','aegean','snow'].map(name=>[
    name,{__racingV31:true,width:23,points:[[0,0,0]]}
  ]));
  assert.equal(createCareerLayouts(bases),30);
  const signatures=new Set();
  for(const stage of STAGES) {
    const layout=bases[stage.course];
    assert.ok(layout?.points.length>=16,stage.id);
    assert.equal(layout.width,COURSE_ROAD_WIDTHS[stage.id]);
    assert.equal(CAREER_COURSE_MAPS[Number(stage.id)-1],stage.map);
    const signature=JSON.stringify(layout.points);
    assert.equal(signatures.has(signature),false,'a distinct road must not reuse old geometry '+stage.id);
    signatures.add(signature);
  }
  assert.equal(signatures.size,30);
});

test('advanced circuits stay separated at road width and have meaningfully different silhouettes',()=>{
  const outlines=[];
  for(const [id,plan] of Object.entries(EXPANSION_COURSES)){
    const full=pointsOf(id);
    assert.ok(plan.technical.length>=3&&plan.technical.length<=5,id);
    assert.equal(full.length,plan.sketch.split(' ').length+plan.technical.length*2,id);
    assert.equal(full[0][0],0);assert.equal(full[0][1],0);
    assert.ok(full.every(p=>p.length===3&&p.every(Number.isFinite)&&p[2]>=0&&p[2]<=25));
    let length=0;
    for(let i=0;i<full.length;i++)
      length+=distance(full[i],full[(i+1)%full.length])*plan.scale;
    assert.ok(length>=1900&&length<=3150,id+' actual authored road length '+length);
    const safety=spacing(full,plan.scale);
    assert.equal(safety.crossings,0,'self-crossing centerline '+id);
    assert.ok(safety.minimum>plan.width+15,'nonadjacent roads must not touch '+id);
    assert.ok(plan.width>=17&&plan.width<=18,'hard but physically recoverable road '+id);
    assert.equal(careerCourseDetails(id).biome,plan.map);
    outlines.push({id,shape:normalize(full)});
  }
  // Compare redesigned roads against ALL other career roads. Checking new vs
  // new only was the V6.0 error: some old/new pairs looked almost identical.
  const changed=new Set(['11','13',...Object.keys(EXPANSION_COURSES)]);
  const all=STAGES.map(s=>({id:s.id,shape:normalize(pointsOf(s.id))}));
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    if(!changed.has(all[i].id)&&!changed.has(all[j].id))continue;
    const separation=rms(all[i].shape,all[j].shape);
    assert.ok(separation>=.14,'near-duplicate redesigned/old route '+all[i].id+'/'+
      all[j].id+' (normalized RMS '+separation.toFixed(3)+')');
  }
  assert.equal(changed.size,16);
  assert.ok(outlines.length===14);
});

test('chapters 5-8 increase rank, corner and race duration demand without fake winner data',()=>{
  const later=STAGES.slice(16);
  assert.deepEqual(later.map(x=>x.chapter),[5,5,5,5,6,6,6,6,7,7,7,7,8,8]);
  assert.ok(later.every(x=>x.rank<=2 && x.diff===2));
  assert.ok(STAGES.slice(20).filter(x=>x.laps===3).length>=8);
  assert.equal(STAGES[29].kind,'boss');assert.equal(STAGES[29].rank,1);
  assert.equal(gradeStage(STAGES[29],{finished:true,place:1,time:150,stats:{crash:0}},
    {beatBoss:false}),0,'final boss cannot be credited without a genuine native overtake');
  assert.ok(gradeStage(STAGES[29],{finished:true,place:1,time:150,stats:{crash:0}},
    {beatBoss:true})>0);
  const failure={finished:true,place:4,time:1,stats:{crash:0}};
  for(const stage of later)
    assert.equal(gradeStage(stage,failure,{cleanDrifts:10,cleanPasses:10,pickups:10,
      gateSpeed:240,survived:2,beatBoss:true,padCount:4}),0,
      'a 4th-place player can never advance the late campaign '+stage.id);
});

test('old saves and paid reward bookkeeping survive expansion; stage 17 unlocks only via stage 16',()=>{
  const old={...newCareer(),stars:{'01':3,'16':1},times:{'16':179.2},rounds:31};
  const restored=loadCareer(JSON.stringify(old));
  assert.equal(restored.stars['16'],1);
  assert.equal(restored.times['16'],179.2);
  assert.equal(stageUnlocked(restored,16),true);
  assert.equal(stageUnlocked(restored,17),false);
  const promoted=recordStage(restored,STAGES[16],
    {finished:true,place:1,time:140,stats:{crash:0}},{cleanDrifts:7});
  assert.ok(promoted.stars>0);
  assert.equal(stageUnlocked(promoted.career,17),true);
  const roundtrip=loadCareer(JSON.stringify(promoted.career));
  assert.ok(roundtrip.stars['17']>0);
  assert.equal(CAREER_KEY,'h5-mobile:qq-speed:career:v1','do not orphan legacy career saves');
});
