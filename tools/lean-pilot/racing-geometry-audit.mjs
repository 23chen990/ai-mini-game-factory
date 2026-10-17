/* global process, console */
// V9 native centerline and physical short-apex audit. Static geometry is NOT natural driving QA.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { SHORTCUT_PLANS, installPhysicalShortcut } from '../../templates/web-lite/h5-source-mobile-v1/racing/shortcut-network.mjs';
import { applyTrackDesign, CAREER_COURSE_MAPS, COURSE_BLUEPRINTS, createRaceTrackTheme } from '../../templates/web-lite/h5-source-mobile-v1/racing/track-design.mjs';
import { PAD_LANES } from '../../templates/web-lite/h5-source-mobile-v1/racing/lane-design.mjs';

const root=process.cwd(), src=path.join(root,'runs/h5-qq-mobile-20261013/workspace/source/qq-speed');
const build=JSON.parse(await readFile(path.join(root,'runs/h5-qq-mobile-20261013/artifacts/build-racing.json')));
const source=await readFile(path.join(src,'src/layouts.js'),'utf8');
const prefix="import { applyTrackDesign } from './race-track-design.mjs';\n";
const suffix='\napplyTrackDesign(LAYOUTS, { v8: true, v9: true });';
if(!source.startsWith(prefix) || !source.trimEnd().endsWith(suffix))
  throw Error('Unrecognized pinned generated layouts.js');
const originalSource=source.slice(prefix.length).trimEnd().slice(0,-suffix.length);
const original=(await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'))).LAYOUTS;
const modified=JSON.parse(JSON.stringify(original));applyTrackDesign(modified,{v8:true,v9:true});
const THREE=createRequire(path.join(src,'package.json'))('three');
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
function inspect(layout, key){
  const curve=new THREE.CatmullRomCurve3(layout.points.map(p=>new THREE.Vector3(p[0],p[2]||0,p[1])),true,'centripetal');
  curve.arcLengthDivisions=6000;curve.updateArcLengths();
  const len=curve.getLength(),n=Math.round(len/1.5),ds=len/n;
  const pts=curve.getSpacedPoints(n).slice(0,n);
  const headings=pts.map((p,i)=>{const a=pts[(i+n-1)%n],b=pts[(i+1)%n];return Math.atan2(b.x-a.x,b.z-a.z);});
  const raw=headings.map((h,i)=>wrap(headings[(i+1)%n]-h)/ds);
  const curvature=raw.map((_,i)=>{let sum=0;for(let k=-7;k<=7;k++)sum+=raw[(i+k+n)%n];return sum/15;});
  const abs=curvature.map(Math.abs).sort((a,b)=>a-b);
  let changes=0,last=0,lastD=-1000;
  const stride=Math.max(1,Math.floor(20/ds));
  for(let i=0;i<n;i+=stride){
    const sample=curvature.slice(i,i+stride);
    const avg=sample.reduce((a,b)=>a+b,0)/sample.length;
    const sign=Math.abs(avg)>=.008?Math.sign(avg):0;
    if(sign && sign!==last && i*ds-lastD>=40){if(last)changes++;last=sign;lastD=i*ds;}
  }
  let pairs=0;
  for(let i=0;i<n;i+=8)for(let j=i+8;j<n;j+=8){
    if(Math.min(j-i,n-j+i)*ds<125 || Math.abs(pts[i].y-pts[j].y)>3.5)continue;
    if(Math.hypot(pts[i].x-pts[j].x,pts[i].z-pts[j].z)<layout.width+1)pairs++;
  }
  const padAnchors=(PAD_LANES[key]??[]).map(p=>Math.min(...pts.map(pt=>Math.hypot(pt.x-p.at[0],pt.z-p.at[1]))));
  // At 45 m/s normal native steering can follow roughly 0.023 1/m curvature
  // without a native drift; not a verified mobile handling benchmark.
  const normalTurnCap=1.9/45-1.9*.55/55;
  return {lengthM:Math.round(len),widthM:layout.width,directionChanges:changes,
    sharpNormalSteeringAt45Pct:Math.round(curvature.filter(c=>Math.abs(c)>normalTurnCap).length/n*100),
    maxPadAnchorOffsetM:+Math.max(0,...padAnchors).toFixed(1),
    p95Curvature:+abs[Math.floor(n*.95)].toFixed(5),
    sharpPct:Math.round(curvature.filter(x=>Math.abs(x)>=.018).length/n*100),
    sameLevelClosePairs:pairs,
    line:pts.filter((_,i)=>i%8===0).map(p=>[+p.x.toFixed(2),+p.z.toFixed(2)])};
}
const maps={};for(const name of Object.keys(original)){
  maps[name]={old:inspect(original[name],name),next:inspect(modified[name],name)};
  if(maps[name].next.maxPadAnchorOffsetM>36) throw Error(name+': new centerline is too far from an existing boost pad anchor');
}
const { Track: NativeTrack }=await import(pathToFileURL(path.join(src,'src/track.js')).href);
const courses={}, fingerprints=new Set();
for(let i=1;i<=CAREER_COURSE_MAPS.length;i++){ 
  const id=String(i).padStart(2,'0'),key='race-'+id,map=CAREER_COURSE_MAPS[i-1];
  const layout=modified[key];
  if(!layout || !Array.isArray(layout.points)) throw Error('Missing physical stage course '+id);
  const fingerprint=JSON.stringify(layout.points);
  if(fingerprints.has(fingerprint)) throw Error('Duplicated physical stage course '+id);
  fingerprints.add(fingerprint);
  const geometry=inspect(layout,map);
  // Original world-coordinate boost-pad anchors must not be used on an
  // entirely new route: the stage-specific theme uses actual track fractions.
  const tr=new NativeTrack(layout);
  const padLanes=(PAD_LANES[map]??[]).map(p=>({lat:p.lat}));
  const courseTheme=createRaceTrackTheme({boostPads:padLanes,tunnels:map==='city'?[]:[{}]},tr,key);
  if(courseTheme.boostPads.length!==padLanes.length ||
      courseTheme.boostPads.some(p=>!Number.isFinite(p.f)||p.f<=.08||p.f>=.93||
        Math.abs(p.lat)>=tr.halfW-1.5) ||
      courseTheme.tunnels.some(t=>!(t.f0>0&&t.f1>t.f0&&t.f1<1)))
    throw Error('Stage-specific speed-pad/tunnel placement is not on the real road: '+id);
  // No easy-stage sharp-turn exemption: 01 now gets the same physical cap as
  // its peers. Native PlayerCar drivability is checked independently.
  if(geometry.sameLevelClosePairs>0 ||
      geometry.lengthM<1900 || geometry.lengthM>5700 ||
      geometry.sharpPct>(Number(id)<=10?23:Number(id)<=16?29:36))
    throw Error('Unsafe stage '+id+' physical geometry '+JSON.stringify({
      collisions:geometry.sameLevelClosePairs,sharpPct:geometry.sharpPct,length:geometry.lengthM}));
  courses[id]={scene:map,courseName:COURSE_BLUEPRINTS[id][0],
    physicalPads:courseTheme.boostPads.map(p=>({f:+p.f.toFixed(4),lat:p.lat})),
    ...geometry,maxPadAnchorOffsetM:0};
}
if(Object.keys(courses).length!==CAREER_COURSE_MAPS.length)
  throw Error('All '+CAREER_COURSE_MAPS.length+' stages must have distinct physical courses');
// Actual pinned Three.js Track projection test, not a simulated race victory.
const shortcutAudit={};
for(const course of Object.keys(SHORTCUT_PLANS)){
  const track=new NativeTrack(modified[course]),fork=installPhysicalShortcut(track,course,{v8:true,v9:true});
  if(!fork || !(fork.gain>=24&&fork.gain<=82) ||
     !(fork.length>=75&&fork.length<=210) ||
     !(fork.neckWidth>=8.5&&fork.neckWidth<=11) ||
     !(fork.width>=11&&fork.width<=14) || !Number.isFinite(fork.length))
    throw Error('Shortcut is not an honest shorter physical road: '+course);
  const p={},details=[];
  for(let i=0;i<fork.samples.length;i+=2){
    const x=fork.samples[i];
    const probe=track.project(x.x,x.y,x.z,-1,p);
    details.push({active:probe.__RACE_SHORTCUT_ACTIVE===true,d:probe.d});
  }
  const active=details.filter(x=>x.active);
  if(active.length<8 || details.at(-1).active)
    throw Error('Shortcut must have a physically reachable gated entry and normal exit: '+course);
  // A shortened road is invalid if it overlaps the normal road throughout
  // the supposedly independent middle sector. Ignore only >5m vertical
  // overpasses. Guardrail collision widths must have actual clearance.
  let minMidCorridorClearance=Infinity;
  const first=Math.floor(fork.samples.length*.33),
    last=Math.ceil(fork.samples.length*.67);
  for(let i=first;i<last;i+=2){
    const p=fork.samples[i],branchHalf=fork.widthAt(p.arc)*.5;
    let nearest=Infinity;
    for(let j=0;j<track.N;j+=2){
      if(Math.abs(p.y-track.py[j])>5.5)continue;
      nearest=Math.min(nearest,Math.hypot(p.x-track.px[j],p.z-track.pz[j]));
    }
    minMidCorridorClearance=Math.min(minMidCorridorClearance,
      nearest-(track.halfW+branchHalf));
  }
  if(!Number.isFinite(minMidCorridorClearance)||
     minMidCorridorClearance<.35)
    throw Error('Fork overlaps original main-road driving corridor: '+
      course+' '+minMidCorridorClearance.toFixed(1)+'m');
  const mesh=fork.buildMesh(THREE,()=>0);
  if(!mesh.getObjectByName('physical-shortcut-road') ||
     !mesh.getObjectByName('physical-shortcut-rails') ||
     mesh.getObjectByName('physical-shortcut-approach')?.children?.length!==2)
    throw Error('Shortcut missing physical fork road, side rails or pre-entry markers: '+course);
  const approach=mesh.getObjectByName('physical-shortcut-approach');
  // World-space signs must point TOWARD the real open fork. A reversed local
  // axis would send players into the opposite rail despite a passing build.
  for(const [index,back] of [98,52].entries()){
    const at=track.sample(fork.start-back,{});
    const sign=approach.children[index],tip=sign.children[1];
    const lateral=(sign.position.x-at.x)*at.rx+(sign.position.z-at.z)*at.rz;
    const vector=new THREE.Vector3(0,1,0).applyEuler(tip.rotation).applyEuler(sign.rotation);
    const toward=(vector.x*at.rx+vector.z*at.rz)*Math.sign(lateral);
    if(sign.name!=='physical-shortcut-direction'||!Number.isFinite(toward)||
       toward<.90 || Math.abs(lateral)-track.halfW<3.5)
      throw Error('Shortcut approach sign points away from actual opening: '+course);
  }
  shortcutAudit[course]={scene:CAREER_COURSE_MAPS[+course.slice(-2)-1],
    branchLengthM:+fork.length.toFixed(1),mainSegmentM:fork.end-fork.start,
    physicalSavingM:+fork.gain.toFixed(1),widthM:fork.width,neckWidthM:fork.neckWidth,
    playerProjectionPoints:active.length,
    minMidCorridorClearanceM:+minMidCorridorClearance.toFixed(1)};
  mesh.traverse(o=>{o.geometry?.dispose();if(o.material&&!Array.isArray(o.material))o.material.dispose();});
}
if(Object.keys(shortcutAudit).length!==10)throw Error('Missing ten genuine physical shortcut tracks');
const report={schemaVersion:2,buildHash:build.buildHash,upstream:build.sourceRevision,
  limitation:'Static Catmull-Rom centerline only; not natural-driving/phone performance QA',
  maps,courses,shortcuts:shortcutAudit};
const out=path.join(root,'runs/h5-qq-mobile-20261013/artifacts/racing-v3-smoke');
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'geometry-v32.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(out,'geometry-career30.json'),JSON.stringify({buildHash:report.buildHash,courses,shortcuts:shortcutAudit},null,2)+'\n');
// Preserve the earlier artifact path for historical V5.3 external QA consumers.
const original16=Object.fromEntries(Object.entries(courses).filter(([id])=>Number(id)<=16));
await writeFile(path.join(out,'geometry-career16.json'),JSON.stringify({buildHash:report.buildHash,courses:original16,shortcuts:shortcutAudit},null,2)+'\n');
let art='';
for(const [i,name] of Object.keys(maps).entries()){
  const a=maps[name],all=[...a.old.line,...a.next.line],xs=all.map(x=>x[0]),zs=all.map(x=>x[1]);
  const minX=Math.min(...xs),minZ=Math.min(...zs);
  const scale=Math.min(400/(Math.max(...xs)-minX),196/(Math.max(...zs)-minZ));
  for(const [col,item] of [[0,a.old],[1,a.next]]){
    const pathD=item.line.map(([x,z],k)=>(k?'L':'M')+(36+(x-minX)*scale).toFixed(1)+' '+(48+(z-minZ)*scale).toFixed(1)).join(' ')+' Z';
    art+='<g transform="translate('+(18+col*492)+' '+(32+i*265)+')">'+
      '<rect width="470" height="244" rx="12" fill="white" stroke="#cad7df"/>'+
      '<text x="15" y="23" font-size="16" font-family="sans-serif" fill="#22394a">'+name+(col?' - reshaped':' - original')+'</text>'+
      '<path d="'+pathD+'" stroke="'+(col?'#167e96':'#8a97a2')+'" stroke-width="3.5" fill="none"/>'+
      '<text x="14" y="233" font-size="12" fill="#526a79">'+item.lengthM+'m | '+item.directionChanges+' turns | '+item.sharpPct+'% sharp</text></g>';
  }
}
await writeFile(path.join(out,'geometry-v32.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1100" width="1000" height="1100">'+
  '<rect width="1000" height="1100" fill="#eef4f7"/>'+art+'</svg>');
console.log(JSON.stringify({shortcutAudit,careerCourseCount:Object.keys(courses).length,courseWidths:Object.fromEntries(Object.entries(courses).map(([id,c])=>[id,{scene:c.scene,lengthM:c.lengthM,turns:c.directionChanges,sharpPct:c.sharpPct}])),buildHash:report.buildHash,maps:Object.fromEntries(
  Object.entries(maps).map(([name,item])=>[name,{old:{length:item.old.lengthM,turns:item.old.directionChanges,sharp:item.old.sharpPct},
    next:{length:item.next.lengthM,turns:item.next.directionChanges,sharp:item.next.sharpPct,closePairs:item.next.sameLevelClosePairs}}]))}));
