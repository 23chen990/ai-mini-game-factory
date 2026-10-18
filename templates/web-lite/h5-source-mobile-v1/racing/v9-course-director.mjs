/**
 * V9: original, per-stage driving-rhythm direction.
 *
 * The V8 template inserted the same two-point S-kink 105 times.  A different
 * top-down silhouette did not produce a different driving rhythm.
 *
 * These authored beats deliberately leave recovery straights unmodified.
 * Every applied beat is a geometry change on the native Track's centerline,
 * NOT a visual arrow, scoring event, assist or hidden steering force.
 *
 * Beat indices refer to existing original authored segment indices; untouched
 * sector entries are deliberate breathers.  This remains a low-cost procedural
 * H5 system, not an attempt to reproduce third-party course layouts.
 */
export const V9_STAGE_RHYTHMS = Object.freeze({
  '01': {identity:'hard urban pursuit / four decisive shifts and late countersteer', beats:['chicane','late','apex','chicane']},
  '02': {identity:'long accelerating crests / late desert brake', beats:['grandSweep','late','apex']},
  '03': {identity:'fast divided flyovers / technical infield', beats:['sweep',null,'chicane']},
  '04': {identity:'coastal flow / downhill corner exit', beats:[null,'sweep','late']},
  '05': {identity:'temple approach / one consequential hairpin', beats:['apex',null,'chicane']},
  '06': {identity:'urban expressway / district-change rhythm', beats:['sweep','late',null]},
  '07': {identity:'cliff descent / focused switchback / long exit', beats:['grandSweep','apex','chicane',null]},
  '08': {identity:'open snow arc / technical ridge crossing', beats:['sweep',null,'late']},
  '09': {identity:'dune open sprint / isolated hard brake', beats:[null,'apex']},
  '10': {identity:'neon main-line attack / abrupt U-cut commitment', beats:['late',null,'chicane']},
  '11': {identity:'flowing sea serpent / rolling linked turns', beats:['sweep',null,'sweep','late']},
  '12': {identity:'ice flyover / early turn and stable landing', beats:[null,'apex','sweep',null]},
  '13': {identity:'crown interchange / boss defensive apex', beats:['late','chicane',null]},
  '14': {identity:'dual dune crests / speed versus braking', beats:['sweep',null,'apex']},
  '15': {identity:'polar three-lobe / linked countersteer', beats:['chicane','late',null,'apex']},
  '16': {identity:'cliff crown / tight final-risk corner', beats:[null,'sweep','late','chicane']},
  '17': {identity:'city outer freeway / one dramatic return', beats:['grandSweep','doubleApex','sweep']},
  '18': {identity:'two dune ravines / precise inside entry', beats:['apex','grandSweep',null]},
  '19': {identity:'tidal peninsula / edge-control transitions', beats:['grandSweep','chicane','late']},
  '20': {identity:'crystal summit / alternating short technicals', beats:['chicane','doubleApex','apex']},
  '21': {identity:'open highway / late single-bend showdown', beats:[null,'grandSweep',null,'late']},
  '22': {identity:'canyon single-run descent / early safe fork then decisive outer exit arc', beats:[null,'late','apex','grandSweep']},
  '23': {identity:'island crossing / one loaded midair entry', beats:['sweep','doubleApex','chicane','apex']},
  '24': {identity:'snow hook / narrow-turn approach after speed', beats:['grandSweep','apex','late',null]},
  '25': {identity:'urban stacked road / shortcut precision', beats:['late','sweep',null,'doubleApex']},
  '26': {identity:'stone ring / natural wide-turn breathing', beats:['grandSweep','sweep','apex','late']},
  '27': {identity:'cloud snake / countersteer race', beats:['chicane','doubleApex',null,'late']},
  '28': {identity:'aurora / alternating height and banking feel', beats:['grandSweep','chicane',null,'late']},
  '29': {identity:'night overpass / long-run final chicane', beats:['grandSweep','late','chicane','sweep']},
  '30': {identity:'skyline finale / technical entry then long chase', beats:['late','chicane','doubleApex',null]},
});
// The V10 sector director was authored against c099's three-point V9 beats.
// Keep that explicit legacy baseline separate from the newer V9/V9.1 edits:
// changing their insertion counts would move V10 corners to unrelated edges.
const V10_BASELINE_BEATS=Object.freeze({
  '02':[null,'late','apex'],'07':[null,'apex','chicane',null],
  '17':[null,'late','sweep'],'18':['apex','sweep',null],
  '19':[null,'chicane','late'],'20':['chicane',null,'apex'],
  '21':[null,'sweep',null,'late'],'22':[null,'late','apex',null],
  '23':['sweep',null,'chicane','apex'],'24':[null,'apex','late',null],
  '25':['late','sweep',null,'apex'],'26':[null,'sweep','apex','late'],
  '27':['chicane','apex',null,'late'],'28':['sweep','chicane',null,'late'],
  '29':[null,'late','chicane','sweep'],'30':['late','chicane','apex',null],
});
export const V10_BASELINE_RHYTHMS=Object.freeze(Object.fromEntries(
  Object.entries(V9_STAGE_RHYTHMS).map(([id,plan])=>[id,Object.freeze({
    identity:id==='22'?'canyon single-run descent / open risky exits':plan.identity,
    beats:Object.freeze([...(V10_BASELINE_BEATS[id]??plan.beats)]),
  })])
));
const STYLES=Object.freeze({
  // Long arcs have enough longitudinal distance for sustained wheel rotation,
  // not a decorative ±15m kink that can be ignored with automatic throttle.
  sweep:[[.23,.22],[.52,.78],[.79,.42]],
  apex:[[.24,.14],[.54,1],[.80,.28]],
  late:[[.27,.06],[.57,.35],[.78,.76]],
  chicane:[[.26,.74],[.54,-.73],[.79,.18]],
  grandSweep:[[.13,.16],[.30,.82],[.49,1.30],[.68,1.04],[.87,.20]],
  // Opposite sides of the original lane centreline force two deliberate
  // wheel commitments. Still genuine spline points and native collisions.
  doubleApex:[[.14,.18],[.34,1.02],[.51,.18],[.68,-.96],[.85,-.20]],
});
/** V9.1 pacing correction is limited to measured low-turn intervals.
 * Indices refer to ORIGINAL nodes, never indices shifted by previous inserts.
 * Offsets use the same pre-V8-stretch metre convention as the authored beats.
 * The first node, return road, near-fork entry and all car physics are intact. */
export const V91_PACING_SECTORS = Object.freeze({
  '03': Object.freeze([
    Object.freeze({index:0, amplitude:12, side:1, shape:'entry'})
  ]),
  '07': Object.freeze([
    Object.freeze({index:0, amplitude:12, side:1, shape:'entry'}),
    Object.freeze({index:14, amplitude:12, side:-1, shape:'release'})
  ]),
  '22': Object.freeze([
    Object.freeze({index:0, amplitude:10, side:-1, shape:'entry'}),
    Object.freeze({index:9, amplitude:12, side:1, shape:'switch'})
  ])
});
const PACING_SHAPES = Object.freeze({
  entry:[[.30,0],[.58,1],[.82,.25]],
  release:[[.23,.25],[.54,1],[.80,.35]],
  switch:[[.26,.65],[.55,-.8],[.81,-.15]]
});
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function validateV9Rhythms(){
  const ids=Object.keys(V9_STAGE_RHYTHMS);
  if(ids.length!==30)throw Error('V9 must author 30 distinct driving rhythms');
  const fingerprints=new Set();
  for(let i=1;i<=30;i++){
    const id=String(i).padStart(2,'0'),p=V9_STAGE_RHYTHMS[id];
    if(!p||!p.identity||!Array.isArray(p.beats)||p.beats.length<2||
      p.beats.length>4||p.beats.filter(Boolean).length<1||
      p.beats.some(x=>x!==null&&!STYLES[x]))throw Error('Invalid stage rhythm '+id);
    const fingerprint=p.beats.map(x=>x??'rest').join('-');
    if(fingerprints.has(fingerprint))throw Error('Duplicate V9 rhythm sequence '+id);
    fingerprints.add(fingerprint);
  }
  return ids.length;
}
/** Work only between TWO ORIGINAL author-picked nodes, not an arbitrary
 * fraction of a spline. This leaves the original course skeleton and all
 * finish/start positions intact, while avoiding 105 near-identical S bends.
 */
/** Low-budget real lane-width modulation. The widest portions give actual
 * overtaking space, while one authored technical approach in each stage is
 * physically narrower. All road mesh, guardrails, player collision and AI
 * lateral goals use the same scalar; never paint a fake narrow road.
 *
 * Pattern parameters deliberately vary among stages to avoid a fixed
 * wide-straight/narrow-S cadence. Width remains above the vehicle safety
 * margin on both mobile and desktop.
 */
const widthBands=rhythms=>Object.freeze(Object.fromEntries(
  Object.keys(rhythms).map(id=>{
    const n=Number(id),p=rhythms[id],breather=p.beats.indexOf(null);
    const narrowAt=+.12+((n*7)%53)/100;
    const wideAt=breather>=0
      ? .66+((n*3)%16)/100
      : .70+((n*5)%11)/100;
    return [id,Object.freeze([
      Object.freeze({at:narrowAt,span:.07+((n%3)*.015),factor:.86+(n%3)*.02}),
      Object.freeze({at:wideAt,span:.10+((n%4)*.01),factor:1.045+(n%2)*.02}),
    ])];
  })
));
export const V9_WIDTH_BANDS=widthBands(V9_STAGE_RHYTHMS);
export const V10_BASELINE_WIDTH_BANDS=widthBands(V10_BASELINE_RHYTHMS);
const smooth01=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export function v9RoadHalfWidthAt(base,profile,fraction) {
  if(!Number.isFinite(base)||base<=0)throw Error('Invalid original road width');
  if(!profile)return base;
  if(!Number.isFinite(fraction)||!Array.isArray(profile))
    throw Error('Invalid V9 road width station');
  const f=((fraction%1)+1)%1;
  let factor=1;
  for(const band of profile){
    const dist=Math.min(Math.abs(f-band.at),1-Math.abs(f-band.at));
    if(dist>=band.span)continue;
    const influence=smooth01((band.span-dist)/band.span);
    factor+=(band.factor-1)*influence;
  }
  if(!Number.isFinite(factor)||factor<.83||factor>1.08)
    throw Error('Unsafe physical road width band');
  return base*factor;
}


export function shapeV9RhythmSegments(local,courseId,scale,originalSectors,{legacyV10=false,pacing=!legacyV10}={}){
  
validateV9Rhythms();
  if(legacyV10&&pacing)throw Error('Legacy V10 requires its original V9 sector indices');
  const plan=(legacyV10?V10_BASELINE_RHYTHMS:V9_STAGE_RHYTHMS)[courseId];
  if(!plan||!Array.isArray(local)||!finite(scale)||scale<=0||
     !Array.isArray(originalSectors)||originalSectors.length!==plan.beats.length)
    throw Error('Missing authored rhythm contract '+courseId);
  const out=local.map(v=>v.slice()),seen=new Set(),insertions=[];
  let applied=0;
  for(let k=originalSectors.length-1;k>=0;k--){
    const [authoredIndex,amplitude,side]=originalSectors[k],style=plan.beats[k];
    // The old 22 grandSweep at node 15 was mainly beyond its 84% finish.
    // Place the same authored corner at node 11, inside the actual race.
    const index=pacing && courseId==='22' && authoredIndex===15 &&
      style==='grandSweep' ? 11 : authoredIndex;
    if(!Number.isInteger(index)||index<1||index>=local.length-1||
       seen.has(index)||!finite(amplitude)||amplitude<10||amplitude>30||
       ![-1,1].includes(side))throw Error('Invalid authored rhythm segment '+courseId);
    seen.add(index);
    if(style===null)continue;
    const a=local[index],b=local[index+1],
      dx=b[0]-a[0],dz=b[1]-a[1],span=Math.hypot(dx,dz);
    if(!finite(span)||span*scale<110)throw Error('V9 rhythm segment too short '+courseId);
    const normalX=-dz/span,normalZ=dx/span;
    // Limit offsets to the known-safe old design envelope. The old template
    // used +/- amplitude and collided with the rhythm of adjacent corners.
    // The 01/05/11/16 corner-duel chapters need authentic steering stakes:
    // retain four intentionally distinct beats while sharpening the apex
    // geometry instead of reducing the native steering challenge threshold.
    const chapter=Number(courseId);
    const baseline=chapter<=10?.73:chapter<=16?.87:chapter<=20?.96:
      chapter<=24?1.05:chapter<=27?1.12:1.18;
    // Long entries on 02/07/22 need sustained steering, not the old null rest.
    // Keep known V9 technical fork geometry in the same safe general envelope.
    const challengeAmplitude={
      '01':1.07,'02':1.15,'05':1.16,'07':1.18,
      '11':1.04,'16':1.04,'22':.73
    };
    const legacyAmplitude={'01':1.07,'05':1.16,'11':1.04,'16':1.04};
    const maximum=amplitude*(legacyV10
      ? legacyAmplitude[courseId]??.73 : challengeAmplitude[courseId]??baseline)/scale;
    const points=STYLES[style].map(([t,w])=>[
      +(a[0]+dx*t+normalX*side*maximum*w).toFixed(4),
      +(a[1]+dz*t+normalZ*side*maximum*w).toFixed(4),
      +(a[2]+(b[2]-a[2])*t).toFixed(4),
    ]);
    insertions.push({index,points});
    applied++;
  }
  let pacingApplied=0;
  for(const entry of pacing ? V91_PACING_SECTORS[courseId]??[] : []) {
    const {index,amplitude,side,shape}=entry;
    if(!Number.isInteger(index)||index<0||index>=local.length-1||seen.has(index))
      throw Error('Invalid pacing anchor '+courseId);
    const a=local[index],b=local[index+1],dx=b[0]-a[0],dz=b[1]-a[1];
    const span=Math.hypot(dx,dz),profile=PACING_SHAPES[shape];
    if(!profile||!finite(span)||span*scale<100)
      throw Error('Pacing sector too short '+courseId);
    const offset=side*amplitude/scale;
    const points=profile.map(([t,w])=>[
      +(a[0]+dx*t-dz/span*offset*w).toFixed(4),
      +(a[1]+dz*t+dx/span*offset*w).toFixed(4),
      +(a[2]+(b[2]-a[2])*t).toFixed(4)
    ]);
    insertions.push({index,points});seen.add(index);pacingApplied++;
  }
  // Sort once so insertions can never reinterpret another sector's indices.
  for(const {index,points} of insertions.sort((a,b)=>b.index-a.index))
    out.splice(index+1,0,...points);
  if(!applied)throw Error('No real V9 geometry changes '+courseId);
  return {points:out,identity:plan.identity,applied,rest:originalSectors.length-applied,pacingApplied};
}
validateV9Rhythms();
