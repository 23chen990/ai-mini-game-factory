import { V9_STAGE_RHYTHMS } from './v9-course-director.mjs';
/**
 * V10 bespoke native driving sequences. Each beat is mapped to an explicit
 * ORIGINAL sketch edge (not a randomly generated bend at a progress ratio).
 *
 * width/elevation/roadside cues are physically attached to real Three.js
 * Track samples. No invisible steering aids, teleports, AI magic speed,
 * counterfeit QQ Speed art, or added HUD tutorials.
 *
 * Each stage deliberately pairs its V9 route skeleton with independent V10
 * braking / sweep / countersteer or crest beats, so harder stages demand
 * different driving actions rather than merely being longer.
 */
export const V10_STAGE_SIGNATURES=Object.freeze({
  '01':{identity:'town attack: corner-in, countersteer, recover boost',beats:[[2,'arc',20],[8,'late',16]]},
  '02':{identity:'dune rush: crest, blind braking ridge',beats:[[2,'crest',19],[14,'late',18]]},
  '03':{identity:'interchange: broad outer sweep to inner apex',beats:[[4,'sweep',18],[11,'late',17]]},
  '04':{identity:'sea cliff: entry flow then descending cut',beats:[[3,'sweep',18],[12,'apex',17]]},
  '05':{identity:'temple: long brake pocket and restart chase',beats:[[3,'late',18],[11,'sweep',16]]},
  '06':{identity:'double city: narrow expressway reversal',beats:[[19,'arc',19]]},
  '07':{identity:'cliff staircase: three real descent commitments',beats:[[2,'switch',20],[11,'sweep',20],[18,'late',17]]},
  '08':{identity:'snow ring: long loaded arc and recovery',beats:[[17,'arc',18]]},
  '09':{identity:'dune peaks: airborne line / late finish brake',beats:[[1,'crest',21],[14,'late',20]]},
  '10':{identity:'neon shortcut: corner-control to open straight',beats:[[7,'apex',20],[10,'arc',18]]},
  '11':{identity:'serpentine coast: flowing linked drifts',beats:[[3,'sweep',19],[9,'late',17]]},
  '12':{identity:'ice bridge: descent flow and sharp second transfer',beats:[[5,'sweep',20],[14,'switch',22]]},
  '13':{identity:'crown duel: inside braking and last-gasp apex',beats:[[4,'late',21],[16,'apex',21]]},
  '14':{identity:'double dune crests: suspension and sweeping exit',beats:[[2,'crest',22],[16,'sweep',19]]},
  '15':{identity:'snow petals: loaded reversal and short relief',beats:[[3,'late',22],[13,'switch',20]]},
  '16':{identity:'cliff crown: downhill entry then crosswind brake',beats:[[2,'sweep',20],[12,'late',20]]},
  '17':{identity:'scissor city: technically committed double chicane',beats:[[3,'switch',26],[9,'late',22]]},
  '18':{identity:'dual ravines: gentle launch into a risky apex',beats:[[1,'sweep',20],[11,'late',20]]},
  '19':{identity:'tidal cape: late inner turn and coast exit',beats:[[2,'late',19],[13,'switch',19]]},
  '20':{identity:'ice crown: alpine sweep / precise return',beats:[[2,'sweep',18],[13,'switch',21]]},
  '21':{identity:'twin bows: long high-speed arc to cut',beats:[[4,'sweep',20],[10,'apex',21]]},
  '22':{identity:'stone canyon: genuine downhill switchbacks',beats:[[1,'switch',24],[8,'switch',22],[14,'late',24]]},
  '23':{identity:'sea bridge: wide crossing then corner commitment',beats:[[9,'sweep',21],[13,'late',19]]},
  '24':{identity:'white-night hook: loaded line and sudden return',beats:[[6,'switch',23],[16,'late',22]]},
  '25':{identity:'quantum viaduct: inner apex defended under pressure',beats:[[3,'apex',24],[13,'switch',20]]},
  '26':{identity:'sunset ring: broad rolling drift then late brake',beats:[[2,'arc',20],[8,'late',19]]},
  '27':{identity:'cloud snake: rhythmic countersteer with sky fork',beats:[[7,'switch',22],[17,'apex',21]]},
  '28':{identity:'aurora branches: bridge crest and hard braking line',beats:[[3,'crest',20],[11,'late',20]]},
  '29':{identity:'night cross: defending an apex under traffic',beats:[[4,'late',22],[10,'switch',22]]},
  '30':{identity:'skyline final: open sprint to technical late duel',beats:[[2,'sweep',21],[18,'switch',24]]},
});
const STROKES=Object.freeze({
  // arc is ONE long continuous bend; no automatic sign-flipping zigzag.
  arc:[[.24,.22,0],[.55,.85,0],[.82,.38,0]],
  sweep:[[.23,.28,0],[.49,.65,0],[.78,.36,0]],
  apex:[[.28,.12,0],[.56,1,0],[.80,.34,0]],
  late:[[.28,.05,0],[.58,.40,0],[.80,1.05,0]],
  switch:[[.24,.70,0],[.50,-.84,0],[.79,.24,0]],
  crest:[[.28,.22,.45],[.51,.70,3.2],[.78,.34,.6]],
});
const number=v=>typeof v==='number'&&Number.isFinite(v);
export function validateV10Signatures(){
  if(Object.keys(V10_STAGE_SIGNATURES).length!==30)throw Error('V10 must author 30 driving programs');
  const seen=new Set();
  for(let n=1;n<=30;n++){
    const id=String(n).padStart(2,'0'),p=V10_STAGE_SIGNATURES[id];
    if(!p||typeof p.identity!=='string'||p.identity.length<18||
       !Array.isArray(p.beats)||p.beats.length<1||p.beats.length>3)
      throw Error('Missing stage V10 driving identity '+id);
    const key=p.beats.map(([idx,style])=>idx+':'+style).join('/');
    if(seen.has(key))throw Error('Duplicate V10 driving program '+id);
    seen.add(key);
    for(const beat of p.beats) {
      if(beat.length!==3||!Number.isInteger(beat[0])||
         !STROKES[beat[1]]||!number(beat[2])||beat[2]<14||beat[2]>27)
        throw Error('Invalid authored V10 technical event '+id);
    }
  }
  return 30;
}
export function shapeV10SignatureSectors(original,shaped,originalSectors,id,baseScale,stretch){
  validateV10Signatures();
  const plan=V10_STAGE_SIGNATURES[id];
  if(!plan||!Array.isArray(original)||!Array.isArray(shaped)||
     !Array.isArray(originalSectors)||!number(baseScale)||baseScale<=0||
     !number(stretch)||stretch<=0)throw Error('Missing V10 road choreography '+id);
  const oldPlan=V9_STAGE_RHYTHMS[id];
  if(!oldPlan||oldPlan.beats.length!==originalSectors.length)
    throw Error('Unmatched V9/V10 sector contract '+id);
  const expanded=(index)=>index+originalSectors.reduce((sum,[oldIndex],k)=>
    sum+(oldIndex<index&&oldPlan.beats[k]!==null?3:0),0);
  const segments=new Set(originalSectors.map(x=>x[0])),extras=new Set();
  const out=shaped.map(p=>p.slice());
  for(const [index,style,amplitude]of [...plan.beats].sort((a,b)=>b[0]-a[0])) {
    if(index<1||index>=original.length-1||segments.has(index)||
       extras.has(index))throw Error('Overlapping V10/V9 real driving segment '+id);
    extras.add(index);
    const a=original[index],b=original[index+1],
      dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length*baseScale<120)throw Error('V10 authored sector too short '+id+':'+index);
    const normalX=-dz/length,normalZ=dx/length,
      physical=amplitude/(baseScale*stretch);
    const points=STROKES[style].map(([t,w,h])=>[
      +(a[0]+dx*t+normalX*physical*w).toFixed(4),
      +(a[1]+dz*t+normalZ*physical*w).toFixed(4),
      +(a[2]+(b[2]-a[2])*t+h/(baseScale*stretch)).toFixed(4),
    ]);
    out.splice(expanded(index)+1,0,...points);
  }
  if(out.length>40)throw Error('V10 native control-point limit exceeded '+id);
  return {points:out,identity:plan.identity,events:plan.beats.length};
}
validateV10Signatures();
