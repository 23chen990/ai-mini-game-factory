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
import {shapeV9RhythmSegments,V9_WIDTH_BANDS} from '../../templates/web-lite/h5-source-mobile-v1/racing/v9-course-director.mjs';
import {applyV8CourseGeometry} from '../../templates/web-lite/h5-source-mobile-v1/racing/v8-course-geometry.mjs';
import {createV11CourseGeometry,v11RaceFraction} from '../../templates/web-lite/h5-source-mobile-v1/racing/v11-course-director.mjs';
import {PAD_LANES} from '../../templates/web-lite/h5-source-mobile-v1/racing/lane-design.mjs';
import {RACE_FINISH_FRACTIONS} from '../../templates/web-lite/h5-source-mobile-v1/racing/session.mjs';

export async function runNativePacingAudit(root='.',{routeVersion='v11'}={}) {
  assert.ok(['v11','v9'].includes(routeVersion),'Select the actual built V11 or explicit legacy V9 route');
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
    const place=(points,planScale=1)=>{
      const [ox,oz]=layout.points[0];
      return points.map(p=>stage.map==='egypt'
        ? [ox-p[1]*planScale,oz+p[0]*planScale,p[2]]
        : [ox+p[0]*planScale,oz+p[1]*planScale,p[2]]);
    };
    const reconstructV9=pacing=>{
      const shaped=shapeV9RhythmSegments(local,stage.id,scale,COURSE_TECHNICAL_SECTORS[stage.id],{pacing});
      const geo=applyV8CourseGeometry(shaped.points,stage.id,scale);
      return {...layout,points:place(geo.points,geo.scale),v9WidthProfile:V9_WIDTH_BANDS[stage.id],
        v10StageIdentity:undefined,v11CourseIdentity:undefined};
    };
    const tr=new Track(layout);
    if(routeVersion==='v11') {
      const geometry=createV11CourseGeometry(stage.id);
      assert.deepEqual(place(geometry.points),layout.points,'Audit must match complete recovered V11 geometry '+stage.id);
      assert.deepEqual(layout.v9WidthProfile,geometry.widthProfile,'Audit must match recovered V11 road width '+stage.id);
      assert.equal(tr.__V11_COURSE_IDENTITY__,geometry.identity,'Actual native Track must carry V11 identity '+stage.id);
    } else {
      assert.ok(!layout.v11CourseIdentity&&!layout.v10StageIdentity,'Legacy audit must use an actual V9 build '+stage.id);
      assert.deepEqual(reconstructV9(true).points,layout.points,'Legacy audit must match built V9 geometry '+stage.id);
    }
    const before=measureCourseActivity(new Track(reconstructV9(false)),stage);
    const after=measureCourseActivity(tr,stage);
    // Only the isolated V9.1 repair promises that all other V9 tracks stay
    // unchanged. Complete V11 routes are compared with a historical baseline.
    if(routeVersion==='v9'&&!['03','07','22'].includes(stage.id))
      assert.deepEqual(before,after,'Non-target legacy V9 track changed '+stage.id);
    const maxFraction=RACE_FINISH_FRACTIONS[stage.course]??1;
    assert.equal(maxFraction,v11RaceFraction(stage.course),'Session must exclude the one-way return road '+stage.id);
    const theme=createRaceTrackTheme({boostPads:PAD_LANES[stage.map]??[],tunnels:[]},tr,stage.course);
    const potentialPads=theme.boostPads.filter(p=>p.f<maxFraction).map(p=>({atM:Math.round(p.f*tr.length),lateralM:p.lat}));
    const row={id:stage.id,beforeLowTurnM:before.longestLowCurvature.lengthM,
      afterLowTurnM:after.longestLowCurvature.lengthM,actualRaceDistanceM:after.raceDistanceM,
      firstAboveLowCurvatureM:after.firstAboveLowCurvatureM,warning:after.warning};
    rows.push(row);courses.push({id:stage.id,stageMode:stage.mode,routeVersion,
      nativeCourseIdentity:tr.__V11_COURSE_IDENTITY__??null,before,after,
      potentialPads,featureScope:'road opportunities only; inventory, traffic and actual player choices NOT MEASURED'});
  }
  assert.equal(courses.length,30);
  const c03=rows.find(x=>x.id==='03'),c07=rows.find(x=>x.id==='07'),c22=rows.find(x=>x.id==='22');
  const checks=[
    {id:'historical-stage03-cruise',passed:c03.beforeLowTurnM>450,observedM:c03.beforeLowTurnM,required:'>450'},
    {id:'stage03-early-decision',passed:c03.afterLowTurnM<280&&c03.firstAboveLowCurvatureM<150,
      observedM:c03.afterLowTurnM,firstAboveLowCurvatureM:c03.firstAboveLowCurvatureM,required:'<280; first turn <150'},
    {id:'historical-stage22-gap',passed:c22.beforeLowTurnM>800,observedM:c22.beforeLowTurnM,required:'>800'},
    {id:'stage22-race-interval',passed:c22.afterLowTurnM<400&&c22.afterLowTurnM<c22.beforeLowTurnM*.5,
      observedM:c22.afterLowTurnM,historicalM:c22.beforeLowTurnM,required:'<400 and <50% of historical interval'},
    {id:'stage07-race-interval',passed:c07.afterLowTurnM<300&&c07.afterLowTurnM<c07.beforeLowTurnM,
      observedM:c07.afterLowTurnM,historicalM:c07.beforeLowTurnM,required:'<300 and shorter than historical interval'},
  ];
  const report={schemaVersion:2,gameId:'qq-speed',runId:'h5-qq-mobile-20261013',routeVersion,
    buildHash:build.buildHash,baseline:'historical V9.1 geometry generator with pacing:false',
    comparison:routeVersion==='v11'
      ? 'complete recovered V11 routes versus historical V9.1 geometry; not an isolated pacing-only change'
      : 'same explicit legacy V9.1 geometry with pacing:false versus pacing:true; non-target routes unchanged',
    engineeringPassed:checks.every(check=>check.passed),humanPhoneQA:'NOT_RUN',checks,rows,courses};
  const out=path.join(run,'artifacts/racing-v3-smoke');await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'course-activity.json'),JSON.stringify(report,null,2)+'\n');
  console.log('RACING_PACING_NATIVE_RESULT='+JSON.stringify({routeVersion,engineeringPassed:report.engineeringPassed,checks,rows,humanPhoneQA:'NOT_RUN'}));
  assert.ok(report.engineeringPassed,'Native pacing limits failed: '+checks.filter(check=>!check.passed).map(check=>check.id).join(', '));
  return report;
}
