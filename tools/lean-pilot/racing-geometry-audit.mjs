/* global process, console */
// Original-vs-V3.1 centerline audit. Static geometry is NOT natural driving QA.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { applyTrackDesign } from '../../templates/web-lite/h5-source-mobile-v1/racing/track-design.mjs';

const root=process.cwd(), src=path.join(root,'runs/h5-qq-mobile-20261013/workspace/source/qq-speed');
const build=JSON.parse(await readFile(path.join(root,'runs/h5-qq-mobile-20261013/artifacts/build-racing.json')));
const source=await readFile(path.join(src,'src/layouts.js'),'utf8');
const prefix="import { applyTrackDesign } from './race-track-design.mjs';\n";
const suffix='\napplyTrackDesign(LAYOUTS);';
if(!source.startsWith(prefix) || !source.trimEnd().endsWith(suffix))
  throw Error('Unrecognized pinned generated layouts.js');
const originalSource=source.slice(prefix.length).trimEnd().slice(0,-suffix.length);
const original=(await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'))).LAYOUTS;
const modified=structuredClone(original);applyTrackDesign(modified);
const THREE=createRequire(path.join(src,'package.json'))('three');
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
function inspect(layout){
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
  return {lengthM:Math.round(len),widthM:layout.width,directionChanges:changes,
    p95Curvature:+abs[Math.floor(n*.95)].toFixed(5),
    sharpPct:Math.round(curvature.filter(x=>Math.abs(x)>=.018).length/n*100),
    sameLevelClosePairs:pairs,
    line:pts.filter((_,i)=>i%8===0).map(p=>[+p.x.toFixed(2),+p.z.toFixed(2)])};
}
const maps={};for(const name of Object.keys(original))maps[name]={old:inspect(original[name]),next:inspect(modified[name])};
const report={schemaVersion:1,buildHash:build.buildHash,upstream:build.sourceRevision,
  limitation:'Static Catmull-Rom centerline only; not natural-driving/phone performance QA',maps};
const out=path.join(root,'runs/h5-qq-mobile-20261013/artifacts/racing-v3-smoke');
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'geometry-v32.json'),JSON.stringify(report,null,2)+'\n');
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
console.log(JSON.stringify({buildHash:report.buildHash,maps:Object.fromEntries(
  Object.entries(maps).map(([name,item])=>[name,{old:{length:item.old.lengthM,turns:item.old.directionChanges,sharp:item.old.sharpPct},
    next:{length:item.next.lengthM,turns:item.next.directionChanges,sharp:item.next.sharpPct,closePairs:item.next.sameLevelClosePairs}}]))}));
