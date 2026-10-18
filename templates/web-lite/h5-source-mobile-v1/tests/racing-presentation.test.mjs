import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { URL } from 'node:url';
import { careerCourseSvg, raceCoursePreview, raceProgressPercent, compactRaceObjective, stageRailScrollLeft, rewardedStageStatus } from '../racing/presentation.mjs';
import { STAGES } from '../racing/career.mjs';
import { createV11CourseGeometry, v11RaceFraction } from '../racing/v11-course-director.mjs';

test('all 30 authored tracks have unique rendered road shapes without remote assets', () => {
  const paths = new Set();
  for (const stage of STAGES) {
    const svg = careerCourseSvg(stage.course);
    assert.match(svg, /viewBox="0 0 240 134"/);
    assert.match(svg, /race-track-start/);
    assert.equal(svg.includes('http'), false);
    const path = svg.match(/class="race-track-road" d="([^"]+)"/)?.[1];
    assert.ok(path);
    const geometry=createV11CourseGeometry(stage.id);
    const preview=raceCoursePreview(stage.course);
    assert.equal((path.match(/L/g)??[]).length+1,preview.points.length);
    if(v11RaceFraction(stage.course)===1){
      assert.ok(path.endsWith(' Z'));
      assert.deepEqual(preview.points,geometry.planPoints);
    }else{
      assert.equal(path.endsWith(' Z'),false,'single-run thumbnail must not draw its return connector');
      assert.match(svg,/race-track-finish/);
    }
    paths.add(path);
  }
  assert.equal(paths.size, 30);
  assert.equal(careerCourseSvg('race-99'), '');
});
test('07 and 22 thumbnails finish at real planar arclength, not a vertex-count fraction',()=>{
  const length=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
  for(const [id,fraction] of [['07',.82],['22',.84]]){
    const geometry=createV11CourseGeometry(id),preview=raceCoursePreview('race-'+id);
    assert.equal(preview.closed,false);
    assert.equal(preview.fraction,fraction);
    assert.ok(Math.abs(length(preview.points)/geometry.perimeterM-fraction)<1e-10);
    assert.deepEqual(preview.points[0],geometry.planPoints[0]);
    assert.ok(preview.points.length<geometry.planPoints.length);
    const previous=preview.points.at(-2),end=preview.points.at(-1),next=geometry.planPoints[preview.points.length-1];
    const cross=(end[0]-previous[0])*(next[1]-previous[1])-(end[1]-previous[1])*(next[0]-previous[0]);
    assert.ok(Math.abs(cross)<1e-6,'finish lies on the actual road segment');
  }
  assert.equal(raceCoursePreview('race-99'),null);
});
test('rewarded next-stage status distinguishes cancellation, failure, timeout, stale and save failure',()=>{
  assert.equal(rewardedStageStatus('cancelled'),'广告已取消，下一关未解锁');
  assert.equal(rewardedStageStatus('failed'),'广告加载失败，下一关未解锁');
  assert.equal(rewardedStageStatus('timed-out'),'广告请求超时，下一关未解锁');
  assert.equal(rewardedStageStatus('stale'),'比赛状态已变化，未解锁下一关');
  assert.equal(rewardedStageStatus('save-failed'),'广告已完成，但解锁未能保存');
  assert.equal(rewardedStageStatus('unavailable'),'当前没有可用广告');
  assert.equal(rewardedStageStatus('busy'),'正在处理另一条广告');
  assert.equal(rewardedStageStatus('unknown'),'未确认广告完成，下一关未解锁');
});
test('home rail centers the selected numbered stage and clamps at both ends',()=>{
  assert.equal(stageRailScrollLeft(360,3000,0,100),0);
  assert.equal(stageRailScrollLeft(360,3000,1040,100),910);
  assert.equal(stageRailScrollLeft(360,3000,2910,90),2640);
  assert.equal(stageRailScrollLeft(800,400,180,80),0);
  assert.equal(stageRailScrollLeft(0,3000,1040,100),0);
  assert.equal(stageRailScrollLeft(360,Infinity,1040,100),0);
});
test('progress display clamps to real native distance, not rank or synthetic timeline', () => {
  const stage = { laps: 2 }, track = { length: 1000 };
  assert.equal(raceProgressPercent({progress: 0},track,stage),0);
  assert.equal(raceProgressPercent({progress: 700},track,stage),35);
  assert.equal(raceProgressPercent({progress: 3000},track,stage),100);
  assert.equal(raceProgressPercent({progress: -30},track,stage),0);
  assert.equal(raceProgressPercent({progress: NaN},track,stage),0);
  assert.equal(raceProgressPercent({progress:820},track,{course:'race-07',laps:1}),100);
  assert.equal(raceProgressPercent({progress:420},track,{course:'race-22',laps:1}),50);
});
test('podium-only progression shows only real time limits, never obsolete medal tasks',()=>{
  const cases=[
    [{kind:'race',rank:3},{},31,''],
    [{kind:'boss',rank:1},{},31,''],
    [{kind:'elimination'},{survived:1},31,''],
    [{kind:'drift',target:5},{cleanDrifts:2},31,''],
    [{kind:'overtake',target:3},{cleanPasses:2},31,''],
    [{kind:'item',target:4},{pickups:6},31,''],
    [{kind:'speed',target:190},{gateSpeed:173},31,''],
    [{kind:'time'},{timeAllowance:105},30.4,'剩余 75s'],
    [{kind:'relay'},{timeAllowance:90},92,'剩余 0s']
  ];
  for(const [stage,stats,raceTime,expected]of cases)
    assert.equal(compactRaceObjective(stage,stats,raceTime),expected);
});
test('compact HUD never invents a coach message or misstates corrupt telemetry',()=>{
  assert.equal(compactRaceObjective(null,{}),'');
  assert.equal(compactRaceObjective({kind:'drift',target:5},{cleanDrifts:-2}),'');
  assert.equal(compactRaceObjective({kind:'speed',target:190},{gateSpeed:NaN}),'');
  assert.equal(compactRaceObjective({kind:'time'},{timeAllowance:20},Infinity),'剩余 20s');
});

/** Execute the actual wired click handler with an asynchronous provider. The
 * runtime entitlement rules are covered separately by racing-next-stage-ad. */
function nextAdUiHarness() {
  const source=readFileSync(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
  const body=source.match(/\$\('next-ad'\)\.addEventListener\('click',async\(\)=>\{([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(body,'next-stage action must be wired to the actual mobile entrypoint');
  let resolveAd,calls=0,unlocked=false;
  const nodes=new Map(),selected=[],loaded=[],outcomes=[],busySnapshots=[];
  const context={
    phase:'finished',result:{finished:true,place:4,time:108,stats:{crash:2}},
    lastRacePassed:false,loading:false,policyReady:true,nextStageAdPending:null,
    gateSelectionIndex:null,pendingSkinIndex:null,STAGES,g:{},
    $:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false});return nodes.get(id);},
    career:{
      index:0,stage:STAGES[0],adBusy:false,dailySnapshot:null,
      canOfferNextStageAd(){return !this.adBusy;},
      async watchNextStageAd(){
        calls++;this.adBusy=true;
        try{
          const out=await new Promise(done=>{resolveAd=done;});
          if(out.status==='completed')unlocked=true;
          return out;
        }finally{this.adBusy=false;}
      },
      gateStatus(index){return {unlocked:index===1&&unlocked};},
      setStage(index){selected.push(index);this.index=index;this.stage=STAGES[index];return true;}
    },
    fuelView(){busySnapshots.push(context.career.adBusy);},
    trial:{rewardedOutcome(status){outcomes.push(status);}},
    renderLobby(){},
    async loadTrack(map,autoStart){loaded.push({map,autoStart});context.phase='ready';context.result=null;},
    stageTrackReady:()=>true,
    display(next){context.phase=next;},
    rewardedStageStatus,
  };
  const click=runInNewContext('(async()=>{'+body+'})',context);
  return {context,click,settle:out=>resolveAd(out),nodes,selected,loaded,outcomes,busySnapshots,calls:()=>calls};
}
test('actual next-stage UI keeps free retry and loss visible after every unsuccessful provider outcome',async()=>{
  for(const status of ['cancelled','failed','timed-out','stale','save-failed','unavailable']){
    const h=nextAdUiHarness(),original=h.context.result,pending=h.click();
    assert.equal(h.calls(),1);assert.equal(h.context.career.adBusy,true);
    assert.deepEqual(h.busySnapshots,[true]);
    await h.click();assert.equal(h.calls(),1,'second tap must not request another advertisement');
    h.settle({status});await pending;
    assert.equal(h.context.phase,'finished');assert.equal(h.context.result,original);
    assert.equal(h.context.result.place,4);assert.equal(h.context.lastRacePassed,false);
    assert.deepEqual(h.selected,[]);assert.deepEqual(h.loaded,[]);
    assert.equal(h.nodes.get('note').textContent,rewardedStageStatus(status));
  }
});
test('actual completed UI selects only the confirmed adjacent level and returns home without starting a race',async()=>{
  const h=nextAdUiHarness(),original=h.context.result,pending=h.click();
  h.settle({status:'completed',targetIndex:1,stageId:'02'});await pending;
  assert.deepEqual(h.selected,[1]);assert.deepEqual(h.loaded,[{map:STAGES[1].map,autoStart:false}]);
  assert.equal(h.context.phase,'ready');assert.equal(h.nodes.get('note').textContent,'第02关已解锁');
  assert.equal(original.place,4);assert.equal(h.context.lastRacePassed,false);
});
test('late and mismatched next-stage UI callbacks cannot reopen a result or jump multiple levels',async()=>{
  const late=nextAdUiHarness(),pending=late.click();
  late.context.phase='ready';late.context.result=null;
  late.settle({status:'completed',targetIndex:1,stageId:'02'});await pending;
  assert.equal(late.context.phase,'ready');assert.deepEqual(late.selected,[]);assert.deepEqual(late.loaded,[]);
  const invalid=nextAdUiHarness(),request=invalid.click();
  invalid.settle({status:'completed',targetIndex:2,stageId:'03'});await request;
  assert.equal(invalid.context.phase,'finished');assert.deepEqual(invalid.selected,[]);
  assert.match(invalid.nodes.get('note').textContent,/未确认/);
});
