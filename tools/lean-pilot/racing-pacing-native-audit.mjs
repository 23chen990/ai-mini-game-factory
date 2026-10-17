/* global console */
/** Called after the real H5 build, with its exact native Track and generated layouts.
 * Read-only. This does not move cars, change physics, saves or acceptance thresholds.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {measureCourseActivity} from './racing-course-activity.mjs';
import {STAGES} from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import {COURSE_BLUEPRINTS,COURSE_TECHNICAL_SECTORS,createRaceTrackTheme} from '../../templates/web-lite/h5-source-mobile-v1/racing/track-design.mjs';
import {shapeV9RhythmSegments} from '../../templates/web-lite/h5-source-mobile-v1/racing/v9-course-director.mjs';
import {applyV8CourseGeometry} from '../../templates/web-lite/h5-source-mobile-v1/racing/v8-course-geometry.mjs';
import {PAD_LANES} from '../../templates/web-lite/h5-source-mobile-v1/racing/lane-design.mjs';
import {RACE_FINISH_FRACTIONS} from '../../templates/web-lite/h5-source-mobile-v1/racing/session.mjs';

export async function runNativePacingAudit(root='.') {
  const run=path.resolve(root,'runs/h5-qq-mobile-20261013');
  const src=path.join(run,'workspace/source/qq-speed/src');
  const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json'),'utf8'));
  const nativeMain=await readFile(path.join(src,'main.js'),'utf8');
  assert.match(nativeMain,/settings\.course === 'race-07' \? \.82/u);
  assert.match(nativeMain,/settings\.course === 'race-22' \? \.84/u);
  const {Track}=await import(pathToFileURL(path.join(src,'track.js')).href);
  const {LAYOUTS}=await import(pathToFileURL(path.join(src,'layouts.js')).href);
  const rows=[],courses=[];
  for(const stage of STAGES) {
    const layout=LAYOUTS[stage.course];assert.ok(layout,'Missing actual built course '+stage.id);
    const [,, ,scale,sketch]=COURSE_BLUEPRINTS[stage.id];
    const local=sketch.split(' ').map(p=>p.split(',').map(Number));
    const reconstruct=pacing=>{
      const shaped=shapeV9RhythmSegments(local,stage.id,scale,COURSE_TECHNICAL_SECTORS[stage.id],{pacing});
      const geo=applyV8CourseGeometry(shaped.points,stage.id,scale);
      const [ox,oz]=layout.points[0];
      return {...layout,points:geo.points.map(p=>stage.map==='egypt'
        ? [ox-p[1]*geo.scale,oz+p[0]*geo.scale,p[2]]
        : [ox+p[0]*geo.scale,oz+p[1]*geo.scale,p[2]])};
    };
    assert.deepEqual(reconstruct(true).points,layout.points,'Audit must match built geometry '+stage.id);
    const before=measureCourseActivity(new Track(reconstruct(false)),stage);
    const tr=new Track(layout),after=measureCourseActivity(tr,stage);
    if(!['03','07','22'].includes(stage.id)) assert.deepEqual(before,after,'Non-target track changed '+stage.id);
    const maxFraction=RACE_FINISH_FRACTIONS[stage.course]??1;
    const theme=createRaceTrackTheme({boostPads:PAD_LANES[stage.map]??[],tunnels:[]},tr,stage.course);
    const potentialPads=theme.boostPads.filter(p=>p.f<maxFraction).map(p=>({atM:Math.round(p.f*tr.length),lateralM:p.lat}));
    const row={id:stage.id,beforeLowTurnM:before.longestLowCurvature.lengthM,
      afterLowTurnM:after.longestLowCurvature.lengthM,actualRaceDistanceM:after.raceDistanceM,
      firstAboveLowCurvatureM:after.firstAboveLowCurvatureM,warning:after.warning};
    rows.push(row);courses.push({id:stage.id,stageMode:stage.mode,before,after,
      potentialPads,featureScope:'road opportunities only; inventory, traffic and actual player choices NOT MEASURED'});
  }
  assert.equal(courses.length,30);
  const c03=rows.find(x=>x.id==='03'),c07=rows.find(x=>x.id==='07'),c22=rows.find(x=>x.id==='22');
  assert.ok(c03.beforeLowTurnM>450,'Reproduce stage03 lap-line automatic cruise');
  assert.ok(c03.afterLowTurnM<280&&c03.firstAboveLowCurvatureM<150,'Stage03 needs an early real driving decision');
  assert.ok(c22.beforeLowTurnM>800,'Reproduce the reported middle-sector gap');
  assert.ok(c22.afterLowTurnM<400&&c22.afterLowTurnM<c22.beforeLowTurnM*.5,'Repair the actual race, not its closing road');
  assert.ok(c07.afterLowTurnM<300&&c07.afterLowTurnM<c07.beforeLowTurnM,'Shorten the verified 07 intervals');
  const report={schemaVersion:1,gameId:'qq-speed',runId:'h5-qq-mobile-20261013',
    buildHash:build.buildHash,baseline:'same V9.1 generator with pacing:false; no other rules changed',
    engineeringPassed:true,humanPhoneQA:'NOT_RUN',rows,courses};
  const out=path.join(run,'artifacts/racing-v3-smoke');await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'course-activity.json'),JSON.stringify(report,null,2)+'\n');
  console.log('RACING_PACING_NATIVE_RESULT='+JSON.stringify({engineeringPassed:true,rows,humanPhoneQA:'NOT_RUN'}));
  return report;
}
